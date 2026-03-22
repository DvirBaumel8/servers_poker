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
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { TournamentsService } from "./tournaments.service";
import { TournamentDirectorService } from "./tournament-director.service";
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
  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly tournamentDirector: TournamentDirectorService,
  ) {}

  @Public()
  @Get()
  async findAll(@Query() query: TournamentQueryDto) {
    return this.tournamentsService.findAll(query.status as TournamentStatus);
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
  @Get(":id/results")
  async getResults(@Param("id", ParseUUIDPipe) id: string) {
    return this.tournamentsService.getResults(id);
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
    // Get current level for late registration check
    const state = this.tournamentDirector.getTournamentState(id);
    const currentLevel = state?.level;

    await this.tournamentsService.register(
      id,
      dto.bot_id,
      user.id,
      currentLevel,
    );
    return { success: true, lateRegistration: currentLevel !== undefined };
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
      return {
        tournamentId: id,
        name: tournament.name,
        status: tournament.status,
        playersRemaining: 0,
        totalEntrants: tournament.entries_count,
      };
    }
    return state;
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
}
