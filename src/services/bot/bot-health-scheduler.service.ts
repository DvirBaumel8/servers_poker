import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { BotCallerService } from "./bot-caller.service";

export interface HealthCheckResult {
  botId: string;
  endpoint: string;
  healthy: boolean;
  latencyMs: number;
  timestamp: Date;
  previousState?: boolean;
  stateChanged: boolean;
}

export interface HealthCheckRound {
  roundId: number;
  startedAt: Date;
  completedAt?: Date;
  totalBots: number;
  healthyCount: number;
  unhealthyCount: number;
  results: HealthCheckResult[];
}

interface RegisteredBot {
  id: string;
  endpoint: string;
  registeredAt: Date;
  inActiveGame: boolean;
  gameId?: string;
}

@Injectable()
export class BotHealthSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BotHealthSchedulerService.name);

  private readonly healthCheckIntervalMs: number;
  private readonly activeGameCheckIntervalMs: number;
  private readonly enabled: boolean;

  private readonly registeredBots = new Map<string, RegisteredBot>();
  private healthCheckInterval?: NodeJS.Timeout;
  private activeGameCheckInterval?: NodeJS.Timeout;
  private roundCounter = 0;
  private lastRound?: HealthCheckRound;

  constructor(
    private readonly botCaller: BotCallerService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.healthCheckIntervalMs = this.configService.get<number>(
      "BOT_HEALTH_CHECK_INTERVAL_MS",
      30000,
    );
    this.activeGameCheckIntervalMs = this.configService.get<number>(
      "BOT_ACTIVE_GAME_CHECK_INTERVAL_MS",
      10000,
    );
    this.enabled = this.configService.get<boolean>(
      "BOT_HEALTH_CHECK_ENABLED",
      true,
    );
  }

  onModuleInit() {
    if (this.enabled) {
      this.startScheduler();
      this.logger.log(
        `Health check scheduler started (interval: ${this.healthCheckIntervalMs}ms)`,
      );
    } else {
      this.logger.log("Health check scheduler disabled");
    }
  }

  onModuleDestroy() {
    this.stopScheduler();
  }

  registerBot(botId: string, endpoint: string): void {
    this.registeredBots.set(botId, {
      id: botId,
      endpoint,
      registeredAt: new Date(),
      inActiveGame: false,
    });
    this.logger.debug(`Bot ${botId} registered for health monitoring`);
  }

  unregisterBot(botId: string): void {
    this.registeredBots.delete(botId);
    this.logger.debug(`Bot ${botId} unregistered from health monitoring`);
  }

  markBotInGame(botId: string, gameId: string): void {
    const bot = this.registeredBots.get(botId);
    if (bot) {
      bot.inActiveGame = true;
      bot.gameId = gameId;
    }
  }

  markBotNotInGame(botId: string): void {
    const bot = this.registeredBots.get(botId);
    if (bot) {
      bot.inActiveGame = false;
      bot.gameId = undefined;
    }
  }

  getRegisteredBots(): RegisteredBot[] {
    return Array.from(this.registeredBots.values());
  }

  getBotsInActiveGames(): RegisteredBot[] {
    return this.getRegisteredBots().filter((b) => b.inActiveGame);
  }

  getLastHealthCheckRound(): HealthCheckRound | undefined {
    return this.lastRound;
  }

  async runHealthCheckNow(): Promise<HealthCheckRound> {
    return this.performHealthCheckRound();
  }

  private startScheduler(): void {
    this.healthCheckInterval = setInterval(
      () => this.performHealthCheckRound(),
      this.healthCheckIntervalMs,
    );

    this.activeGameCheckInterval = setInterval(
      () => this.performActiveGameHealthCheck(),
      this.activeGameCheckIntervalMs,
    );
  }

  private stopScheduler(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    if (this.activeGameCheckInterval) {
      clearInterval(this.activeGameCheckInterval);
      this.activeGameCheckInterval = undefined;
    }
    this.logger.log("Health check scheduler stopped");
  }

  private async performHealthCheckRound(): Promise<HealthCheckRound> {
    const roundId = ++this.roundCounter;
    const bots = Array.from(this.registeredBots.values()).filter(
      (b) => !b.inActiveGame,
    );

    if (bots.length === 0) {
      const emptyRound: HealthCheckRound = {
        roundId,
        startedAt: new Date(),
        completedAt: new Date(),
        totalBots: 0,
        healthyCount: 0,
        unhealthyCount: 0,
        results: [],
      };
      this.lastRound = emptyRound;
      return emptyRound;
    }

    const round: HealthCheckRound = {
      roundId,
      startedAt: new Date(),
      totalBots: bots.length,
      healthyCount: 0,
      unhealthyCount: 0,
      results: [],
    };

    const checkPromises = bots.map((bot) => this.checkBot(bot));
    const results = await Promise.all(checkPromises);

    for (const result of results) {
      round.results.push(result);
      if (result.healthy) {
        round.healthyCount++;
      } else {
        round.unhealthyCount++;
      }

      if (result.stateChanged) {
        this.eventEmitter.emit("bot.healthStateChanged", result);
      }
    }

    round.completedAt = new Date();
    this.lastRound = round;

    if (round.unhealthyCount > 0) {
      this.logger.warn(
        `Health check round ${roundId}: ${round.unhealthyCount}/${round.totalBots} bots unhealthy`,
      );
    } else {
      this.logger.debug(
        `Health check round ${roundId}: all ${round.totalBots} bots healthy`,
      );
    }

    this.eventEmitter.emit("bot.healthCheckRoundCompleted", round);

    return round;
  }

  private async performActiveGameHealthCheck(): Promise<void> {
    const activeBots = this.getBotsInActiveGames();
    if (activeBots.length === 0) return;

    for (const bot of activeBots) {
      const result = await this.checkBot(bot);

      if (!result.healthy && result.stateChanged) {
        this.logger.warn(
          `Active game bot ${bot.id} became unhealthy (game: ${bot.gameId})`,
        );
        this.eventEmitter.emit("bot.activeGameBotUnhealthy", {
          ...result,
          gameId: bot.gameId,
        });
      }
    }
  }

  private async checkBot(bot: RegisteredBot): Promise<HealthCheckResult> {
    const previousStatus = this.botCaller.getHealthStatus(bot.id);
    const previousState = previousStatus?.healthy;

    const startTime = Date.now();
    const healthy = await this.botCaller.healthCheck(bot.id, bot.endpoint);
    const latencyMs = Date.now() - startTime;

    return {
      botId: bot.id,
      endpoint: bot.endpoint,
      healthy,
      latencyMs,
      timestamp: new Date(),
      previousState,
      stateChanged: previousState !== undefined && previousState !== healthy,
    };
  }
}
