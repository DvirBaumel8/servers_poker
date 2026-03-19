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
import { GameStatePersistenceService } from "./game-state-persistence.service";
import { GameRecoveryService } from "./game-recovery.service";
import { GameStateSnapshot } from "../entities/game-state-snapshot.entity";
import { GameStateRepository } from "../repositories/game-state.repository";
import { BotRepository } from "../repositories/bot.repository";
import { Bot } from "../entities/bot.entity";

@Global()
@Module({
  imports: [
    ConfigModule,
    EventEmitterModule,
    TypeOrmModule.forFeature([GameStateSnapshot, Bot]),
  ],
  providers: [
    BotCallerService,
    BotValidatorService,
    BotHealthSchedulerService,
    BotResilienceService,
    BotMetricsGateway,
    LiveGameManagerService,
    GameStatePersistenceService,
    GameRecoveryService,
    GameStateRepository,
    BotRepository,
  ],
  exports: [
    BotCallerService,
    BotValidatorService,
    BotHealthSchedulerService,
    BotResilienceService,
    LiveGameManagerService,
    GameStatePersistenceService,
    GameRecoveryService,
  ],
})
export class ServicesModule {}
