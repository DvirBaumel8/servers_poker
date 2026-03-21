import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GamesController } from "./games.controller";
import { GamesService } from "./games.service";
import { TablesService } from "./tables.service";
import { GamesGateway } from "./games.gateway";
import { TournamentsModule } from "../tournaments/tournaments.module";
import { Game } from "../../entities/game.entity";
import { GamePlayer } from "../../entities/game-player.entity";
import { Hand } from "../../entities/hand.entity";
import { HandPlayer } from "../../entities/hand-player.entity";
import { Action } from "../../entities/action.entity";
import { Table } from "../../entities/table.entity";
import { TableSeat } from "../../entities/table-seat.entity";
import { Bot } from "../../entities/bot.entity";
import { GameRepository } from "../../repositories/game.repository";
import { TableRepository } from "../../repositories/table.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { HandSeedRepository } from "../../repositories/hand-seed.repository";
import { HandSeed } from "../../entities/hand-seed.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Game,
      GamePlayer,
      Hand,
      HandPlayer,
      Action,
      Table,
      TableSeat,
      Bot,
      HandSeed,
    ]),
    forwardRef(() => TournamentsModule),
  ],
  controllers: [GamesController],
  providers: [
    GamesService,
    TablesService,
    GamesGateway,
    GameRepository,
    TableRepository,
    BotRepository,
    HandSeedRepository,
  ],
  exports: [
    GamesService,
    TablesService,
    GamesGateway,
    GameRepository,
    TableRepository,
  ],
})
export class GamesModule {}
