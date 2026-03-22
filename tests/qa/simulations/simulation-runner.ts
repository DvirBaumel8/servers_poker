/**
 * SimulationRunner - Base class for integration simulation tests
 * ===============================================================
 *
 * This framework runs real games through the actual backend services
 * to validate end-to-end functionality. Unlike unit tests, these:
 *
 * - Use real PostgreSQL database
 * - Create bots with in-process strategy evaluation
 * - Exercise the full NestJS stack
 * - Validate state consistency across services
 *
 * Tiers:
 * - Basic: 2-player, fast, run on every commit
 * - SingleTable: 9-player tournament, run on PR
 * - MultiTable: 30+ player, run weekly/before release
 *
 * For live invariant validation during gameplay, use the SimulationMonster
 * from the Monster Army (tests/qa/monsters/simulation-monster/).
 */

import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import * as crypto from "crypto";
import { EventEmitter2 } from "@nestjs/event-emitter";

export interface SimulationConfig {
  name: string;
  playerCount: number;
  startingChips: number;
  maxHands?: number;
  maxDurationMs?: number;
  blinds: { small: number; big: number; ante?: number };
  tournamentMode: boolean;
  verboseLogging?: boolean;
  validateAfterEachHand?: boolean;
}

export interface SimulationResult {
  success: boolean;
  config: SimulationConfig;
  duration: number;
  handsPlayed: number;
  errors: SimulationError[];
  warnings: SimulationWarning[];
  finalState: FinalState;
  assertions: AssertionResult[];
}

export interface SimulationError {
  type: string;
  message: string;
  severity: "critical" | "error";
  context?: Record<string, any>;
  timestamp: Date;
}

export interface SimulationWarning {
  type: string;
  message: string;
  context?: Record<string, any>;
}

export interface FinalState {
  status: string;
  playersRemaining: number;
  totalChips: number;
  expectedChips: number;
  winner?: string;
  chipDistribution: Record<string, number>;
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  message: string;
  expected?: any;
  actual?: any;
}

export interface BotRecord {
  botId: string;
  personality: string;
  strategy: Record<string, unknown>;
}

const PERSONALITY_STRATEGIES: Record<string, Record<string, unknown>> = {
  caller: {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 10,
      bluffFrequency: 5,
      riskTolerance: 20,
      tightness: 20,
    },
  },
  folder: {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 5,
      bluffFrequency: 0,
      riskTolerance: 5,
      tightness: 95,
    },
  },
  maniac: {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 90,
      bluffFrequency: 60,
      riskTolerance: 80,
      tightness: 30,
    },
  },
  smart: {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 55,
      bluffFrequency: 25,
      riskTolerance: 45,
      tightness: 55,
    },
  },
  random: {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 50,
      bluffFrequency: 50,
      riskTolerance: 50,
      tightness: 50,
    },
  },
};

export abstract class SimulationRunner {
  protected app: INestApplication | null = null;
  protected dataSource: DataSource | null = null;
  protected botRecords: BotRecord[] = [];
  protected config: SimulationConfig;
  protected result: SimulationResult;
  protected startTime: number = 0;
  protected eventEmitter: EventEmitter2 | null = null;

  constructor(config: SimulationConfig) {
    this.config = config;
    this.result = this.initResult();
  }

  private initResult(): SimulationResult {
    return {
      success: false,
      config: this.config,
      duration: 0,
      handsPlayed: 0,
      errors: [],
      warnings: [],
      finalState: {
        status: "not_started",
        playersRemaining: 0,
        totalChips: 0,
        expectedChips: this.config.playerCount * this.config.startingChips,
        chipDistribution: {},
      },
      assertions: [],
    };
  }

  /**
   * Run the complete simulation
   */
  async run(): Promise<SimulationResult> {
    this.startTime = Date.now();
    this.log(`Starting simulation: ${this.config.name}`);
    this.log(
      `Players: ${this.config.playerCount}, Chips: ${this.config.startingChips}`,
    );

    try {
      // Phase 1: Setup
      await this.setupDatabase();
      this.createBotRecords();
      await this.setupTestData();

      // Phase 2: Execute
      await this.executeSimulation();

      // Phase 3: Validate
      await this.runAssertions();

      // Determine success
      this.result.success =
        this.result.errors.filter((e) => e.severity === "critical").length ===
          0 && this.result.assertions.every((a) => a.passed);
    } catch (error) {
      this.recordError({
        type: "simulation_crash",
        message: `Simulation crashed: ${error}`,
        severity: "critical",
        context: { error: String(error), stack: (error as Error).stack },
      });
    } finally {
      this.result.duration = Date.now() - this.startTime;
      await this.cleanup();
    }

    this.log(`Simulation completed in ${this.result.duration}ms`);
    this.log(`Success: ${this.result.success}`);
    this.log(`Hands played: ${this.result.handsPlayed}`);
    this.log(`Errors: ${this.result.errors.length}`);

    return this.result;
  }

  /**
   * Setup the test database - override in subclass if needed
   */
  protected abstract setupDatabase(): Promise<void>;

  /**
   * Setup test data (users, bots, tournaments) - override in subclass
   */
  protected abstract setupTestData(): Promise<void>;

  /**
   * Execute the main simulation logic - override in subclass
   */
  protected abstract executeSimulation(): Promise<void>;

