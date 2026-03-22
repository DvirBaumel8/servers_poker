/**
 * TournamentDirectorService
 * =========================
 * NestJS service that manages a running tournament: table assignments,
 * blind levels, table balancing, table breaking, final table consolidation,
 * and payouts.
 *
 * Migrated from the old tournament.ts to integrate with NestJS DI and events.
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
  Inject,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DataSource } from "typeorm";
import { TournamentRepository } from "../../repositories/tournament.repository";
import { BotRepository } from "../../repositories/bot.repository";
import {
  LiveGameManagerService,
  GameInstance,
} from "../../services/game/live-game-manager.service";
import { BotCallerService } from "../../services/bot/bot-caller.service";
import { GameOwnershipService } from "../../services/game/game-ownership.service";
import { RedisGameStateService } from "../../services/redis/redis-game-state.service";
import { RedisEventBusService } from "../../services/redis/redis-event-bus.service";
import {
  HANDS_PER_LEVEL,
  getBlindLevel,
  calculatePayouts,
} from "../../config/tournaments.config";
import { Game } from "../../entities/game.entity";
import { GamePlayer } from "../../entities/game-player.entity";
import * as crypto from "crypto";

const SEATS_PER_TABLE = 9;
const BREAK_THRESHOLD = 4;

interface BotInfo {
  botId: string;
  name: string;
  endpoint: string;
  chips: number;
  tableDbId: string | null;
}

interface TableEntry {
  game: GameInstance;
  tableDbId: string;
  gameDbId: string;
  tableNumber: number;
  botIdMap: Record<string, string>;
}

export interface TournamentState {
  tournamentId: string;
  name: string;
  status: string;
  level: number;
  handsThisLevel: number;
  handsPerLevel: number;
  blinds: {
    small: number;
    big: number;
    ante: number;
  };
  playersRemaining: number;
  totalEntrants: number;
  tables: Array<{
    tableId: string;
    tableNumber: number;
    isFinalTable: boolean;
    gameState: any;
  }>;
  buyIn: number;
  prizePool: number;
}

@Injectable()
export class TournamentDirectorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TournamentDirectorService.name);
  private readonly activeDirectors = new Map<string, ActiveTournament>();
  private schedulerJob: CronJob | null = null;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly tournamentRepository: TournamentRepository,
    private readonly botRepository: BotRepository,
    private readonly liveGameManager: LiveGameManagerService,
    private readonly botCaller: BotCallerService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Optional()
    @Inject(GameOwnershipService)
    private readonly gameOwnershipService: GameOwnershipService | null,
    @Optional()
    @Inject(RedisGameStateService)
    private readonly redisGameStateService: RedisGameStateService | null,
    @Optional()
    @Inject(RedisEventBusService)
    private readonly redisEventBusService: RedisEventBusService | null,
  ) {}

  private isRedisEnabled(): boolean {
    return (
      this.gameOwnershipService !== null &&
      this.redisGameStateService !== null &&
      this.redisEventBusService !== null
    );
  }

  onModuleInit(): void {
    const enabled = this.configService.get<boolean>(
      "tournamentScheduler.enabled",
      true,
    );
    if (!enabled) {
      this.logger.log("Tournament scheduler is disabled");
      return;
    }

    const cronExpression = this.configService.get<string>(
      "tournamentScheduler.cronExpression",
      "*/30 * * * * *",
    );

    this.schedulerJob = new CronJob(cronExpression, () => {
      this.checkScheduledTournaments();
    });

    this.schedulerRegistry.addCronJob(
      "tournament-scheduler",
      this.schedulerJob,
    );
    this.schedulerJob.start();

    this.logger.log(
      `Tournament scheduler started with cron: ${cronExpression}`,
    );
  }

  onModuleDestroy(): void {
    if (this.schedulerJob) {
      this.schedulerJob.stop();
      try {
        this.schedulerRegistry.deleteCronJob("tournament-scheduler");
      } catch {
        // Job might not exist
      }
    }

    for (const [id, director] of this.activeDirectors) {
      this.logger.log(`Stopping tournament ${id}`);
      director.stop();
    }
    this.activeDirectors.clear();
  }

  /**
   * Update the scheduler cron expression at runtime.
   * Useful for admin configuration changes.
   */
  updateSchedulerCron(cronExpression: string): void {
    if (this.schedulerJob) {
      this.schedulerJob.stop();
      try {
        this.schedulerRegistry.deleteCronJob("tournament-scheduler");
      } catch {
        // Ignore
      }
    }

    this.schedulerJob = new CronJob(cronExpression, () => {
      this.checkScheduledTournaments();
    });

    this.schedulerRegistry.addCronJob(
      "tournament-scheduler",
      this.schedulerJob,
    );
    this.schedulerJob.start();

    this.logger.log(`Tournament scheduler updated to cron: ${cronExpression}`);
  }

  /**
   * Get current scheduler status for admin dashboard.
   */
  getSchedulerStatus(): {
    enabled: boolean;
    cronExpression: string;
    nextRun: Date | null;
    lastRun: Date | null;
  } {
    const isRunning = this.schedulerJob !== null;
    return {
      enabled: isRunning,
      cronExpression: this.configService.get<string>(
        "tournamentScheduler.cronExpression",
        "*/30 * * * * *",
      ),
      nextRun: isRunning
        ? (this.schedulerJob!.nextDate()?.toJSDate() ?? null)
        : null,
      lastRun: isRunning ? (this.schedulerJob!.lastDate() ?? null) : null,
    };
  }

  private async checkScheduledTournaments(): Promise<void> {
    const now = new Date();
    const tournaments =
      await this.tournamentRepository.findByStatus("registering");

    for (const tournament of tournaments) {
      if (
        tournament.type === "scheduled" &&
        tournament.scheduled_start_at &&
        tournament.scheduled_start_at <= now &&
        !this.activeDirectors.has(tournament.id)
      ) {
        const entries = await this.tournamentRepository.getEntries(
          tournament.id,
        );
        const activeEntries = entries.filter((e) => e.finish_position === null);

        if (activeEntries.length < tournament.min_players) {
          this.logger.log(
            `Tournament ${tournament.name}: scheduled start passed but only ${activeEntries.length}/${tournament.min_players} players — cancelling`,
          );
          await this.tournamentRepository.updateStatus(
            tournament.id,
            "cancelled",
          );
          continue;
        }

        this.logger.log(
          `Starting scheduled tournament: ${tournament.name} (${activeEntries.length} players)`,
        );
        await this.startTournament(tournament.id);
      }
    }
  }

  async startTournament(tournamentId: string): Promise<void> {
    if (this.activeDirectors.has(tournamentId)) {
      throw new Error("Tournament already running");
    }

    if (this.isRedisEnabled()) {
      const acquired =
        await this.gameOwnershipService!.acquireTournamentOwnership(
          tournamentId,
        );
      if (!acquired) {
        const existingState =
          await this.redisGameStateService!.getTournamentState(tournamentId);
        if (existingState) {
          this.logger.log(
            `Tournament ${tournamentId} owned by another instance`,
          );
        }
        throw new Error(
          `Cannot start tournament: ${tournamentId} is owned by another instance`,
        );
      }
    }

    const tournament = await this.tournamentRepository.findById(tournamentId);
    if (!tournament) {
      if (this.isRedisEnabled()) {
        await this.gameOwnershipService!.releaseTournamentOwnership(
          tournamentId,
        );
      }
      throw new Error("Tournament not found");
    }

    if (tournament.status !== "registering") {
      if (this.isRedisEnabled()) {
        await this.gameOwnershipService!.releaseTournamentOwnership(
          tournamentId,
        );
      }
      throw new Error("Tournament cannot be started");
    }

    const entries = await this.tournamentRepository.getEntries(tournamentId);
    if (entries.length < tournament.min_players) {
      if (this.isRedisEnabled()) {
        await this.gameOwnershipService!.releaseTournamentOwnership(
          tournamentId,
        );
      }
      throw new Error(
        `Not enough players: ${entries.length}/${tournament.min_players}`,
      );
    }

    await this.tournamentRepository.updateStatus(tournamentId, "running");

    const director = new ActiveTournament(
      tournamentId,
      tournament.name,
      entries,
      tournament,
      this.logger,
      this.eventEmitter,
      this.liveGameManager,
      this.botCaller,
      this.tournamentRepository,
      this.dataSource,
      this.redisGameStateService,
      this.redisEventBusService,
      this.gameOwnershipService?.getInstanceId() || null,
    );

    this.activeDirectors.set(tournamentId, director);
    await director.start();
  }

  getTournamentState(tournamentId: string): TournamentState | null {
    const director = this.activeDirectors.get(tournamentId);
    if (!director) return null;
    return director.getState();
  }

  getActiveTournaments(): string[] {
    return Array.from(this.activeDirectors.keys());
  }

  isRunning(tournamentId: string): boolean {
    return this.activeDirectors.has(tournamentId);
  }

  async stopTournament(tournamentId: string): Promise<void> {
    const director = this.activeDirectors.get(tournamentId);
    if (director) {
      director.stop();
      this.activeDirectors.delete(tournamentId);

      if (this.isRedisEnabled()) {
        await this.gameOwnershipService!.releaseTournamentOwnership(
          tournamentId,
        );
        await this.redisGameStateService!.deleteTournamentState(tournamentId);
      }
    }
  }
}

