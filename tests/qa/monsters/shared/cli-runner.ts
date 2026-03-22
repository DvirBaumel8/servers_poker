/**
 * Monster Army - CLI Runner
 *
 * Utilities for running monsters from the command line.
 * Reduces boilerplate in monster entry points.
 *
 * OUTPUT CONTRACT:
 * Every monster emits a final JSON line prefixed with MONSTER_RESULT_JSON:
 * that run-all.ts parses to determine pass/fail, issue counts, and checks.
 * This replaces fragile regex-based stdout parsing.
 */

import { BaseMonster, MonsterConfig } from "./base-monster";
import { RunConfig, MonsterType } from "./types";
import { generateReport } from "./issue-tracker";

/**
 * Structured result emitted by every monster on its final stdout line.
 * run-all.ts parses this instead of using regex heuristics.
 */
export interface MonsterResultEnvelope {
  passed: boolean;
  skipped: boolean;
  duration: number;
  findings: number;
  checks: number;
  severity: { critical: number; high: number; medium: number; low: number };
  error?: string;
}

const RESULT_PREFIX = "MONSTER_RESULT_JSON:";

/**
 * Emit the structured result envelope to stdout.
 */
function emitResult(envelope: MonsterResultEnvelope): void {
  console.log(`${RESULT_PREFIX}${JSON.stringify(envelope)}`);
}

/**
 * Parse a structured result from monster output.
 * Returns null if no valid envelope is found.
 */
export function parseResultFromOutput(
  output: string,
): MonsterResultEnvelope | null {
  const lines = output.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith(RESULT_PREFIX)) {
      try {
        return JSON.parse(line.slice(RESULT_PREFIX.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export interface CliRunnerOptions {
  verbose?: boolean;
  timeout?: number;
}

export function createCliRunConfig(
  monsterType: MonsterType,
  options: CliRunnerOptions = {},
): RunConfig {
  return {
    version: 1,
    runId: `${monsterType}-${Date.now()}`,
    startTime: new Date(),
    monsters: [monsterType],
    triggeredBy: "manual",
  };
}

export function runMonsterCli(
  monster: BaseMonster,
  monsterType: MonsterType,
  options: CliRunnerOptions = {},
): void {
  const runConfig = createCliRunConfig(monsterType, options);

  monster
    .run(runConfig)
    .then((result) => {
      if (result.skipped) {
        console.log(`\nSKIPPED: ${result.skipReason}`);
        emitResult({
          passed: true,
          skipped: true,
          duration: 0,
          findings: 0,
          checks: 0,
          severity: { critical: 0, high: 0, medium: 0, low: 0 },
        });
        process.exit(0);
      }

      console.log("\n" + "─".repeat(60));
      console.log(`${monsterType.toUpperCase()} MONSTER COMPLETE`);
      console.log("─".repeat(60));
      console.log(`Passed: ${result.passed ? "✅ YES" : "❌ NO"}`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(
        `Findings: ${result.findingsSummary?.total ?? result.findings.length}`,
      );

      if (result.checksPerformed !== undefined) {
        console.log(`Checks performed: ${result.checksPerformed}`);
      }

      if (result.findingsSummary) {
        const s = result.findingsSummary;
        console.log(
          `  Critical: ${s.critical}, High: ${s.high}, Medium: ${s.medium}, Low: ${s.low}`,
        );
      }

      if (result.error) {
        console.log(`Error: ${result.error}`);
      }

      console.log("─".repeat(60));

      const summary = result.findingsSummary || {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: result.findings.length,
      };

      emitResult({
        passed: result.passed,
        skipped: false,
        duration: result.duration,
        findings: summary.total,
        checks: result.checksPerformed || 0,
        severity: {
          critical: summary.critical,
          high: summary.high,
          medium: summary.medium,
          low: summary.low,
        },
        error: result.error,
      });

      try {
        generateReport();
      } catch {
        // Report generation best-effort
      }

      process.exit(result.passed ? 0 : 1);
    })
    .catch((error) => {
      console.error("\n❌ Monster crashed:", error.message || error);
      emitResult({
        passed: false,
        skipped: false,
        duration: 0,
        findings: 0,
        checks: 0,
        severity: { critical: 0, high: 0, medium: 0, low: 0 },
        error: error.message || String(error),
      });
      process.exit(2);
    });
}

/**
 * Register a monster for CLI execution.
 * This is a simpler wrapper that checks if running as main module.
 *
 * @example
 * // At the end of your monster file:
 * registerMonsterCli(module, () => new MyMonster(), 'my-monster');
 */
export function registerMonsterCli(
  module: NodeModule,
  createMonster: () => BaseMonster,
  monsterType: MonsterType,
  options: CliRunnerOptions = {},
): void {
  if (require.main === module) {
    runMonsterCli(createMonster(), monsterType, options);
  }
}

/**
 * Parse CLI arguments for monster options.
 */
export function parseCliArgs(): CliRunnerOptions {
  const args = process.argv.slice(2);

  return {
    verbose: args.includes("--verbose") || args.includes("-v"),
    timeout: parseIntArg(args, "--timeout"),
  };
}

function parseIntArg(args: string[], name: string): number | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  const value = parseInt(args[idx + 1], 10);
  return isNaN(value) ? undefined : value;
}
