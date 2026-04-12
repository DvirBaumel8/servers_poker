import {
  Injectable,
  Logger,
  ForbiddenException,
  ConflictException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { TableRepository } from "../../repositories/table.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { GameRepository } from "../../repositories/game.repository";
import { Table, TableStatus } from "../../entities/table.entity";
import { LiveGameManagerService } from "../../services/game/live-game-manager.service";
import { TournamentDirectorService } from "../tournaments/tournament-director.service";
import {
  CreateTableDto,
  JoinTableDto,
  TableResponseDto,
  JoinTableResponseDto,
} from "./dto/game.dto";
import {
  assertFound,
  mapPostgresError,
  PG_ERROR_CODES,
} from "../../common/utils";

@Injectable()
export class TablesService {
  private readonly logger = new Logger(TablesService.name);

  constructor(
    private readonly tableRepository: TableRepository,
    private readonly botRepository: BotRepository,
    private readonly gameRepository: GameRepository,
    private readonly liveGameManager: LiveGameManagerService,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => TournamentDirectorService))
    private readonly tournamentDirector: TournamentDirectorService,
  ) {}

  async create(dto: CreateTableDto): Promise<Table> {
    try {
      const table = await this.tableRepository.create({
        name: dto.name,
        small_blind: dto.small_blind ?? 10,
        big_blind: dto.big_blind ?? 20,
        starting_chips: dto.starting_chips ?? 1000,
        max_players: dto.max_players ?? 9,
        status: "waiting" as TableStatus,
      });

      this.logger.log(`Table ${table.id} created: ${table.name}`);
      return table;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create table: ${message}`);
      throw mapPostgresError(error, {
        [PG_ERROR_CODES.UNIQUE_VIOLATION]:
          "A table with this name already exists",
        [PG_ERROR_CODES.CHECK_VIOLATION]:
          "Invalid table configuration: check that blind values and starting chips are valid positive numbers",
        default:
          "Failed to create table. Please check your input and try again.",
      });
    }
  }

  async findById(id: string): Promise<Table | null> {
    return this.tableRepository.findById(id);
  }

  async findAll(): Promise<Table[]> {
    return this.tableRepository.findAll();
  }

  async findAllWithState(): Promise<TableResponseDto[]> {
    // Get database tables
    const dbTables = await this.tableRepository.findAll();
    const result: TableResponseDto[] = dbTables.map((t) =>
      this.toTableResponseDto(t),
    );

    // Also include tournament tables that may not be in the database
    const tournamentTables = this.getTournamentTables();
    for (const tt of tournamentTables) {
      // Only add if not already in result (by ID)
      if (!result.find((r) => r.id === tt.id)) {
        result.push(tt);
      }
    }

    return result;
  }

  /**
   * Get all active tournament tables with their current state.
   */
  private getTournamentTables(): TableResponseDto[] {
    const result: TableResponseDto[] = [];
    const activeTournaments = this.tournamentDirector.getActiveTournaments();

    for (const tournamentId of activeTournaments) {
      const tState = this.tournamentDirector.getTournamentState(tournamentId);
      if (!tState?.tables) continue;

      for (const table of tState.tables) {
        const gameState = table.gameState;
        if (!gameState) continue;

        result.push({
          id: table.tableId,
          name: `Tournament Table ${table.tableNumber}`,
          status: gameState.status === "finished" ? "finished" : "running",
          config: {
            small_blind: gameState.smallBlind || 25,
            big_blind: gameState.bigBlind || 50,
            starting_chips: 5000,
            max_players: 9,
          },
          players:
            gameState.players?.map((p: any) => ({
              name: p.name,
              chips: p.chips,
              disconnected: p.disconnected || false,
            })) || [],
          gameId: gameState.gameId,
          tournamentId,
          tableNumber: table.tableNumber,
        });
      }
    }

    return result;
  }

  async findByStatus(status: TableStatus): Promise<Table[]> {
    return this.tableRepository.findByStatus(status);
  }

  async updateStatus(id: string, status: TableStatus): Promise<Table | null> {
    return this.tableRepository.updateStatus(id, status);
  }

  async joinTable(
    tableId: string,
    dto: JoinTableDto,
    userId: string,
  ): Promise<JoinTableResponseDto> {
    const table = await this.tableRepository.findByIdOrThrow(tableId);

    if (table.status === "finished") {
      throw new ConflictException("This game has already finished");
    }

    const bot = await this.botRepository.findByIdOrThrow(dto.bot_id);

    if (bot.user_id !== userId) {
      throw new ForbiddenException("You do not own this bot");
    }

    if (!bot.active) {
      throw new ConflictException("Bot is deactivated");
    }

    return this.joinTableInProcess(tableId, table, bot, userId);
  }

  private async joinTableInProcess(
    tableId: string,
    table: Table,
    bot: { id: string; name: string; strategy: Record<string, any> | null },
    userId?: string,
  ): Promise<JoinTableResponseDto> {
    let liveGame = this.liveGameManager.getGame(tableId);

    if (liveGame) {
      const players = liveGame.game.players;
      if (players.length >= table.max_players) {
        throw new ConflictException(
          `Table is full (max ${table.max_players} players)`,
        );
      }
      if (players.some((p) => p.id === bot.id)) {
        throw new ConflictException("This bot is already seated at this table");
      }
      if (userId && players.length > 0) {
        const playerBots = await this.botRepository.findByIds(
          players.map((p) => p.id),
        );
        if (playerBots.some((b) => b.user_id === userId)) {
          throw new ConflictException(
            "You already have a bot at this table. Only one bot per player allowed.",
          );
        }
      }
    }

    const result = await this.dataSource.transaction(
      "SERIALIZABLE",
      async (manager) => {
        let currentLiveGame = this.liveGameManager.getGame(tableId);
        let gameDbId: string;

        if (!currentLiveGame) {
          const gameRow = await this.gameRepository.createGame(
            tableId,
            undefined,
            manager,
          );
          gameDbId = gameRow.id;
          this.liveGameManager.createGameSync({
            tableId,
            gameDbId,
            smallBlind: Number(table.small_blind),
            bigBlind: Number(table.big_blind),
            startingChips: Number(table.starting_chips),
          });
          currentLiveGame = this.liveGameManager.getGame(tableId)!;
        } else {
          gameDbId = currentLiveGame.gameDbId;
        }

        // Authoritative max-players check via DB (in-memory count may lag due to queued mutations)
        const playerCount = await manager.count("game_players", {
          where: { game_id: gameDbId },
        });
        if (playerCount >= table.max_players) {
          throw new ConflictException(
            `Table is full (max ${table.max_players} players)`,
          );
        }

        await this.gameRepository.addGamePlayer(
          gameDbId,
          bot.id,
          BigInt(table.starting_chips),
          manager,
        );

        return { liveGame: currentLiveGame, gameDbId };
      },
    );
    liveGame = result.liveGame;
    liveGame.game.addPlayer({
      id: bot.id,
      name: bot.name,
      strategy: bot.strategy as any,
    });

    this.liveGameManager.registerBotInGame(tableId, bot.id, bot.name);

    const playerCount = liveGame.game.players.length;
    await this.tableRepository.updateStatus(
      tableId,
      playerCount >= 2 ? "running" : "waiting",
    );

    return {
      message:
        playerCount >= 2
          ? `${bot.name} joined. Game is now running!`
          : `${bot.name} joined. Waiting for more players.`,
      tableId,
      botId: bot.id,
      playerCount,
    };
  }

  async getTableState(tableId: string): Promise<any> {
    const state = this.liveGameManager.getGameState(tableId);
    if (state) {
      return state;
    }

    const table = await this.tableRepository.findById(tableId);
    assertFound(table, "Table", tableId);

    return {
      status: table.status,
      players: [],
      stage: null,
    };
  }

  private toTableResponseDto(table: Table): TableResponseDto {
    const liveGame = this.liveGameManager.getGame(table.id);
    let state: any = this.liveGameManager.getGameState(table.id);
    const gameDbId: string | undefined = liveGame?.gameDbId;

    // If no state found, check if this table is part of an active tournament
    if (!state || !state.players?.length) {
      const tournamentState = this.getTournamentTableState(table.id);
      if (tournamentState) {
        state = tournamentState;
      }
    }

    return {
      id: table.id,
      name: table.name,
      status: state?.status || table.status,
      config: {
        small_blind: Number(table.small_blind),
        big_blind: Number(table.big_blind),
        starting_chips: Number(table.starting_chips),
        max_players: table.max_players,
      },
      players:
        state?.players?.map((p: any) => ({
          name: p.name,
          chips: p.chips,
          disconnected: p.disconnected,
        })) || [],
      gameId: gameDbId,
    };
  }

  /**
   * Try to get table state from any active tournament.
   * Tournament tables are managed separately from cash game tables.
   */
  private getTournamentTableState(tableId: string): any {
    const activeTournaments = this.tournamentDirector.getActiveTournaments();

    for (const tournamentId of activeTournaments) {
      const tState = this.tournamentDirector.getTournamentState(tournamentId);
      if (!tState?.tables) continue;

      const tableEntry = tState.tables.find((t: any) => t.tableId === tableId);

      if (tableEntry?.gameState) {
        return tableEntry.gameState;
      }
    }

    return null;
  }
}
