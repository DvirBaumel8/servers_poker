#!/usr/bin/env npx ts-node
/**
 * Monster Army Orchestrator
 *
 * The command center that coordinates all monsters.
 *
 * Features:
 * - Run monsters in parallel or sequence
 * - Aggregate results from all monsters
 * - Invoke the Evolution Agent for analysis
 * - Generate consolidated reports
 * - Handle CI integration (exit codes, PR comments)
 *
 * Usage:
 *   npx ts-node tests/qa/monsters/orchestrator.ts [monsters...] [--options]
 *
 * Examples:
 *   npx ts-node orchestrator.ts                    # Run all monsters
 *   npx ts-node orchestrator.ts api visual         # Run specific monsters
 *   npx ts-node orchestrator.ts --quick            # Run quick subset
 *   npx ts-node orchestrator.ts --ci               # CI mode (JSON output)
 */

import {
  RunConfig,
  AggregatedRunResult,
  RunResult,
  MonsterType,
  countBySeverity,
  shouldFailRun,
} from "./shared/types";
import {
  printConsoleReport,
  generateMarkdownReport,
  generateJsonReport,
  printEvolutionReport,
} from "./shared/reporter";
import { ApiMonster } from "./api-monster/api-monster";
import { VisualMonster } from "./visual-monster/visual-monster";
import { InvariantMonster } from "./invariant-monster/invariant-monster";
import { ChaosMonster } from "./chaos-monster/chaos-monster";
import { GuardianMonster } from "./guardian-monster/guardian-monster";
import { ApiDbConnector } from "./connectors/api-db-connector";
import { ApiWsConnector } from "./connectors/api-ws-connector";
import { GameFlowMonster } from "./flows/game-flow-monster";
import { TournamentFlowMonster } from "./flows/tournament-flow-monster";
import { E2EMonster } from "./e2e-monster/e2e-monster";
import { ContractMonster } from "./contract-monster/contract-monster";
import { BrowserMonster } from "./browser-monster/browser-monster";
import { CssLintMonster } from "./browser-monster/css-lint-monster";
import { LayoutLintMonster } from "./browser-monster/layout-lint-monster";
import { DesignCriticMonster } from "./browser-monster/design-critic-monster";
import { CodeQualityMonster } from "./code-quality-monster/code-quality-monster";
import { BrowserQAMonster } from "./browser-monster/browser-qa-monster";
import { SimulationMonster } from "./simulation-monster/simulation-monster";
import { EvolutionAgent } from "./evolution/evolution-agent";
import { getMemoryStore } from "./memory/memory-store";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

// ============================================================================
// MONSTER REGISTRY BY LAYER
// ============================================================================

// Layer 1: Unit Monsters (single system)
const UNIT_MONSTERS: Record<string, () => any> = {
  api: () => new ApiMonster(),
  visual: () => new VisualMonster(),
  invariant: () => new InvariantMonster(),
  contract: () => new ContractMonster(),
  browser: () => new BrowserMonster(),
  "browser-qa": () => new BrowserQAMonster(),
  "css-lint": () => new CssLintMonster(),
  "layout-lint": () => new LayoutLintMonster(),
  "design-critic": () => new DesignCriticMonster(),
  "code-quality": () => new CodeQualityMonster(),
  guardian: () => new GuardianMonster(),
  chaos: () => new ChaosMonster(),
};

// Layer 2: Connector Monsters (two systems)
const CONNECTOR_MONSTERS: Record<string, () => any> = {
  "api-db": () => new ApiDbConnector(),
  "api-ws": () => new ApiWsConnector(),
  // Placeholders
  "ws-ui": () => null,
  "auth-flow": () => null,
};

// Layer 3: Flow Monsters (multi-system flows)
const FLOW_MONSTERS: Record<string, () => any> = {
  "game-flow": () => new GameFlowMonster(),
  "tournament-flow": () => new TournamentFlowMonster(),
  simulation: () => new SimulationMonster(), // Live game invariant validation
  // Placeholders
  "betting-flow": () => null,
  "player-flow": () => null,
};

// Layer 4: E2E Monster (full system)
const E2E_MONSTERS: Record<string, () => any> = {
  e2e: () => new E2EMonster(),
};

// Combined registry
const MONSTER_REGISTRY: Record<MonsterType | string, () => any> = {
  ...UNIT_MONSTERS,
  ...CONNECTOR_MONSTERS,
  ...FLOW_MONSTERS,
  ...E2E_MONSTERS,
  // Legacy/unimplemented
  perf: () => null, // TODO: Performance monster
};

