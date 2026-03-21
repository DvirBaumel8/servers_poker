/**
 * Quick Scenario
 * ==============
 *
 * Fast CI/CD validation test. Runs in under 2 minutes.
 * Use this for pre-merge checks and rapid feedback.
 *
 * Usage: npx ts-node tests/qa/performance/scenarios/quick.scenario.ts
 */

import { runLoadTest } from "../load-controller";

async function main() {
  console.log("\n🚀 Running Quick Load Test (CI Mode)\n");
  console.log("Fast validation: 20 tournaments, 90 seconds");
  console.log("Use this for pre-merge performance checks.\n");

  const startTime = Date.now();

  const result = await runLoadTest("quick", {
    verbose: process.argv.includes("--verbose"),
  });

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);

  console.log(`\n✅ Quick test completed in ${totalTime}s\n`);

  console.log("Key Metrics:");
  console.log(`  HTTP P95: ${result.metrics.httpLatency.p95.toFixed(1)}ms`);
  console.log(
    `  Error Rate: ${((result.metrics.requests.failed / Math.max(1, result.metrics.requests.total)) * 100).toFixed(2)}%`,
  );
  console.log(
    `  Tournaments: ${result.tournamentsCompleted}/${result.tournamentsStarted} completed`,
  );
  console.log(`  Hands: ${result.metrics.tournaments.handsPlayed}`);
  console.log(
    `  Throughput: ${result.metrics.requests.perSecond.toFixed(1)} req/s`,
  );
  console.log("");

  console.log(
    `Result: ${result.sloValidation.passed ? "✅ PASSED" : "❌ FAILED"}`,
  );

  if (!result.sloValidation.passed) {
    console.log("\nViolations:");
    for (const v of result.sloValidation.violations) {
      console.log(
        `  - ${v.metric}: ${v.actual.toFixed(2)} (max: ${v.threshold})`,
      );
    }
  }

  process.exit(result.sloValidation.passed ? 0 : 1);
}

main().catch((error) => {
  console.error("Quick test failed:", error);
  process.exit(1);
});
