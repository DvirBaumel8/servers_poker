import { Module } from "@nestjs/common";
import { TestingService } from "./testing.service";
import { TestingController } from "./testing.controller";
import { LiveGameStarterService } from "../../testing-utilities/live-game-starter";
import { GamesModule } from "../games/games.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [GamesModule, AuthModule],
  controllers: [TestingController],
  providers: [TestingService, LiveGameStarterService],
})
export class TestingModule {}