// Presets (cast to MonsterType[] for type safety)
const QUICK_MONSTERS: MonsterType[] = [
  "api",
  "invariant",
  "contract",
  "css-lint",
];
const UNIT_ONLY: MonsterType[] = Object.keys(UNIT_MONSTERS) as MonsterType[];
const CONNECTORS_ONLY: MonsterType[] = Object.keys(
  CONNECTOR_MONSTERS,
) as MonsterType[];
const FLOWS_ONLY: MonsterType[] = Object.keys(FLOW_MONSTERS) as MonsterType[];
const PR_MONSTERS: MonsterType[] = [...UNIT_ONLY, ...CONNECTORS_ONLY];
const NIGHTLY_MONSTERS: MonsterType[] = [
  ...UNIT_ONLY,
  ...CONNECTORS_ONLY,
  ...FLOWS_ONLY,
  "simulation",
];
const ALL_MONSTERS: MonsterType[] = [
  "api",
  "visual",
  "invariant",
  "contract",
  "css-lint",
  "layout-lint",
  "design-critic",
  "code-quality",
  "guardian",
];
const ALL_WITH_SIMULATION: MonsterType[] = [...ALL_MONSTERS, "simulation"];

// ============================================================================
// ORCHESTRATOR
// ============================================================================

interface OrchestratorOptions {
  monsters: MonsterType[];
  parallel: boolean;
  ciMode: boolean;
  outputDir: string;
  verbose: boolean;
  skipEvolution: boolean;
  autoImprove: boolean;
  autoImproveCommit: boolean;
  dryRun: boolean;
}

async function runOrchestrator(options: OrchestratorOptions): Promise<void> {
  const startTime = new Date();

  console.log("\n" + "═".repeat(70));
  console.log("  🦖 MONSTER ARMY - ORCHESTRATOR");
  console.log("═".repeat(70) + "\n");

  // Create run config
  const runConfig: RunConfig = {
    version: 1,
    runId: `monster-army-${Date.now()}`,
    startTime,
    monsters: options.monsters,
    triggeredBy: options.ciMode ? "ci" : "manual",
    gitCommit: getGitCommit(),
    gitBranch: getGitBranch(),
    changedFiles: getChangedFiles(),
  };

  console.log(`Run ID: ${runConfig.runId}`);
  console.log(`Monsters: ${options.monsters.join(", ")}`);
  console.log(`Mode: ${options.parallel ? "parallel" : "sequential"}`);
  if (runConfig.gitCommit) {
    console.log(`Commit: ${runConfig.gitCommit.slice(0, 8)}`);
  }
  console.log("");

  // Run monsters
  const monsterResults = new Map<MonsterType, RunResult>();

  if (options.parallel) {
    // Run in parallel
    console.log("Running monsters in parallel...\n");
    const promises = options.monsters.map(async (monsterType) => {
      const factory = MONSTER_REGISTRY[monsterType];
      if (!factory) {
        console.log(`⚠️  ${monsterType} monster not registered`);
        return null;
      }
      const monster = factory();
      if (!monster || typeof monster.run !== "function") {
        console.log(`⚠️  ${monsterType} monster not implemented yet`);
        return null;
      }
      const result = await monster.run(runConfig);
      return { monsterType, result };
    });

    const results = await Promise.all(promises);
    for (const item of results) {
      if (item) {
        monsterResults.set(item.monsterType, item.result);
      }
    }
  } else {
    // Run sequentially
    for (const monsterType of options.monsters) {
      console.log(`\n${"─".repeat(50)}`);
      console.log(`Running ${monsterType} monster...`);
      console.log("─".repeat(50));

      const factory = MONSTER_REGISTRY[monsterType];
      if (!factory) {
        console.log(`⚠️  ${monsterType} monster not registered`);
        continue;
      }
      const monster = factory();
      if (!monster || typeof monster.run !== "function") {
        console.log(`⚠️  ${monsterType} monster not implemented yet`);
        continue;
      }

      const result = await monster.run(runConfig);
      monsterResults.set(monsterType, result);
    }
  }

  // Aggregate results
  const endTime = new Date();
  const aggregatedResult = aggregateResults(runConfig, monsterResults, endTime);

  // Run Evolution Agent
  let evolutionReport;
  if (!options.skipEvolution) {
    console.log("\n" + "─".repeat(50));
    console.log("Running Evolution Agent...");
    console.log("─".repeat(50));

    const evolution = new EvolutionAgent(undefined, {
      autoImproveEnabled: options.autoImprove,
      autoImproveCommit: options.autoImproveCommit,
      dryRun: options.dryRun,
    });
    evolutionReport = await evolution.analyze(aggregatedResult);

    if (options.autoImprove) {
      console.log("\n🤖 Auto-improve mode was enabled");
      if (options.dryRun) {
        console.log("   (DRY RUN - no changes were actually made)");
      }
    }
  }

  // Generate reports
  console.log("\n" + "─".repeat(50));
  console.log("Generating reports...");
  console.log("─".repeat(50));

  if (options.ciMode) {
    // CI mode: Output JSON
    const jsonReport = generateJsonReport(aggregatedResult);
    console.log(jsonReport);
  } else {
    // Interactive mode: Console report
    printConsoleReport(aggregatedResult);

    if (evolutionReport) {
      printEvolutionReport(evolutionReport);
    }
  }

  // Save reports to files
  // Primary location: docs/qa-reports/ (single file, always updated)
  const docsReportDir = join(process.cwd(), "docs/qa-reports");
  // Archive location: tests/qa/monsters/reports/<run-id>/ (historical)
  const archiveDir = join(process.cwd(), options.outputDir, runConfig.runId);

  try {
    const { mkdirSync, existsSync } = await import("fs");

    // Create docs/qa-reports if needed
    if (!existsSync(docsReportDir)) {
      mkdirSync(docsReportDir, { recursive: true });
    }

    // Write to single consolidated file in docs/ (overwrites previous)
    writeFileSync(
      join(docsReportDir, "LATEST-REPORT.md"),
      generateMarkdownReport(aggregatedResult),
    );
    writeFileSync(
      join(docsReportDir, "LATEST-REPORT.json"),
      generateJsonReport(aggregatedResult),
    );

    console.log(`\n📄 Report saved to: docs/qa-reports/LATEST-REPORT.md`);

    // Also archive to historical folder (optional, for debugging)
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }
    writeFileSync(
      join(archiveDir, "report.json"),
      generateJsonReport(aggregatedResult),
    );
    writeFileSync(
      join(archiveDir, "report.md"),
      generateMarkdownReport(aggregatedResult),
    );
  } catch (e) {
    console.warn(`Could not save reports: ${e}`);
  }

  // Exit with appropriate code
  const exitCode = aggregatedResult.exitCode;
  console.log(`\nExit code: ${exitCode}`);

  if (exitCode !== 0) {
    console.log("\n❌ Run FAILED - see findings above\n");
  } else {
    console.log("\n✅ Run PASSED\n");
  }

  process.exit(exitCode);
}

