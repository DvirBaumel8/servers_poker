import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  NotFoundException,
  UseGuards,
} from "@nestjs/common";
import { GamesService } from "./games.service";
import { TablesService } from "./tables.service";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { User } from "../../entities/user.entity";
import {
  CreateTableDto,
  JoinTableDto,
  TableResponseDto,
  JoinTableResponseDto,
  LeaderboardEntryDto,
} from "./dto/game.dto";

@Controller("games")
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly tablesService: TablesService,
  ) {}

  @Public()
  @Get()
  async listTables(): Promise<TableResponseDto[]> {
    return this.tablesService.findAllWithState();
  }

  @Public()
  @Get("health")
  async health() {
    return {
      status: "ok",
    };
  }

  @Public()
  @Get("leaderboard")
  async getLeaderboard(
    @Query("limit") limit?: string,
  ): Promise<LeaderboardEntryDto[]> {
    return this.gamesService.getLeaderboard(limit ? parseInt(limit, 10) : 20);
  }

  @Public()
  @Get("hands/:handId")
  async getHand(@Param("handId") handId: string) {
    const hand = await this.gamesService.getHand(handId);
    if (!hand) {
      throw new NotFoundException(`Hand ${handId} not found`);
    }
    return hand;
  }

  @Public()
  @Get("table/:tableId")
  async findByTableId(@Param("tableId") tableId: string) {
    return this.gamesService.findByTableId(tableId);
  }

  @Public()
  @Get("table/:tableId/history")
  async getTableHistory(
    @Param("tableId") tableId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.gamesService.getTableHistory(
      tableId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("tables")
  async createTable(@Body() dto: CreateTableDto, @CurrentUser() _user: User) {
    return this.tablesService.create(dto);
  }

  @Public()
  @Get("tables/:id")
  async getTable(@Param("id") id: string) {
    const table = await this.tablesService.findById(id);
    if (!table) {
      throw new NotFoundException(`Table ${id} not found`);
    }
    return table;
  }

  @Public()
  @Get(":id")
  async findOne(@Param("id") id: string) {
    const game = await this.gamesService.findById(id);
    if (!game) {
      throw new NotFoundException(`Game ${id} not found`);
    }
    return game;
  }

  @Public()
  @Get(":id/state")
  async getGameState(@Param("id") tableId: string) {
    return this.tablesService.getTableState(tableId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/join")
  async joinTable(
    @Param("id") tableId: string,
    @Body() dto: JoinTableDto,
    @CurrentUser() user: User,
  ): Promise<JoinTableResponseDto> {
    return this.tablesService.joinTable(tableId, dto, user.id);
  }

  @Public()
  @Get(":id/hands")
  async getHandHistory(
    @Param("id") id: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.gamesService.getHandHistory(
      id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
