/**
 * Monster Army - Base Monster Class
 *
 * Abstract base class that all monsters inherit from.
 * Provides common functionality:
 * - Finding creation and management
 * - Logging with consistent format
 * - Run lifecycle (setup, execute, teardown)
 * - Result generation
 */

import {
  MonsterType,
  Finding,
  RunResult,
  RunConfig,
  createFinding,
  countBySeverity,
  shouldFailRun,
  FindingCategory,
  Severity,
  Location,
  Evidence,
} from "./types";
import { addIssue, Severity as IssueSeverity } from "./issue-tracker";

export interface MonsterConfig {
  name: string;
  type: MonsterType;
  enabled: boolean;
  timeout: number; // Max runtime in ms
  failOnHighSeverity: boolean;
  verbose: boolean;
}

export abstract class BaseMonster {
  protected config: MonsterConfig;
  protected findings: Finding[] = [];
  protected startTime: Date = new Date();
  protected testsRun = 0;
  protected testsPassed = 0;
  protected testsFailed = 0;
  protected testsSkipped = 0;

  constructor(
    config: Partial<MonsterConfig> & { name: string; type: MonsterType },
  ) {
    this.config = {
      enabled: true,
      timeout: 60000, // 1 minute default
      failOnHighSeverity: true,
      verbose: false,
      ...config,
    };
  }

  // ============================================================================
  // ABSTRACT METHODS - Must be implemented by each monster
  // ============================================================================

  /**
   * Setup before running tests.
   * Override to initialize connections, load config, etc.
   */
  protected abstract setup(runConfig: RunConfig): Promise<void>;

  /**
   * Execute all tests.
   * This is where the monster does its work.
   */
  protected abstract execute(runConfig: RunConfig): Promise<void>;

  /**
   * Cleanup after tests.
   * Override to close connections, cleanup resources, etc.
   */
  protected abstract teardown(): Promise<void>;

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Run the monster.
   * Handles the full lifecycle: setup -> execute -> teardown.
   */
  async run(runConfig: RunConfig): Promise<RunResult> {
    this.startTime = new Date();
    this.findings = [];
    this.testsRun = 0;
    this.testsPassed = 0;
    this.testsFailed = 0;
    this.testsSkipped = 0;

    this.log(`Starting ${this.config.name}...`);

    let error: string | undefined;

    try {
      await this.runWithTimeout(async () => {
        await this.setup(runConfig);
        await this.execute(runConfig);
      }, this.config.timeout);
    } catch (e: any) {
      error = e.message || String(e);
      this.logError(`Monster failed: ${error}`);

      // Add a finding for the monster itself failing
      this.addFinding({
        category: "BUG",
        severity: "critical",
        title: `${this.config.name} crashed`,
        description: `The monster itself failed to complete: ${error}`,
        location: { file: `tests/qa/monsters/${this.config.type}` },
        reproducible: true,
        tags: ["monster-crash"],
      });
    } finally {
      try {
        await this.teardown();
      } catch (e: any) {
        this.logError(`Teardown failed: ${e.message}`);
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();

    const summary = countBySeverity(this.findings);
    const passed = !shouldFailRun(this.findings) && !error;

    this.log(
      `Completed in ${duration}ms. ` +
        `Findings: ${summary.critical}C ${summary.high}H ${summary.medium}M ${summary.low}L. ` +
        `${passed ? "PASSED" : "FAILED"}`,
    );

    return {
      runId: runConfig.runId,
      monster: this.config.type,
      startTime: this.startTime,
      endTime,
      duration,
      passed,
      findings: this.findings,
      findingsSummary: {
        ...summary,
        total: this.findings.length,
      },
      newFindings: [], // Filled in by orchestrator after comparing to memory
      regressions: [],
      fixed: [],
      testsRun: this.testsRun,
      testsPassed: this.testsPassed,
      testsFailed: this.testsFailed,
      testsSkipped: this.testsSkipped,
      error,
    };
  }

  // ============================================================================
  // PROTECTED HELPERS - For use by monster implementations
  // ============================================================================

  /**
   * Add a finding.
   * Automatically syncs to the unified issue tracker.
   */
  protected addFinding(params: {
    category: FindingCategory;
    severity: Severity;
    title: string;
    description: string;
    location: Location;
    evidence?: Evidence;
    reproducible: boolean;
    reproductionSteps?: string[];
    tags: string[];
  }): Finding {
    const finding = createFinding({
      monster: this.config.type,
      ...params,
    });

    this.findings.push(finding);

    if (this.config.verbose) {
      this.logFinding(finding);
    }

    // Sync to unified issue tracker
    try {
      const locationStr =
        params.location.endpoint ||
        params.location.file ||
        params.location.page ||
        "unknown";

      addIssue({
        category: params.category,
        severity: params.severity as IssueSeverity,
        source: this.config.type,
        title: params.title,
        description: params.description,
        location: locationStr,
        suggestion: params.reproductionSteps?.join(" → "),
      });
    } catch {
      // Silently ignore issue tracker errors to not break tests
    }

    return finding;
  }

  /**
   * Record a test result.
   */
  protected recordTest(passed: boolean, skipped = false): void {
    this.testsRun++;
    if (skipped) {
      this.testsSkipped++;
    } else if (passed) {
      this.testsPassed++;
    } else {
      this.testsFailed++;
    }
  }

  /**
   * Log a message with monster prefix.
   */
  protected log(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 23);
    console.log(`[${timestamp}] [${this.config.name}] ${message}`);
  }

  /**
   * Log a warning.
   */
  protected logWarn(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 23);
    console.warn(`[${timestamp}] [${this.config.name}] ⚠️  ${message}`);
  }

  /**
   * Log an error.
   */
  protected logError(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 23);
    console.error(`[${timestamp}] [${this.config.name}] ❌ ${message}`);
  }

  /**
   * Log a finding.
   */
  protected logFinding(finding: Finding): void {
    const icon =
      finding.severity === "critical"
        ? "🔴"
        : finding.severity === "high"
          ? "🟠"
          : finding.severity === "medium"
            ? "🟡"
            : "🔵";

    this.log(`${icon} [${finding.category}] ${finding.title}`);
    if (this.config.verbose) {
      this.log(`   ${finding.description.slice(0, 100)}`);
    }
  }

  /**
   * Make an HTTP request with error handling.
   */
  protected async fetch(
    url: string,
    options: RequestInit = {},
  ): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      let data: any;
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    } catch (e: any) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: e.message || String(e),
      };
    }
  }

  /**
   * Run with timeout.
   */
  private async runWithTimeout(
    fn: () => Promise<void>,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
    });
  }
}

/**
 * Helper to run multiple test functions and collect findings.
 */
export async function runTests<T>(
  items: T[],
  testFn: (item: T) => Promise<void>,
  options: {
    parallel?: boolean;
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<void> {
  const { parallel = false, concurrency = 5, onProgress } = options;

  if (!parallel) {
    for (let i = 0; i < items.length; i++) {
      await testFn(items[i]);
      onProgress?.(i + 1, items.length);
    }
    return;
  }

  // Parallel with concurrency limit
  const queue = [...items];
  let completed = 0;
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    while (running.length < concurrency && queue.length > 0) {
      const item = queue.shift()!;
      const promise = testFn(item).then(() => {
        completed++;
        onProgress?.(completed, items.length);
        running.splice(running.indexOf(promise), 1);
      });
      running.push(promise);
    }

    if (running.length > 0) {
      await Promise.race(running);
    }
  }
}
