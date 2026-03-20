import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
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
import { GameStateSnapshot } from "../entities/game-state-snapshot.entity";
import { HandSeed } from "../entities/hand-seed.entity";
import { Game } from "../entities/game.entity";
import { Hand } from "../entities/hand.entity";
import { HandPlayer } from "../entities/hand-player.entity";
import { Action } from "../entities/action.entity";
import { GamePlayer } from "../entities/game-player.entity";
import { GameStateRepository } from "../repositories/game-state.repository";
import { HandSeedRepository } from "../repositories/hand-seed.repository";
import { BotRepository } from "../repositories/bot.repository";
import { Bot } from "../entities/bot.entity";
import { SecurityModule } from "../common/security/security.module";

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
    ]),
    SecurityModule,
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
  ],
})
export class ServicesModule {}
