/**
 * Virtual Tournament
 * ==================
 *
 * Simulates a tournament lifecycle for load testing.
 * Each virtual tournament:
 * - Creates bots with strategy JSON
 * - Registers players via API
 * - Connects via WebSocket
 * - Monitors game state
 * - Tracks metrics
 */

import * as crypto from "crypto";
import { WebSocket } from "ws";
import { MetricsCollector } from "./metrics-collector";
import {
  BotPersonality,
  EnvironmentConfig,
  TournamentState,
  LoadTestError,
} from "./load-config";

export interface VirtualTournamentConfig {
  id: string;
  playerCount: number;
  personalities: BotPersonality[];
  botActionDelayMs: number;
  env: EnvironmentConfig;
  metricsCollector: MetricsCollector;
  verboseLogging?: boolean;
  authToken?: string;
}

const PERSONALITY_STRATEGIES: Record<string, Record<string, unknown>> = {
  caller: {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 10,
      bluffFrequency: 5,
      riskTolerance: 20,
      tightness: 20,
    },
  },
  folder: {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 5,
      bluffFrequency: 0,
      riskTolerance: 5,
      tightness: 95,
    },
  },
  maniac: {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 90,
      bluffFrequency: 60,
      riskTolerance: 80,
      tightness: 30,
    },
  },
  smart: {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 55,
      bluffFrequency: 25,
      riskTolerance: 45,
      tightness: 55,
    },
  },
  random: {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 50,
      bluffFrequency: 50,
      riskTolerance: 50,
      tightness: 50,
    },
  },
};

interface VirtualPlayer {
  id: string;
  name: string;
  personality: BotPersonality;
  strategy: Record<string, unknown>;
  wsConnection?: WebSocket;
  chips: number;
  isActive: boolean;
}

export class VirtualTournament {
  private config: VirtualTournamentConfig;
  private state: TournamentState;
  private players: VirtualPlayer[] = [];
  private tournamentId: string = "";
  private wsConnections: WebSocket[] = [];
  private stopped = false;
  private authToken: string = "";

  constructor(config: VirtualTournamentConfig) {
    this.config = config;
    this.authToken = config.authToken || "";
    this.state = {
      id: config.id,
      status: "starting",
      playersRegistered: 0,
      playersRemaining: 0,
      handsPlayed: 0,
      startTime: Date.now(),
      errors: [],
    };
  }

  /**
   * Start the virtual tournament
   */
  async start(): Promise<void> {
    try {
      this.log("Starting virtual tournament...");

      await this.createBotRecords();

      // Phase 2: Create tournament via API
      await this.createTournament();

      // Phase 3: Register bots
      await this.registerBots();

      // Phase 4: Start tournament
      await this.startTournament();

      // Phase 5: Connect WebSockets and monitor
      await this.connectWebSockets();

      this.state.status = "running";
      this.config.metricsCollector.recordTournamentStarted();
      this.log("Tournament running");
    } catch (error) {
      this.state.status = "error";
      this.state.errors.push(String(error));
      this.config.metricsCollector.recordTournamentFailed();
      this.recordError("crash", `Failed to start: ${error}`);
      throw error;
    }
  }

  /**
   * Monitor tournament until completion
   */
  async monitor(): Promise<void> {
    const maxRuntime = 300000; // 5 minute max per tournament
    const startTime = Date.now();

    while (
      !this.stopped &&
      this.state.status === "running" &&
      Date.now() - startTime < maxRuntime
    ) {
      await this.sleep(2000);
      await this.checkTournamentState();
    }

    if (this.state.status === "running") {
      this.state.status = "finished";
    }
  }

  /**
   * Stop the tournament and cleanup resources
   */
  async stop(): Promise<void> {
    this.stopped = true;
    this.state.endTime = Date.now();

    // Close WebSocket connections
    for (const ws of this.wsConnections) {
      try {
        ws.close();
      } catch {
        // Ignore close errors
      }
    }
    this.wsConnections = [];

    this.players = [];

    if (this.state.status !== "error") {
      this.state.status = "finished";
      this.config.metricsCollector.recordTournamentCompleted();
    }

    this.log(
      `Stopped - ${this.state.handsPlayed} hands played, ${this.state.errors.length} errors`,
    );
  }

