/**
 * Simulation Test Runner
 * ======================
 *
 * Runs all or selected simulation tests and reports results.
 *
 * Usage:
 *   npx ts-node tests/simulations/run-all.ts [options]
 *
 * Options:
 *   --basic       Run only basic simulation
 *   --single      Run only single-table simulation
 *   --multi       Run only multi-table simulation
 *   --all         Run all simulations (default)
 *   --verbose     Enable verbose logging
 *   --ci          CI mode - fail fast, minimal output
 */

import { BasicSimulation } from "./basic.simulation";
import { SingleTableSimulation } from "./single-table.simulation";
import { MultiTableSimulation } from "./multi-table.simulation";
import { SimulationResult } from "./simulation-runner";

interface SimulationRun {
  name: string;
  tier: "basic" | "single" | "multi";
  runner: () => Promise<SimulationResult>;
  result?: SimulationResult;
  summary?: string;
}

async function runSimulations() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const ciMode = args.includes("--ci");

  // Determine which simulations to run
  const runBasic =
    args.includes("--basic") || args.includes("--all") || args.length === 0;
  const runSingle =
    args.includes("--single") || args.includes("--all") || args.length === 0;
  const runMulti = args.includes("--multi") || args.includes("--all");

  console.log("\n" + "=".repeat(70));
  console.log("   POKER SIMULATION TEST SUITE");
  console.log("=".repeat(70));
  console.log(`\nMode: ${ciMode ? "CI" : "Interactive"}`);
  console.log(`Verbose: ${verbose}`);
  console.log(`\nSimulations to run:`);
  console.log(`  Basic (2-player):        ${runBasic ? "✓" : "skip"}`);
  console.log(`  Single-Table (9-player): ${runSingle ? "✓" : "skip"}`);
  console.log(`  Multi-Table (30-player): ${runMulti ? "✓" : "skip"}`);
  console.log("\n");

  const simulations: SimulationRun[] = [];

  if (runBasic) {
    simulations.push({
      name: "Basic (2-Player Heads-Up)",
      tier: "basic",
      runner: async () => {
        const sim = new BasicSimulation({ verboseLogging: verbose });
        const result = await sim.run();
        return result;
      },
    });
  }

  if (runSingle) {
    simulations.push({
      name: "Single-Table (9-Player Tournament)",
      tier: "single",
      runner: async () => {
        const sim = new SingleTableSimulation({ verboseLogging: verbose });
        const result = await sim.run();
        return result;
      },
    });
  }

  if (runMulti) {
    simulations.push({
      name: "Multi-Table (30-Player Tournament)",
      tier: "multi",
      runner: async () => {
        const sim = new MultiTableSimulation({
          verboseLogging: verbose,
          playerCount: args.includes("--small") ? 18 : 30,
        });
        const result = await sim.run();
        return result;
      },
    });
  }

  // Run simulations
  const startTime = Date.now();
  let passed = 0;
  let failed = 0;

  for (const sim of simulations) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`▶ Starting: ${sim.name}`);
    console.log(`${"─".repeat(70)}\n`);

    try {
      sim.result = await sim.runner();

      if (sim.result.success) {
        passed++;
        console.log(`\n✓ ${sim.name}: PASSED`);
      } else {
        failed++;
        console.log(`\n✗ ${sim.name}: FAILED`);

        // Print failures
        const failedAssertions = sim.result.assertions.filter((a) => !a.passed);
        for (const a of failedAssertions) {
          console.log(`  - ${a.name}: expected ${a.expected}, got ${a.actual}`);
        }

        const criticalErrors = sim.result.errors.filter(
          (e) => e.severity === "critical",
        );
        for (const e of criticalErrors) {
          console.log(`  - ERROR: ${e.message}`);
        }

        // In CI mode, fail fast
        if (ciMode) {
          break;
        }
      }

      console.log(`  Duration: ${sim.result.duration}ms`);
      console.log(`  Hands: ${sim.result.handsPlayed}`);
    } catch (error) {
      failed++;
      console.log(`\n✗ ${sim.name}: CRASHED`);
      console.log(`  Error: ${error}`);

      if (ciMode) {
        break;
      }
    }
  }

  // Final Report
  const totalTime = Date.now() - startTime;

  console.log("\n" + "=".repeat(70));
  console.log("   SIMULATION RESULTS");
  console.log("=".repeat(70));
  console.log(`\nTotal Time: ${Math.round(totalTime / 1000)}s`);
  console.log(`\nResults:`);
  console.log(`  ✓ Passed: ${passed}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log(`  Total:    ${passed + failed}`);

  // Individual simulation summaries
  if (!ciMode) {
    for (const sim of simulations) {
      if (sim.result) {
        console.log(`\n${"─".repeat(70)}`);
        console.log(`${sim.name}`);
        console.log(`${"─".repeat(70)}`);
        console.log(`Status: ${sim.result.success ? "✓ PASSED" : "✗ FAILED"}`);
        console.log(`Duration: ${sim.result.duration}ms`);
        console.log(`Hands: ${sim.result.handsPlayed}`);
        console.log(`Final State: ${sim.result.finalState.status}`);
        console.log(
          `Players Remaining: ${sim.result.finalState.playersRemaining}`,
        );
        if (sim.result.finalState.winner) {
          console.log(`Winner: ${sim.result.finalState.winner}`);
        }
        console.log(
          `Assertions: ${sim.result.assertions.filter((a) => a.passed).length}/${sim.result.assertions.length} passed`,
        );
        console.log(`Errors: ${sim.result.errors.length}`);
        console.log(`Warnings: ${sim.result.warnings.length}`);
      }
    }
  }

  console.log("\n" + "=".repeat(70) + "\n");

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Run
runSimulations().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
