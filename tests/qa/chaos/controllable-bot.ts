/**
 * Controllable Bot Server
 *
 * A bot server that can be programmed to behave in various ways
 * for chaos testing purposes.
 */

import * as http from "http";
import * as crypto from "crypto";

export type BotBehavior =
  | "normal"
  | "timeout"
  | "crash"
  | "garbage"
  | "wrong_action"
  | "slow"
  | "intermittent"
  | "offline";

export interface BotBehaviorConfig {
  behavior: BotBehavior;
  delayMs?: number;
  failureRate?: number;
  crashAfterRequests?: number;
}

export interface ControllableBotConfig {
  port: number;
  name: string;
  initialBehavior?: BotBehavior;
  personality?: "aggressive" | "conservative" | "random";
  verbose?: boolean;
}

export interface BotStats {
  requestsReceived: number;
  actionsReturned: number;
  timeouts: number;
  crashes: number;
  garbageResponses: number;
  healthChecks: number;
}

export class ControllableBot {
  private server: http.Server | null = null;
  private config: ControllableBotConfig;
  private behaviorConfig: BotBehaviorConfig;
  private stats: BotStats;
  private isRunning = false;

  constructor(config: ControllableBotConfig) {
    this.config = config;
    this.behaviorConfig = {
      behavior: config.initialBehavior ?? "normal",
    };
    this.stats = {
      requestsReceived: 0,
      actionsReturned: 0,
      timeouts: 0,
      crashes: 0,
      garbageResponses: 0,
      healthChecks: 0,
    };
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`  [Bot:${this.config.name}] ${message}`);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
          reject(new Error(`Port ${this.config.port} already in use`));
        } else {
          reject(err);
        }
      });

      this.server.listen(this.config.port, () => {
        this.isRunning = true;
        this.log(`Started on port ${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server || !this.isRunning) return;

    return new Promise((resolve) => {
      // Force close all connections
      this.server!.closeAllConnections?.();
      this.server!.close(() => {
        this.isRunning = false;
        this.server = null;
        this.log("Stopped");
        resolve();
      });

      // Fallback timeout to prevent hanging
      setTimeout(() => {
        this.isRunning = false;
        this.server = null;
        resolve();
      }, 1000);
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    await new Promise((r) => setTimeout(r, 100));
    await this.start();
  }

  setBehavior(config: BotBehaviorConfig): void {
    this.behaviorConfig = config;
    this.log(`Behavior changed to: ${config.behavior}`);
  }

  getBehavior(): BotBehavior {
    return this.behaviorConfig.behavior;
  }

  getStats(): BotStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      requestsReceived: 0,
      actionsReturned: 0,
      timeouts: 0,
      crashes: 0,
      garbageResponses: 0,
      healthChecks: 0,
    };
  }

  getEndpoint(): string {
    return `http://localhost:${this.config.port}`;
  }

  getName(): string {
    return this.config.name;
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    this.stats.requestsReceived++;

    // Handle offline and crash behaviors - affects ALL requests
    if (this.behaviorConfig.behavior === "offline") {
      res.destroy();
      return;
    }

    if (this.behaviorConfig.behavior === "crash") {
      this.stats.crashes++;
      res.destroy();
      return;
    }

    // Health check endpoint
    if (req.method === "GET" && req.url === "/") {
      this.stats.healthChecks++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", name: this.config.name }));
      return;
    }

    // Action endpoint
    if (req.method === "POST") {
      await this.handleActionRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  }

  private async handleActionRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const body = await this.readBody(req);
    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    // Check for crash after N requests
    if (
      this.behaviorConfig.crashAfterRequests &&
      this.stats.requestsReceived >= this.behaviorConfig.crashAfterRequests
    ) {
      this.behaviorConfig.behavior = "crash";
    }

    // Handle different behaviors
    switch (this.behaviorConfig.behavior) {
      case "timeout":
        this.stats.timeouts++;
        this.log("Simulating timeout (not responding)");
        // Don't respond - let it timeout
        return;

      case "garbage":
        this.stats.garbageResponses++;
        this.log("Returning garbage response");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("not valid json {{{");
        return;

      case "wrong_action":
        this.stats.actionsReturned++;
        this.log("Returning wrong action type");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ type: "invalid_action_type", amount: -9999 }));
        return;

      case "slow":
        const delay = this.behaviorConfig.delayMs ?? 5000;
        this.log(`Delaying response by ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        break;

      case "intermittent":
        const failureRate = this.behaviorConfig.failureRate ?? 0.5;
        if (Math.random() < failureRate) {
          this.stats.crashes++;
          this.log("Intermittent failure");
          res.destroy();
          return;
        }
        break;

      case "normal":
      default:
        break;
    }

    // Generate action response
    const action = this.generateAction(payload);
    this.stats.actionsReturned++;
    this.log(`Returning action: ${action.type}`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(action));
  }

  private generateAction(payload: Record<string, unknown>): {
    type: string;
    amount?: number;
  } {
    const gameState = payload.game_state as Record<string, unknown> | undefined;
    const currentBet = (gameState?.current_bet as number) ?? 0;
    const playerChips = (gameState?.player_chips as number) ?? 1000;
    const pot = (gameState?.pot as number) ?? 0;

    const personality = this.config.personality ?? "random";

    switch (personality) {
      case "aggressive":
        if (Math.random() < 0.4) {
          const raiseAmount = Math.min(
            playerChips,
            currentBet + Math.floor(pot * 0.5),
          );
          return { type: "raise", amount: raiseAmount };
        }
        return { type: "call" };

      case "conservative":
        if (currentBet === 0) {
          return { type: "check" };
        }
        if (Math.random() < 0.7) {
          return { type: "fold" };
        }
        return { type: "call" };

      case "random":
      default:
        const actions = ["fold", "call", "check", "raise"];
        const action = actions[Math.floor(Math.random() * actions.length)];
        if (action === "raise") {
          return {
            type: "raise",
            amount: Math.min(playerChips, currentBet + 100),
          };
        }
        return { type: action };
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        resolve(body);
      });
    });
  }
}

/**
 * Create multiple controllable bots
 */
export async function createBotFleet(
  count: number,
  basePort: number,
  options?: {
    verbose?: boolean;
    initialBehavior?: BotBehavior;
  },
): Promise<ControllableBot[]> {
  const bots: ControllableBot[] = [];
  const personalities: Array<"aggressive" | "conservative" | "random"> = [
    "aggressive",
    "conservative",
    "random",
  ];

  for (let i = 0; i < count; i++) {
    const bot = new ControllableBot({
      port: basePort + i,
      name: `chaos-bot-${i + 1}`,
      personality: personalities[i % personalities.length],
      verbose: options?.verbose,
      initialBehavior: options?.initialBehavior,
    });
    await bot.start();
    bots.push(bot);
  }

  return bots;
}

/**
 * Stop all bots in a fleet
 */
export async function stopBotFleet(bots: ControllableBot[]): Promise<void> {
  await Promise.all(bots.map((bot) => bot.stop()));
}