  /**
   * Get current tournament state
   */
  getState(): TournamentState {
    return { ...this.state };
  }

  private async createBotRecords(): Promise<void> {
    for (let i = 0; i < this.config.playerCount; i++) {
      const personality =
        this.config.personalities[i % this.config.personalities.length];
      const playerId = crypto.randomUUID();
      const strategy =
        PERSONALITY_STRATEGIES[personality] || PERSONALITY_STRATEGIES.random;

      this.players.push({
        id: playerId,
        name: `LoadBot_${this.config.id.slice(0, 8)}_${i}`,
        personality,
        strategy,
        chips: 0,
        isActive: true,
      });
    }

    this.log(`Created ${this.players.length} bot records with strategy JSON`);
  }

  private async createTournament(): Promise<void> {
    const start = Date.now();

    try {
      const response = await this.httpRequest(
        `${this.config.env.backendUrl}/api/v1/tournaments`,
        {
          method: "POST",
          body: {
            name: `LoadTest_${this.config.id.slice(0, 8)}`,
            type: "sit_n_go",
            buyIn: 100,
            startingChips: 1000,
            minPlayers: this.config.playerCount,
            maxPlayers: this.config.playerCount,
            playersPerTable: Math.min(9, this.config.playerCount),
            turnTimeoutMs: 5000,
          },
        },
      );

      const latency = Date.now() - start;
      this.config.metricsCollector.recordHttpLatency(latency, response.ok);

      if (response.ok && response.body?.id) {
        this.tournamentId = response.body.id;
        this.log(`Created tournament: ${this.tournamentId}`);
      } else {
        throw new Error(`Failed to create tournament: ${response.status}`);
      }
    } catch (error) {
      this.recordError("http", `Create tournament failed: ${error}`);
      throw error;
    }
  }

  private async registerBots(): Promise<void> {
    for (const player of this.players) {
      const start = Date.now();

      try {
        const botResponse = await this.httpRequest(
          `${this.config.env.backendUrl}/api/v1/bots/internal`,
          {
            method: "POST",
            body: {
              name: player.name,
              strategy: player.strategy,
            },
          },
        );

        if (botResponse.ok && botResponse.body?.id) {
          player.id = botResponse.body.id;

          // Then register for tournament
          const regResponse = await this.httpRequest(
            `${this.config.env.backendUrl}/api/v1/tournaments/${this.tournamentId}/register`,
            {
              method: "POST",
              body: { botId: player.id },
            },
          );

          const latency = Date.now() - start;
          this.config.metricsCollector.recordHttpLatency(
            latency,
            regResponse.ok,
          );

          if (regResponse.ok) {
            this.state.playersRegistered++;
          }
        }
      } catch (error) {
        this.recordError("http", `Register bot failed: ${error}`);
      }
    }

    this.log(`Registered ${this.state.playersRegistered} players`);
  }

  private async startTournament(): Promise<void> {
    const start = Date.now();

    try {
      const response = await this.httpRequest(
        `${this.config.env.backendUrl}/api/v1/tournaments/${this.tournamentId}/start`,
        { method: "POST" },
      );

      const latency = Date.now() - start;
      this.config.metricsCollector.recordHttpLatency(latency, response.ok);

      if (!response.ok) {
        throw new Error(`Failed to start: ${response.status}`);
      }
    } catch (error) {
      this.recordError("http", `Start tournament failed: ${error}`);
      throw error;
    }
  }