class ActiveTournament {
  private tables = new Map<string, TableEntry>();
  private tableHandNumbers = new Map<string, number>();
  private currentLevel = 1;
  private handsThisLevel = 0;
  private activeBots = new Map<string, BotInfo>();
  private bustOrder: string[] = [];
  private bustedBots = new Set<string>();
  private running = false;
  private handLock = false;
  private totalEntrants: number;

  constructor(
    private readonly tournamentId: string,
    private readonly name: string,
    private readonly entries: any[],
    private readonly config: any,
    private readonly logger: Logger,
    private readonly eventEmitter: EventEmitter2,
    private readonly liveGameManager: LiveGameManagerService,
    private readonly botCaller: BotCallerService,
    private readonly tournamentRepository: TournamentRepository,
    private readonly dataSource: DataSource,
    private readonly redisGameStateService: RedisGameStateService | null,
    private readonly redisEventBusService: RedisEventBusService | null,
    private readonly instanceId: string | null,
  ) {
    this.totalEntrants = entries.length;
  }

  private isRedisEnabled(): boolean {
    return (
      this.redisGameStateService !== null &&
      this.redisEventBusService !== null &&
      this.instanceId !== null
    );
  }

  private async saveStateToRedis(): Promise<void> {
    if (!this.isRedisEnabled()) return;

    const blindLevel = getBlindLevel(this.currentLevel);
    await this.redisGameStateService!.saveTournamentState(this.tournamentId, {
      name: this.name,
      status: this.running ? "running" : "finished",
      level: this.currentLevel,
      handsThisLevel: this.handsThisLevel,
      handsPerLevel: HANDS_PER_LEVEL,
      blinds: {
        small: blindLevel.small_blind,
        big: blindLevel.big_blind,
        ante: blindLevel.ante,
      },
      playersRemaining: this.activeBots.size,
      totalEntrants: this.totalEntrants,
      tables: Array.from(this.tables.values()).map((t) => ({
        tableId: t.tableDbId,
        tableNumber: t.tableNumber,
      })),
      buyIn: this.config.buy_in,
      prizePool: this.totalEntrants * this.config.buy_in,
      ownerInstanceId: this.instanceId!,
    });
  }

