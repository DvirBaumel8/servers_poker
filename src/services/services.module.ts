import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { LiveGameManagerService } from "./game/live-game-manager.service";
import { GameStatePersistenceService } from "./game/game-state-persistence.service";
import { GameRecoveryService } from "./game/game-recovery.service";
import { GameHotStateService } from "./game/game-hot-state.service";
import { GameMonitorService } from "./game/game-monitor.service";
import { ProvablyFairService } from "./provably-fair.service";
import { HandSeedPersistenceService } from "./hand-seed-persistence.service";
import { GameDataPersistenceService } from "./game/game-data-persistence.service";
import { HandStatsProcessorService } from "./game/hand-stats-processor.service";
import { RedisHealthService } from "./redis/redis-health.service";
import { BotActivityService } from "./bot/bot-activity.service";
import { BotAutoRegistrationService } from "./bot/bot-auto-registration.service";
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
import { Tournament } from "../entities/tournament.entity";
import { TournamentEntry } from "../entities/tournament-entry.entity";
import { TournamentSeat } from "../entities/tournament-seat.entity";
import { Table } from "../entities/table.entity";
import { AnalyticsEvent } from "../entities/analytics-event.entity";
import { User } from "../entities/user.entity";
import { GameStateRepository } from "../repositories/game-state.repository";
import { HandSeedRepository } from "../repositories/hand-seed.repository";
import { BotRepository } from "../repositories/bot.repository";
import { Bot } from "../entities/bot.entity";
import { SecurityModule } from "../common/security/security.module";
import { RedisModule } from "../common/redis";
import { JwtConfigModule } from "../common/jwt";

@Global()
@Module({
  imports: [
    ConfigModule,
    EventEmitterModule,
    JwtConfigModule,
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
      Tournament,
      TournamentEntry,
      TournamentSeat,
      Table,
      BotSubscription,
      AnalyticsEvent,
      User,
    ]),
    SecurityModule,
    RedisModule,
  ],
  providers: [
    LiveGameManagerService,
    GameStatePersistenceService,
    GameRecoveryService,
    GameHotStateService,
    GameMonitorService,
    ProvablyFairService,
    HandSeedPersistenceService,
    GameDataPersistenceService,
    HandStatsProcessorService,
    RedisHealthService,
    BotActivityService,
    BotAutoRegistrationService,
    EmailService,
    BotSubscriptionRepository,
    GameStateRepository,
    HandSeedRepository,
    BotRepository,
  ],
  exports: [
    LiveGameManagerService,
    GameStatePersistenceService,
    GameRecoveryService,
    GameHotStateService,
    GameMonitorService,
    ProvablyFairService,
    HandSeedRepository,
    RedisHealthService,
    BotActivityService,
    BotAutoRegistrationService,
    EmailService,
    BotSubscriptionRepository,
  ],
})
export class ServicesModule {}
