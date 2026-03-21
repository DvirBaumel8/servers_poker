import { Module } from "@nestjs/common";
import { PreviewController } from "./preview.controller";
import { GamesModule } from "../games/games.module";
import { TournamentsModule } from "../tournaments/tournaments.module";

@Module({
  imports: [GamesModule, TournamentsModule],
  controllers: [PreviewController],
})
export class PreviewModule {}
