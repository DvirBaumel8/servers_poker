#!/usr/bin/env npx ts-node
/**
 * 🧪 RUN ALL QA - Complete Test Suite (Optimized)
 *
 * Runs ALL testing tools with smart concurrency:
 * - Unit Tests, Integration Tests, E2E Tests
 * - Simulations, Monsters, Visual Tests
 * - Load Tests, Chaos Tests, Monitoring Tests
 *
 * Optimizations:
 * - Parallel execution within safe groups
 * - Early termination on critical failures (optional)
 * - Resource-aware grouping (DB vs browser vs CPU)
 *
 * Usage:
 *   npm run qa:all          # Standard (parallel where safe)
 *   npm run qa:all:quick    # Quick validation only
 *   npm run qa:all:full     # Full comprehensive suite
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

interface TestSuite {
  id: string;
  name: string;
  command: string;
  category:
    | "unit"
    | "integration"
    | "e2e"
    | "simulation"
    | "monster"
    | "visual"
    | "load"
    | "chaos"
    | "monitoring";
  tier: "quick" | "standard" | "full";
  timeout: number;
  resourceGroup: "cpu" | "db" | "browser" | "network"; // For smart parallelization
  critical: boolean; // If true, failure stops the run
}

const ALL_SUITES: TestSuite[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: QUICK (< 30 seconds) - Basic validation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "unit",
    name: "Unit Tests",
    command: "npm run test:unit",
    category: "unit",
    tier: "quick",
    timeout: 60000,
    resourceGroup: "cpu",
    critical: true,
  },
  {
    id: "monsters-fast",
    name: "Monsters (Fast)",
    command: "npx ts-node tests/qa/monsters/run-all.ts --fast",
    category: "monster",
    tier: "quick",
    timeout: 30000,
    resourceGroup: "browser",
    critical: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: STANDARD (30s - 2 min) - Normal validation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "integration",
    name: "Integration Tests",
    command: "npm run test:integration",
    category: "integration",
    tier: "standard",
    timeout: 120000,
    resourceGroup: "db",
    critical: false,
  },
  {
    id: "monsters-all",
    name: "Monsters (All 21)",
    command: "npm run monsters:all",
    category: "monster",
    tier: "standard",
    timeout: 60000,
    resourceGroup: "browser",
    critical: false,
  },
  {
    id: "sim-basic",
    name: "Basic Simulation",
    command: "npm run sim:basic",
    category: "simulation",
    tier: "standard",
    timeout: 120000,
    resourceGroup: "db",
    critical: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: FULL (> 2 min) - Comprehensive validation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "e2e",
    name: "E2E Tests",
    command: "npm run test:e2e",
    category: "e2e",
    tier: "full",
    timeout: 300000,
    resourceGroup: "db",
    critical: false,
  },
  {
    id: "sim-all",
    name: "All Simulations",
    command: "npm run sim:all",
    category: "simulation",
    tier: "full",
    timeout: 300000,
    resourceGroup: "db",
    critical: false,
  },
  {
    id: "visual",
    name: "Visual Tests",
    command: "npm run test:visual",
    category: "visual",
    tier: "full",
    timeout: 180000,
    resourceGroup: "browser",
    critical: false,
  },
  {
    id: "load-quick",
    name: "Load Tests (Quick)",
    command: "npm run load:quick",
    category: "load",
    tier: "full",
    timeout: 120000,
    resourceGroup: "network",
    critical: false,
  },
  {
    id: "chaos-light",
    name: "Chaos Tests (Light)",
    command: "npm run chaos:light",
    category: "chaos",
    tier: "full",
    timeout: 180000,
    resourceGroup: "db",
    critical: false,
  },
  {
    id: "monitoring",
    name: "Monitoring Tests",
    command: "npm run test:monitoring:quick",
    category: "monitoring",
    tier: "full",
    timeout: 60000,
    resourceGroup: "network",
    critical: false,
  },
];

// ============================================================================
// PARALLEL EXECUTION GROUPS
// Suites in the same group can run together safely
// ============================================================================

const PARALLEL_GROUPS: Record<string, string[][]> = {
  quick: [
    ["unit", "monsters-fast"], // CPU + Browser = safe parallel
  ],
  standard: [
    ["integration", "monsters-all"], // DB + Browser = safe parallel
    ["sim-basic"], // Needs DB exclusively
  ],
  full: [
    ["visual", "monitoring", "load-quick"], // Browser + Network = safe parallel
    ["e2e"], // Needs DB exclusively
    ["sim-all"], // Needs DB exclusively
    ["chaos-light"], // Needs DB exclusively
  ],
};

// ============================================================================
// RUNNER
// ============================================================================

interface SuiteResult {
  suite: TestSuite;
  success: boolean;
  duration: number;
  output: string;
  error?: string;
}

async function runSuite(suite: TestSuite): Promise<SuiteResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const output: string[] = [];
    const [cmd, ...args] = suite.command.split(" ");

    const proc = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    proc.stdout.on("data", (data) => output.push(data.toString()));
    proc.stderr.on("data", (data) => output.push(data.toString()));

    proc.on("close", (code) => {
      resolve({
        suite,
        success: code === 0,
        duration: Date.now() - startTime,
        output: output.join(""),
      });
    });

    proc.on("error", (err) => {
      resolve({
        suite,
        success: false,
        duration: Date.now() - startTime,
        output: output.join(""),
        error: err.message,
      });
    });

    setTimeout(() => {
      proc.kill();
      resolve({
        suite,
        success: false,
        duration: Date.now() - startTime,
        output: output.join(""),
        error: `Timeout after ${suite.timeout / 1000}s`,
      });
    }, suite.timeout);
  });
}

async function runGroup(
  suiteIds: string[],
  allSuites: TestSuite[],
): Promise<SuiteResult[]> {
  const suites = suiteIds
    .map((id) => allSuites.find((s) => s.id === id)!)
    .filter(Boolean);

  if (suites.length === 0) return [];

  if (suites.length === 1) {
    console.log(`  ⏳ Running: ${suites[0].name}...`);
    const result = await runSuite(suites[0]);
    const icon = result.success ? "✅" : "❌";
    console.log(
      `  ${icon} ${result.suite.name} (${(result.duration / 1000).toFixed(1)}s)`,
    );
    return [result];
  }

  // Parallel execution
  console.log(`  🚀 Running ${suites.length} suites in parallel...`);
  for (const s of suites) {
    console.log(`    ⚡ ${s.name}`);
  }

  const results = await Promise.all(suites.map(runSuite));

  for (const r of results.sort((a, b) => a.duration - b.duration)) {
    const icon = r.success ? "✅" : "❌";
    console.log(
      `  ${icon} ${r.suite.name} (${(r.duration / 1000).toFixed(1)}s)`,
    );
  }

  return results;
}

// ============================================================================
// REPORT
// ============================================================================

function generateReport(results: SuiteResult[], totalDuration: number): void {
  const reportPath = path.join(process.cwd(), "docs/qa_report.md");

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  const byCategory: Record<string, SuiteResult[]> = {};
  for (const r of results) {
    if (!byCategory[r.suite.category]) byCategory[r.suite.category] = [];
    byCategory[r.suite.category].push(r);
  }

  // Calculate time saved by parallelization
  const sequentialTime = results.reduce((sum, r) => sum + r.duration, 0);
  const timeSaved = sequentialTime - totalDuration;

  const report = `# 🧪 Complete QA Report

**Generated:** ${new Date().toLocaleString()}
**Total Duration:** ${(totalDuration / 1000).toFixed(1)}s
**Time Saved (parallel):** ${(timeSaved / 1000).toFixed(1)}s (${((timeSaved / sequentialTime) * 100).toFixed(0)}% faster)

## Summary

| Metric | Value |
|--------|-------|
| Total Suites | ${results.length} |
| Passed | ${passed} |
| Failed | ${failed} |
| Success Rate | ${((passed / results.length) * 100).toFixed(1)}% |

## Results by Category

${Object.entries(byCategory)
  .map(
    ([category, catResults]) => `
### ${category.charAt(0).toUpperCase() + category.slice(1)}

| Suite | Status | Duration |
|-------|--------|----------|
${catResults.map((r) => `| ${r.suite.name} | ${r.success ? "✅ Pass" : "❌ Fail"} | ${(r.duration / 1000).toFixed(1)}s |`).join("\n")}
`,
  )
  .join("\n")}

## Failed Suites

${
  failed === 0
    ? "*All suites passed!*"
    : results
        .filter((r) => !r.success)
        .map(
          (r) => `
### ${r.suite.name}
- **Error:** ${r.error || "Test assertions failed"}
- **Duration:** ${(r.duration / 1000).toFixed(1)}s
- **Command:** \`${r.suite.command}\`
`,
        )
        .join("\n")
}

## Optimization Stats

| Metric | Value |
|--------|-------|
| Sequential Time (est.) | ${(sequentialTime / 1000).toFixed(1)}s |
| Actual Time | ${(totalDuration / 1000).toFixed(1)}s |
| Time Saved | ${(timeSaved / 1000).toFixed(1)}s |
| Speedup | ${(sequentialTime / totalDuration).toFixed(1)}x |

---
*Run \`npm run qa:all\` to regenerate this report.*
`;

  fs.writeFileSync(reportPath, report);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const startTime = Date.now();

  console.log("\n" + "═".repeat(60));
  console.log("  🧪 COMPLETE QA SUITE (Optimized)");
  console.log("═".repeat(60));

  // Determine which tiers to run
  let tiers: Array<"quick" | "standard" | "full">;
  let mode: string;

  if (args.includes("--quick")) {
    tiers = ["quick"];
    mode = "⚡ QUICK (parallel unit + monsters)";
  } else if (args.includes("--full")) {
    tiers = ["quick", "standard", "full"];
    mode = "🔴 FULL (all tests, optimized parallel)";
  } else {
    tiers = ["quick", "standard"];
    mode = "🔶 STANDARD (optimized parallel)";
  }

  const suitesToRun = ALL_SUITES.filter((s) => tiers.includes(s.tier));

  console.log(`\n  Mode: ${mode}`);
  console.log(`  Suites: ${suitesToRun.length}/${ALL_SUITES.length}`);
  console.log(`  Tiers: ${tiers.join(", ")}`);
  console.log(`  Strategy: Smart parallel by resource group`);

  const allResults: SuiteResult[] = [];

  for (const tier of tiers) {
    const groups = PARALLEL_GROUPS[tier] || [];
    const tierSuites = suitesToRun.filter((s) => s.tier === tier);

    if (tierSuites.length === 0) continue;

    console.log("\n" + "─".repeat(56));
    console.log(`  TIER: ${tier.toUpperCase()} (${tierSuites.length} suites)`);
    console.log("─".repeat(56));

    // Run each group in the tier
    for (const group of groups) {
      // Filter to only include suites in this tier
      const groupSuiteIds = group.filter((id) =>
        tierSuites.some((s) => s.id === id),
      );
      if (groupSuiteIds.length === 0) continue;

      const results = await runGroup(groupSuiteIds, suitesToRun);
      allResults.push(...results);
    }

    // Check for critical failures
    const criticalFailed = allResults.some(
      (r) => !r.success && r.suite.critical,
    );
    if (criticalFailed) {
      console.log(`\n  🛑 Critical test failed - stopping early`);
      break;
    }
  }

  // Final summary
  const totalDuration = Date.now() - startTime;
  const passed = allResults.filter((r) => r.success).length;
  const failed = allResults.filter((r) => !r.success).length;
  const sequentialEst = allResults.reduce((sum, r) => sum + r.duration, 0);

  console.log("\n" + "═".repeat(60));
  console.log("  📊 FINAL RESULTS");
  console.log("═".repeat(60));

  console.log(`\n  ⏱️  Total Time: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(
    `  ⚡ Sequential would be: ${(sequentialEst / 1000).toFixed(1)}s`,
  );
  console.log(
    `  🚀 Speedup: ${(sequentialEst / totalDuration).toFixed(1)}x faster`,
  );
  console.log(`\n  ✅ Passed: ${passed}/${allResults.length}`);
  console.log(`  ❌ Failed: ${failed}/${allResults.length}`);

  if (failed > 0) {
    console.log("\n  Failed suites:");
    for (const r of allResults.filter((r) => !r.success)) {
      console.log(`    ❌ ${r.suite.name}: ${r.error || "assertions failed"}`);
    }
  }

  generateReport(allResults, totalDuration);
  console.log(`\n  📄 Report: docs/qa_report.md`);

  console.log("\n" + "═".repeat(60) + "\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA Suite failed:", err);
  process.exit(1);
});
