import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { TournamentsService } from "./tournaments.service";
import { TournamentDirectorService } from "./tournament-director.service";
import { CreateTournamentDto, RegisterBotDto } from "./dto/tournament.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { User } from "../../entities/user.entity";
import { Public } from "../../common/decorators/public.decorator";
import { TournamentStatus } from "../../entities/tournament.entity";

@Controller("tournaments")
export class TournamentsController {
  constructor(
    private readonly tournamentsService: TournamentsService,
    private readonly tournamentDirector: TournamentDirectorService,
  ) {}

  @Public()
  @Get()
  async findAll(@Query("status") status?: TournamentStatus) {
    return this.tournamentsService.findAll(status);
  }

  @Public()
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const tournament = await this.tournamentsService.findById(id);
    if (!tournament) {
      throw new NotFoundException(`Tournament ${id} not found`);
    }
    return tournament;
  }

  @Public()
  @Get(":id/results")
  async getResults(@Param("id") id: string) {
    return this.tournamentsService.getResults(id);
  }

  @Public()
  @Get(":id/leaderboard")
  async getLeaderboard(@Param("id") id: string) {
    return this.tournamentsService.getLeaderboard(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateTournamentDto, @CurrentUser() user: User) {
    if (user.role !== "admin") {
      throw new ForbiddenException("Admin access required");
    }
    return this.tournamentsService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/register")
  async register(
    @Param("id") id: string,
    @Body() dto: RegisterBotDto,
    @CurrentUser() user: User,
  ) {
    await this.tournamentsService.register(id, dto.bot_id, user.id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id/register/:botId")
  async unregister(
    @Param("id") id: string,
    @Param("botId") botId: string,
    @CurrentUser() _user: User,
  ) {
    await this.tournamentsService.unregister(id, botId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/start")
  async start(@Param("id") id: string, @CurrentUser() user: User) {
    if (user.role !== "admin") {
      throw new ForbiddenException("Admin access required");
    }
    await this.tournamentDirector.startTournament(id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/cancel")
  async cancel(@Param("id") id: string, @CurrentUser() user: User) {
    if (user.role !== "admin") {
      throw new ForbiddenException("Admin access required");
    }
    await this.tournamentsService.cancel(id);
    return { success: true };
  }

  @Public()
  @Get(":id/state")
  async getState(@Param("id") id: string) {
    const state = this.tournamentDirector.getTournamentState(id);
    if (!state) {
      const tournament = await this.tournamentsService.findById(id);
      if (!tournament) {
        throw new NotFoundException(`Tournament ${id} not found`);
      }
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

  @Public()
  @Get("active")
  async getActiveTournaments() {
    return {
      activeTournaments: this.tournamentDirector.getActiveTournaments(),
    };
  }
}