  private async publishEvent(
    eventType:
      | "tournament.stateUpdated"
      | "tournament.levelChanged"
      | "tournament.playerBusted"
      | "tournament.tableBreak"
      | "tournament.finished",
    payload: unknown,
  ): Promise<void> {
    if (!this.isRedisEnabled()) return;

    await this.redisEventBusService!.publishTournamentEvent(
      eventType,
      this.tournamentId,
      payload,
    );
  }

  async start(): Promise<void> {
    this.running = true;
    this.logger.log(
      `Starting tournament ${this.name} with ${this.entries.length} players`,
    );

    // Ensure starting_chips is a number (bigint from DB comes as string)
    const startingChips = Number(this.config.starting_chips);

    for (const entry of this.entries) {
      this.activeBots.set(entry.bot_id, {
        botId: entry.bot_id,
        name: entry.bot?.name || "Unknown",
        endpoint: entry.bot?.endpoint || "",
        chips: startingChips,
        tableDbId: null,
      });
    }

    await this.createInitialTables();
    await this.startBlindLevel(1);
    this.emitStateUpdate();

    this.runGameLoop();
  }

  private async createInitialTables(): Promise<void> {
    const bots = Array.from(this.activeBots.values());
    const numTables = Math.ceil(bots.length / SEATS_PER_TABLE);

    this.logger.log(`Creating ${numTables} tables for ${bots.length} players`);

    for (let i = 0; i < numTables; i++) {
      const tableBots = bots.slice(
        i * SEATS_PER_TABLE,
        (i + 1) * SEATS_PER_TABLE,
      );
      await this.createTable(i + 1, tableBots);
    }
  }

