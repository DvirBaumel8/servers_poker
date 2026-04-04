import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Bot } from "../../entities/bot.entity";
import { BotStats } from "../../entities/bot-stats.entity";
import { TournamentEntry } from "../../entities/tournament-entry.entity";
import { Tournament } from "../../entities/tournament.entity";
import { Hand } from "../../entities/hand.entity";
import { HandPlayer } from "../../entities/hand-player.entity";
import { LeaderboardController } from "./leaderboard.controller";
import { LeaderboardService } from "./leaderboard.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Bot,
      BotStats,
      TournamentEntry,
      Tournament,
      Hand,
      HandPlayer,
    ]),
  ],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
