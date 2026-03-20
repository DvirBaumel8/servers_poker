import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { OnEvent } from "@nestjs/event-emitter";
import { BotCallerService } from "./bot-caller.service";
import {
  BotHealthSchedulerService,
  HealthCheckRound,
  HealthCheckResult,
} from "./bot-health-scheduler.service";

export interface BotMetricsSnapshot {
  timestamp: Date;
  totalBots: number;
  healthyBots: number;
  unhealthyBots: number;
  botsInActiveGames: number;
  circuitBreakersOpen: number;
  averageLatencyMs: number;
  bots: BotMetricDetail[];
}

export interface BotMetricDetail {
  botId: string;
  endpoint: string;
  healthy: boolean;
  latencyMs: number;
  consecutiveFailures: number;
  circuitOpen: boolean;
  inActiveGame: boolean;
  gameId?: string;
  lastCheck?: Date;
}

@WebSocketGateway({
  namespace: "/metrics",
  cors: {
    origin: "*",
  },
})
export class BotMetricsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BotMetricsGateway.name);
  private connectedClients = 0;

  constructor(
    private readonly botCaller: BotCallerService,
    private readonly healthScheduler: BotHealthSchedulerService,
  ) {}

  afterInit() {
    this.logger.log("Bot Metrics Gateway initialized");
  }

  handleConnection(client: Socket) {
    this.connectedClients++;
    this.logger.debug(
      `Client connected: ${client.id} (total: ${this.connectedClients})`,
    );

    this.sendCurrentSnapshot(client);
  }

  handleDisconnect(client: Socket) {
    this.connectedClients--;
    this.logger.debug(
      `Client disconnected: ${client.id} (total: ${this.connectedClients})`,
    );
  }

  @SubscribeMessage("getSnapshot")
  handleGetSnapshot(_client: Socket): BotMetricsSnapshot {
    return this.buildSnapshot();
  }

  @SubscribeMessage("getHealthHistory")
  handleGetHealthHistory(_client: Socket): HealthCheckRound | null {
    return this.healthScheduler.getLastHealthCheckRound() ?? null;
  }

  @SubscribeMessage("triggerHealthCheck")
  async handleTriggerHealthCheck(): Promise<HealthCheckRound> {
    this.logger.log("Manual health check triggered via WebSocket");
    return this.healthScheduler.runHealthCheckNow();
  }

  @OnEvent("bot.healthCheckRoundCompleted")
  handleHealthCheckRoundCompleted(round: HealthCheckRound): void {
    if (this.connectedClients > 0) {
      this.server.emit("healthCheckRound", round);
      this.server.emit("snapshot", this.buildSnapshot());
    }
  }

  @OnEvent("bot.healthStateChanged")
  handleHealthStateChanged(result: HealthCheckResult): void {
    if (this.connectedClients > 0) {
      this.server.emit("botStateChanged", {
        botId: result.botId,
        healthy: result.healthy,
        previousState: result.previousState,
        timestamp: result.timestamp,
      });
    }
  }

  @OnEvent("bot.circuitOpened")
  handleCircuitOpened(data: {
    botId: string;
    failures: number;
    resetAt: Date;
  }): void {
    if (this.connectedClients > 0) {
      this.server.emit("circuitBreaker", {
        type: "opened",
        ...data,
      });
    }
  }

  @OnEvent("bot.callFailed")
  handleCallFailed(data: {
    botId: string;
    endpoint: string;
    error: string;
    attempts: number;
    latencyMs: number;
  }): void {
    if (this.connectedClients > 0) {
      this.server.emit("botCallFailed", data);
    }
  }

  @OnEvent("bot.activeGameBotUnhealthy")
  handleActiveGameBotUnhealthy(
    data: HealthCheckResult & { gameId: string },
  ): void {
    if (this.connectedClients > 0) {
      this.server.emit("activeGameAlert", {
        type: "botUnhealthy",
        ...data,
      });
    }
  }

  private sendCurrentSnapshot(client: Socket): void {
    const snapshot = this.buildSnapshot();
    client.emit("snapshot", snapshot);
  }

  private buildSnapshot(): BotMetricsSnapshot {
    const healthStatuses = this.botCaller.getAllHealthStatuses();
    const registeredBots = this.healthScheduler.getRegisteredBots();
    const botsInGames = this.healthScheduler.getBotsInActiveGames();

    const botsMap = new Map<string, BotMetricDetail>();

    for (const status of healthStatuses) {
      botsMap.set(status.botId, {
        botId: status.botId,
        endpoint: status.endpoint,
        healthy: status.healthy,
        latencyMs: status.averageLatencyMs,
        consecutiveFailures: status.consecutiveFailures,
        circuitOpen: status.circuitOpen,
        inActiveGame: false,
        lastCheck: status.lastCheck,
      });
    }

    for (const bot of registeredBots) {
      const existing = botsMap.get(bot.id);
      if (existing) {
        existing.inActiveGame = bot.inActiveGame;
        existing.gameId = bot.gameId;
      } else {
        botsMap.set(bot.id, {
          botId: bot.id,
          endpoint: bot.endpoint,
          healthy: true,
          latencyMs: 0,
          consecutiveFailures: 0,
          circuitOpen: false,
          inActiveGame: bot.inActiveGame,
          gameId: bot.gameId,
        });
      }
    }

    const bots = Array.from(botsMap.values());
    const healthyBots = bots.filter((b) => b.healthy).length;
    const circuitBreakersOpen = bots.filter((b) => b.circuitOpen).length;

    const totalLatency = bots.reduce((sum, b) => sum + b.latencyMs, 0);
    const averageLatencyMs =
      bots.length > 0 ? Math.round(totalLatency / bots.length) : 0;

    return {
      timestamp: new Date(),
      totalBots: bots.length,
      healthyBots,
      unhealthyBots: bots.length - healthyBots,
      botsInActiveGames: botsInGames.length,
      circuitBreakersOpen,
      averageLatencyMs,
      bots,
    };
  }
}
