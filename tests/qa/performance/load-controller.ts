/**
 * Load Controller
 * ================
 *
 * Main orchestrator for performance load tests.
 * Manages the lifecycle of virtual tournaments and collects metrics.
 *
 * Usage:
 *   npx ts-node tests/qa/performance/load-controller.ts [scenario]
 *
 * Scenarios: baseline, rampUp, sustained, spike, endurance, quick
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  SCENARIOS,
  ScenarioConfig,
  getEnvironmentConfig,
  validateSLOs,
  LoadTestMetrics,
  LoadTestPhase,
  SLOValidationResult,
  EnvironmentConfig,
} from "./load-config";
import { MetricsCollector, createMetricsCollector } from "./metrics-collector";
import {
  VirtualTournament,
  createVirtualTournament,
} from "./virtual-tournament";

export interface LoadTestResult {
  scenario: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  metrics: LoadTestMetrics;
  sloValidation: SLOValidationResult;
  phases: LoadTestPhase[];
  tournamentsStarted: number;
  tournamentsCompleted: number;
  tournamentsFailed: number;
  reportPath?: string;
}

export class LoadController {
  private scenario: ScenarioConfig;
  private env: EnvironmentConfig;
  private metricsCollector: MetricsCollector;
  private tournaments: Map<string, VirtualTournament> = new Map();
  private phases: LoadTestPhase[] = [];
  private currentPhase: LoadTestPhase["name"] = "ramp_up";
  private startTime: number = 0;
  private stopped = false;
  private verboseLogging: boolean;
  private authToken: string = "";

  constructor(scenarioName: string, options: { verbose?: boolean } = {}) {
    const scenario = SCENARIOS[scenarioName];
    if (!scenario) {
      throw new Error(
        `Unknown scenario: ${scenarioName}. Available: ${Object.keys(SCENARIOS).join(", ")}`,
      );
    }

    this.scenario = scenario;
    this.env = getEnvironmentConfig();
    this.metricsCollector = createMetricsCollector(
      scenario.metricsCollectionIntervalMs,
    );
    this.verboseLogging = options.verbose ?? false;
  }

  /**
   * Run the load test scenario
   */
  async run(): Promise<LoadTestResult> {
    this.startTime = Date.now();
    this.log(`Starting load test: ${this.scenario.name}`);
    this.log(
      `Target: ${this.scenario.targetTournaments} tournaments, ${this.scenario.playersPerTournament} players each`,
    );
    this.log(
      `Total virtual users: ${this.scenario.targetTournaments * this.scenario.playersPerTournament}`,
    );

    try {
      // Check backend health
      const healthy = await this.checkBackendHealth();
      if (!healthy) {
        throw new Error("Backend health check failed");
      }

      // Authenticate
      await this.authenticate();

      // Run test phases
      await this.runRampUp();
      await this.runSustained();
      await this.runRampDown();

      this.currentPhase = "completed";
    } catch (error) {
      this.log(`Load test error: ${error}`);
    } finally {
      // Cleanup
      await this.cleanup();
    }

    // Generate results
    const result = this.generateResult();

    // Save report
    result.reportPath = await this.saveReport(result);

    return result;
  }

  /**
   * Stop the load test early
   */
  stop(): void {
    this.stopped = true;
    this.log("Stopping load test...");
  }

  private async checkBackendHealth(): Promise<boolean> {
    this.log("Checking backend health...");

    try {
      const response = await fetch(`${this.env.backendUrl}/api/v1/health`);
      const healthy = response.ok;

      if (healthy) {
        this.log("Backend is healthy");
      } else {
        this.log(`Backend health check failed: ${response.status}`);
      }

      return healthy;
    } catch (error) {
      this.log(`Backend health check error: ${error}`);
      return false;
    }
  }

  private async authenticate(): Promise<void> {
    this.log("Authenticating as admin...");

    try {
      const response = await fetch(`${this.env.backendUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: process.env.LOAD_TEST_ADMIN_EMAIL || "admin@poker.io",
          password: process.env.LOAD_TEST_ADMIN_PASSWORD || "adminpass123",
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { access_token?: string };
        if (data.access_token) {
          this.authToken = data.access_token;
          this.log("Authentication successful");
          return;
        }
      }

      // Try to register if login failed
      this.log("Admin login failed, attempting to register...");
      const registerResponse = await fetch(
        `${this.env.backendUrl}/api/v1/auth/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "loadtest@poker.io",
            password: "loadtest123",
            name: "Load Test Admin",
          }),
        },
      );

      if (registerResponse.ok) {
        const regData = (await registerResponse.json()) as {
          access_token?: string;
        };
        if (regData.access_token) {
          this.authToken = regData.access_token;
          this.log("Registration successful");
          return;
        }
      }

      // Try logging in with the registered user
      const loginResponse = await fetch(
        `${this.env.backendUrl}/api/v1/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "loadtest@poker.io",
            password: "loadtest123",
          }),
        },
      );

      if (loginResponse.ok) {
        const loginData = (await loginResponse.json()) as {
          access_token?: string;
        };
        if (loginData.access_token) {
          this.authToken = loginData.access_token;
          this.log("Login with registered user successful");
          return;
        }
      }

      this.log("Warning: Could not authenticate - some tests may fail");
    } catch (error) {
      this.log(`Authentication error: ${error}`);
    }
  }

  private async runRampUp(): Promise<void> {
    this.currentPhase = "ramp_up";
    const phase: LoadTestPhase = {
      name: "ramp_up",
      startTime: Date.now(),
      tournamentsTarget: this.scenario.targetTournaments,
      tournamentsActive: 0,
    };
    this.phases.push(phase);

    this.log(`Phase: RAMP UP (${this.scenario.rampUpDurationMs / 1000}s)`);

    const interval = this.scenario.tournamentStartIntervalMs;
    const endTime = Date.now() + this.scenario.rampUpDurationMs;
    let tournamentsStarted = 0;

    while (
      !this.stopped &&
      Date.now() < endTime &&
      tournamentsStarted < this.scenario.targetTournaments
    ) {
      // Start a new tournament
      await this.startTournament();
      tournamentsStarted++;
      phase.tournamentsActive = this.tournaments.size;

      // Progress logging
      if (tournamentsStarted % 10 === 0 || this.verboseLogging) {
        this.log(
          `Ramp-up: ${tournamentsStarted}/${this.scenario.targetTournaments} tournaments`,
        );
      }

      // Sample resources periodically
      this.metricsCollector.sampleResources();

      await this.sleep(interval);
    }

    phase.endTime = Date.now();
    this.log(`Ramp-up complete: ${tournamentsStarted} tournaments started`);
  }

  private async runSustained(): Promise<void> {
    this.currentPhase = "sustained";
    const phase: LoadTestPhase = {
      name: "sustained",
      startTime: Date.now(),
      tournamentsTarget: this.scenario.targetTournaments,
      tournamentsActive: this.tournaments.size,
    };
    this.phases.push(phase);

    this.log(`Phase: SUSTAINED (${this.scenario.sustainedDurationMs / 1000}s)`);

    const endTime = Date.now() + this.scenario.sustainedDurationMs;
    const statusInterval = 10000; // Log status every 10 seconds
    let lastStatusTime = Date.now();

    while (!this.stopped && Date.now() < endTime) {
      // Maintain target tournament count (replace finished ones)
      const activeTournaments = Array.from(this.tournaments.values()).filter(
        (t) => t.getState().status === "running",
      );

      if (activeTournaments.length < this.scenario.targetTournaments) {
        const deficit =
          this.scenario.targetTournaments - activeTournaments.length;
        for (let i = 0; i < Math.min(deficit, 5); i++) {
          await this.startTournament();
        }
      }

      // Update phase stats
      phase.tournamentsActive = activeTournaments.length;

      // Sample resources
      this.metricsCollector.sampleResources();
      this.metricsCollector.takeSnapshot();

      // Status logging
      if (Date.now() - lastStatusTime >= statusInterval) {
        const metrics = this.metricsCollector.getMetrics();
        this.log(
          `Sustained: ${activeTournaments.length} active | ` +
            `${metrics.tournaments.handsPlayed} hands | ` +
            `${metrics.requests.perSecond.toFixed(1)} req/s | ` +
            `p95: ${metrics.httpLatency.p95.toFixed(0)}ms`,
        );
        lastStatusTime = Date.now();
      }

      await this.sleep(2000);
    }

    phase.endTime = Date.now();
    this.log("Sustained phase complete");
  }

  private async runRampDown(): Promise<void> {
    this.currentPhase = "ramp_down";
    const phase: LoadTestPhase = {
      name: "ramp_down",
      startTime: Date.now(),
      tournamentsTarget: 0,
      tournamentsActive: this.tournaments.size,
    };
    this.phases.push(phase);

    this.log(`Phase: RAMP DOWN (${this.scenario.rampDownDurationMs / 1000}s)`);

    // Stop starting new tournaments and let existing ones finish
    const endTime = Date.now() + this.scenario.rampDownDurationMs;

    while (!this.stopped && Date.now() < endTime) {
      const activeTournaments = Array.from(this.tournaments.values()).filter(
        (t) => t.getState().status === "running",
      );

      if (activeTournaments.length === 0) {
        break;
      }

      phase.tournamentsActive = activeTournaments.length;
      this.metricsCollector.sampleResources();

      await this.sleep(2000);
    }

    phase.endTime = Date.now();
    this.log("Ramp-down complete");
  }

  private async startTournament(): Promise<void> {
    const id = crypto.randomUUID();

    const tournament = createVirtualTournament({
      id,
      playerCount: this.scenario.playersPerTournament,
      personalities: this.scenario.botPersonalities,
      botActionDelayMs: this.scenario.botActionDelayMs,
      env: this.env,
      metricsCollector: this.metricsCollector,
      verboseLogging: this.verboseLogging,
      authToken: this.authToken,
    });

    this.tournaments.set(id, tournament);

    // Start tournament in background
    tournament
      .start()
      .then(() => tournament.monitor())
      .catch((error) => {
        this.log(`Tournament ${id.slice(0, 8)} error: ${error}`);
      })
      .finally(() => {
        // Keep tournament reference for stats
      });
  }

  private async cleanup(): Promise<void> {
    this.log("Cleaning up...");

    const stopPromises = Array.from(this.tournaments.values()).map((t) =>
      t.stop().catch(() => {}),
    );

    await Promise.all(stopPromises);
    this.tournaments.clear();

    this.log("Cleanup complete");
  }

  private generateResult(): LoadTestResult {
    const endTime = Date.now();
    const metrics = this.metricsCollector.getMetrics();
    const sloValidation = validateSLOs(metrics, this.scenario.slos);

    // Count tournament outcomes
    let completed = 0;
    let failed = 0;

    for (const tournament of this.tournaments.values()) {
      const state = tournament.getState();
      if (state.status === "finished") {
        completed++;
      } else if (state.status === "error") {
        failed++;
      }
    }

    return {
      scenario: this.scenario.name,
      startTime: new Date(this.startTime),
      endTime: new Date(endTime),
      durationMs: endTime - this.startTime,
      metrics,
      sloValidation,
      phases: this.phases,
      tournamentsStarted: metrics.tournaments.started,
      tournamentsCompleted: completed,
      tournamentsFailed: failed,
    };
  }

  private async saveReport(result: LoadTestResult): Promise<string> {
    const reportsDir = path.join(__dirname, "reports");

    // Create reports directory if it doesn't exist
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportName = `load-test-${this.scenario.name.toLowerCase()}-${timestamp}`;

    // Save JSON report
    const jsonPath = path.join(reportsDir, `${reportName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

    // Save markdown report
    const mdPath = path.join(reportsDir, `${reportName}.md`);
    fs.writeFileSync(mdPath, this.generateMarkdownReport(result));

    // Save metrics report
    const metricsPath = path.join(reportsDir, `${reportName}-metrics.txt`);
    fs.writeFileSync(metricsPath, this.metricsCollector.generateReport());

    this.log(`Reports saved to: ${reportsDir}`);

    return mdPath;
  }

  private generateMarkdownReport(result: LoadTestResult): string {
    const m = result.metrics;
    const slo = result.sloValidation;

    return `# Load Test Report: ${result.scenario}

## Summary

| Metric | Value |
|--------|-------|
| Start Time | ${result.startTime.toISOString()} |
| End Time | ${result.endTime.toISOString()} |
| Duration | ${(result.durationMs / 1000).toFixed(1)}s |
| **SLO Status** | ${slo.passed ? "✅ PASSED" : "❌ FAILED"} |

## Configuration

- Target Tournaments: ${this.scenario.targetTournaments}
- Players per Tournament: ${this.scenario.playersPerTournament}
- Total Virtual Users: ${this.scenario.targetTournaments * this.scenario.playersPerTournament}

## HTTP Latency

| Percentile | Value | SLO | Status |
|------------|-------|-----|--------|
| P50 | ${m.httpLatency.p50.toFixed(1)}ms | ${this.scenario.slos.httpP50MaxMs}ms | ${m.httpLatency.p50 <= this.scenario.slos.httpP50MaxMs ? "✅" : "❌"} |
| P95 | ${m.httpLatency.p95.toFixed(1)}ms | ${this.scenario.slos.httpP95MaxMs}ms | ${m.httpLatency.p95 <= this.scenario.slos.httpP95MaxMs ? "✅" : "❌"} |
| P99 | ${m.httpLatency.p99.toFixed(1)}ms | ${this.scenario.slos.httpP99MaxMs}ms | ${m.httpLatency.p99 <= this.scenario.slos.httpP99MaxMs ? "✅" : "❌"} |
| Max | ${m.httpLatency.max.toFixed(1)}ms | - | - |
| Avg | ${m.httpLatency.avg.toFixed(1)}ms | - | - |

## Throughput

| Metric | Value | SLO | Status |
|--------|-------|-----|--------|
| Requests/sec | ${m.requests.perSecond.toFixed(1)} | ${this.scenario.slos.minRequestsPerSecond} | ${m.requests.perSecond >= this.scenario.slos.minRequestsPerSecond ? "✅" : "❌"} |
| Total Requests | ${m.requests.total} | - | - |
| Successful | ${m.requests.successful} | - | - |
| Failed | ${m.requests.failed} | - | - |
| Error Rate | ${((m.requests.failed / Math.max(1, m.requests.total)) * 100).toFixed(2)}% | ${this.scenario.slos.maxErrorRatePercent}% | ${(m.requests.failed / Math.max(1, m.requests.total)) * 100 <= this.scenario.slos.maxErrorRatePercent ? "✅" : "❌"} |

## Tournaments

| Metric | Value |
|--------|-------|
| Started | ${result.tournamentsStarted} |
| Completed | ${result.tournamentsCompleted} |
| Failed | ${result.tournamentsFailed} |
| Hands Played | ${m.tournaments.handsPlayed} |
| Hands/min | ${((m.tournaments.handsPlayed / result.durationMs) * 60000).toFixed(1)} |

## WebSocket

| Metric | Value |
|--------|-------|
| Messages Sent | ${m.websocket.messagesSent} |
| Messages Received | ${m.websocket.messagesReceived} |
| Disconnects | ${m.websocket.disconnects} |

## Resources

| Metric | Value | SLO | Status |
|--------|-------|-----|--------|
| Memory Start | ${m.memory.startMB.toFixed(1)}MB | - | - |
| Memory Peak | ${m.memory.peakMB.toFixed(1)}MB | - | - |
| Memory Growth | ${m.memory.growthMB.toFixed(1)}MB | ${this.scenario.slos.maxMemoryGrowthMB}MB | ${m.memory.growthMB <= this.scenario.slos.maxMemoryGrowthMB ? "✅" : "❌"} |
| CPU Avg | ${m.cpu.avgPercent.toFixed(1)}% | - | - |
| CPU Peak | ${m.cpu.peakPercent.toFixed(1)}% | ${this.scenario.slos.maxCpuUsagePercent}% | ${m.cpu.peakPercent <= this.scenario.slos.maxCpuUsagePercent ? "✅" : "❌"} |

## SLO Violations

${
  slo.violations.length === 0
    ? "No violations detected."
    : slo.violations
        .map(
          (v) =>
            `- **${v.metric}**: ${v.actual.toFixed(2)} (threshold: ${v.threshold}) [${v.severity}]`,
        )
        .join("\n")
}

## Test Phases

| Phase | Duration | Tournaments |
|-------|----------|-------------|
${result.phases
  .map(
    (p) =>
      `| ${p.name} | ${((p.endTime! - p.startTime) / 1000).toFixed(1)}s | ${p.tournamentsActive} |`,
  )
  .join("\n")}

---
*Generated by Load Test Framework*
`;
  }

  private log(message: string): void {
    const elapsed = (
      (Date.now() - (this.startTime || Date.now())) /
      1000
    ).toFixed(1);
    console.log(`[${elapsed}s] [LoadController] ${message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Run a load test scenario
 */
export async function runLoadTest(
  scenarioName: string,
  options: { verbose?: boolean } = {},
): Promise<LoadTestResult> {
  const controller = new LoadController(scenarioName, options);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nReceived SIGINT, stopping...");
    controller.stop();
  });

  process.on("SIGTERM", () => {
    console.log("\nReceived SIGTERM, stopping...");
    controller.stop();
  });

  return controller.run();
}

// CLI entry point
if (require.main === module) {
  const scenarioName = process.argv[2] || "quick";
  const verbose =
    process.argv.includes("--verbose") || process.argv.includes("-v");

  console.log(
    "\n╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║             POKER PLATFORM LOAD TEST                         ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝\n",
  );

  runLoadTest(scenarioName, { verbose })
    .then((result) => {
      console.log("\n" + "═".repeat(70));
      console.log("LOAD TEST COMPLETE");
      console.log("═".repeat(70));
      console.log(`Scenario: ${result.scenario}`);
      console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
      console.log(
        `Tournaments: ${result.tournamentsStarted} started, ${result.tournamentsCompleted} completed`,
      );
      console.log(`Hands: ${result.metrics.tournaments.handsPlayed}`);
      console.log(
        `Requests: ${result.metrics.requests.total} (${result.metrics.requests.perSecond.toFixed(1)}/s)`,
      );
      console.log(`HTTP p95: ${result.metrics.httpLatency.p95.toFixed(1)}ms`);
      console.log(
        `SLO Status: ${result.sloValidation.passed ? "✅ PASSED" : "❌ FAILED"}`,
      );

      if (result.sloValidation.violations.length > 0) {
        console.log("\nSLO Violations:");
        for (const v of result.sloValidation.violations) {
          console.log(
            `  - ${v.metric}: ${v.actual.toFixed(2)} (max: ${v.threshold})`,
          );
        }
      }

      if (result.reportPath) {
        console.log(`\nReport: ${result.reportPath}`);
      }

      console.log("═".repeat(70) + "\n");

      process.exit(result.sloValidation.passed ? 0 : 1);
    })
    .catch((error) => {
      console.error("Load test failed:", error);
      process.exit(1);
    });
}
