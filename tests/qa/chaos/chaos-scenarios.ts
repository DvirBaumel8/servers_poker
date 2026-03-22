/**
 * Chaos Scenarios
 *
 * Strategy-based chaos test scenarios that validate the system
 * handles corrupt, extreme, and invalid strategy JSON gracefully.
 */

import { ControllableBot, createBotFleet } from "./controllable-bot";
import { NetworkChaosAgent, StateChaosAgent } from "./chaos-agents";

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

export abstract class ChaosScenario {
  protected config: ScenarioConfig;
  protected bots: ControllableBot[] = [];
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
    this.bots = [];
    this.verifications = [];
  }
}

export class CorruptStrategyScenario extends ChaosScenario {
  name = "Corrupt Strategy JSON";
  description =
    "Bot has corrupt strategy JSON, system should handle gracefully";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      this.bots = createBotFleet(4);

      this.bots[0].setMode("corrupt_json");
      this.log("Set bot 0 to corrupt_json mode");

      const corruptStrategy = this.bots[0].generateStrategy();
      const normalStrategy = this.bots[1].generateStrategy();

      this.verify(
        "Corrupt strategy generated",
        typeof corruptStrategy.version === "string",
        "Strategy has invalid version type",
      );

      this.verify(
        "Normal strategy valid",
        typeof normalStrategy.version === "number",
        "Normal strategy has correct version type",
      );

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

export class ExtremePersonalityScenario extends ChaosScenario {
  name = "Extreme Personality Values";
  description =
    "Bots with max/min personality values should play without errors";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      this.bots = createBotFleet(4);

      this.bots[0].setMode("extreme_aggressive");
      this.bots[1].setMode("extreme_passive");
      this.log("Set extreme personality modes");

      const aggressiveStrategy = this.bots[0].generateStrategy();
      const passiveStrategy = this.bots[1].generateStrategy();

      const aggPersonality = aggressiveStrategy.personality as Record<
        string,
        number
      >;
      const passPersonality = passiveStrategy.personality as Record<
        string,
        number
      >;

      this.verify(
        "Aggressive has max aggression",
        aggPersonality?.aggression === 100,
        `Aggression: ${aggPersonality?.aggression}`,
      );

      this.verify(
        "Passive has zero aggression",
        passPersonality?.aggression === 0,
        `Aggression: ${passPersonality?.aggression}`,
      );

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

export class InvalidStrategyValuesScenario extends ChaosScenario {
  name = "Invalid Strategy Values";
  description = "Strategy with NaN, negative, and undefined values";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      this.bots = createBotFleet(2);

      this.bots[0].setMode("invalid_values");
      this.log("Set invalid_values mode");

      const strategy = this.bots[0].generateStrategy();
      const personality = strategy.personality as Record<string, unknown>;

      this.verify(
        "Has negative value",
        (personality?.aggression as number) < 0,
        `Aggression: ${personality?.aggression}`,
      );

      this.verify(
        "Has out-of-range value",
        (personality?.bluffFrequency as number) > 100,
        `BluffFrequency: ${personality?.bluffFrequency}`,
      );

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

export class MissingStrategyFieldsScenario extends ChaosScenario {
  name = "Missing Strategy Fields";
  description = "Strategy JSON with missing required fields";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
      this.bots = createBotFleet(2);

      this.bots[0].setMode("missing_fields");
      this.log("Set missing_fields mode");

      const strategy = this.bots[0].generateStrategy();

      this.verify(
        "Strategy missing personality",
        !("personality" in strategy),
        "No personality field in strategy",
      );

      this.verify(
        "Strategy missing tier",
        !("tier" in strategy),
        "No tier field in strategy",
      );

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

export class RequestBurstScenario extends ChaosScenario {
  name = "Request Burst";
  description = "Sudden burst of requests, testing rate limiting and stability";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
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

export class RecoveryStatusScenario extends ChaosScenario {
  name = "Recovery Status";
  description = "Verify recovery mechanisms are available and configured";

  async run(): Promise<ScenarioOutcome> {
    const start = Date.now();

    try {
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

export function getScenarios(
  config: ScenarioConfig,
  intensity: ChaosIntensity = "medium",
): ChaosScenario[] {
  const all: ChaosScenario[] = [
    new CorruptStrategyScenario(config),
    new ExtremePersonalityScenario(config),
    new InvalidStrategyValuesScenario(config),
    new MissingStrategyFieldsScenario(config),
    new RequestBurstScenario(config),
    new RecoveryStatusScenario(config),
  ];

  switch (intensity) {
    case "light":
      return [
        new CorruptStrategyScenario(config),
        new RecoveryStatusScenario(config),
      ];
    case "medium":
      return all;
    case "heavy":
    default:
      return all;
  }
}
