import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { BotCallerService } from "./bot-caller.service";
import { BotValidatorService } from "./bot-validator.service";
import { BotHealthSchedulerService } from "./bot-health-scheduler.service";
import { BotResilienceService } from "./bot-resilience.service";
import { BotMetricsGateway } from "./bot-metrics.gateway";
import { LiveGameManagerService } from "./live-game-manager.service";

@Global()
@Module({
  imports: [ConfigModule, EventEmitterModule],
  providers: [
    BotCallerService,
    BotValidatorService,
    BotHealthSchedulerService,
    BotResilienceService,
    BotMetricsGateway,
    LiveGameManagerService,
  ],
  exports: [
    BotCallerService,
    BotValidatorService,
    BotHealthSchedulerService,
    BotResilienceService,
    LiveGameManagerService,
  ],
})
export class ServicesModule {}
