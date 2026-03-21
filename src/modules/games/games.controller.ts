import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  NotFoundException,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { GamesService } from "./games.service";
import { TablesService } from "./tables.service";
import { ProvablyFairService } from "../../services/provably-fair.service";
import { HandSeedRepository } from "../../repositories/hand-seed.repository";
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
  VerifyHandDto,
  VerifyHandResponseDto,
} from "./dto/game.dto";

@Controller("games")
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly tablesService: TablesService,
    private readonly provablyFairService: ProvablyFairService,
    private readonly handSeedRepository: HandSeedRepository,
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

  @UseGuards(JwtAuthGuard)
  @Get("hands/:handId")
  async getHand(@Param("handId") handId: string, @CurrentUser() user: User) {
    const hasAccess = await this.gamesService.userHasAccessToHand(
      handId,
      user.id,
      user.role === "admin",
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        "You can only view hands where your bots participated",
      );
    }

    const hand = await this.gamesService.getHand(handId);
    if (!hand) {
      throw new NotFoundException(`Hand ${handId} not found`);
    }
    return hand;
  }

  @UseGuards(JwtAuthGuard)
  @Get("table/:tableId")
  async findByTableId(@Param("tableId") tableId: string) {
    return this.gamesService.findByTableId(tableId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("table/:tableId/history")
  async getTableHistory(
    @Param("tableId") tableId: string,
    @CurrentUser() user: User,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const games = await this.gamesService.findByTableId(tableId);
    if (games.length > 0) {
      const hasAccess = await this.gamesService.userHasAccessToGame(
        games[0].id,
        user.id,
        user.role === "admin",
      );
      if (!hasAccess) {
        throw new ForbiddenException(
          "You can only view history for tables where your bots participated",
        );
      }
    }

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

  @UseGuards(JwtAuthGuard)
  @Get("tables/:id")
  async getTable(@Param("id") id: string) {
    const table = await this.tablesService.findById(id);
    if (!table) {
      throw new NotFoundException(`Table ${id} not found`);
    }
    return table;
  }

  @UseGuards(JwtAuthGuard)
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

  @UseGuards(JwtAuthGuard)
  @Get(":id/hands")
  async getHandHistory(
    @Param("id") id: string,
    @CurrentUser() user: User,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const hasAccess = await this.gamesService.userHasAccessToGame(
      id,
      user.id,
      user.role === "admin",
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        "You can only view hand history for games where your bots participated",
      );
    }

    return this.gamesService.getHandHistory(
      id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  /**
   * Verify a hand's fairness using the provably fair algorithm.
   * Players can use this endpoint after a hand to verify the deck shuffle
   * was truly random and deterministic based on the committed seeds.
   */
  @Public()
  @Post("verify-hand")
  async verifyHand(@Body() dto: VerifyHandDto): Promise<VerifyHandResponseDto> {
    return this.provablyFairService.verifyHand(
      dto.serverSeed,
      dto.serverSeedHash,
      dto.clientSeed,
      dto.nonce,
      dto.deckOrder,
    );
  }

  /**
   * Get provably fair info about how verification works.
   * This is a public endpoint for transparency.
   */
  @Public()
  @Get("provably-fair/info")
  async getProvablyFairInfo() {
    return {
      algorithm: "HMAC-SHA256",
      description:
        "Before each hand, the server generates a random server seed and commits to it by sharing its SHA256 hash. " +
        "A client seed is also generated. After the hand, the server reveals the server seed so players can verify " +
        "that: (1) the hash matches the commitment, and (2) the deck order was deterministically derived from the seeds.",
      steps: [
        "1. Server generates serverSeed (random 32 bytes) and clientSeed (random 16 bytes)",
        "2. Server shares SHA256(serverSeed) as commitment BEFORE the hand starts",
        "3. combinedHash = HMAC-SHA256(serverSeed, clientSeed + ':' + handNumber)",
        "4. Deck is shuffled deterministically using combinedHash as seed",
        "5. After hand, server reveals serverSeed",
        "6. Players verify SHA256(serverSeed) matches commitment",
        "7. Players verify deck order using the verification endpoint",
      ],
      verificationEndpoint: "POST /api/v1/games/verify-hand",
      verificationPayload: {
        serverSeed: "revealed server seed after hand",
        serverSeedHash: "commitment shared before hand",
        clientSeed: "client seed used",
        nonce: "hand number",
        deckOrder: "array of 52 indices representing deck order",
      },
    };
  }

  /**
   * Get all hand seeds for a specific game.
   * These seeds can be used to verify each hand was fair.
   * Requires user to have a bot that participated in the game.
   */
  @UseGuards(JwtAuthGuard)
  @Get(":gameId/seeds")
  async getGameHandSeeds(
    @Param("gameId") gameId: string,
    @CurrentUser() user: User,
  ) {
    const hasAccess = await this.gamesService.userHasAccessToGame(
      gameId,
      user.id,
      user.role === "admin",
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        "You can only view seeds for games where your bots participated",
      );
    }

    const seeds = await this.handSeedRepository.findByGame(gameId);
    return seeds.map((seed) => ({
      handNumber: seed.hand_number,
      serverSeed: seed.server_seed,
      serverSeedHash: seed.server_seed_hash,
      clientSeed: seed.client_seed,
      combinedHash: seed.combined_hash,
      deckOrder: seed.deck_order,
      revealed: seed.revealed,
      revealedAt: seed.revealed_at,
      createdAt: seed.created_at,
    }));
  }

  /**
   * Get a specific hand's seed data for verification.
   * Requires user to have a bot that participated in the game.
   */
  @UseGuards(JwtAuthGuard)
  @Get(":gameId/seeds/:handNumber")
  async getHandSeed(
    @Param("gameId") gameId: string,
    @Param("handNumber") handNumber: string,
    @CurrentUser() user: User,
  ) {
    const hasAccess = await this.gamesService.userHasAccessToGame(
      gameId,
      user.id,
      user.role === "admin",
    );
    if (!hasAccess) {
      throw new ForbiddenException(
        "You can only view seeds for games where your bots participated",
      );
    }

    const seed = await this.handSeedRepository.findByGameAndHand(
      gameId,
      parseInt(handNumber, 10),
    );
    if (!seed) {
      throw new NotFoundException(
        `Hand seed not found for game ${gameId}, hand ${handNumber}`,
      );
    }
    return {
      handNumber: seed.hand_number,
      serverSeed: seed.server_seed,
      serverSeedHash: seed.server_seed_hash,
      clientSeed: seed.client_seed,
      combinedHash: seed.combined_hash,
      deckOrder: seed.deck_order,
      revealed: seed.revealed,
      revealedAt: seed.revealed_at,
      createdAt: seed.created_at,
      verificationUrl: `/api/v1/games/verify-hand`,
    };
  }
}
