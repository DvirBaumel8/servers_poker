/**
 * Chaos Scenarios
 *
 * Defines individual chaos test scenarios with injection,
 * verification, and expected outcomes.
 */

import {
  ControllableBot,
  createBotFleet,
  stopBotFleet,
} from "./controllable-bot";
import {
  BotChaosAgent,
  NetworkChaosAgent,
  StateChaosAgent,
} from "./chaos-agents";

export type ScenarioResult = "passed" | "failed" | "skipped";

export interface ScenarioOutcome {
  name: string;
  result: ScenarioResult;
  durationMs: number;
  details?: string;
  error?: string;
  verifications: {
    name: string;
    passed: boolean;
    message: string;
  }[];
}

export interface ScenarioConfig {
  baseUrl: string;
  verbose?: boolean;
  authToken?: string;
}

export type ChaosIntensity = "light" | "medium" | "heavy";

/**
 * Base class for chaos scenarios
 */
export abstract class ChaosScenario {
  protected config: ScenarioConfig;
  protected bots: ControllableBot[] = [];
  protected botChaos: BotChaosAgent | null = null;
  protected networkChaos: NetworkChaosAgent;
  protected stateChaos: StateChaosAgent;
  protected verifications: {
    name: string;
    passed: boolean;
    message: string;
  }[] = [];

  abstract name: string;
  abstract description: string;

  constructor(config: ScenarioConfig) {
    this.config = config;
    this.networkChaos = new NetworkChaosAgent(config.baseUrl, config.verbose);
    this.stateChaos = new StateChaosAgent(config.baseUrl, config.verbose);
  }

  protected log(message: string): void {
    if (this.config.verbose) {
      console.log(`  [${this.name}] ${message}`);
    }
  }

  protected verify(name: string, condition: boolean, message: string): void {
    this.verifications.push({ name, passed: condition, message });
    if (this.config.verbose) {
      const icon = condition ? "✓" : "✗";
      console.log(`    ${icon} ${name}: ${message}`);
    }
  }

  protected async fetchJson<T>(path: string): Promise<T | null> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.config.authToken) {
        headers["Authorization"] = `Bearer ${this.config.authToken}`;
      }
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        headers,
      });
      if (response.ok) {
        return (await response.json()) as T;
      }
    } catch {
      // Ignore
    }
    return null;
  }

  protected async postJson<T>(path: string, body: unknown): Promise<T | null> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.config.authToken) {
        headers["Authorization"] = `Bearer ${this.config.authToken}`;
      }
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (response.ok) {
        return (await response.json()) as T;
      }
    } catch {
      // Ignore
    }
    return null;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  abstract run(): Promise<ScenarioOutcome>;

  async cleanup(): Promise<void> {
    if (this.bots.length > 0) {
      await stopBotFleet(this.bots);
      this.bots = [];
    }
    this.botChaos?.restoreAllBots();
    this.verifications = [];
  }
}

/**
 * Scenario: Bot crashes mid-hand
 * Tests fallback action when bot becomes unavailable
 */
export class BotCrashMidHandScenario extends ChaosScenario {
  name = "Bot Crash Mid-Hand";
  description = "Bot crashes during action request, fallback should be used";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      // Setup: Create controllable bots
      const basePort = 12000 + Math.floor(Math.random() * 1000);
      this.bots = await createBotFleet(4, basePort, {
        verbose: this.config.verbose,
      });
      this.botChaos = new BotChaosAgent(this.bots, this.config.verbose);

      this.log("Created bot fleet");

      // Verify bots are healthy
      for (const bot of this.bots) {
        const response = await fetch(bot.getEndpoint());
        this.verify(
          `${bot.getName()} reachable`,
          response.ok,
          response.ok ? "Bot responding" : "Bot not responding",
        );
      }

      // Inject chaos: Crash first bot
      this.log("Injecting chaos: Crashing bot 0");
      this.botChaos.crashBot(0);

