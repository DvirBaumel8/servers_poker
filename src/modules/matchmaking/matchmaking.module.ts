import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Tournament } from "../../entities/tournament.entity";
import { TournamentEntry } from "../../entities/tournament-entry.entity";
import { TournamentTable } from "../../entities/tournament-table.entity";
import { TournamentSeat } from "../../entities/tournament-seat.entity";
import { TournamentBlindLevel } from "../../entities/tournament-blind-level.entity";
import { TournamentPod } from "../../entities/tournament-pod.entity";
import { Bot } from "../../entities/bot.entity";
import { User } from "../../entities/user.entity";
import { TournamentPodRepository } from "../../repositories/tournament-pod.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { UserRepository } from "../../repositories/user.repository";
import { TournamentRepository } from "../../repositories/tournament.repository";
import { FinanceModule } from "../finance/finance.module";
import { TournamentsModule } from "../tournaments/tournaments.module";
import { MatchmakingService } from "./matchmaking.service";
import { PrizeDistributionService } from "./prize-distribution.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tournament,
      TournamentEntry,
      TournamentTable,
      TournamentSeat,
      TournamentBlindLevel,
      TournamentPod,
      Bot,
      User,
    ]),
    forwardRef(() => TournamentsModule),
    FinanceModule,
  ],
  providers: [
    MatchmakingService,
    PrizeDistributionService,
    TournamentPodRepository,
    BotRepository,
    UserRepository,
    TournamentRepository,
  ],
  exports: [MatchmakingService, PrizeDistributionService],
})
export class MatchmakingModule {}
