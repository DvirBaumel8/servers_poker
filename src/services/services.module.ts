import { Module, Global, OnModuleInit } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { BotCallerService } from "./bot-caller.service";
import { BotValidatorService } from "./bot-validator.service";
import { BotHealthSchedulerService } from "./bot-health-scheduler.service";
import { BotResilienceService } from "./bot-resilience.service";
import { BotMetricsGateway } from "./bot-metrics.gateway";
import { LiveGameManagerService } from "./live-game-manager.service";
import { GameWorkerManagerService } from "./game-worker-manager.service";
import { GameStatePersistenceService } from "./game-state-persistence.service";
import { GameRecoveryService } from "./game-recovery.service";
import { ProvablyFairService } from "./provably-fair.service";
import { HandSeedPersistenceService } from "./hand-seed-persistence.service";
import { GameDataPersistenceService } from "./game-data-persistence.service";
import { GameOwnershipService } from "./game-ownership.service";
import { RedisGameStateService } from "./redis-game-state.service";
import { RedisEventBusService } from "./redis-event-bus.service";
import { RedisHealthService } from "./redis-health.service";
import { BotActivityService } from "./bot-activity.service";
import { BotAutoRegistrationService } from "./bot-auto-registration.service";
import { PlatformAnalyticsService } from "./platform-analytics.service";
import { DailySummaryService } from "./daily-summary.service";
import { EmailService } from "./email.service";
import { BotSubscription } from "../entities/bot-subscription.entity";
import { BotSubscriptionRepository } from "../repositories/bot-subscription.repository";
import { GameStateSnapshot } from "../entities/game-state-snapshot.entity";
import { HandSeed } from "../entities/hand-seed.entity";
import { Game } from "../entities/game.entity";
import { Hand } from "../entities/hand.entity";
import { HandPlayer } from "../entities/hand-player.entity";
import { Action } from "../entities/action.entity";
import { GamePlayer } from "../entities/game-player.entity";
import { BotStats } from "../entities/bot-stats.entity";
import { BotEvent } from "../entities/bot-event.entity";
import { ChipMovement } from "../entities/chip-movement.entity";
import { AuditLog } from "../entities/audit-log.entity";
import { Tournament } from "../entities/tournament.entity";
import { TournamentEntry } from "../entities/tournament-entry.entity";
import { TournamentSeat } from "../entities/tournament-seat.entity";
import { Table } from "../entities/table.entity";
import { PlatformMetrics } from "../entities/platform-metrics.entity";
import { AnalyticsEvent } from "../entities/analytics-event.entity";
import { DailySummary } from "../entities/daily-summary.entity";
import { User } from "../entities/user.entity";
import { GameStateRepository } from "../repositories/game-state.repository";
import { HandSeedRepository } from "../repositories/hand-seed.repository";
import { BotRepository } from "../repositories/bot.repository";
import { Bot } from "../entities/bot.entity";
import { SecurityModule } from "../common/security/security.module";
import { RedisModule } from "../common/redis";

@Global()
@Module({
  imports: [
    ConfigModule,
    EventEmitterModule,
    TypeOrmModule.forFeature([
      GameStateSnapshot,
      Bot,
      HandSeed,
      Game,
      Hand,
      HandPlayer,
      Action,
      GamePlayer,
      BotStats,
      BotEvent,
      ChipMovement,
      AuditLog,
      Tournament,
      TournamentEntry,
      TournamentSeat,
      Table,
      BotSubscription,
      PlatformMetrics,
      AnalyticsEvent,
      DailySummary,
      User,
    ]),
    SecurityModule,
    RedisModule,
  ],
  providers: [
    BotCallerService,
    BotValidatorService,
    BotHealthSchedulerService,
    BotResilienceService,
    BotMetricsGateway,
    LiveGameManagerService,
    GameWorkerManagerService,
    GameStatePersistenceService,
    GameRecoveryService,
    ProvablyFairService,
    HandSeedPersistenceService,
    GameDataPersistenceService,
    GameOwnershipService,
    RedisGameStateService,
    RedisEventBusService,
    RedisHealthService,
    BotActivityService,
    BotAutoRegistrationService,
    PlatformAnalyticsService,
    DailySummaryService,
    EmailService,
    BotSubscriptionRepository,
    GameStateRepository,
    HandSeedRepository,
    BotRepository,
  ],
  exports: [
    BotCallerService,
    BotValidatorService,
    BotHealthSchedulerService,
    BotResilienceService,
    LiveGameManagerService,
    GameWorkerManagerService,
    GameStatePersistenceService,
    GameRecoveryService,
    ProvablyFairService,
    HandSeedRepository,
    GameOwnershipService,
    RedisGameStateService,
    RedisEventBusService,
    RedisHealthService,
    BotActivityService,
    BotAutoRegistrationService,
    PlatformAnalyticsService,
    DailySummaryService,
    EmailService,
    BotSubscriptionRepository,
  ],
})
export class ServicesModule implements OnModuleInit {
  constructor(
    private readonly liveGameManager: LiveGameManagerService,
    private readonly redisGameStateService: RedisGameStateService,
    private readonly gameOwnershipService: GameOwnershipService,
    private readonly redisEventBusService: RedisEventBusService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const redisEnabled =
      this.configService.get<string>("REDIS_HOST") !== undefined;

    if (redisEnabled) {
      this.liveGameManager.setRedisServices(
        this.redisGameStateService,
        this.gameOwnershipService,
        this.redisEventBusService,
      );
    }
  }
}