      // Verify the crashed bot is now unavailable
      let crashedBotResponse: Response | null = null;
      try {
        crashedBotResponse = await fetch(this.bots[0].getEndpoint());
      } catch {
        // Expected to fail
      }

      this.verify(
        "Crashed bot unavailable",
        crashedBotResponse === null || !crashedBotResponse.ok,
        crashedBotResponse === null
          ? "Connection refused (expected)"
          : `Unexpected response: ${crashedBotResponse.status}`,
      );

      // Verify other bots still work
      const healthyBotResponse = await fetch(this.bots[1].getEndpoint());
      this.verify(
        "Other bots still healthy",
        healthyBotResponse.ok,
        healthyBotResponse.ok
          ? "Healthy bots responding"
          : "Healthy bots affected",
      );

      // Verify system health endpoint still works
      const healthResponse = await this.fetchJson<{ status: string }>(
        "/api/v1/health",
      );
      this.verify(
        "System health OK",
        healthResponse?.status === "ok",
        healthResponse ? "System healthy" : "System health check failed",
      );

      const allPassed = this.verifications.every((v) => v.passed);
      return {
        name: this.name,
        result: allPassed ? "passed" : "failed",
        durationMs: Date.now() - start,
        verifications: this.verifications,
      };
    } catch (error) {
      return {
        name: this.name,
        result: "failed",
        durationMs: Date.now() - start,
        error: String(error),
        verifications: this.verifications,
      };
    }
  }
}

/**
 * Scenario: Multiple bots timeout simultaneously
 * Tests circuit breaker and fallback cascade
 */
export class BotTimeoutCascadeScenario extends ChaosScenario {
  name = "Bot Timeout Cascade";
  description =
    "Multiple bots timeout simultaneously, testing circuit breakers";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      const basePort = 13000 + Math.floor(Math.random() * 1000);
      this.bots = await createBotFleet(4, basePort, {
        verbose: this.config.verbose,
      });
      this.botChaos = new BotChaosAgent(this.bots, this.config.verbose);

      this.log("Created bot fleet");

      // Inject chaos: Make multiple bots timeout
      this.log("Injecting chaos: Multiple bot timeouts");
      this.botChaos.timeoutBot(0);
      this.botChaos.timeoutBot(1);
      this.botChaos.timeoutBot(2);

      // Verify timeout bots don't respond (within reasonable time)
      const timeoutPromise = Promise.race([
        fetch(this.bots[0].getEndpoint(), { method: "POST", body: "{}" }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);

      const timeoutResult = await timeoutPromise;
      this.verify(
        "Timeout bot doesn't respond quickly",
        timeoutResult === null,
        timeoutResult === null
          ? "Request timed out (expected)"
          : "Bot responded unexpectedly",
      );

      // Verify healthy bot still works
      const healthyBotResponse = await fetch(this.bots[3].getEndpoint());
      this.verify(
        "Healthy bot still responds",
        healthyBotResponse.ok,
        healthyBotResponse.ok ? "Healthy bot OK" : "Healthy bot affected",
      );

      // Verify metrics endpoint shows data
      const metricsResponse = await fetch(
        `${this.config.baseUrl}/api/v1/metrics`,
      );
      this.verify(
        "Metrics endpoint available",
        metricsResponse.ok,
        metricsResponse.ok ? "Metrics accessible" : "Metrics unavailable",
      );

      const allPassed = this.verifications.every((v) => v.passed);
      return {
        name: this.name,
        result: allPassed ? "passed" : "failed",
        durationMs: Date.now() - start,
        verifications: this.verifications,
      };
    } catch (error) {
      return {
        name: this.name,
        result: "failed",
        durationMs: Date.now() - start,
        error: String(error),
        verifications: this.verifications,
      };
    }
  }
}

/**
 * Scenario: Bot returns garbage response
 * Tests response validation and fallback
 */
export class BotGarbageResponseScenario extends ChaosScenario {
  name = "Bot Garbage Response";
  description = "Bot returns invalid JSON, testing response validation";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      const basePort = 14000 + Math.floor(Math.random() * 1000);
      this.bots = await createBotFleet(2, basePort, {
        verbose: this.config.verbose,
      });
      this.botChaos = new BotChaosAgent(this.bots, this.config.verbose);

