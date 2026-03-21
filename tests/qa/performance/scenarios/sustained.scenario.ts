/**
 * Sustained Load Scenario
 * =======================
 *
 * Full target load (100 tournaments) for an extended period.
 * Tests system stability and looks for memory leaks.
 *
 * Usage: npx ts-node tests/qa/performance/scenarios/sustained.scenario.ts
 */

import { runLoadTest } from "../load-controller";

async function main() {
  console.log("\n🏋️ Running Sustained Load Test\n");
  console.log("This is the primary load test for your target scale:");
  console.log("  - 100 concurrent tournaments");
  console.log("  - 10 players each (1000 virtual users)");
  console.log("  - Duration: 10 minutes at full load\n");
  console.log("Key metrics to watch:");
  console.log("  - Latency stability (should not increase over time)");
  console.log("  - Memory growth (indicates leaks if steadily climbing)");
  console.log("  - Error rate (should remain near zero)\n");

  const startTime = Date.now();

  const result = await runLoadTest("sustained", {
    verbose: process.argv.includes("--verbose"),
  });

  const totalDuration = (Date.now() - startTime) / 1000 / 60;

  console.log("\n📊 Sustained Load Results\n");
  console.log(`Total duration: ${totalDuration.toFixed(1)} minutes`);
  console.log("");

  console.log("Latency:");
  console.log(`  P50:  ${result.metrics.httpLatency.p50.toFixed(1)}ms`);
  console.log(`  P95:  ${result.metrics.httpLatency.p95.toFixed(1)}ms`);
  console.log(`  P99:  ${result.metrics.httpLatency.p99.toFixed(1)}ms`);
  console.log(`  Max:  ${result.metrics.httpLatency.max.toFixed(1)}ms`);
  console.log("");

  console.log("Throughput:");
  console.log(
    `  Requests/sec: ${result.metrics.requests.perSecond.toFixed(1)}`,
  );
  console.log(`  Total requests: ${result.metrics.requests.total}`);
  console.log(`  Failed: ${result.metrics.requests.failed}`);
  console.log("");

  console.log("Tournaments:");
  console.log(`  Started: ${result.tournamentsStarted}`);
  console.log(`  Completed: ${result.tournamentsCompleted}`);
  console.log(`  Failed: ${result.tournamentsFailed}`);
  console.log(`  Hands played: ${result.metrics.tournaments.handsPlayed}`);
  console.log("");

  console.log("Resources:");
  console.log(`  Memory start: ${result.metrics.memory.startMB.toFixed(1)}MB`);
  console.log(`  Memory peak:  ${result.metrics.memory.peakMB.toFixed(1)}MB`);
  console.log(
    `  Memory growth: ${result.metrics.memory.growthMB.toFixed(1)}MB`,
  );
  console.log(`  CPU peak: ${result.metrics.cpu.peakPercent.toFixed(1)}%`);
  console.log("");

  // Analysis
  console.log("Analysis:");

  if (result.metrics.memory.growthMB > 200) {
    console.log("  ⚠️  High memory growth detected - possible memory leak");
  } else {
    console.log("  ✅ Memory usage stable");
  }

  const errorRate =
    (result.metrics.requests.failed /
      Math.max(1, result.metrics.requests.total)) *
    100;
  if (errorRate > 1) {
    console.log(
      `  ⚠️  Error rate ${errorRate.toFixed(2)}% exceeds 1% threshold`,
    );
  } else {
    console.log(`  ✅ Error rate acceptable (${errorRate.toFixed(2)}%)`);
  }

  if (result.metrics.httpLatency.p95 > 200) {
    console.log(
      `  ⚠️  P95 latency (${result.metrics.httpLatency.p95.toFixed(0)}ms) exceeds 200ms target`,
    );
  } else {
    console.log(`  ✅ Latency within acceptable bounds`);
  }

  console.log("");
  console.log(
    `Overall: ${result.sloValidation.passed ? "✅ PASSED" : "❌ FAILED"}`,
  );

  if (result.reportPath) {
    console.log(`\nDetailed report: ${result.reportPath}`);
  }

  process.exit(result.sloValidation.passed ? 0 : 1);
}

main().catch((error) => {
  console.error("Sustained load test failed:", error);
  process.exit(1);
});
