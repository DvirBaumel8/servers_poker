#!/usr/bin/env npx ts-node
/**
 * Chaos Simulation
 *
 * Comprehensive chaos engineering test suite that systematically tests
 * system resilience by injecting failures and verifying recovery.
 *
 * Usage:
 *   npm run chaos:light    # Basic scenarios
 *   npm run chaos:medium   # Standard chaos (recommended)
 *   npm run chaos:heavy    # Full chaos suite
 */

import {
  getScenarios,
  ChaosScenario,
  ScenarioOutcome,
  ChaosIntensity,
} from "./chaos-scenarios";

interface ChaosSimulationConfig {
  baseUrl: string;
  intensity: ChaosIntensity;
  verbose: boolean;
  authToken?: string;
}

interface SimulationSummary {
  totalScenarios: number;
  passed: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  outcomes: ScenarioOutcome[];
}

class ChaosSimulation {
  private config: ChaosSimulationConfig;
  private scenarios: ChaosScenario[] = [];
  private outcomes: ScenarioOutcome[] = [];

  constructor(config: ChaosSimulationConfig) {
    this.config = config;
    this.scenarios = getScenarios(
      {
        baseUrl: config.baseUrl,
        verbose: config.verbose,
        authToken: config.authToken,
      },
      config.intensity,
    );
  }

  async run(): Promise<SimulationSummary> {
    const startTime = Date.now();

    this.printHeader();

    console.log(`Running ${this.scenarios.length} chaos scenarios...\n`);

    for (let i = 0; i < this.scenarios.length; i++) {
      const scenario = this.scenarios[i];
      console.log(`${i + 1}. ${scenario.name}`);
      console.log(`   ├─ ${scenario.description}`);

      try {
        // Add timeout to prevent hanging scenarios
        const timeoutPromise = new Promise<ScenarioOutcome>((_, reject) =>
          setTimeout(
            () => reject(new Error("Scenario timed out after 30s")),
            30000,
          ),
        );
        const outcome = await Promise.race([scenario.run(), timeoutPromise]);
        this.outcomes.push(outcome);

        // Print verifications
        for (const v of outcome.verifications) {
          const icon = v.passed ? "✓" : "✗";
          console.log(`   ├─ ${icon} ${v.name}: ${v.message}`);
        }

        // Print result
        const resultIcon =
          outcome.result === "passed"
            ? "✅"
            : outcome.result === "failed"
              ? "❌"
              : "⏭️";
        console.log(
          `   └─ ${resultIcon} ${outcome.result.toUpperCase()} (${outcome.durationMs}ms)`,
        );

        if (outcome.error) {
          console.log(`      Error: ${outcome.error}`);
        }
      } catch (error) {
        console.log(`   └─ ❌ FAILED with exception: ${error}`);
        this.outcomes.push({
          name: scenario.name,
          result: "failed",
          durationMs: 0,
          error: String(error),
          verifications: [],
        });
      } finally {
        await scenario.cleanup();
      }

      console.log();
    }

    const summary = this.generateSummary(Date.now() - startTime);
    this.printSummary(summary);

    return summary;
  }

  private printHeader(): void {
    const intensity = this.config.intensity.toUpperCase();
    console.log();
    console.log(`🔥 CHAOS SIMULATION - ${intensity} Intensity`);
    console.log("═".repeat(50));
    console.log();
    console.log(`Target:     ${this.config.baseUrl}`);
    console.log(`Scenarios:  ${this.scenarios.length}`);
    console.log(`Verbose:    ${this.config.verbose}`);
    console.log();
  }

  private generateSummary(totalDurationMs: number): SimulationSummary {
    const passed = this.outcomes.filter((o) => o.result === "passed").length;
    const failed = this.outcomes.filter((o) => o.result === "failed").length;
    const skipped = this.outcomes.filter((o) => o.result === "skipped").length;

    return {
      totalScenarios: this.outcomes.length,
      passed,
      failed,
      skipped,
      totalDurationMs,
      outcomes: this.outcomes,
    };
  }

  private printSummary(summary: SimulationSummary): void {
    console.log("═".repeat(50));

    if (summary.failed === 0) {
      console.log(`✅ PASSED: All ${summary.totalScenarios} scenarios passed`);
    } else {
      console.log(
        `❌ FAILED: ${summary.passed}/${summary.totalScenarios} scenarios passed`,
      );
    }

    console.log(`   Duration: ${(summary.totalDurationMs / 1000).toFixed(1)}s`);
    console.log("═".repeat(50));

    if (summary.failed > 0) {
      console.log("\nFailed scenarios:");
      for (const outcome of summary.outcomes.filter(
        (o) => o.result === "failed",
      )) {
        console.log(`  ❌ ${outcome.name}`);
        if (outcome.error) {
          console.log(`     Error: ${outcome.error}`);
        }
        for (const v of outcome.verifications.filter((v) => !v.passed)) {
          console.log(`     - ${v.name}: ${v.message}`);
        }
      }
    }

    // Print chaos events summary
    console.log("\n📊 Chaos Events Summary:");
    const totalBotFailures = 0;
    let totalVerifications = 0;
    let passedVerifications = 0;

    for (const outcome of summary.outcomes) {
      totalVerifications += outcome.verifications.length;
      passedVerifications += outcome.verifications.filter(
        (v) => v.passed,
      ).length;
    }

    console.log(`   Scenarios run:        ${summary.totalScenarios}`);
    console.log(
      `   Verifications:        ${passedVerifications}/${totalVerifications} passed`,
    );
    console.log(
      `   Total duration:       ${(summary.totalDurationMs / 1000).toFixed(1)}s`,
    );
  }
}

async function checkServerAvailable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let intensity: ChaosIntensity = "medium";
  let verbose = false;

  for (const arg of args) {
    if (arg === "--light" || arg === "-l") intensity = "light";
    if (arg === "--medium" || arg === "-m") intensity = "medium";
    if (arg === "--heavy" || arg === "-h") intensity = "heavy";
    if (arg === "--verbose" || arg === "-v") verbose = true;
    if (arg.startsWith("--intensity=")) {
      intensity = arg.split("=")[1] as ChaosIntensity;
    }
  }

  // Also check positional argument
  if (args[0] === "light") intensity = "light";
  if (args[0] === "medium") intensity = "medium";
  if (args[0] === "heavy") intensity = "heavy";

  const baseUrl = process.env.POKER_URL || "http://localhost:3000";

  console.log("🔥 Chaos Simulation");
  console.log("─".repeat(40));
  console.log(`Target:    ${baseUrl}`);
  console.log(`Intensity: ${intensity}`);

  // Check server availability
  console.log("\nChecking server availability...");
  const serverAvailable = await checkServerAvailable(baseUrl);

  if (!serverAvailable) {
    console.error("❌ Server not available at", baseUrl);
    console.error("   Make sure the poker server is running.");
    process.exit(1);
  }

  console.log("✅ Server is available\n");

  const simulation = new ChaosSimulation({
    baseUrl,
    intensity,
    verbose,
  });

  try {
    const summary = await simulation.run();
    process.exit(summary.failed === 0 ? 0 : 1);
  } catch (error) {
    console.error("\n❌ Simulation failed with error:", error);
    process.exit(1);
  }
}

main();
