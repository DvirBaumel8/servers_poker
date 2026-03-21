/**
 * Monster Army - CLI Runner
 *
 * Utilities for running monsters from the command line.
 * Reduces boilerplate in monster entry points.
 */

import { BaseMonster, MonsterConfig } from "./base-monster";
import { RunConfig, MonsterType } from "./types";

/**
 * Options for running a monster from CLI.
 */
export interface CliRunnerOptions {
  verbose?: boolean;
  timeout?: number;
}

/**
 * Create a RunConfig for CLI execution.
 */
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

/**
 * Run a monster from the CLI with standard error handling.
 *
 * @example
 * // In your monster file:
 * if (require.main === module) {
 *   runMonsterCli(new MyMonster(), 'my-monster');
 * }
 */
export function runMonsterCli(
  monster: BaseMonster,
  monsterType: MonsterType,
  options: CliRunnerOptions = {},
): void {
  const runConfig = createCliRunConfig(monsterType, options);

  monster
    .run(runConfig)
    .then((result) => {
      console.log("\n" + "─".repeat(60));
      console.log(`${monsterType.toUpperCase()} MONSTER COMPLETE`);
      console.log("─".repeat(60));
      console.log(`Passed: ${result.passed ? "✅ YES" : "❌ NO"}`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(
        `Findings: ${result.findingsSummary?.total ?? result.findings.length}`,
      );

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

      process.exit(result.passed ? 0 : 1);
    })
    .catch((error) => {
      console.error("\n❌ Monster crashed:", error.message || error);
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
