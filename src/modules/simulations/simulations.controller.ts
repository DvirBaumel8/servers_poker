import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SimulationsService } from "./simulations.service";
import { CreateSimulationDto } from "./dto/create-simulation.dto";

@Controller("simulations")
export class SimulationsController {
  constructor(private readonly simulationsService: SimulationsService) {}

  /**
   * Create a new simulation and enqueue it.
   * Max 1 concurrent simulation per user.
   *
   * POST /api/v1/simulations
   * Body: { botId, handCount (1000–10000), opponentProfile }
   * Response: { simulationId, status: "PENDING" }
   */
  @Post()
  async create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateSimulationDto,
  ) {
    return this.simulationsService.create(user.id, dto);
  }

  /**
   * List all simulations for the current user (paginated).
   *
   * GET /api/v1/simulations?limit=20&offset=0
   */
  @Get()
  async findAll(
    @CurrentUser() user: { id: string },
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.simulationsService.findAll(
      user.id,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  /**
   * Get simulation status and progress percentage.
   * Suitable for polling while a simulation is RUNNING.
   *
   * GET /api/v1/simulations/:id
   * Response includes `progress` field (0–100) for UI progress bar.
   */
  @Get(":id")
  async findOne(
    @CurrentUser() user: { id: string },
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.simulationsService.findOne(id, user.id);
  }

  /**
   * Get aggregated analytics after the simulation completes.
   *
   * GET /api/v1/simulations/:id/result
   * Returns: bbPer100, winRate, vpip, pfr, aggressionFactor, heatmapData, equityRealization
   */
  @Get(":id/result")
  async getResult(
    @CurrentUser() user: { id: string },
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.simulationsService.getResult(id, user.id);
  }
}
