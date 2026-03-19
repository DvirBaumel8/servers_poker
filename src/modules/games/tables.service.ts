import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { TableRepository } from "../../repositories/table.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { GameRepository } from "../../repositories/game.repository";
import { Table, TableStatus } from "../../entities/table.entity";
import { LiveGameManagerService } from "../../services/live-game-manager.service";
import {
  CreateTableDto,
  JoinTableDto,
  TableResponseDto,
  JoinTableResponseDto,
} from "./dto/game.dto";

@Injectable()
export class TablesService {
  private readonly logger = new Logger(TablesService.name);

  constructor(
    private readonly tableRepository: TableRepository,
    private readonly botRepository: BotRepository,
    private readonly gameRepository: GameRepository,
    private readonly liveGameManager: LiveGameManagerService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateTableDto): Promise<Table> {
    const table = await this.tableRepository.create({
      name: dto.name,
      small_blind: dto.small_blind ?? 10,
      big_blind: dto.big_blind ?? 20,
      starting_chips: dto.starting_chips ?? 1000,
      max_players: dto.max_players ?? 9,
      turn_timeout_ms: dto.turn_timeout_ms ?? 10000,
      status: "waiting" as TableStatus,
    });

    this.logger.log(`Table ${table.id} created: ${table.name}`);
    return table;
  }

  async findById(id: string): Promise<Table | null> {
    return this.tableRepository.findById(id);
  }

  async findAll(): Promise<Table[]> {
    return this.tableRepository.findAll();
  }

  async findAllWithState(): Promise<TableResponseDto[]> {
    const tables = await this.tableRepository.findAll();
    return tables.map((t) => this.toTableResponseDto(t));
  }

  async findByStatus(status: TableStatus): Promise<Table[]> {
    return this.tableRepository.findByStatus(status);
  }

  async updateStatus(id: string, status: TableStatus): Promise<Table | null> {
    return this.tableRepository.updateStatus(id, status);
  }

  async getSeatCount(tableId: string): Promise<number> {
    return this.tableRepository.getSeatCount(tableId);
  }

  async joinTable(
    tableId: string,
    dto: JoinTableDto,
    userId: string,
  ): Promise<JoinTableResponseDto> {
    if (!dto.bot_id) {
      throw new BadRequestException("Required: { bot_id }");
    }

    const table = await this.tableRepository.findById(tableId);
    if (!table) {
      throw new NotFoundException("Table not found");
    }

    if (table.status === "finished") {
      throw new ConflictException("This game has already finished");
    }

    const bot = await this.botRepository.findById(dto.bot_id);
    if (!bot) {
      throw new NotFoundException("Bot not found");
    }

    if (bot.user_id !== userId) {
      throw new ForbiddenException("You do not own this bot");
    }

    if (!bot.active) {
      throw new ConflictException("Bot is deactivated");
    }

    const result = await this.dataSource.transaction(
      "SERIALIZABLE",
      async (manager) => {
        const joinResult = await this.tableRepository.atomicJoinTable(
          tableId,
          bot.id,
          table.max_players,
          manager,
        );

        if (!joinResult.ok) {
          throw new ConflictException(joinResult.error);
        }

        let liveGame = this.liveGameManager.getGame(tableId);
        let gameDbId: string;

        if (!liveGame) {
          const gameRow = await this.gameRepository.createGame(
            tableId,
            undefined,
            manager,
          );
          gameDbId = gameRow.id;
          this.liveGameManager.createGame({
            tableId,
            gameDbId,
            smallBlind: Number(table.small_blind),
            bigBlind: Number(table.big_blind),
            startingChips: Number(table.starting_chips),
            turnTimeoutMs: table.turn_timeout_ms,
          });
          liveGame = this.liveGameManager.getGame(tableId)!;
        } else {
          gameDbId = liveGame.gameDbId;
        }

        await this.gameRepository.addGamePlayer(
          gameDbId,
          bot.id,
          Number(table.starting_chips),
          manager,
        );

        return { liveGame, gameDbId };
      },
    );

    const liveGame = result.liveGame;
    liveGame.game.addPlayer({
      id: bot.id,
      name: bot.name,
      endpoint: bot.endpoint,
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
    if (!table) {
      throw new NotFoundException("Table not found");
    }

    return {
      status: table.status,
      players: [],
      stage: null,
    };
  }

  private toTableResponseDto(table: Table): TableResponseDto {
    const liveGame = this.liveGameManager.getGame(table.id);
    const state = this.liveGameManager.getGameState(table.id);

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
        state?.players?.map((p) => ({
          name: p.name,
          chips: p.chips,
          disconnected: p.disconnected,
        })) || [],
      gameId: liveGame?.gameDbId,
    };
  }
}