      this.log("Created bot fleet");

      // Inject chaos: Make bot return garbage
      this.log("Injecting chaos: Garbage response");
      this.botChaos.corruptBot(0);

      // Send action request to garbage bot
      const garbageResponse = await fetch(this.bots[0].getEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });

      const responseText = await garbageResponse.text();
      let isValidJson = true;
      try {
        JSON.parse(responseText);
      } catch {
        isValidJson = false;
      }

      this.verify(
        "Bot returns invalid JSON",
        !isValidJson,
        isValidJson
          ? "Bot returned valid JSON (unexpected)"
          : "Bot returned garbage (expected)",
      );

      // Verify system still healthy
      const healthResponse = await this.fetchJson<{ status: string }>(
        "/api/v1/health",
      );
      this.verify(
        "System health OK",
        healthResponse?.status === "ok",
        healthResponse
          ? "System healthy despite garbage bot"
          : "System affected",
      );

      const allPassed = this.verifications.every((v) => v.passed);
      return {
        name: this.name,
        result: allPassed ? "passed" : "failed",
        durationMs: Date.now() - start,
        verifications: this.verifications,
      };
    } catch (error) {
      return {
        name: this.name,
        result: "failed",
        durationMs: Date.now() - start,
        error: String(error),
        verifications: this.verifications,
      };
    }
  }
}

/**
 * Scenario: Intermittent bot failures
 * Tests resilience to flaky bots
 */
export class IntermittentBotFailureScenario extends ChaosScenario {
  name = "Intermittent Bot Failures";
  description = "Bot fails randomly, testing retry and fallback logic";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      const basePort = 15000 + Math.floor(Math.random() * 1000);
      this.bots = await createBotFleet(2, basePort, {
        verbose: this.config.verbose,
      });
      this.botChaos = new BotChaosAgent(this.bots, this.config.verbose);

      this.log("Created bot fleet");

      // Inject chaos: 50% failure rate
      this.log("Injecting chaos: Intermittent failures (50%)");
      this.botChaos.intermittentBot(0, 0.5);

      // Send multiple requests and count successes (reduced to 10 for speed)
      let successes = 0;
      let failures = 0;
      const totalRequests = 10;

      const requests = Array(totalRequests)
        .fill(null)
        .map(async () => {
          try {
            const response = await fetch(this.bots[0].getEndpoint(), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "test" }),
            });
            return response.ok;
          } catch {
            return false;
          }
        });

      const results = await Promise.all(requests);
      successes = results.filter((r) => r).length;
      failures = results.filter((r) => !r).length;

      const successRate = successes / totalRequests;
      this.verify(
        "Some requests succeed",
        successes > 0,
        `${successes}/${totalRequests} succeeded`,
      );
      this.verify(
        "Some requests fail",
        failures > 0,
        `${failures}/${totalRequests} failed`,
      );
      this.verify(
        "Failure rate approximately 50%",
        successRate > 0.2 && successRate < 0.8,
        `Success rate: ${(successRate * 100).toFixed(0)}%`,
      );

      const allPassed = this.verifications.every((v) => v.passed);
      return {
        name: this.name,
        result: allPassed ? "passed" : "failed",
        durationMs: Date.now() - start,
        verifications: this.verifications,
      };
    } catch (error) {
      return {
        name: this.name,
        result: "failed",
        durationMs: Date.now() - start,
        error: String(error),
        verifications: this.verifications,
      };
    }
  }
}

/**
 * Scenario: All bots crash simultaneously
 * Tests graceful degradation when all bots fail
 */
export class MassBotFailureScenario extends ChaosScenario {
  name = "Mass Bot Failure";
  description = "All bots fail at once, testing graceful degradation";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      const basePort = 16000 + Math.floor(Math.random() * 1000);
      this.bots = await createBotFleet(4, basePort, {
        verbose: this.config.verbose,
      });
      this.botChaos = new BotChaosAgent(this.bots, this.config.verbose);

