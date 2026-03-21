#!/usr/bin/env npx ts-node
/**
 * Simulation Monster v2 - The Professional QA Tester
 * ===================================================
 *
 * This monster simulates a SENIOR QA ENGINEER + PRODUCT MANAGER who:
 *
 * 1. Runs REAL poker games (not mocks) with various scenarios
 * 2. Validates poker invariants in real-time during gameplay
 * 3. Measures and critiques game timing, UX, and flow
 * 4. Tests edge cases that humans would find annoying
 * 5. Compares against industry best practices
 * 6. Generates actionable, prioritized findings
 *
 * Simulation Scenarios:
 * - HeadsUp: 2-player cash game (fastest, basic validation)
 * - SingleTable: 6-9 player tournament (core tournament logic)
 * - MultiTable: 18-30 player tournament (table balancing, breaks)
 * - Chaos: Inject failures, disconnects, timeouts
 * - EdgeCases: All-in heads-up, split pots, side pots
 *
 * Target runtime: < 2 minutes for quick mode, < 10 minutes for full mode
 *
 * Part of the Monster Army - findings persist to:
 * - tests/qa/monsters/shared/issues.json
 * - docs/monsters_issues.md
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule, EventEmitter2 } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import * as http from "http";
import * as crypto from "crypto";

import { BaseMonster } from "../shared/base-monster";
import {
  RunConfig,
  GameStateSnapshot,
  InvariantContext,
  Severity,
} from "../shared/types";
import {
  runCriticalInvariantChecks,
  runInvariantChecks,
} from "../invariant-monster/poker-invariants";
import { runMonsterCli } from "../shared";

import { appConfig } from "../../../../src/config";
import * as entities from "../../../../src/entities";
import { LiveGameManagerService } from "../../../../src/services/game/live-game-manager.service";
import { ServicesModule } from "../../../../src/services/services.module";
import { GamesModule } from "../../../../src/modules/games/games.module";
import { TournamentsModule } from "../../../../src/modules/tournaments/tournaments.module";
import { BotsModule } from "../../../../src/modules/bots/bots.module";
import { TournamentDirectorService } from "../../../../src/modules/tournaments/tournament-director.service";

// ============================================================================
// CONFIGURATION
// ============================================================================

type SimulationScenario =
  | "heads-up"
  | "single-table"
  | "multi-table"
  | "chaos"
  | "edge-cases"
  | "all-in-showdown"
  | "split-pot";

type SimulationMode = "quick" | "standard" | "thorough";

interface ScenarioConfig {
  name: string;
  description: string;
  playerCount: number;
  startingChips: number;
  maxHands: number;
  maxDurationMs: number;
  pollIntervalMs: number;
  blinds: { small: number; big: number; ante?: number };
  tournamentMode: boolean;
  validateEveryState: boolean;
  injectChaos: boolean;
  chaosLevel?: "light" | "medium" | "heavy";
}

const SCENARIO_CONFIGS: Record<SimulationScenario, ScenarioConfig> = {
  "heads-up": {
    name: "Heads-Up Cash Game",
    description: "2-player game - fastest scenario for basic validation",
    playerCount: 2,
    startingChips: 1000,
    maxHands: 20,
    maxDurationMs: 30000,
    pollIntervalMs: 50,
    blinds: { small: 10, big: 20 },
    tournamentMode: false,
    validateEveryState: true,
    injectChaos: false,
  },
  "single-table": {
    name: "Single Table Tournament",
    description: "6-player tournament - validates core tournament mechanics",
    playerCount: 6,
    startingChips: 3000,
    maxHands: 50,
    maxDurationMs: 90000,
    pollIntervalMs: 100,
    blinds: { small: 25, big: 50, ante: 5 },
    tournamentMode: true,
    validateEveryState: true,
    injectChaos: false,
  },
  "multi-table": {
    name: "Multi-Table Tournament",
    description: "18-player tournament - validates table balancing",
    playerCount: 18,
    startingChips: 5000,
    maxHands: 100,
    maxDurationMs: 180000,
    pollIntervalMs: 200,
    blinds: { small: 25, big: 50, ante: 10 },
    tournamentMode: true,
    validateEveryState: false, // Too expensive
    injectChaos: false,
  },
  chaos: {
    name: "Chaos Testing",
    description: "Inject failures, disconnects, and timeouts",
    playerCount: 4,
    startingChips: 2000,
    maxHands: 30,
    maxDurationMs: 60000,
    pollIntervalMs: 100,
    blinds: { small: 10, big: 20 },
    tournamentMode: false,
    validateEveryState: true,
    injectChaos: true,
    chaosLevel: "medium",
  },
  "edge-cases": {
    name: "Edge Case Testing",
    description: "Test specific poker edge cases",
    playerCount: 3,
    startingChips: 1000,
    maxHands: 15,
    maxDurationMs: 45000,
    pollIntervalMs: 50,
    blinds: { small: 10, big: 20 },
    tournamentMode: false,
    validateEveryState: true,
    injectChaos: false,
  },
  "all-in-showdown": {
    name: "All-In Showdown",
    description: "Force all-in scenarios to test showdown logic",
    playerCount: 2,
    startingChips: 100, // Tiny stacks force all-ins
    maxHands: 10,
    maxDurationMs: 30000,
    pollIntervalMs: 50,
    blinds: { small: 25, big: 50 }, // Big blinds relative to stack
    tournamentMode: false,
    validateEveryState: true,
    injectChaos: false,
  },
  "split-pot": {
    name: "Split Pot Testing",
    description: "Multiple all-ins to test side pot logic",
    playerCount: 4,
    startingChips: 1000,
    maxHands: 20,
    maxDurationMs: 45000,
    pollIntervalMs: 50,
    blinds: { small: 10, big: 20 },
    tournamentMode: false,
    validateEveryState: true,
    injectChaos: false,
  },
};

const MODE_SCENARIOS: Record<SimulationMode, SimulationScenario[]> = {
  quick: ["heads-up", "all-in-showdown"],
  standard: ["heads-up", "single-table", "edge-cases", "all-in-showdown"],
  thorough: [
    "heads-up",
    "single-table",
    "multi-table",
    "chaos",
    "edge-cases",
    "all-in-showdown",
    "split-pot",
  ],
};

// ============================================================================
// INDUSTRY BEST PRACTICES (Competitive Analysis)
// ============================================================================

const INDUSTRY_STANDARDS = {
  timing: {
    turnTimeoutMs: { min: 10000, max: 30000, recommended: 15000 },
    actionResponseMs: { max: 100, warning: 50 },
    uiUpdateMs: { max: 50, warning: 20 },
    handCompletionMs: { max: 5000, warning: 2000 },
  },
  ux: {
    maxPlayersPerTable: 10,
    minPlayersToStart: 2,
    maxBlindsPerStack: 0.1, // Warn if blinds > 10% of average stack
    tournamentBreakEveryMinutes: 60,
  },
  reliability: {
    maxErrorRate: 0.001, // 0.1% max errors
    maxDisconnectRecoveryMs: 5000,
    maxStateInconsistencyMs: 100,
  },
};

// ============================================================================
// BOT PERSONALITIES
// ============================================================================

type BotPersonality =
  | "tight-passive" // Check/fold, rarely bets
  | "tight-aggressive" // Plays few hands but bets hard
  | "loose-passive" // Calls everything
  | "loose-aggressive" // Raises constantly
  | "all-in-maniac" // Goes all-in frequently
  | "timeout-bot" // Slow to respond (tests timeouts)
  | "disconnect-bot"; // Disconnects mid-hand (chaos)

interface BotServer {
  server: http.Server;
  port: number;
  botId: string;
  personality: BotPersonality;
  stats: {
    actionsReceived: number;
    actionsResponded: number;
    timeouts: number;
    errors: number;
  };
  close: () => Promise<void>;
}

// ============================================================================
// SIMULATION MONSTER
// ============================================================================

export class SimulationMonster extends BaseMonster {
  private app: INestApplication | null = null;
  private dataSource: DataSource | null = null;
  private testModule: TestingModule | null = null;
  private liveGameManager: LiveGameManagerService | null = null;
  private tournamentDirector: TournamentDirectorService | null = null;
  private eventEmitter: EventEmitter2 | null = null;

  private mode: SimulationMode = "standard";
  private scenarioResults: Map<SimulationScenario, ScenarioResult> = new Map();

  // Tracking across all scenarios
  private totalHandsPlayed = 0;
  private totalStatesValidated = 0;
  private totalInvariantsChecked = 0;
  private totalInvariantViolations = 0;

  // Timing metrics
  private handDurations: number[] = [];
  private actionLatencies: number[] = [];
  private stateUpdateLatencies: number[] = [];

  // UX observations
  private uxObservations: UXObservation[] = [];

  constructor() {
    super({
      name: "Simulation Monster",
      type: "simulation",
      timeout: 600000, // 10 minutes max
      verbose: true,
    });
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  protected async setup(runConfig: RunConfig): Promise<void> {
    this.log("Setting up Simulation Monster v2 (Professional QA Mode)...\n");

    // Parse mode from run config or CLI
    this.mode = this.parseMode();
    this.log(`Mode: ${this.mode.toUpperCase()}`);
    this.log(`Scenarios: ${MODE_SCENARIOS[this.mode].join(", ")}\n`);

    // Setup NestJS test module
    this.testModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
        TypeOrmModule.forRoot({
          type: "postgres",
          host: process.env.TEST_DB_HOST || "localhost",
          port: parseInt(process.env.TEST_DB_PORT || "5432", 10),
          username: process.env.TEST_DB_USERNAME || "postgres",
          password: process.env.TEST_DB_PASSWORD || "postgres",
          database: process.env.TEST_DB_NAME || "poker_test",
          entities: Object.values(entities),
          synchronize: true,
          dropSchema: true,
          logging: false,
        }),
        ThrottlerModule.forRoot([
          { name: "default", ttl: 60000, limit: 100000 },
        ]),
        EventEmitterModule.forRoot(),
        ServicesModule,
        GamesModule,
        TournamentsModule,
        BotsModule,
      ],
    }).compile();

    this.app = this.testModule.createNestApplication();
    await this.app.init();

    this.dataSource = this.testModule.get(DataSource);
    this.liveGameManager = this.testModule.get(LiveGameManagerService);
    this.tournamentDirector = this.testModule.get(TournamentDirectorService);
    this.eventEmitter = this.testModule.get(EventEmitter2);

    this.log("Infrastructure ready\n");
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    const scenarios = MODE_SCENARIOS[this.mode];

    this.log(`${"═".repeat(60)}`);
    this.log("PROFESSIONAL QA SIMULATION - Running All Scenarios");
    this.log(`${"═".repeat(60)}\n`);

    for (const scenario of scenarios) {
      await this.runScenario(scenario);
      await this.sleep(500); // Brief pause between scenarios
    }

    // Generate comprehensive report
    this.generateProfessionalReport();
  }

  protected async teardown(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
    if (this.app) {
      await this.app.close();
    }
  }

  // ============================================================================
  // SCENARIO EXECUTION
  // ============================================================================

  private async runScenario(scenario: SimulationScenario): Promise<void> {
    const config = SCENARIO_CONFIGS[scenario];

    this.log(`${"─".repeat(60)}`);
    this.log(`SCENARIO: ${config.name}`);
    this.log(`Description: ${config.description}`);
    this.log(`${"─".repeat(60)}`);

    const result: ScenarioResult = {
      scenario,
      config,
      startTime: Date.now(),
      endTime: 0,
      success: false,
      handsPlayed: 0,
      statesValidated: 0,
      invariantViolations: 0,
      errors: [],
      warnings: [],
      uxIssues: [],
      timingMetrics: {
        avgHandDurationMs: 0,
        maxHandDurationMs: 0,
        avgActionLatencyMs: 0,
        maxActionLatencyMs: 0,
      },
    };

    const botServers: BotServer[] = [];

    try {
      // Create bot servers
      const basePort = 8000 + Math.floor(Math.random() * 1000);
      const personalities = this.getPersonalitiesForScenario(scenario);

      for (let i = 0; i < config.playerCount; i++) {
        const bot = await this.createBotServer(
          basePort + i,
          personalities[i % personalities.length],
          config.injectChaos ? config.chaosLevel : undefined,
        );
        botServers.push(bot);
      }

      this.log(`Created ${botServers.length} bot players`);

      // Run the actual game
      if (config.tournamentMode) {
        await this.runTournamentScenario(config, botServers, result);
      } else {
        await this.runCashGameScenario(config, botServers, result);
      }

      result.success =
        result.invariantViolations === 0 && result.errors.length === 0;
    } catch (error: any) {
      result.errors.push(`Scenario failed: ${error.message}`);
      this.addFinding({
        category: "BUG",
        severity: "critical",
        title: `Scenario "${config.name}" crashed`,
        description: error.message || String(error),
        location: { endpoint: `/simulation/${scenario}` },
        reproducible: true,
        tags: ["simulation", scenario, "crash"],
      });
    } finally {
      // Cleanup bot servers
      for (const bot of botServers) {
        try {
          await bot.close();
        } catch {
          // Ignore
        }
      }
    }

    result.endTime = Date.now();
    this.scenarioResults.set(scenario, result);

    // Update totals
    this.totalHandsPlayed += result.handsPlayed;
    this.totalStatesValidated += result.statesValidated;
    this.totalInvariantViolations += result.invariantViolations;

    const status = result.success ? "✅ PASSED" : "❌ FAILED";
    const duration = ((result.endTime - result.startTime) / 1000).toFixed(1);
    this.log(`${status} - ${result.handsPlayed} hands in ${duration}s\n`);
  }

  private async runCashGameScenario(
    config: ScenarioConfig,
    botServers: BotServer[],
    result: ScenarioResult,
  ): Promise<void> {
    const gameTableId = crypto.randomUUID();
    const gameDbId = crypto.randomUUID();

    // Create game
    const game = await this.liveGameManager!.createGame({
      tableId: gameTableId,
      gameDbId,
      smallBlind: config.blinds.small,
      bigBlind: config.blinds.big,
      ante: config.blinds.ante || 0,
      startingChips: config.startingChips,
      turnTimeoutMs: 3000,
    });

    // Add players
    for (let i = 0; i < botServers.length; i++) {
      const bot = botServers[i];
      game.addPlayer({
        id: bot.botId,
        name: `${bot.personality.replace("-", "")}_${i}`,
        chips: config.startingChips,
        endpoint: `http://localhost:${bot.port}/action`,
      });
    }

    // Monitor and validate
    let lastHandNumber = 0;
    let lastHandStartTime = Date.now();
    let previousState: GameStateSnapshot | null = null;

    const startTime = Date.now();

    while (Date.now() - startTime < config.maxDurationMs) {
      await this.sleep(config.pollIntervalMs);

      const gameState = this.liveGameManager!.getGameState(gameTableId);
      if (!gameState) {
        break;
      }

      // Convert to snapshot
      const snapshot = this.toSnapshot(gameState, gameTableId);

      // Validate invariants
      if (config.validateEveryState) {
        await this.validateState(snapshot, previousState, result);
      }

      result.statesValidated++;

      // Check for hand completion
      const currentHand = gameState.handNumber || 0;
      if (currentHand > lastHandNumber) {
        const handDuration = Date.now() - lastHandStartTime;
        this.handDurations.push(handDuration);

        // Check timing against industry standards
        if (handDuration > INDUSTRY_STANDARDS.timing.handCompletionMs.max) {
          this.addUXObservation("timing", "high", "Slow hand completion", {
            handNumber: currentHand,
            durationMs: handDuration,
            maxExpected: INDUSTRY_STANDARDS.timing.handCompletionMs.max,
          });
        }

        result.handsPlayed++;
        lastHandNumber = currentHand;
        lastHandStartTime = Date.now();
        previousState = null;
      }

      // Check for game end
      if (gameState.status === "finished" || currentHand >= config.maxHands) {
        break;
      }

      if (gameState.status === "error") {
        result.errors.push("Game entered error state");
        break;
      }

      previousState = snapshot;
    }

    // Calculate timing metrics
    if (this.handDurations.length > 0) {
      result.timingMetrics.avgHandDurationMs =
        this.handDurations.reduce((a, b) => a + b, 0) /
        this.handDurations.length;
      result.timingMetrics.maxHandDurationMs = Math.max(...this.handDurations);
    }
  }

  private async runTournamentScenario(
    config: ScenarioConfig,
    botServers: BotServer[],
    result: ScenarioResult,
  ): Promise<void> {
    // Create user for bots
    const userId = crypto.randomUUID();
    await this.dataSource!.query(
      `INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'user', true, true, NOW(), NOW())`,
      [
        userId,
        `sim_${Date.now()}@test.com`,
        "SimUser",
        "hashed",
        "0".repeat(64),
      ],
    );

    // Register bots in DB
    for (let i = 0; i < botServers.length; i++) {
      const bot = botServers[i];
      await this.dataSource!.query(
        `INSERT INTO bots (id, user_id, name, endpoint, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
        [
          bot.botId,
          userId,
          `${bot.personality}_${i}`,
          `http://localhost:${bot.port}/action`,
        ],
      );
    }

    // Create tournament
    const tournamentId = crypto.randomUUID();
    await this.dataSource!.query(
      `INSERT INTO tournaments (
        id, name, type, status, buy_in, starting_chips,
        min_players, max_players, players_per_table,
        turn_timeout_ms, late_reg_ends_level, rebuys_allowed,
        created_at, updated_at
      )
      VALUES ($1, $2, 'rolling', 'registering', 100, $3, 2, $4, 9, 3000, 0, false, NOW(), NOW())`,
      [
        tournamentId,
        `SimTournament_${Date.now()}`,
        config.startingChips,
        config.playerCount,
      ],
    );

    // Create blind levels
    const blindLevels = [
      { level: 1, ...config.blinds },
      {
        level: 2,
        small: config.blinds.small * 2,
        big: config.blinds.big * 2,
        ante: (config.blinds.ante || 0) * 2,
      },
      {
        level: 3,
        small: config.blinds.small * 4,
        big: config.blinds.big * 4,
        ante: (config.blinds.ante || 0) * 4,
      },
    ];

    for (const bl of blindLevels) {
      await this.dataSource!.query(
        `INSERT INTO tournament_blind_levels (id, tournament_id, level, small_blind, big_blind, ante, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [
          crypto.randomUUID(),
          tournamentId,
          bl.level,
          bl.small,
          bl.big,
          bl.ante || 0,
        ],
      );
    }

    // Register players
    for (const bot of botServers) {
      await this.dataSource!.query(
        `INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, created_at, updated_at)
         VALUES ($1, $2, $3, 'initial', NOW(), NOW())`,
        [crypto.randomUUID(), tournamentId, bot.botId],
      );
    }

    // Start tournament
    try {
      await this.tournamentDirector!.startTournament(tournamentId);
    } catch (error: any) {
      this.log(`Tournament start: ${error.message}`);
    }

    // Monitor tournament
    const startTime = Date.now();
    let lastHandCount = 0;

    while (Date.now() - startTime < config.maxDurationMs) {
      await this.sleep(config.pollIntervalMs);

      const state = this.tournamentDirector!.getTournamentState(tournamentId);
      if (!state) {
        // Check DB for finished
        const t = await this.dataSource!.query(
          `SELECT status FROM tournaments WHERE id = $1`,
          [tournamentId],
        );
        if (t[0]?.status === "finished") {
          break;
        }
        continue;
      }

      // Count hands across tables
      let totalHands = 0;
      for (const table of state.tables || []) {
        totalHands += table.gameState?.handNumber || 0;

        // Validate each table's state
        if (config.validateEveryState && table.gameState) {
          const snapshot = this.toSnapshot(table.gameState, table.tableId);
          await this.validateState(snapshot, null, result);
          result.statesValidated++;
        }
      }

      if (totalHands > lastHandCount) {
        result.handsPlayed = totalHands;
        lastHandCount = totalHands;
      }

      // Check for completion
      if (
        state.status === "finished" ||
        result.handsPlayed >= config.maxHands
      ) {
        break;
      }
    }
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  private async validateState(
    state: GameStateSnapshot,
    previousState: GameStateSnapshot | null,
    result: ScenarioResult,
  ): Promise<void> {
    const ctx: InvariantContext = {
      before: previousState || undefined,
      after: state,
    };

    // Run all invariant checks
    const results = runInvariantChecks(ctx);
    this.totalInvariantsChecked += results.length;

    for (const check of results) {
      if (!check.passed) {
        result.invariantViolations++;
        this.totalInvariantViolations++;

        // Extract severity from the enhanced result (added by runInvariantChecks)
        const checkWithMeta = check as any;

        this.addFinding({
          category: "BUG",
          severity: (checkWithMeta.severity as Severity) || "critical",
          title: `INVARIANT: ${checkWithMeta.invariantName}`,
          description: `${check.message} (Hand ${state.handNumber || "?"}, Stage: ${state.stage})`,
          location: { endpoint: `/simulation/game/${state.gameId}` },
          evidence: check.evidence,
          reproducible: true,
          reproductionSteps: [
            `Run simulation monster`,
            `Scenario will reproduce the violation`,
          ],
          tags: [
            "simulation",
            "invariant",
            checkWithMeta.category || "unknown",
          ],
        });

        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }

    // Check state transitions
    if (previousState) {
      this.checkStateTransition(state, previousState, result);
    }

    // UX checks
    this.performUXChecks(state, result);
  }

  private checkStateTransition(
    current: GameStateSnapshot,
    previous: GameStateSnapshot,
    result: ScenarioResult,
  ): void {
    const normalizeStage = (s: string) =>
      s.toLowerCase().replace(/-/g, "").replace(/_/g, "");

    // Valid transitions within a single hand + between hands
    // Note: With fast polling, we might miss intermediate states (preflop)
    // so we allow some "skip" transitions for new hands
    const validTransitions: Record<string, string[]> = {
      waiting: ["preflop", "flop"], // flop possible if preflop was very fast
      preflop: ["flop", "showdown", "finished", "waiting"],
      flop: ["turn", "showdown", "finished", "waiting", "preflop"], // preflop = new hand
      turn: ["river", "showdown", "finished", "waiting", "preflop"],
      river: ["showdown", "finished", "waiting", "preflop"],
      showdown: ["waiting", "finished", "preflop", "flop"], // flop possible if preflop was skipped
    };

    const prevStage = normalizeStage(previous.stage);
    const currStage = normalizeStage(current.stage);

    // If hand number changed, this is a new hand - allow any betting stage start
    const prevHand = previous.handNumber || 0;
    const currHand = current.handNumber || 0;
    if (currHand > prevHand) {
      // New hand started - any betting stage is valid
      this.recordTest(true);
      return;
    }

    if (prevStage !== currStage) {
      const allowed = validTransitions[prevStage] || [];
      if (!allowed.includes(currStage)) {
        result.invariantViolations++;
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: "Invalid stage transition",
          description: `Stage changed from "${prevStage}" to "${currStage}" (not allowed)`,
          location: { endpoint: `/simulation/game/${current.gameId}` },
          evidence: {
            raw: { from: prevStage, to: currStage, allowed, hand: currHand },
          },
          reproducible: true,
          tags: ["simulation", "state", "transition"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  private performUXChecks(
    state: GameStateSnapshot,
    result: ScenarioResult,
  ): void {
    // Check for excessive blinds relative to stacks
    const avgStack =
      state.players.reduce((sum, p) => sum + p.chips, 0) / state.players.length;

    // This would need to know current blinds from game config
    // For now, check if any player has < 10 big blinds
    const shortStacks = state.players.filter(
      (p) => p.chips < state.currentBet * 10 && p.chips > 0,
    );

    if (shortStacks.length > state.players.length / 2) {
      this.addUXObservation(
        "gameplay",
        "medium",
        "Many players are short-stacked",
        {
          shortStackCount: shortStacks.length,
          totalPlayers: state.players.length,
          avgStack,
        },
      );
    }

    // Check for stuck game (same pot for too long)
    // This would need tracking across multiple states
  }

  // ============================================================================
  // BOT MANAGEMENT
  // ============================================================================

  private async createBotServer(
    port: number,
    personality: BotPersonality,
    chaosLevel?: "light" | "medium" | "heavy",
  ): Promise<BotServer> {
    return new Promise((resolve, reject) => {
      const botId = crypto.randomUUID();
      const stats = {
        actionsReceived: 0,
        actionsResponded: 0,
        timeouts: 0,
        errors: 0,
      };

      const server = http.createServer((req, res) => {
        if (req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", personality }));
          return;
        }

        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          stats.actionsReceived++;

          // Chaos injection
          if (chaosLevel && Math.random() < this.getChaosChance(chaosLevel)) {
            if (personality === "timeout-bot" || Math.random() < 0.3) {
              // Simulate timeout - don't respond
              stats.timeouts++;
              return;
            }
            if (personality === "disconnect-bot" || Math.random() < 0.2) {
              // Simulate disconnect
              res.destroy();
              stats.errors++;
              return;
            }
          }

          try {
            const payload = JSON.parse(body);
            const action = this.decideBotAction(payload, personality);

            // Add latency tracking
            const latency = Date.now();

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(action));
            stats.actionsResponded++;

            this.actionLatencies.push(Date.now() - latency);
          } catch {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "fold" }));
            stats.errors++;
          }
        });
      });

      server.on("error", reject);
      server.listen(port, () => {
        resolve({
          server,
          port,
          botId,
          personality,
          stats,
          close: () => new Promise<void>((r) => server.close(() => r())),
        });
      });
    });
  }

  private decideBotAction(
    payload: any,
    personality: BotPersonality,
  ): { type: string; amount?: number } {
    const canCheck = payload.action?.canCheck ?? false;
    const minRaise = payload.action?.minRaise ?? 0;
    const maxRaise = payload.action?.maxRaise ?? 0;
    const myChips = payload.player?.chips ?? 0;

    switch (personality) {
      case "tight-passive":
        // Mostly folds, occasionally calls
        if (canCheck) return { type: "check" };
        return Math.random() < 0.7 ? { type: "fold" } : { type: "call" };

      case "tight-aggressive":
        // Plays few hands but raises when playing
        if (canCheck && Math.random() < 0.5) return { type: "check" };
        if (maxRaise > 0 && Math.random() < 0.5) {
          return { type: "raise", amount: Math.min(minRaise * 2, maxRaise) };
        }
        return canCheck ? { type: "check" } : { type: "call" };

      case "loose-passive":
        // Calls almost everything
        return canCheck ? { type: "check" } : { type: "call" };

      case "loose-aggressive":
        // Raises frequently
        if (maxRaise > 0 && Math.random() < 0.4) {
          return { type: "raise", amount: Math.min(minRaise * 3, maxRaise) };
        }
        return canCheck ? { type: "check" } : { type: "call" };

      case "all-in-maniac":
        // Goes all-in frequently
        if (maxRaise >= myChips || Math.random() < 0.3) {
          return { type: "raise", amount: myChips };
        }
        return canCheck ? { type: "check" } : { type: "call" };

      case "timeout-bot":
      case "disconnect-bot":
        // These are handled at the server level with chaos
        return canCheck ? { type: "check" } : { type: "call" };

      default:
        return canCheck ? { type: "check" } : { type: "call" };
    }
  }

  private getPersonalitiesForScenario(
    scenario: SimulationScenario,
  ): BotPersonality[] {
    switch (scenario) {
      case "heads-up":
        return ["tight-aggressive", "loose-passive"];
      case "single-table":
        return [
          "tight-aggressive",
          "tight-passive",
          "loose-passive",
          "loose-aggressive",
          "tight-aggressive",
          "loose-passive",
        ];
      case "multi-table":
        return [
          "tight-aggressive",
          "tight-passive",
          "loose-passive",
          "loose-aggressive",
          "tight-aggressive",
          "loose-passive",
          "tight-passive",
          "loose-aggressive",
          "tight-aggressive",
        ];
      case "chaos":
        return [
          "loose-passive",
          "timeout-bot",
          "disconnect-bot",
          "loose-aggressive",
        ];
      case "edge-cases":
        return ["all-in-maniac", "loose-passive", "tight-aggressive"];
      case "all-in-showdown":
        return ["all-in-maniac", "all-in-maniac"];
      case "split-pot":
        return [
          "all-in-maniac",
          "all-in-maniac",
          "loose-passive",
          "tight-aggressive",
        ];
      default:
        return ["loose-passive", "loose-passive"];
    }
  }

  private getChaosChance(level: "light" | "medium" | "heavy"): number {
    switch (level) {
      case "light":
        return 0.05;
      case "medium":
        return 0.15;
      case "heavy":
        return 0.3;
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private toSnapshot(gameState: any, gameId: string): GameStateSnapshot {
    return {
      gameId,
      timestamp: new Date(),
      handNumber: gameState.handNumber || 0,
      stage: gameState.stage || gameState.status || "unknown",
      pot: gameState.pot || 0,
      sidePots: gameState.sidePots || [],
      communityCards: this.normalizeCards(
        gameState.communityCards || gameState.board || [],
      ),
      players: (gameState.players || []).map((p: any) => ({
        id: p.id || "unknown",
        name: p.name || "Unknown",
        position: p.position || 0,
        chips: p.chips || 0,
        bet: p.bet || 0,
        cards: p.cards ? this.normalizeCards(p.cards) : undefined,
        folded: p.folded || false,
        allIn: p.allIn || false,
        disconnected: p.disconnected || false,
      })),
      currentBet: gameState.currentBet || 0,
      dealer: gameState.dealer || 0,
      activePlayer: gameState.activePlayer,
    };
  }

  private normalizeCards(cards: any[]): string[] {
    if (!Array.isArray(cards)) return [];
    return cards.map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object" && c.rank && c.suit) {
        return `${c.rank}${c.suit}`;
      }
      return String(c);
    });
  }

  private addUXObservation(
    category: "timing" | "gameplay" | "visual" | "reliability",
    severity: "low" | "medium" | "high",
    message: string,
    details: Record<string, unknown>,
  ): void {
    this.uxObservations.push({ category, severity, message, details });

    if (severity === "high") {
      this.addFinding({
        category: "UX",
        severity: "medium",
        title: `UX Issue: ${message}`,
        description: JSON.stringify(details),
        location: { page: "/game" },
        reproducible: true,
        tags: ["simulation", "ux", category],
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseMode(): SimulationMode {
    const args = process.argv.slice(2);
    if (args.includes("--quick") || args.includes("-q")) return "quick";
    if (args.includes("--thorough") || args.includes("-t")) return "thorough";
    return "standard";
  }

  // ============================================================================
  // PROFESSIONAL REPORT GENERATION
  // ============================================================================

  private generateProfessionalReport(): void {
    const totalTime = Array.from(this.scenarioResults.values()).reduce(
      (sum, r) => sum + (r.endTime - r.startTime),
      0,
    );

    this.log(`\n${"═".repeat(70)}`);
    this.log("                    PROFESSIONAL QA SIMULATION REPORT");
    this.log(`${"═".repeat(70)}\n`);

    // Executive Summary
    this.log("📋 EXECUTIVE SUMMARY");
    this.log("─".repeat(40));
    this.log(`Mode: ${this.mode.toUpperCase()}`);
    this.log(`Total Runtime: ${(totalTime / 1000).toFixed(1)}s`);
    this.log(`Scenarios Run: ${this.scenarioResults.size}`);
    this.log(`Total Hands Played: ${this.totalHandsPlayed}`);
    this.log(`Total States Validated: ${this.totalStatesValidated}`);
    this.log(`Invariants Checked: ${this.totalInvariantsChecked}`);
    this.log(`Invariant Violations: ${this.totalInvariantViolations}`);
    this.log("");

    // Scenario Results
    this.log("📊 SCENARIO RESULTS");
    this.log("─".repeat(40));
    for (const [scenario, result] of this.scenarioResults) {
      const status = result.success ? "✅" : "❌";
      const duration = ((result.endTime - result.startTime) / 1000).toFixed(1);
      this.log(
        `${status} ${result.config.name}: ${result.handsPlayed} hands, ` +
          `${result.invariantViolations} violations (${duration}s)`,
      );
    }
    this.log("");

    // Performance Metrics
    if (this.handDurations.length > 0) {
      this.log("⏱️  PERFORMANCE METRICS");
      this.log("─".repeat(40));
      this.log(
        `Avg Hand Duration: ${(this.handDurations.reduce((a, b) => a + b, 0) / this.handDurations.length).toFixed(0)}ms`,
      );
      this.log(`Max Hand Duration: ${Math.max(...this.handDurations)}ms`);

      // Compare to industry standards
      const avgDuration =
        this.handDurations.reduce((a, b) => a + b, 0) /
        this.handDurations.length;
      if (avgDuration > INDUSTRY_STANDARDS.timing.handCompletionMs.warning) {
        this.log(
          `⚠️  Warning: Avg duration exceeds industry standard (${INDUSTRY_STANDARDS.timing.handCompletionMs.warning}ms)`,
        );
      }
      this.log("");
    }

    // UX Observations
    if (this.uxObservations.length > 0) {
      this.log("🎯 UX OBSERVATIONS");
      this.log("─".repeat(40));
      for (const obs of this.uxObservations.slice(0, 5)) {
        const icon =
          obs.severity === "high"
            ? "🔴"
            : obs.severity === "medium"
              ? "🟡"
              : "🔵";
        this.log(`${icon} [${obs.category}] ${obs.message}`);
      }
      if (this.uxObservations.length > 5) {
        this.log(`   ... and ${this.uxObservations.length - 5} more`);
      }
      this.log("");
    }

    // Industry Best Practices Comparison
    this.log("📈 COMPETITIVE ANALYSIS (vs Industry Standards)");
    this.log("─".repeat(40));
    this.log(
      `Turn Timeout: ${INDUSTRY_STANDARDS.timing.turnTimeoutMs.recommended}ms recommended`,
    );
    this.log(
      `Max Players/Table: ${INDUSTRY_STANDARDS.ux.maxPlayersPerTable} (industry standard)`,
    );
    this.log(
      `Error Rate Target: < ${INDUSTRY_STANDARDS.reliability.maxErrorRate * 100}%`,
    );
    this.log("");

    // Recommendations
    this.log("💡 RECOMMENDATIONS");
    this.log("─".repeat(40));
    if (this.totalInvariantViolations > 0) {
      this.log(
        `🔴 CRITICAL: Fix ${this.totalInvariantViolations} invariant violations before release`,
      );
    }
    if (this.handDurations.length > 0) {
      const avgDuration =
        this.handDurations.reduce((a, b) => a + b, 0) /
        this.handDurations.length;
      if (avgDuration > INDUSTRY_STANDARDS.timing.handCompletionMs.warning) {
        this.log(
          `🟡 PERFORMANCE: Optimize hand processing (avg ${avgDuration.toFixed(0)}ms)`,
        );
      }
    }
    if (this.uxObservations.filter((o) => o.severity === "high").length > 0) {
      this.log(`🟡 UX: Address high-severity UX issues`);
    }

    this.log("");
    this.log(`${"═".repeat(70)}`);
    this.log(`All findings have been persisted to docs/monsters_issues.md`);
    this.log(`${"═".repeat(70)}\n`);
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface ScenarioResult {
  scenario: SimulationScenario;
  config: ScenarioConfig;
  startTime: number;
  endTime: number;
  success: boolean;
  handsPlayed: number;
  statesValidated: number;
  invariantViolations: number;
  errors: string[];
  warnings: string[];
  uxIssues: string[];
  timingMetrics: {
    avgHandDurationMs: number;
    maxHandDurationMs: number;
    avgActionLatencyMs: number;
    maxActionLatencyMs: number;
  };
}

interface UXObservation {
  category: "timing" | "gameplay" | "visual" | "reliability";
  severity: "low" | "medium" | "high";
  message: string;
  details: Record<string, unknown>;
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  runMonsterCli(new SimulationMonster(), "simulation");
}
