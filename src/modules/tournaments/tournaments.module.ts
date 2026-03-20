import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TournamentsController } from "./tournaments.controller";
import { TournamentsService } from "./tournaments.service";
import { TournamentDirectorService } from "./tournament-director.service";
import { Tournament } from "../../entities/tournament.entity";
import { TournamentEntry } from "../../entities/tournament-entry.entity";
import { TournamentTable } from "../../entities/tournament-table.entity";
import { TournamentSeat } from "../../entities/tournament-seat.entity";
import { TournamentBlindLevel } from "../../entities/tournament-blind-level.entity";
import { Bot } from "../../entities/bot.entity";
import { BotStats } from "../../entities/bot-stats.entity";
import { BotEvent } from "../../entities/bot-event.entity";
import { TournamentRepository } from "../../repositories/tournament.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { AnalyticsRepository } from "../../repositories/analytics.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tournament,
      TournamentEntry,
      TournamentTable,
      TournamentSeat,
      TournamentBlindLevel,
      Bot,
      BotStats,
      BotEvent,
    ]),
  ],
  controllers: [TournamentsController],
  providers: [
    TournamentsService,
    TournamentDirectorService,
    TournamentRepository,
    BotRepository,
    AnalyticsRepository,
  ],
  exports: [
    TournamentsService,
    TournamentDirectorService,
    TournamentRepository,
  ],
})
export class TournamentsModule {}