// ============================================================================
// RESULT AGGREGATION
// ============================================================================

function aggregateResults(
  config: RunConfig,
  monsterResults: Map<MonsterType, RunResult>,
  endTime: Date,
): AggregatedRunResult {
  const allFindings = [];
  let totalCritical = 0;
  let totalHigh = 0;
  let totalMedium = 0;
  let totalLow = 0;
  const byMonster: Record<MonsterType, number> = {} as any;

  for (const [monster, result] of monsterResults) {
    allFindings.push(...result.findings);

    totalCritical += result.findingsSummary.critical;
    totalHigh += result.findingsSummary.high;
    totalMedium += result.findingsSummary.medium;
    totalLow += result.findingsSummary.low;
    byMonster[monster] = result.findings.length;
  }

  const passed = !shouldFailRun(allFindings);
  const hasErrors = Array.from(monsterResults.values()).some((r) => r.error);

  return {
    runId: config.runId,
    config,
    startTime: config.startTime,
    endTime,
    duration: endTime.getTime() - config.startTime.getTime(),
    monsterResults,
    allFindings,
    findingsSummary: {
      critical: totalCritical,
      high: totalHigh,
      medium: totalMedium,
      low: totalLow,
      total: allFindings.length,
      byMonster,
    },
    passed,
    exitCode: hasErrors ? 2 : passed ? 0 : 1,
    newFindings: [],
    regressions: [],
    fixed: [],
  };
}

// ============================================================================
// GIT HELPERS
// ============================================================================

function getGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function getGitBranch(): string | undefined {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

function getChangedFiles(): string[] {
  try {
    const output = execSync("git diff --name-only HEAD~1 HEAD", {
      encoding: "utf8",
    }).trim();
    return output ? output.split("\n") : [];
  } catch {
    return [];
  }
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): OrchestratorOptions {
  const args = process.argv.slice(2);

  const options: OrchestratorOptions = {
    monsters: [],
    parallel: false,
    ciMode: false,
    outputDir: "tests/qa/monsters/reports",
    verbose: false,
    skipEvolution: false,
    autoImprove: false,
    autoImproveCommit: false,
    dryRun: true,
  };

  for (const arg of args) {
    if (arg === "--parallel" || arg === "-p") {
      options.parallel = true;
    } else if (arg === "--ci") {
      options.ciMode = true;
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--quick" || arg === "-q") {
      options.monsters = QUICK_MONSTERS as any;
    } else if (arg === "--all" || arg === "-a") {
      options.monsters = ALL_MONSTERS as any;
    } else if (arg === "--unit") {
      options.monsters = UNIT_ONLY as any;
    } else if (arg === "--connectors") {
      options.monsters = CONNECTORS_ONLY as any;
    } else if (arg === "--flows") {
      options.monsters = FLOWS_ONLY as any;
    } else if (arg === "--pr") {
      options.monsters = PR_MONSTERS as any;
    } else if (arg === "--nightly") {
      options.monsters = NIGHTLY_MONSTERS as any;
    } else if (arg === "--skip-evolution") {
      options.skipEvolution = true;
    } else if (arg === "--auto-improve") {
      options.autoImprove = true;
      options.dryRun = true; // Default to dry run for safety
    } else if (arg === "--auto-improve-commit") {
      options.autoImprove = true;
      options.autoImproveCommit = true;
      options.dryRun = false;
    } else if (arg === "--no-dry-run") {
      options.dryRun = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      // Assume it's a monster name
      if (arg in MONSTER_REGISTRY) {
        options.monsters.push(arg as MonsterType);
      } else {
        console.error(`Unknown monster: ${arg}`);
        console.error(`Available: ${Object.keys(MONSTER_REGISTRY).join(", ")}`);
        process.exit(1);
      }
    }
  }

  // Default to all implemented monsters
  if (options.monsters.length === 0) {
    options.monsters = ALL_MONSTERS;
  }

  return options;
}

function printHelp(): void {
  console.log(`
Monster Army Orchestrator

Usage:
  npx ts-node orchestrator.ts [monsters...] [options]

LAYER 1 - UNIT MONSTERS (single system):
  api          API endpoint testing
  visual       Visual and responsive testing
  invariant    Poker game invariant checking
  contract     Frontend-backend contract validation
  browser      Real browser UI testing (MCP-based)
  css-lint     CSS accessibility and UX linting (button styling, hover states)
  layout-lint  Layout and z-index conflict detection
  design-critic  Design quality critique vs competitors (PokerStars, GGPoker)
  guardian     Security + a11y (planned)

LAYER 2 - CONNECTOR MONSTERS (two systems):
  api-db       API ↔ Database integration
  api-ws       API ↔ WebSocket integration
  ws-ui        WebSocket ↔ UI (planned)
  auth-flow    Auth ↔ All systems (planned)

LAYER 3 - FLOW MONSTERS (multi-system):
  game-flow        Complete hand flow
  tournament-flow  Tournament lifecycle

LAYER 4 - E2E MONSTER (full system):
  e2e          Full user journeys (planned)

PRESETS:
  --quick, -q     Quick subset (api, invariant)
  --unit          Layer 1 only (all unit monsters)
  --connectors    Layer 2 only (all connector monsters)
  --flows         Layer 3 only (all flow monsters)
  --pr            Layers 1+2 (for PR validation)
  --nightly       Layers 1+2+3 (nightly runs)
  --all, -a       All implemented monsters

OPTIONS:
  --parallel, -p         Run monsters in parallel
  --ci                   CI mode (JSON output, no colors)
  --verbose, -v          Verbose output
  --skip-evolution       Skip Evolution Agent analysis
  --auto-improve         Enable auto-improvement (DRY RUN by default)
  --auto-improve-commit  Auto-improve + commit changes to new branch
  --no-dry-run           Actually apply changes (use with --auto-improve)
  --help, -h             Show this help

AUTO-IMPROVE MODE:
  When enabled, the Evolution Agent can actually modify monster configs
  and create new test files based on its analysis.

  Safety levels:
    --auto-improve              Preview what would change (safe)
    --auto-improve --no-dry-run Actually write changes to files
    --auto-improve-commit       Write changes + commit to new branch

EXAMPLES:
  npx ts-node orchestrator.ts                    # Run default monsters
  npx ts-node orchestrator.ts api api-db         # API + API-DB connector
  npx ts-node orchestrator.ts --pr               # PR validation (layers 1+2)
  npx ts-node orchestrator.ts --flows            # Flow tests only
  npx ts-node orchestrator.ts --nightly --parallel # Full nightly run
`);
}

// ============================================================================
// MAIN
// ============================================================================

const options = parseArgs();
runOrchestrator(options).catch((err) => {
  console.error("Orchestrator failed:", err);
  process.exit(2);
});
