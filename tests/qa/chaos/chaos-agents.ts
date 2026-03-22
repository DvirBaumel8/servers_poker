/**
 * Chaos Agents
 *
 * Agents that inject various types of failures into the system
 * for chaos testing purposes.
 */

import {
  ControllableBot,
  BotBehavior,
  BotBehaviorConfig,
} from "./controllable-bot";

export interface ChaosEvent {
  timestamp: Date;
  agent: string;
  action: string;
  target?: string;
  details?: string;
}

/**
 * Bot Chaos Agent
 * Controls bot behavior to simulate various failure modes
 */
export class BotChaosAgent {
  private bots: ControllableBot[];
  private events: ChaosEvent[] = [];
  private verbose: boolean;

  constructor(bots: ControllableBot[], verbose = false) {
    this.bots = bots;
    this.verbose = verbose;
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`  [BotChaos] ${message}`);
    }
  }

  private recordEvent(action: string, target?: string, details?: string): void {
    this.events.push({
      timestamp: new Date(),
      agent: "BotChaosAgent",
      action,
      target,
      details,
    });
  }

  /**
   * Make a single bot crash
   */
  crashBot(index: number): void {
    if (index >= this.bots.length) return;
    const bot = this.bots[index];
    bot.setBehavior({ behavior: "crash" });
    this.log(`Crashed bot: ${bot.getName()}`);
    this.recordEvent("crash", bot.getName());
  }

  /**
   * Make a bot start timing out
   */
  timeoutBot(index: number): void {
    if (index >= this.bots.length) return;
    const bot = this.bots[index];
    bot.setBehavior({ behavior: "timeout" });
    this.log(`Bot now timing out: ${bot.getName()}`);
    this.recordEvent("timeout", bot.getName());
  }

  /**
   * Make a bot return garbage responses
   */
  corruptBot(index: number): void {
    if (index >= this.bots.length) return;
    const bot = this.bots[index];
    bot.setBehavior({ behavior: "garbage" });
    this.log(`Bot now returning garbage: ${bot.getName()}`);
    this.recordEvent("corrupt", bot.getName());
  }

  /**
   * Make a bot go offline
   */
  offlineBot(index: number): void {
    if (index >= this.bots.length) return;
    const bot = this.bots[index];
    bot.setBehavior({ behavior: "offline" });
    this.log(`Bot now offline: ${bot.getName()}`);
    this.recordEvent("offline", bot.getName());
  }

  /**
   * Make a bot slow (high latency)
   */
  slowBot(index: number, delayMs: number = 5000): void {
    if (index >= this.bots.length) return;
    const bot = this.bots[index];
    bot.setBehavior({ behavior: "slow", delayMs });
    this.log(`Bot now slow (${delayMs}ms delay): ${bot.getName()}`);
    this.recordEvent("slow", bot.getName(), `${delayMs}ms delay`);
  }

  /**
   * Make a bot intermittently fail
   */
  intermittentBot(index: number, failureRate: number = 0.5): void {
    if (index >= this.bots.length) return;
    const bot = this.bots[index];
    bot.setBehavior({ behavior: "intermittent", failureRate });
    this.log(
      `Bot now intermittent (${failureRate * 100}% failure): ${bot.getName()}`,
    );
    this.recordEvent(
      "intermittent",
      bot.getName(),
      `${failureRate * 100}% failure rate`,
    );
  }

  /**
   * Set bot to crash after N requests
   */
  crashBotAfterRequests(index: number, requests: number): void {
    if (index >= this.bots.length) return;
    const bot = this.bots[index];
    bot.setBehavior({ behavior: "normal", crashAfterRequests: requests });
    this.log(`Bot will crash after ${requests} requests: ${bot.getName()}`);
    this.recordEvent(
      "delayed_crash",
      bot.getName(),
      `after ${requests} requests`,
    );
  }

  /**
   * Restore a bot to normal behavior
   */
  restoreBot(index: number): void {
    if (index >= this.bots.length) return;
    const bot = this.bots[index];
    bot.setBehavior({ behavior: "normal" });
    this.log(`Bot restored to normal: ${bot.getName()}`);
    this.recordEvent("restore", bot.getName());
  }

  /**
   * Restore all bots to normal behavior
   */
  restoreAllBots(): void {
    this.bots.forEach((bot) => {
      bot.setBehavior({ behavior: "normal" });
    });
    this.log("All bots restored to normal");
    this.recordEvent("restore_all");
  }

  /**
   * Crash all bots simultaneously
   */
  crashAllBots(): void {
    this.bots.forEach((bot) => {
      bot.setBehavior({ behavior: "crash" });
    });
    this.log("All bots crashed");
    this.recordEvent("crash_all");
  }

  /**
   * Crash a random bot
   */
  crashRandomBot(): number {
    const index = Math.floor(Math.random() * this.bots.length);
    this.crashBot(index);
    return index;
  }

  /**
   * Apply random chaos to a random bot
   */
  randomChaos(): { botIndex: number; behavior: BotBehavior } {
    const index = Math.floor(Math.random() * this.bots.length);
    const behaviors: BotBehavior[] = [
      "crash",
      "timeout",
      "garbage",
      "slow",
      "intermittent",
    ];
    const behavior = behaviors[Math.floor(Math.random() * behaviors.length)];

    const config: BotBehaviorConfig = { behavior };
    if (behavior === "slow") config.delayMs = 3000 + Math.random() * 7000;
    if (behavior === "intermittent")
      config.failureRate = 0.3 + Math.random() * 0.5;

    this.bots[index].setBehavior(config);
    this.log(`Random chaos: ${behavior} on ${this.bots[index].getName()}`);
    this.recordEvent("random_chaos", this.bots[index].getName(), behavior);

    return { botIndex: index, behavior };
  }

  /**
   * Cascade failure - bots fail one by one
   */
  async cascadeFailure(intervalMs: number = 1000): Promise<void> {
    for (let i = 0; i < this.bots.length; i++) {
      this.crashBot(i);
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    this.recordEvent("cascade_failure", undefined, `${this.bots.length} bots`);
  }

  getEvents(): ChaosEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }
}