  private async createTable(
    tableNumber: number,
    bots: BotInfo[],
  ): Promise<void> {
    // Use short UUIDs for database IDs (max 36 chars)
    const tableDbId = crypto.randomUUID();
    const gameDbId = crypto.randomUUID();

    const blindLevel = getBlindLevel(this.currentLevel);

    await this.persistTournamentGame(tableDbId, gameDbId, bots, {
      createTable: true,
      tableNumber,
      tableStatus: "active",
    });

    const game = this.liveGameManager.createGameSync({
      tableId: tableDbId,
      gameDbId,
      tournamentId: this.tournamentId,
      smallBlind: blindLevel.small_blind,
      bigBlind: blindLevel.big_blind,
      ante: blindLevel.ante,
      startingChips: this.config.starting_chips,
      turnTimeoutMs: this.config.turn_timeout_ms,
    });

    const tableEntry: TableEntry = {
      game,
      tableDbId,
      gameDbId,
      tableNumber,
      botIdMap: {},
    };

    for (const bot of bots) {
      game.addPlayer({
        id: bot.botId,
        name: bot.name,
        endpoint: bot.endpoint,
        chips: bot.chips,
      });
      tableEntry.botIdMap[bot.name] = bot.botId;
      bot.tableDbId = tableDbId;

      // Create seat record in database for leaderboard tracking
      await this.tournamentRepository.seatBot({
        tournament_id: this.tournamentId,
        tournament_table_id: tableDbId,
        bot_id: bot.botId,
        seat_number: Object.keys(tableEntry.botIdMap).length,
        chips: bot.chips,
        busted: false,
      });
    }

    this.tables.set(tableDbId, tableEntry);
    this.tableHandNumbers.set(tableDbId, 0);
    this.logger.log(`Created table ${tableNumber} with ${bots.length} players`);
  }