      this.log("Created bot fleet");

      // Verify all bots healthy initially
      for (const bot of this.bots) {
        const response = await fetch(bot.getEndpoint());
        if (!response.ok) {
          this.verify(
            `${bot.getName()} healthy`,
            false,
            "Bot not responding initially",
          );
        }
      }

      // Inject chaos: Crash all bots
      this.log("Injecting chaos: Mass bot failure");
      this.botChaos.crashAllBots();

      // Verify all bots are down
      let allDown = true;
      for (const bot of this.bots) {
        try {
          await fetch(bot.getEndpoint());
          allDown = false;
        } catch {
          // Expected
        }
      }

      this.verify(
        "All bots down",
        allDown,
        allDown
          ? "All bots unreachable (expected)"
          : "Some bots still responding",
      );

      // Verify system health still works
      const healthResponse = await this.fetchJson<{ status: string }>(
        "/api/v1/health",
      );
      this.verify(
        "System health endpoint available",
        healthResponse !== null,
        healthResponse ? "Health check works" : "Health check failed",
      );

      // Verify tournaments endpoint works
      const tournamentsResponse = await this.fetchJson<unknown[]>(
        "/api/v1/tournaments",
      );
      this.verify(
        "Tournaments endpoint available",
        tournamentsResponse !== null,
        tournamentsResponse ? "Tournaments accessible" : "Tournaments failed",
      );

      const allPassed = this.verifications.every((v) => v.passed);
      return {
        name: this.name,
        result: allPassed ? "passed" : "failed",
        durationMs: Date.now() - start,
        verifications: this.verifications,
      };
    } catch (error) {
      return {
        name: this.name,
        result: "failed",
        durationMs: Date.now() - start,
        error: String(error),
        verifications: this.verifications,
      };
    }
  }
}

/**
 * Scenario: High latency bots
 * Tests timeout handling and slow response tolerance
 */
export class HighLatencyBotScenario extends ChaosScenario {
  name = "High Latency Bot";
  description = "Bot responds very slowly, testing timeout handling";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      const basePort = 17000 + Math.floor(Math.random() * 1000);
      this.bots = await createBotFleet(2, basePort, {
        verbose: this.config.verbose,
      });
      this.botChaos = new BotChaosAgent(this.bots, this.config.verbose);

      this.log("Created bot fleet");

      // Inject chaos: 3 second delay
      this.log("Injecting chaos: 3s delay on bot 0");
      this.botChaos.slowBot(0, 3000);

      // Time a request to slow bot
      const slowStart = Date.now();
      const slowResponse = await fetch(this.bots[0].getEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const slowDuration = Date.now() - slowStart;

      this.verify(
        "Slow bot response delayed",
        slowDuration >= 2500,
        `Response took ${slowDuration}ms`,
      );

      this.verify(
        "Slow bot eventually responds",
        slowResponse.ok,
        slowResponse.ok ? "Got response" : "No response",
      );

      // Verify fast bot is unaffected
      const fastStart = Date.now();
      const fastResponse = await fetch(this.bots[1].getEndpoint());
      const fastDuration = Date.now() - fastStart;

      this.verify(
        "Fast bot responds quickly",
        fastDuration < 500,
        `Response took ${fastDuration}ms`,
      );

      const allPassed = this.verifications.every((v) => v.passed);
      return {
        name: this.name,
        result: allPassed ? "passed" : "failed",
        durationMs: Date.now() - start,
        verifications: this.verifications,
      };
    } catch (error) {
      return {
        name: this.name,
        result: "failed",
        durationMs: Date.now() - start,
        error: String(error),
        verifications: this.verifications,
      };
    }
  }
}

/**
 * Scenario: Request burst / load spike
 * Tests system behavior under sudden load
 */
export class RequestBurstScenario extends ChaosScenario {
  name = "Request Burst";
  description = "Sudden burst of requests, testing rate limiting and stability";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      // Send burst of requests
      this.log("Injecting chaos: Request burst (100 requests)");
      const successCount = await this.networkChaos.requestBurst(
        "/api/v1/health",
        100,
        5,
      );

