import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ParseUUIDPipe,
  Logger,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { TournamentsService } from "./tournaments.service";
import { TournamentDirectorService } from "./tournament-director.service";
import { SimulationService } from "./simulation.service";
import { PrizePoolService } from "../../services/prize-pool.service";
import {
  CreateTournamentDto,
  RegisterBotDto,
  UpdateTournamentScheduleDto,
  UpdateSchedulerConfigDto,
  TournamentQueryDto,
} from "./dto/tournament.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { User } from "../../entities/user.entity";
import { TournamentStatus } from "../../entities/tournament.entity";
import { assertFound } from "../../common/utils";

@Controller("tournaments")
export class TournamentsController {
  private readonly logger = new Logger(TournamentsController.name);

  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly tournamentDirector: TournamentDirectorService,
    private readonly simulationService: SimulationService,
    private readonly prizePoolService: PrizePoolService,
  ) {}

  @Public()
  @Get()
  async findAll(@Query() query: TournamentQueryDto) {
    return this.tournamentsService.findAll(
      query.status as TournamentStatus,
      query.limit,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get("active")
  async getActiveTournaments() {
    return {
      activeTournaments: this.tournamentDirector.getActiveTournaments(),
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/scheduler")
  async getSchedulerStatus() {
    return this.tournamentDirector.getSchedulerStatus();
  }

  @Public()
  @Get("scheduled/upcoming")
  async getUpcomingScheduled() {
    return this.tournamentsService.getUpcomingScheduled();
  }

  @Roles("admin")
  @Get("simulation/pool-metrics")
  getPoolMetrics() {
    return this.simulationService.getPoolMetrics();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/prize-preview")
  getPrizePreview(
    @Query("pool") pool: string,
    @Query("players") players: string,
  ) {
    const p = parseInt(pool, 10);
    const n = parseInt(players, 10);
    if (!Number.isFinite(p) || p < 1 || !Number.isFinite(n) || n < 1) {
      throw new BadRequestException(
        "pool and players must be positive integers",
      );
    }
    return { payouts: this.prizePoolService.calculatePayouts(p, n) };
  }

  @UseGuards(JwtAuthGuard)
  @Get("my-activity")
  async getMyActivity(@CurrentUser() user: User) {
    return this.tournamentsService.getMyActivity(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/inject-bots/:id")
  async injectBots(
    @Param("id", ParseUUIDPipe) id: string,
    @Body()
    body: {
      profile?: "random" | "sharks" | "fish" | "balanced";
      count?: number;
    },
  ) {
    return this.tournamentsService.injectSystemBots(
      id,
      body.profile ?? "random",
      body.count,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/users-summary")
  async getUsersSummary() {
    return this.tournamentsService.getUsersWithBotCounts();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/reset-state")
  async resetState() {
    return this.tournamentsService.resetDevState();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/history")
  async getAdminHistory(@Query("limit") limit?: string) {
    return this.tournamentsService.getAdminHistory(
      Math.min(20, parseInt(limit ?? "20") || 20),
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/:id/entries")
  async getAdminEntries(@Param("id", ParseUUIDPipe) id: string) {
    return this.tournamentsService.getAdminEntries(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Delete("admin/:id/entries/:entryId")
  async removeAdminEntry(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("entryId", ParseUUIDPipe) entryId: string,
  ) {
    await this.tournamentsService.removeEntry(id, entryId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/:id/balancing-moves")
  async getBalancingMoves(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit
      ? Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
      : 20;
    return this.tournamentsService.getBalancingMoves(id, parsedLimit);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/:id/status")
  async getAdminTournamentStatus(@Param("id", ParseUUIDPipe) id: string) {
    // Try live in-memory progress first (most accurate)
    const progress = this.tournamentDirector.getTournamentProgress(id);
    if (progress) {
      return { tournamentId: id, ...progress };
    }

    // Fallback to DB summary when director not available (e.g. after restart)
    const summary = await this.tournamentsService.getLiveSummary(id);
    const tournament = await this.tournamentsService.findById(id);
    const totalEntrants = tournament?.entries_count ?? 0;
    const eliminated = Math.max(0, totalEntrants - summary.playersRemaining);
    return {
      tournamentId: id,
      handsProcessed: eliminated,
      totalHands: totalEntrants,
      hps: 0,
      topStacks: [],
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get(":id/seeding-map")
  async getSeedingMap(@Param("id", ParseUUIDPipe) id: string) {
    return this.tournamentsService.getSeedingMap(id);
  }

  @Public()
  @Get(":id")
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    const tournament = await this.tournamentsService.findById(id);
    assertFound(tournament, "Tournament", id);

    const state = this.tournamentDirector.getTournamentState(id);
    if (!state) {
      return tournament;
    }

    return {
      ...tournament,
      current_level: state.level,
      small_blind: state.blinds.small,
      big_blind: state.blinds.big,
    };
  }

  @Public()
  @Public()
  @Get(":id/results")
  async getResults(@Param("id", ParseUUIDPipe) id: string) {
    return this.tournamentsService.getCompleteResults(id);
  }

  @Public()
  @Get(":id/leaderboard")
  async getLeaderboard(@Param("id", ParseUUIDPipe) id: string) {
    return this.tournamentsService.getLeaderboard(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post()
  async create(@Body() dto: CreateTournamentDto) {
    return this.tournamentsService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/register")
  @Throttle({ default: { ttl: 60000, limit: 20 } }) // 20 registrations per minute
  async register(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RegisterBotDto,
    @CurrentUser() user: User,
  ) {
    await this.tournamentsService.register(id, dto.bot_id, user.id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id/register/:botId")
  async unregister(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("botId", ParseUUIDPipe) botId: string,
    @CurrentUser() _user: User,
  ) {
    await this.tournamentsService.unregister(id, botId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/leave")
  async leave(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.tournamentsService.leaveAsUser(id, user.id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post(":id/start")
  async start(@Param("id", ParseUUIDPipe) id: string) {
    try {
      await this.tournamentDirector.startTournament(id);
      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start tournament";
      if (message.includes("not found") || message.includes("Not found")) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post(":id/cancel")
  async cancel(@Param("id", ParseUUIDPipe) id: string) {
    await this.tournamentsService.cancel(id);
    return { success: true };
  }

  @Public()
  @Get(":id/state")
  async getState(@Param("id", ParseUUIDPipe) id: string) {
    const state = this.tournamentDirector.getTournamentState(id);
    if (!state) {
      const tournament = await this.tournamentsService.findById(id);
      assertFound(tournament, "Tournament", id);

      // Enrich with DB-derived data so the admin dashboard shows real numbers
      // even when the in-memory director is gone (e.g. after server restart).
      const live = await this.tournamentsService.getLiveSummary(id);
      return {
        tournamentId: id,
        name: tournament.name,
        status: tournament.status,
        totalEntrants: tournament.entries_count,
        playersRemaining: live.playersRemaining,
        level: live.currentBlindLevel,
        blinds:
          live.smallBlind != null
            ? {
                small: live.smallBlind,
                big: live.bigBlind,
                ante: live.ante ?? 0,
              }
            : undefined,
        tables: live.tableIds.map((tableId, i) => ({
          tableId,
          tableNumber: i + 1,
          isFinalTable: live.tableCount === 1,
        })),
        handsThisLevel: null,
        handsPerLevel: null,
        handForHand: false,
        prizePool: null,
        _stale: true, // flag so frontend can show a warning
      };
    }
    return state;
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/hands-manifest")
  async getHandsManifest(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const hands = await this.tournamentsService.getHandsManifest(id, user.id);
    return { hands };
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/my-current-table")
  async getMyCurrentTable(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const tableInfo = await this.tournamentsService.findUserCurrentTable(
      id,
      user.id,
    );
    if (!tableInfo) {
      throw new NotFoundException(
        "You are not currently playing in this tournament or have been eliminated",
      );
    }
    return tableInfo;
  }

  /**
   * Update tournament schedule (admin only).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch(":id/schedule")
  async updateSchedule(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTournamentScheduleDto,
  ) {
    const tournament = await this.tournamentsService.findById(id);
    assertFound(tournament, "Tournament", id);

    if (tournament.status !== "registering") {
      throw new BadRequestException(
        "Can only update schedule for tournaments in registering status",
      );
    }

    await this.tournamentsService.updateSchedule(
      id,
      dto.scheduled_start_at ? new Date(dto.scheduled_start_at) : null,
    );

    return { success: true, scheduled_start_at: dto.scheduled_start_at };
  }

  /**
   * Update scheduler configuration (admin only).
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch("admin/scheduler")
  async updateSchedulerConfig(@Body() dto: UpdateSchedulerConfigDto) {
    if (dto.cron_expression) {
      try {
        this.tournamentDirector.updateSchedulerCron(dto.cron_expression);
      } catch (error) {
        this.logger.error(
          `Invalid cron expression: ${dto.cron_expression}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw new BadRequestException(
          `Invalid cron expression: ${dto.cron_expression}`,
        );
      }
    }

    return {
      success: true,
      ...this.tournamentDirector.getSchedulerStatus(),
    };
  }

  /**
   * Start a headless simulation of a tournament (admin only).
   * Spawns a Worker Thread and returns a jobId immediately.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post(":id/simulate")
  async startSimulation(@Param("id", ParseUUIDPipe) id: string) {
    return this.simulationService.startSimulation(id);
  }

  /**
   * Poll the status of a running simulation job.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get(":id/simulate/:jobId")
  async getSimulationStatus(
    @Param("id", ParseUUIDPipe) _id: string,
    @Param("jobId", ParseUUIDPipe) jobId: string,
  ) {
    const job = this.simulationService.getStatus(jobId);
    if (!job) {
      throw new NotFoundException(`Simulation job ${jobId} not found`);
    }
    return {
      jobId: job.jobId,
      tournamentId: job.tournamentId,
      status: job.status,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      summary: job.result
        ? {
            totalHands: job.result.totalHands,
            durationMs: job.result.durationMs,
            winnerId: job.result.winnerId,
            winnerName: job.result.winnerName,
            eliminations: job.result.bustOrder.length,
          }
        : undefined,
    };
  }

  /**
   * Retrieve the full in-memory audit trail produced by a completed simulation.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get(":id/simulation-result")
  async getSimulationResult(@Param("id", ParseUUIDPipe) id: string) {
    const result = this.simulationService.getResult(id);
    if (!result) {
      throw new NotFoundException(
        `No completed simulation found for tournament ${id}`,
      );
    }
    return result;
  }
}
