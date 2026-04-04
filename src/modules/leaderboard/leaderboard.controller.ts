import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { LeaderboardService } from "./leaderboard.service";
import {
  LeaderboardQueryDto,
  PaginatedLeaderboardDto,
  BotPerformanceDto,
} from "./dto/leaderboard.dto";

@ApiTags("Leaderboard")
@Controller("leaderboard")
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: "Get bot leaderboard with filtering, sorting, and pagination",
  })
  @ApiResponse({ status: 200, type: PaginatedLeaderboardDto })
  async getLeaderboard(
    @Query() query: LeaderboardQueryDto,
  ): Promise<PaginatedLeaderboardDto> {
    return this.leaderboardService.getLeaderboard(query);
  }

  @Public()
  @Get(":botId")
  @ApiOperation({
    summary:
      "Get detailed performance metrics for a specific bot (hot streak, consistency)",
  })
  @ApiResponse({ status: 200, type: BotPerformanceDto })
  @ApiResponse({ status: 404, description: "Bot not found on leaderboard" })
  async getBotPerformance(
    @Param("botId", ParseUUIDPipe) botId: string,
  ): Promise<BotPerformanceDto> {
    return this.leaderboardService.getBotPerformance(botId);
  }
}
