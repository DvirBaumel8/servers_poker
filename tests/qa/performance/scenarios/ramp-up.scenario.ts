/**
 * Ramp-up Scenario
 * ================
 *
 * Gradually increases load to find the breaking point.
 * Useful for capacity planning and identifying bottlenecks.
 *
 * Usage: npx ts-node tests/qa/performance/scenarios/ramp-up.scenario.ts
 */

import { runLoadTest } from "../load-controller";

async function main() {
  console.log("\n📈 Running Ramp-up Load Test\n");
  console.log("This test gradually increases load from 1 to 50 tournaments.");
  console.log("Watch for latency spikes and error rate increases.\n");
  console.log("Configuration:");
  console.log("  - Start: 1 tournament");
  console.log("  - End: 50 tournaments (450 virtual users)");
  console.log("  - Ramp duration: 2 minutes");
  console.log("  - Sustained at peak: 3 minutes\n");

  const result = await runLoadTest("rampUp", {
    verbose: process.argv.includes("--verbose"),
  });

  console.log("\n📊 Ramp-up Analysis\n");

  // Analyze metrics snapshots to find degradation point
  const snapshots = result.metrics; // Would need to expose snapshots from controller

  console.log("Performance at peak load:");
  console.log(`  HTTP P95: ${result.metrics.httpLatency.p95.toFixed(1)}ms`);
  console.log(`  HTTP P99: ${result.metrics.httpLatency.p99.toFixed(1)}ms`);
  console.log(`  Max Latency: ${result.metrics.httpLatency.max.toFixed(1)}ms`);
  console.log(
    `  Error Rate: ${((result.metrics.requests.failed / Math.max(1, result.metrics.requests.total)) * 100).toFixed(2)}%`,
  );
  console.log(
    `  Throughput: ${result.metrics.requests.perSecond.toFixed(1)} req/s`,
  );

  if (result.metrics.httpLatency.p99 > 500) {
    console.log("\n⚠️  Warning: P99 latency exceeded 500ms");
    console.log(
      "   Consider reviewing database queries and connection pooling",
    );
  }

  if (result.metrics.requests.failed > 0) {
    console.log(
      `\n⚠️  Warning: ${result.metrics.requests.failed} failed requests detected`,
    );
  }

  process.exit(result.sloValidation.passed ? 0 : 1);
}

main().catch((error) => {
  console.error("Ramp-up test failed:", error);
  process.exit(1);
});