  private async connectWebSockets(): Promise<void> {
    try {
      const ws = new WebSocket(
        `${this.config.env.wsUrl}/tournament/${this.tournamentId}`,
      );

      ws.on("open", () => {
        this.config.metricsCollector.recordWsConnection(true);
        this.config.metricsCollector.recordWsMessage(true);
        ws.send(
          JSON.stringify({
            type: "subscribe",
            tournamentId: this.tournamentId,
          }),
        );
      });

      ws.on("message", (data) => {
        this.config.metricsCollector.recordWsMessage(false);
        this.handleWsMessage(data.toString());
      });

      ws.on("close", () => {
        this.config.metricsCollector.recordWsConnection(false);
      });

      ws.on("error", (error) => {
        this.recordError("ws", `WebSocket error: ${error}`);
      });

      this.wsConnections.push(ws);
    } catch (error) {
      this.recordError("ws", `WebSocket connect failed: ${error}`);
    }
  }

  private handleWsMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case "hand_complete":
          this.state.handsPlayed++;
          this.config.metricsCollector.recordHandPlayed();
          break;

        case "player_eliminated":
          this.state.playersRemaining = Math.max(
            0,
            this.state.playersRemaining - 1,
          );
          break;

        case "tournament_complete":
          this.state.status = "finished";
          break;

        case "game_state":
          if (message.playersRemaining !== undefined) {
            this.state.playersRemaining = message.playersRemaining;
          }
          break;
      }
    } catch {
      // Ignore parse errors
    }
  }

  private async checkTournamentState(): Promise<void> {
    const start = Date.now();

    try {
      const response = await this.httpRequest(
        `${this.config.env.backendUrl}/api/v1/tournaments/${this.tournamentId}/state`,
      );

      const latency = Date.now() - start;
      this.config.metricsCollector.recordHttpLatency(latency, response.ok);

      if (response.ok && response.body) {
        const { status, playersRemaining, handsPlayed } = response.body;

        if (status === "finished" || status === "completed") {
          this.state.status = "finished";
        }

        if (playersRemaining !== undefined) {
          this.state.playersRemaining = playersRemaining;
        }

        if (handsPlayed !== undefined && handsPlayed > this.state.handsPlayed) {
          const newHands = handsPlayed - this.state.handsPlayed;
          for (let i = 0; i < newHands; i++) {
            this.config.metricsCollector.recordHandPlayed();
          }
          this.state.handsPlayed = handsPlayed;
        }
      }
    } catch (error) {
      this.recordError("http", `State check failed: ${error}`);
    }
  }

  private async httpRequest(
    url: string,
    options: { method?: string; body?: any; skipAuth?: boolean } = {},
  ): Promise<{ ok: boolean; status: number; body: any }> {
    return new Promise((resolve) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === "https:";
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const httpModule = isHttps ? require("https") : require("http");

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (this.authToken && !options.skipAuth) {
        headers["Authorization"] = `Bearer ${this.authToken}`;
      }

      const req = httpModule.request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: options.method || "GET",
          headers,
          timeout: 30000,
        },
        (res: any) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({
                ok: res.statusCode >= 200 && res.statusCode < 300,
                status: res.statusCode,
                body: data ? JSON.parse(data) : null,
              });
            } catch {
              resolve({
                ok: res.statusCode >= 200 && res.statusCode < 300,
                status: res.statusCode,
                body: data,
              });
            }
          });
        },
      );

      req.on("error", () => {
        resolve({ ok: false, status: 0, body: null });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, status: 0, body: null });
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  }

  private recordError(
    type: LoadTestError["type"],
    message: string,
    endpoint?: string,
  ): void {
    const error: LoadTestError = {
      timestamp: Date.now(),
      tournamentId: this.tournamentId || this.config.id,
      type,
      message,
      endpoint,
    };
    this.state.errors.push(message);
    this.config.metricsCollector.recordError(error);
  }

  private log(message: string): void {
    if (this.config.verboseLogging) {
      console.log(`[VT:${this.config.id.slice(0, 8)}] ${message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a virtual tournament
 */
export function createVirtualTournament(
  config: VirtualTournamentConfig,
): VirtualTournament {
  return new VirtualTournament(config);
}
