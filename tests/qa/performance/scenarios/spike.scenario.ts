/**
 * Spike Scenario
 * ==============
 *
 * Sudden 10x load increase to test system resilience.
 * Simulates a viral moment or coordinated tournament start.
 *
 * Usage: npx ts-node tests/qa/performance/scenarios/spike.scenario.ts
 */

import { runLoadTest } from "../load-controller";

async function main() {
  console.log("\n⚡ Running Spike Load Test\n");
  console.log("This test simulates a sudden surge in traffic:");
  console.log("  - 100 tournaments started in 10 seconds");
  console.log("  - 1000 virtual users connecting simultaneously");
  console.log("  - Tests system's ability to handle burst traffic\n");
  console.log("Expected behavior:");
  console.log("  - Latency spike during ramp-up is acceptable");
  console.log("  - System should stabilize within 30 seconds");
  console.log("  - No crashes or cascading failures\n");

  const result = await runLoadTest("spike", {
    verbose: process.argv.includes("--verbose"),
  });

  console.log("\n📊 Spike Test Results\n");

  console.log("Initial Impact:");
  console.log(`  Max latency: ${result.metrics.httpLatency.max.toFixed(1)}ms`);
  console.log(`  P99 latency: ${result.metrics.httpLatency.p99.toFixed(1)}ms`);
  console.log("");

  console.log("Recovery:");
  console.log(
    `  Error rate: ${((result.metrics.requests.failed / Math.max(1, result.metrics.requests.total)) * 100).toFixed(2)}%`,
  );
  console.log(`  Tournaments started: ${result.tournamentsStarted}`);
  console.log(`  Tournaments completed: ${result.tournamentsCompleted}`);
  console.log("");

  // Spike-specific analysis
  const errorRate =
    (result.metrics.requests.failed /
      Math.max(1, result.metrics.requests.total)) *
    100;

  console.log("Analysis:");

  if (errorRate > 5) {
    console.log(
      `  ❌ Error rate ${errorRate.toFixed(2)}% exceeds 5% spike tolerance`,
    );
    console.log("     Consider implementing request queuing or rate limiting");
  } else {
    console.log(`  ✅ System handled spike with acceptable error rate`);
  }

  if (result.metrics.httpLatency.max > 5000) {
    console.log(
      `  ⚠️  Max latency ${result.metrics.httpLatency.max.toFixed(0)}ms - some requests very slow`,
    );
    console.log("     Consider connection pooling or async processing");
  } else {
    console.log(`  ✅ Max latency within acceptable bounds`);
  }

  if (result.tournamentsFailed > result.tournamentsStarted * 0.1) {
    console.log(
      `  ❌ ${result.tournamentsFailed} tournaments failed (${((result.tournamentsFailed / result.tournamentsStarted) * 100).toFixed(1)}%)`,
    );
  } else {
    console.log(`  ✅ Tournament failure rate acceptable`);
  }

  console.log("");
  console.log(
    `Overall: ${result.sloValidation.passed ? "✅ PASSED" : "❌ FAILED"}`,
  );

  // Spike tests are expected to have some degradation
  // Pass if no crashes and error rate < 5%
  const spikeSuccess = errorRate < 5 && result.tournamentsFailed === 0;

  if (result.reportPath) {
    console.log(`\nDetailed report: ${result.reportPath}`);
  }

  process.exit(spikeSuccess ? 0 : 1);
}

main().catch((error) => {
  console.error("Spike test failed:", error);
  process.exit(1);
});