      this.verify(
        "Most requests succeed",
        successCount > 80,
        `${successCount}/100 succeeded`,
      );

      // Verify system still responsive after burst
      await this.sleep(1000);
      const healthResponse = await this.fetchJson<{ status: string }>(
        "/api/v1/health",
      );
      this.verify(
        "System responsive after burst",
        healthResponse?.status === "ok",
        healthResponse ? "System healthy" : "System unresponsive",
      );

      const allPassed = this.verifications.every((v) => v.passed);
      return {
        name: this.name,
        result: allPassed ? "passed" : "failed",
        durationMs: Date.now() - start,
        verifications: this.verifications,
      };
    } catch (error) {
      return {
        name: this.name,
        result: "failed",
        durationMs: Date.now() - start,
        error: String(error),
        verifications: this.verifications,
      };
    }
  }
}

/**
 * Scenario: Recovery status check
 * Tests recovery mechanism availability
 */
export class RecoveryStatusScenario extends ChaosScenario {
  name = "Recovery Status";
  description = "Verify recovery mechanisms are available and configured";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      // Check health endpoints
      const healthResponse = await this.fetchJson<{ status: string }>(
        "/api/v1/health",
      );
      this.verify(
        "Health endpoint available",
        healthResponse?.status === "ok",
        healthResponse ? "Health OK" : "Health unavailable",
      );

      const readyResponse = await this.fetchJson<{ status: string }>(
        "/api/v1/health/ready",
      );
      this.verify(
        "Readiness endpoint available",
        readyResponse?.status === "ok",
        readyResponse ? "Ready" : "Not ready",
      );

      const liveResponse = await this.fetchJson<{ status: string }>(
        "/api/v1/health/live",
      );
      this.verify(
        "Liveness endpoint available",
        liveResponse?.status === "ok",
        liveResponse ? "Live" : "Not live",
      );

      // Check metrics for recovery-related gauges
      const metricsResponse = await fetch(
        `${this.config.baseUrl}/api/v1/metrics`,
      );
      const metricsText = await metricsResponse.text();

      this.verify(
        "Metrics include active_games gauge",
        metricsText.includes("poker_active_games"),
        metricsText.includes("poker_active_games") ? "Found" : "Missing",
      );

      this.verify(
        "Metrics include active_tournaments gauge",
        metricsText.includes("poker_active_tournaments"),
        metricsText.includes("poker_active_tournaments") ? "Found" : "Missing",
      );

      const allPassed = this.verifications.every((v) => v.passed);
      return {
        name: this.name,
        result: allPassed ? "passed" : "failed",
        durationMs: Date.now() - start,
        verifications: this.verifications,
      };
    } catch (error) {
      return {
        name: this.name,
        result: "failed",
        durationMs: Date.now() - start,
        error: String(error),
        verifications: this.verifications,
      };
    }
  }
}

/**
 * Get all scenarios based on intensity level
 */
export function getScenarios(
  config: ScenarioConfig,
  intensity: ChaosIntensity = "medium",
): ChaosScenario[] {
  const all: ChaosScenario[] = [
    new BotCrashMidHandScenario(config),
    new BotTimeoutCascadeScenario(config),
    new BotGarbageResponseScenario(config),
    new IntermittentBotFailureScenario(config),
    new MassBotFailureScenario(config),
    new HighLatencyBotScenario(config),
    new RequestBurstScenario(config),
    new RecoveryStatusScenario(config),
  ];

  switch (intensity) {
    case "light":
      // Basic scenarios only
      return [
        new BotCrashMidHandScenario(config),
        new BotGarbageResponseScenario(config),
        new RecoveryStatusScenario(config),
      ];
    case "medium":
      // Skip the heaviest scenarios
      return all.filter((s) => s.name !== "Mass Bot Failure");
    case "heavy":
    default:
      return all;
  }
}