/**
 * Network Chaos Agent
 * Simulates network-level issues
 */
export class NetworkChaosAgent {
  private events: ChaosEvent[] = [];
  private verbose: boolean;
  private baseUrl: string;

  constructor(baseUrl: string, verbose = false) {
    this.baseUrl = baseUrl;
    this.verbose = verbose;
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`  [NetworkChaos] ${message}`);
    }
  }

  private recordEvent(action: string, details?: string): void {
    this.events.push({
      timestamp: new Date(),
      agent: "NetworkChaosAgent",
      action,
      details,
    });
  }

  /**
   * Simulate high latency requests
   */
  async highLatencyRequest(
    endpoint: string,
    delayMs: number = 5000,
  ): Promise<Response | null> {
    this.log(`High latency request to ${endpoint} (${delayMs}ms delay)`);
    this.recordEvent("high_latency", `${endpoint} - ${delayMs}ms`);

    await new Promise((r) => setTimeout(r, delayMs));

    try {
      return await fetch(`${this.baseUrl}${endpoint}`);
    } catch (error) {
      this.log(`Request failed: ${error}`);
      return null;
    }
  }

  /**
   * Simulate burst of rapid requests (potential DDoS-like behavior)
   */
  async requestBurst(
    endpoint: string,
    count: number,
    intervalMs: number = 10,
  ): Promise<number> {
    this.log(`Burst: ${count} requests to ${endpoint}`);
    this.recordEvent("request_burst", `${count} requests to ${endpoint}`);

    let successful = 0;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      promises.push(
        (async () => {
          try {
            const response = await fetch(`${this.baseUrl}${endpoint}`);
            if (response.ok) successful++;
          } catch {
            // Ignore errors
          }
        })(),
      );

      if (intervalMs > 0) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    await Promise.all(promises);
    return successful;
  }

  /**
   * Simulate connection that hangs (never completes)
   */
  hangingConnection(endpoint: string): AbortController {
    this.log(`Hanging connection to ${endpoint}`);
    this.recordEvent("hanging_connection", endpoint);

    const controller = new AbortController();

    fetch(`${this.baseUrl}${endpoint}`, {
      signal: controller.signal,
    }).catch(() => {
      // Expected to be aborted
    });

    return controller;
  }

  getEvents(): ChaosEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }
}

/**
 * State Chaos Agent
 * Tests state-related edge cases
 */
export class StateChaosAgent {
  private events: ChaosEvent[] = [];
  private verbose: boolean;
  private baseUrl: string;

  constructor(baseUrl: string, verbose = false) {
    this.baseUrl = baseUrl;
    this.verbose = verbose;
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`  [StateChaos] ${message}`);
    }
  }

  private recordEvent(action: string, details?: string): void {
    this.events.push({
      timestamp: new Date(),
      agent: "StateChaosAgent",
      action,
      details,
    });
  }

  /**
   * Request game state repeatedly to stress consistency
   */
  async stressGameState(
    gameId: string,
    iterations: number = 100,
  ): Promise<{
    consistent: boolean;
    errors: number;
  }> {
    this.log(`Stress testing game state: ${gameId} (${iterations} iterations)`);
    this.recordEvent("stress_game_state", `${iterations} iterations`);

    let lastState: string | null = null;
    let errors = 0;
    let inconsistencies = 0;

    for (let i = 0; i < iterations; i++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/v1/games/${gameId}`);
        if (response.ok) {
          const state = await response.text();
          if (lastState && state !== lastState) {
            inconsistencies++;
          }
          lastState = state;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    return {
      consistent: inconsistencies === 0,
      errors,
    };
  }

  /**
   * Check recovery status endpoint
   */
  async checkRecoveryStatus(): Promise<{
    available: boolean;
    recoverableGames?: number;
    autoRecoverEnabled?: boolean;
  }> {
    this.log("Checking recovery status");
    this.recordEvent("check_recovery_status");

    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/games/recovery/status`,
      );
      if (response.ok) {
        const data = (await response.json()) as {
          recoverableGames?: unknown[];
          autoRecoverEnabled?: boolean;
        };
        return {
          available: true,
          recoverableGames: data.recoverableGames?.length ?? 0,
          autoRecoverEnabled: data.autoRecoverEnabled,
        };
      }
    } catch {
      // Endpoint may not exist
    }

    return { available: false };
  }

  /**
   * Simulate rapid tournament state changes
   */
  async rapidTournamentQueries(
    tournamentId: string,
    durationMs: number = 5000,
  ): Promise<{ requests: number; errors: number }> {
    this.log(`Rapid tournament queries: ${tournamentId}`);
    this.recordEvent("rapid_tournament_queries", tournamentId);

    const start = Date.now();
    let requests = 0;
    let errors = 0;

    while (Date.now() - start < durationMs) {
      try {
        const response = await fetch(
          `${this.baseUrl}/api/v1/tournaments/${tournamentId}`,
        );
        requests++;
        if (!response.ok) errors++;
      } catch {
        errors++;
        requests++;
      }
    }

    return { requests, errors };
  }

  getEvents(): ChaosEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }
}
