import { Controller, Post, Body } from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import {
  TestingService,
  RunSimulationDto,
  SimulationSummary,
} from "./testing.service";

@Controller("testing")
export class TestingController {
  constructor(private readonly testingService: TestingService) {}

  @Post("run-simulation")
  @Public()
  async runSimulation(
    @Body() dto: RunSimulationDto,
  ): Promise<SimulationSummary> {
    return this.testingService.runSimulation(dto);
  }

  @Post("live-game")
  @Public()
  async startLiveGame() {
    try {
      return await this.testingService.startLiveGame();
    } catch (e) {
      return {
        error: `Failed to start game: ${(e as Error).message}`,
      };
    }
  }
}
