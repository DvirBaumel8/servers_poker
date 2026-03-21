import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
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
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>(
          "JWT_SECRET",
          "change-me-in-production",
        ),
      }),
      inject: [ConfigService],
    }),
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