  /**
   * Create bot records with strategy JSON for in-process evaluation
   */
  protected createBotRecords(): void {
    const personalities = Object.keys(PERSONALITY_STRATEGIES);

    for (let i = 0; i < this.config.playerCount; i++) {
      const personality = personalities[i % personalities.length];
      this.botRecords.push({
        botId: crypto.randomUUID(),
        personality,
        strategy: PERSONALITY_STRATEGIES[personality],
      });
    }

    this.log(
      `Created ${this.botRecords.length} bot records with strategy JSON`,
    );
  }

  /**
   * Run all assertions and record results
   */
  protected async runAssertions(): Promise<void> {
    // Chip Conservation
    this.assert(
      "chip_conservation",
      this.result.finalState.totalChips ===
        this.result.finalState.expectedChips,
      `Total chips should equal starting chips`,
      this.result.finalState.expectedChips,
      this.result.finalState.totalChips,
    );

    // Game Completion
    if (this.config.tournamentMode) {
      this.assert(
        "tournament_completed",
        this.result.finalState.status === "finished",
        `Tournament should reach finished status`,
        "finished",
        this.result.finalState.status,
      );

      this.assert(
        "single_winner",
        this.result.finalState.playersRemaining === 1,
        `Tournament should end with exactly 1 player`,
        1,
        this.result.finalState.playersRemaining,
      );
    }

    // No Critical Errors
    const criticalErrors = this.result.errors.filter(
      (e) => e.severity === "critical",
    );
    this.assert(
      "no_critical_errors",
      criticalErrors.length === 0,
      `Should have no critical errors`,
      0,
      criticalErrors.length,
    );

    // Additional custom assertions
    await this.runCustomAssertions();
  }

  /**
   * Override in subclass to add custom assertions
   */
  protected async runCustomAssertions(): Promise<void> {
    // Subclasses can override
  }

  /**
   * Record an assertion result
   */
  protected assert(
    name: string,
    condition: boolean,
    message: string,
    expected?: any,
    actual?: any,
  ): void {
    this.result.assertions.push({
      name,
      passed: condition,
      message: condition ? message : `FAILED: ${message}`,
      expected,
      actual,
    });

    if (!condition) {
      this.log(
        `Assertion FAILED: ${name} - expected ${expected}, got ${actual}`,
      );
    }
  }

  /**
   * Record an error
   */
  protected recordError(error: Omit<SimulationError, "timestamp">): void {
    this.result.errors.push({ ...error, timestamp: new Date() });
    if (error.severity === "critical") {
      this.log(`CRITICAL ERROR: ${error.message}`);
    }
  }

  /**
   * Record a warning
   */
  protected recordWarning(warning: SimulationWarning): void {
    this.result.warnings.push(warning);
    if (this.config.verboseLogging) {
      this.log(`WARNING: ${warning.message}`);
    }
  }

  /**
   * Log message if verbose mode is enabled
   */
  protected log(message: string): void {
    const elapsed = Date.now() - this.startTime;
    console.log(`[${elapsed}ms] [${this.config.name}] ${message}`);
  }

  /**
   * Cleanup resources
   */
  protected async cleanup(): Promise<void> {
    this.botRecords = [];

    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }

    if (this.app) {
      await this.app.close();
    }
  }

  /**
   * Wait for a condition with timeout
   */
  protected async waitFor(
    condition: () => Promise<boolean>,
    timeoutMs: number,
    checkIntervalMs: number = 1000,
  ): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await condition()) {
        return true;
      }
      await this.sleep(checkIntervalMs);
    }
    return false;
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get a summary report
   */
  getSummary(): string {
    const lines: string[] = [
      `\n${"=".repeat(60)}`,
      `SIMULATION REPORT: ${this.config.name}`,
      `${"=".repeat(60)}`,
      ``,
      `Status: ${this.result.success ? "✓ PASSED" : "✗ FAILED"}`,
      `Duration: ${this.result.duration}ms`,
      `Hands Played: ${this.result.handsPlayed}`,
      ``,
      `Final State:`,
      `  Status: ${this.result.finalState.status}`,
      `  Players Remaining: ${this.result.finalState.playersRemaining}`,
      `  Total Chips: ${this.result.finalState.totalChips} (expected: ${this.result.finalState.expectedChips})`,
      this.result.finalState.winner
        ? `  Winner: ${this.result.finalState.winner}`
        : "",
      ``,
      `Assertions (${this.result.assertions.filter((a) => a.passed).length}/${this.result.assertions.length} passed):`,
    ];

    for (const assertion of this.result.assertions) {
      lines.push(
        `  ${assertion.passed ? "✓" : "✗"} ${assertion.name}: ${assertion.message}`,
      );
    }

    if (this.result.errors.length > 0) {
      lines.push(``, `Errors (${this.result.errors.length}):`);
      for (const error of this.result.errors) {
        lines.push(`  [${error.severity}] ${error.type}: ${error.message}`);
      }
    }

    if (this.result.warnings.length > 0) {
      lines.push(``, `Warnings (${this.result.warnings.length}):`);
      for (const warning of this.result.warnings.slice(0, 10)) {
        lines.push(`  ${warning.type}: ${warning.message}`);
      }
      if (this.result.warnings.length > 10) {
        lines.push(`  ... and ${this.result.warnings.length - 10} more`);
      }
    }

    lines.push(`${"=".repeat(60)}\n`);

    return lines.filter((l) => l !== "").join("\n");
  }
}