  private async persistTournamentGame(
    tableDbId: string,
    gameDbId: string,
    bots: Array<{ botId: string; chips: number }>,
    options?: {
      createTable?: boolean;
      tableNumber?: number;
      tableStatus?: "active" | "broken" | "finished";
    },
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const gameRepository = manager.getRepository(Game);
      const gamePlayerRepository = manager.getRepository(GamePlayer);

      await gameRepository.save(
        gameRepository.create({
          id: gameDbId,
          table_id: tableDbId,
          tournament_id: this.tournamentId,
          status: "waiting",
          total_hands: 0,
          started_at: new Date(),
          finished_at: null,
        }),
      );

      if (options?.createTable) {
        await this.tournamentRepository.createTable(
          {
            id: tableDbId,
            tournament_id: this.tournamentId,
            table_number: options.tableNumber,
            status: options.tableStatus ?? "active",
            game_id: gameDbId,
          },
          manager,
        );
      } else {
        await this.tournamentRepository.updateTableGame(
          tableDbId,
          gameDbId,
          manager,
        );
      }

      for (const bot of bots) {
        await gamePlayerRepository.save(
          gamePlayerRepository.create({
            game_id: gameDbId,
            bot_id: bot.botId,
            start_chips: bot.chips,
            end_chips: null,
          }),
        );
      }
    });
  }

  private async finalizePersistedGame(
    gameDbId: string,
    players: Array<{ botId: string; chips: number }>,
    totalHands: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const gameRepository = manager.getRepository(Game);
      const gamePlayerRepository = manager.getRepository(GamePlayer);

      await gameRepository.update(gameDbId, {
        status: "finished",
        total_hands: Math.max(0, totalHands),
        finished_at: new Date(),
      });

      for (const player of players) {
        await gamePlayerRepository.update(
          { game_id: gameDbId, bot_id: player.botId },
          { end_chips: player.chips },
        );
      }
    });
  }

  private async startBlindLevel(level: number): Promise<void> {
    this.currentLevel = level;
    this.handsThisLevel = 0;

    const blindLevel = getBlindLevel(level);
    this.logger.log(
      `Level ${level}: Blinds ${blindLevel.small_blind}/${blindLevel.big_blind}, Ante ${blindLevel.ante}`,
    );

    await this.tournamentRepository.startBlindLevel({
      tournament_id: this.tournamentId,
      level,
      small_blind: blindLevel.small_blind,
      big_blind: blindLevel.big_blind,
      ante: blindLevel.ante,
    });

    this.eventEmitter.emit("tournament.levelChanged", {
      tournamentId: this.tournamentId,
      level,
      blinds: blindLevel,
    });
  }

  private async runGameLoop(): Promise<void> {
    while (this.running) {
      await this.sleep(1000);

      const remaining = this.activeBots.size;
      if (remaining <= 1) {
        await this.finishTournament();
        break;
      }

      await this.checkForBustedPlayers();
      await this.checkTableBalancing();
      await this.checkBlindLevelAdvance();
      await this.checkAndRecoverErroredGames();
      await this.syncChipsToDatabase();
      this.emitStateUpdate();
    }
  }

  private async syncChipsToDatabase(): Promise<void> {
    // Sync chip counts from in-memory game state to database
    for (const [_tableId, tableEntry] of this.tables) {
      const state = tableEntry.game.getPublicState();

      for (const player of state.players) {
        if (!player.disconnected) {
          const bot = this.activeBots.get(player.id);
          if (bot && bot.chips !== player.chips) {
            bot.chips = player.chips;
            await this.tournamentRepository.updateSeatChips(
              this.tournamentId,
              player.id,
              player.chips,
            );
          }
        }
      }
    }
  }

  private async checkAndRecoverErroredGames(): Promise<void> {
    for (const [tableId, tableEntry] of this.tables) {
      const state = tableEntry.game.getPublicState();

      if (state.status === "error") {
        this.logger.warn(
          `Table ${tableEntry.tableNumber} is in error state, attempting recovery`,
        );

        // Get remaining active players
        const activePlayers = state.players.filter(
          (p) => p.chips > 0 && !p.disconnected,
        );

        if (activePlayers.length < 2) {
          this.logger.log(
            `Table ${tableEntry.tableNumber} has < 2 active players, breaking table`,
          );
          await this.breakTable(tableId);
          continue;
        }

        // Try to restart the game
        try {
          await this.finalizePersistedGame(
            tableEntry.gameDbId,
            state.players.map((player) => ({
              botId: player.id,
              chips: player.chips,
            })),
            state.handNumber,
          );

          tableEntry.game.stop();
          this.liveGameManager.removeGameSync(tableId);

          // Create new game for this table
          const blindLevel = getBlindLevel(this.currentLevel);
          const newGameDbId = crypto.randomUUID();

          await this.persistTournamentGame(
            tableId,
            newGameDbId,
            activePlayers.map((player) => ({
              botId: player.id,
              chips: player.chips,
            })),
          );

          const newGame = this.liveGameManager.createGameSync({
            tableId,
            gameDbId: newGameDbId,
            tournamentId: this.tournamentId,
            smallBlind: blindLevel.small_blind,
            bigBlind: blindLevel.big_blind,
            ante: blindLevel.ante,
            startingChips: this.config.starting_chips,
            turnTimeoutMs: this.config.turn_timeout_ms,
          });

          // Add active players back
          for (const player of activePlayers) {
            const bot = this.activeBots.get(player.id);
            if (bot) {
              newGame.addPlayer({
                id: player.id,
                name: player.name,
                endpoint: bot.endpoint,
                chips: player.chips,
              });
            }
          }

          tableEntry.game = newGame;
          tableEntry.gameDbId = newGameDbId;
          this.tableHandNumbers.set(tableId, 0);

          this.logger.log(
            `Table ${tableEntry.tableNumber} recovered with ${activePlayers.length} players`,
          );
        } catch (err: any) {
          this.logger.error(
            `Failed to recover table ${tableEntry.tableNumber}: ${err.message}`,
          );
        }
      }
    }
  }

  private async checkForBustedPlayers(): Promise<void> {
    for (const [_tableId, tableEntry] of this.tables) {
      const state = tableEntry.game.getPublicState();

      for (const player of state.players) {
        if (player.chips === 0 && !player.disconnected) {
          if (this.bustedBots.has(player.id)) {
            continue;
          }

          const bot = this.activeBots.get(player.id);
          if (bot) {
            this.bustedBots.add(player.id);
            this.bustOrder.push(player.id);
            this.activeBots.delete(player.id);

            const position = this.totalEntrants - this.bustOrder.length + 1;
            this.logger.log(`${player.name} busted in position ${position}`);

            // Remove the busted player from the game
            tableEntry.game.removePlayer(player.id);

            await this.tournamentRepository.bustEntry(
              this.tournamentId,
              player.id,
              this.currentLevel,
              position,
            );

            // Update seat record to reflect bust
            await this.tournamentRepository.bustSeat(
              this.tournamentId,
              player.id,
            );

            this.eventEmitter.emit("tournament.playerBusted", {
              tournamentId: this.tournamentId,
              botId: player.id,
              position,
            });
          }
        }
      }
    }
  }

  private async checkTableBalancing(): Promise<void> {
    if (this.tables.size <= 1) return;

    const tableSizes = Array.from(this.tables.entries()).map(([id, entry]) => ({
      id,
      size: entry.game.players.filter((p) => !p.disconnected && p.chips > 0)
        .length,
    }));

    const minTable = tableSizes.reduce((a, b) => (a.size < b.size ? a : b));
    const maxTable = tableSizes.reduce((a, b) => (a.size > b.size ? a : b));

    if (minTable.size < BREAK_THRESHOLD && minTable.size < maxTable.size - 1) {
      await this.breakTable(minTable.id);
    }
  }

  private async breakTable(tableId: string): Promise<void> {
    const tableEntry = this.tables.get(tableId);
    if (!tableEntry) return;

    this.logger.log(`Breaking table ${tableEntry.tableNumber}`);

    const playersToMove = tableEntry.game.players.filter(
      (p) => !p.disconnected && p.chips > 0,
    );

    const remainingTables = Array.from(this.tables.entries())
      .filter(([id]) => id !== tableId)
      .map(([, entry]) => entry);
    const availableSeats = remainingTables.reduce(
      (sum, entry) =>
        sum +
        Math.max(
          0,
          SEATS_PER_TABLE -
            entry.game.players.filter((p) => !p.disconnected && p.chips > 0)
              .length,
        ),
      0,
    );

    if (playersToMove.length > availableSeats) {
      this.logger.warn(
        `Cannot break table ${tableEntry.tableNumber}: ${playersToMove.length} players but only ${availableSeats} seats available`,
      );
      return;
    }

    await this.finalizePersistedGame(
      tableEntry.gameDbId,
      playersToMove.map((player) => ({
        botId: player.id,
        chips: player.chips,
      })),
      tableEntry.game.handNumber,
    );
    await this.tournamentRepository.updateTableStatus(tableId, "broken");

    tableEntry.game.stop();
    this.tables.delete(tableId);
    this.tableHandNumbers.delete(tableId);
    this.liveGameManager.removeGameSync(tableId);

    for (const player of playersToMove) {
      const targetTable = remainingTables
        .filter(
          (entry) =>
            entry.game.players.filter((p) => !p.disconnected && p.chips > 0)
              .length < SEATS_PER_TABLE,
        )
        .sort(
          (left, right) =>
            left.game.players.filter((p) => !p.disconnected && p.chips > 0)
              .length -
            right.game.players.filter((p) => !p.disconnected && p.chips > 0)
              .length,
        )[0];

      if (!targetTable) {
        throw new Error(
          `No target table available while redistributing players from table ${tableEntry.tableNumber}`,
        );
      }

      targetTable.game.addPlayer({
        id: player.id,
        name: player.name,
        endpoint: player.endpoint,
        chips: player.chips,
      });

      const bot = this.activeBots.get(player.id);
      if (bot) {
        bot.tableDbId = targetTable.tableDbId;
      }

      await this.tournamentRepository.seatBot({
        tournament_id: this.tournamentId,
        tournament_table_id: targetTable.tableDbId,
        bot_id: player.id,
        seat_number: targetTable.game.players.filter(
          (p) => p.chips > 0 && !p.disconnected,
        ).length,
        chips: player.chips,
        busted: false,
      });
    }

    this.eventEmitter.emit("tournament.tableBreak", {
      tournamentId: this.tournamentId,
      tableId,
      playersRedistributed: playersToMove.length,
    });

    await this.publishEvent("tournament.tableBreak", {
      tournamentId: this.tournamentId,
      tableId,
      playersRedistributed: playersToMove.length,
    });
  }

  private async checkBlindLevelAdvance(): Promise<void> {
    let completedHandsDelta = 0;
    for (const [tableId, tableEntry] of this.tables) {
      const currentHandNumber = tableEntry.game.handNumber;
      const previousHandNumber = this.tableHandNumbers.get(tableId) ?? 0;

      if (currentHandNumber > previousHandNumber) {
        completedHandsDelta += currentHandNumber - previousHandNumber;
      } else if (currentHandNumber < previousHandNumber) {
        // Recovery recreates a table's live game and resets its local hand counter.
        completedHandsDelta += currentHandNumber;
      }

      this.tableHandNumbers.set(tableId, currentHandNumber);
    }

    if (completedHandsDelta > 0) {
      this.handsThisLevel += completedHandsDelta;
      await this.tournamentRepository.incrementLevelHands(
        this.tournamentId,
        this.currentLevel,
        completedHandsDelta,
      );
    }

    while (this.handsThisLevel >= HANDS_PER_LEVEL) {
      const overflowHands = this.handsThisLevel - HANDS_PER_LEVEL;
      await this.startBlindLevel(this.currentLevel + 1);
      this.handsThisLevel = overflowHands;

      if (overflowHands > 0) {
        await this.tournamentRepository.incrementLevelHands(
          this.tournamentId,
          this.currentLevel,
          overflowHands,
        );
      }

      const blindLevel = getBlindLevel(this.currentLevel);
      for (const [, tableEntry] of this.tables) {
        tableEntry.game.smallBlind = blindLevel.small_blind;
        tableEntry.game.bigBlind = blindLevel.big_blind;
        tableEntry.game.ante = blindLevel.ante;
      }
    }
  }

  private async finishTournament(): Promise<void> {
    this.running = false;

    const winner = Array.from(this.activeBots.values())[0];
    if (winner) {
      this.bustOrder.push(winner.botId);
    }

    const prizePool = this.totalEntrants * this.config.buy_in;
    const payouts = calculatePayouts(prizePool, this.totalEntrants);
    const payoutByPosition = new Map(
      payouts.map((payout) => [payout.position, payout.amount]),
    );

    const finalOrder = [...this.bustOrder].reverse();
    for (let index = 0; index < finalOrder.length; index++) {
      const position = index + 1;
      const botId = finalOrder[index];
      await this.tournamentRepository.setEntryPayout(
        this.tournamentId,
        botId,
        payoutByPosition.get(position) ?? 0,
        position,
      );
    }

    await this.tournamentRepository.updateStatus(this.tournamentId, "finished");

    for (const [tableId, tableEntry] of this.tables) {
      await this.finalizePersistedGame(
        tableEntry.gameDbId,
        tableEntry.game.players.map((player) => ({
          botId: player.id,
          chips: player.chips,
        })),
        tableEntry.game.handNumber,
      );
      await this.tournamentRepository.updateTableStatus(tableId, "finished");
      tableEntry.game.stop();
      this.liveGameManager.removeGameSync(tableId);
    }
    this.tables.clear();

    this.logger.log(
      `Tournament ${this.name} finished. Winner: ${winner?.name || "Unknown"}`,
    );

    this.eventEmitter.emit("tournament.finished", {
      tournamentId: this.tournamentId,
      winnerId: winner?.botId,
      winnerName: winner?.name,
      payouts,
    });

    await this.publishEvent("tournament.finished", {
      tournamentId: this.tournamentId,
      winnerId: winner?.botId,
      winnerName: winner?.name,
      payouts,
    });

    if (this.isRedisEnabled()) {
      await this.redisGameStateService!.deleteTournamentState(
        this.tournamentId,
      );
    }
  }

  getState(): TournamentState {
    const blindLevel = getBlindLevel(this.currentLevel);
    return {
      tournamentId: this.tournamentId,
      name: this.name,
      status: this.running ? "running" : "finished",
      level: this.currentLevel,
      handsThisLevel: this.handsThisLevel,
      handsPerLevel: HANDS_PER_LEVEL,
      blinds: {
        small: blindLevel.small_blind,
        big: blindLevel.big_blind,
        ante: blindLevel.ante,
      },
      playersRemaining: this.activeBots.size,
      totalEntrants: this.totalEntrants,
      tables: Array.from(this.tables.values()).map((t) => ({
        tableId: t.tableDbId,
        tableNumber: t.tableNumber,
        isFinalTable: this.tables.size === 1,
        gameState: t.game.getPublicState(),
      })),
      buyIn: this.config.buy_in,
      prizePool: this.totalEntrants * this.config.buy_in,
    };
  }

  private emitStateUpdate(): void {
    const state = this.getState();
    this.eventEmitter.emit("tournament.stateUpdated", {
      tournamentId: this.tournamentId,
      state,
    });

    this.saveStateToRedis().catch((err) =>
      this.logger.error(`Failed to save tournament state to Redis: ${err}`),
    );
    this.publishEvent("tournament.stateUpdated", {
      tournamentId: this.tournamentId,
      state,
    }).catch((err) =>
      this.logger.error(`Failed to publish tournament state event: ${err}`),
    );
  }

  stop(): void {
    this.running = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
