import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { BotsController } from "./bots.controller";
import { BotsConnectivityController } from "./bots-connectivity.controller";
import { SubscriptionsController } from "./subscriptions.controller";
import { BotsService } from "./bots.service";
import { BotOwnershipService } from "./bot-ownership.service";
import { Bot } from "../../entities/bot.entity";
import { BotStats } from "../../entities/bot-stats.entity";
import { BotEvent } from "../../entities/bot-event.entity";
import { BotSubscription } from "../../entities/bot-subscription.entity";
import { TournamentEntry } from "../../entities/tournament-entry.entity";
import { Tournament } from "../../entities/tournament.entity";
import { TournamentTable } from "../../entities/tournament-table.entity";
import { TournamentSeat } from "../../entities/tournament-seat.entity";
import { TournamentBlindLevel } from "../../entities/tournament-blind-level.entity";
import { BotRepository } from "../../repositories/bot.repository";
import { BotSubscriptionRepository } from "../../repositories/bot-subscription.repository";
import { TournamentRepository } from "../../repositories/tournament.repository";
import { AnalyticsRepository } from "../../repositories/analytics.repository";
import { UrlValidatorService } from "../../common/validators/url-validator.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Bot,
      BotStats,
      BotEvent,
      BotSubscription,
      TournamentEntry,
      Tournament,
      TournamentTable,
      TournamentSeat,
      TournamentBlindLevel,
    ]),
    ConfigModule,
  ],
  controllers: [
    BotsController,
    BotsConnectivityController,
    SubscriptionsController,
  ],
  providers: [
    BotsService,
    BotOwnershipService,
    BotRepository,
    BotSubscriptionRepository,
    TournamentRepository,
    AnalyticsRepository,
    UrlValidatorService,
  ],
  exports: [
    BotsService,
    BotOwnershipService,
    BotRepository,
    BotSubscriptionRepository,
  ],
})
export class BotsModule {}
