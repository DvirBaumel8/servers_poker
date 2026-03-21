/**
 * Baseline Scenario
 * =================
 *
 * Minimal load to establish baseline metrics.
 * Run this first to understand normal performance characteristics.
 *
 * Usage: npx ts-node tests/qa/performance/scenarios/baseline.scenario.ts
 */

import { runLoadTest } from "../load-controller";

async function main() {
  console.log("\n🎯 Running Baseline Load Test\n");
  console.log(
    "This test establishes baseline performance metrics with minimal load.",
  );
  console.log(
    "Configuration: 5 tournaments, 9 players each (45 virtual users)\n",
  );

  const result = await runLoadTest("baseline", {
    verbose: process.argv.includes("--verbose"),
  });

  console.log("\n📊 Baseline Results Summary\n");
  console.log("These values can be used to set realistic SLOs:");
  console.log(
    `  HTTP P50: ${result.metrics.httpLatency.p50.toFixed(1)}ms (target: <50ms)`,
  );
  console.log(
    `  HTTP P95: ${result.metrics.httpLatency.p95.toFixed(1)}ms (target: <200ms)`,
  );
  console.log(
    `  HTTP P99: ${result.metrics.httpLatency.p99.toFixed(1)}ms (target: <500ms)`,
  );
  console.log(
    `  Throughput: ${result.metrics.requests.perSecond.toFixed(1)} req/s`,
  );
  console.log(
    `  Error Rate: ${((result.metrics.requests.failed / Math.max(1, result.metrics.requests.total)) * 100).toFixed(2)}%`,
  );
  console.log(
    `  Memory Growth: ${result.metrics.memory.growthMB.toFixed(1)}MB`,
  );

  process.exit(result.sloValidation.passed ? 0 : 1);
}

main().catch((error) => {
  console.error("Baseline test failed:", error);
  process.exit(1);
});
