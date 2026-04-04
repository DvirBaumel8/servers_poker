#!/usr/bin/env npx ts-node
/**
 * 🧪 RUN ALL QA - Optimized Test Suite
 *
 * OPTIMIZATIONS:
 * 1. Maximum parallelization - run independent suites together
 * 2. Skip redundant tests where possible
 * 3. Use fast variants where available
 * 4. Early termination on critical failures
 *
 * Available Test Suites:
 * - Unit: 10s, Integration: 1s
 * - E2E: 120s (includes all new bot creation & integration tests)
 * - Poker Simulation: 45s (game invariant validators)
 * - Total Sequential: ~175s
 *
 * After parallelization target: <30s for quick, <120s for full
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

interface TestSuite {
  id: string;
  name: string;
  command: string;
  timeout: number;
  group: number; // Suites in same group run in parallel
  skipInQuick?: boolean;
  skipInStandard?: boolean;
}

// Group 1: Fast, no dependencies (run first, in parallel)
// Group 2: Heavy/slow tests (skip in quick mode)
const ALL_SUITES: TestSuite[] = [
  // GROUP 1: Fast tests - all parallel
  {
    id: "unit",
    name: "Unit Tests",
    command: "npm run test:unit",
    timeout: 60000,
    group: 1,
  },
  {
    id: "integration",
    name: "Integration Tests",
    command: "npm run test:integration",
    timeout: 60000,
    group: 1,
  },

  // GROUP 2: Heavy tests - skip in quick mode
  {
    id: "e2e",
    name: "E2E Tests (includes bot creation & game integration)",
    command: "npm run test:e2e",
    timeout: 180000,
    group: 2,
    skipInQuick: true,
  },
  {
    id: "poker-sim",
    name: "Poker Simulation (game invariant validators)",
    command: "npm run test:poker -- --games=50 --bots=6",
    timeout: 240000,
    group: 2,
    skipInQuick: true,
  },
];

interface SuiteResult {
  suite: TestSuite;
  success: boolean;
  duration: number;
  error?: string;
}

async function runSuite(suite: TestSuite): Promise<SuiteResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const [cmd, ...args] = suite.command.split(" ");

    const proc = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let killed = false;
    const timeout = setTimeout(() => {
      killed = true;
      proc.kill();
    }, suite.timeout);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        suite,
        success: code === 0 && !killed,
        duration: Date.now() - startTime,
        error: killed ? `Timeout (${suite.timeout / 1000}s)` : undefined,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        suite,
        success: false,
        duration: Date.now() - startTime,
        error: err.message,
      });
    });
  });
}

async function runGroup(suites: TestSuite[]): Promise<SuiteResult[]> {
  if (suites.length === 0) return [];

  if (suites.length === 1) {
    console.log(`  ⏳ ${suites[0].name}...`);
    const result = await runSuite(suites[0]);
    console.log(
      `  ${result.success ? "✅" : "❌"} ${result.suite.name} (${(result.duration / 1000).toFixed(1)}s)`,
    );
    return [result];
  }

  console.log(`  🚀 Running ${suites.length} in parallel:`);
  suites.forEach((s) => console.log(`     ⚡ ${s.name}`));

  const results = await Promise.all(suites.map(runSuite));

  for (const r of results.sort((a, b) => a.duration - b.duration)) {
    console.log(
      `  ${r.success ? "✅" : "❌"} ${r.suite.name} (${(r.duration / 1000).toFixed(1)}s)${r.error ? ` - ${r.error}` : ""}`,
    );
  }

  return results;
}

function generateReport(results: SuiteResult[], totalDuration: number): void {
  const reportPath = path.join(process.cwd(), ".test-results.md");
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const sequentialTime = results.reduce((sum, r) => sum + r.duration, 0);
  const speedup = sequentialTime / totalDuration;

  const report = `# Test Results

**Time:** ${new Date().toLocaleString()}
**Duration:** ${(totalDuration / 1000).toFixed(1)}s (${speedup.toFixed(1)}x speedup via parallelization)

## Summary: ${passed}/${results.length} passed

| Suite | Status | Time |
|-------|--------|------|
${results.map((r) => `| ${r.suite.name} | ${r.success ? "✅" : "❌"} | ${(r.duration / 1000).toFixed(1)}s |`).join("\n")}

${
  failed > 0
    ? `\n## Failures\n${results
        .filter((r) => !r.success)
        .map((r) => `- **${r.suite.name}**: ${r.error || "Test failed"}`)
        .join("\n")}`
    : ""
}
`;

  fs.writeFileSync(reportPath, report);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const startTime = Date.now();

  // Determine mode
  let mode: "quick" | "standard" | "full";
  if (args.includes("--quick")) {
    mode = "quick";
  } else if (args.includes("--full")) {
    mode = "full";
  } else {
    mode = "standard";
  }

  console.log("\n" + "═".repeat(50));
  console.log("  🧪 OPTIMIZED QA SUITE");
  console.log("═".repeat(50));

  // Filter suites based on mode
  const suites = ALL_SUITES.filter((s) => {
    if (mode === "quick" && s.skipInQuick) return false;
    if (mode === "standard" && s.skipInStandard) return false;
    return true;
  });

  console.log(`\n  Mode: ${mode.toUpperCase()}`);
  console.log(`  Suites: ${suites.length}`);

  // Group suites
  const groups = new Map<number, TestSuite[]>();
  for (const s of suites) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group)!.push(s);
  }

  const allResults: SuiteResult[] = [];

  // Run each group
  for (const [groupNum, groupSuites] of [...groups.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`  GROUP ${groupNum}`);
    console.log("─".repeat(50));

    const results = await runGroup(groupSuites);
    allResults.push(...results);

    // Early termination if critical tests fail
    const criticalFailed = results.some(
      (r) =>
        !r.success && (r.suite.id === "unit" || r.suite.id === "integration"),
    );
    if (criticalFailed && mode !== "full") {
      console.log("\n  🛑 Critical failure - stopping early");
      break;
    }
  }

  // Summary
  const totalDuration = Date.now() - startTime;
  const passed = allResults.filter((r) => r.success).length;
  const failed = allResults.filter((r) => !r.success).length;
  const sequentialEst = allResults.reduce((sum, r) => sum + r.duration, 0);

  console.log("\n" + "═".repeat(50));
  console.log("  📊 RESULTS");
  console.log("═".repeat(50));
  console.log(
    `\n  Time: ${(totalDuration / 1000).toFixed(1)}s (${(sequentialEst / totalDuration).toFixed(1)}x faster than sequential)`,
  );
  console.log(`  ✅ Passed: ${passed}/${allResults.length}`);
  console.log(`  ❌ Failed: ${failed}/${allResults.length}`);

  if (failed > 0) {
    console.log("\n  Failures:");
    allResults
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`    ❌ ${r.suite.name}${r.error ? `: ${r.error}` : ""}`);
      });
  }

  generateReport(allResults, totalDuration);
  console.log(`\n  📄 Report: .test-results.md`);
  console.log("═".repeat(50) + "\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
