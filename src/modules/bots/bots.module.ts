import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { BotsController } from "./bots.controller";
import { BotsConnectivityController } from "./bots-connectivity.controller";
import { BotsService } from "./bots.service";
import { Bot } from "../../entities/bot.entity";
import { BotStats } from "../../entities/bot-stats.entity";
import { BotEvent } from "../../entities/bot-event.entity";
import { TournamentEntry } from "../../entities/tournament-entry.entity";
import { BotRepository } from "../../repositories/bot.repository";
import { AnalyticsRepository } from "../../repositories/analytics.repository";
import { UrlValidatorService } from "../../common/validators/url-validator.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Bot, BotStats, BotEvent, TournamentEntry]),
    ConfigModule,
  ],
  controllers: [BotsController, BotsConnectivityController],
  providers: [
    BotsService,
    BotRepository,
    AnalyticsRepository,
    UrlValidatorService,
  ],
  exports: [BotsService, BotRepository],
})
export class BotsModule {}
