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
import {
  HANDS_PER_LEVEL,
  getBlindLevel,
  calculatePrizes,
} from "../../config/tournaments.config";
import { Game } from "../../entities/game.entity";
import { GamePlayer } from "../../entities/game-player.entity";
import { Table } from "../../entities/table.entity";
import { RedisService } from "../../common/redis/redis.service";
import { LogicBug } from "../../entities/logic-bug.entity";
import { BotStats } from "../../entities/bot-stats.entity";
import {
  TournamentEvent,
  EVENT_TABLE_MOVE,
} from "../../entities/tournament-event.entity";
import * as crypto from "crypto";

const SEATS_PER_TABLE = 9;

interface BotInfo {
  botId: string;
  name: string;
  userName: string;
  userId: string;
  elo: number;
  strategy: Record<string, any> | null;
  chips: bigint;
  tableDbId: string | null;
}

interface TableEntry {
  game: GameInstance;
  tableDbId: string;
  gameDbId: string;
  tableNumber: number;
  botIdMap: Record<string, string>;
}

interface BustRecord {
  botId: string;
  bustLevel: number;
  bustHandNumber: number;
  chipsAtHandStart: number;
  finishPosition: number;
  isTied: boolean;
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
  handForHand: boolean;
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
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly redisService: RedisService,
  ) {}

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

    // Reattach directors for any tournaments that were running before this restart
    this.recoverRunningTournaments().catch((e) =>
      this.logger.error(`Failed to recover running tournaments: ${e.message}`),
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
    this.logger.debug(
      `[Scheduler] Checking for tournaments to start at ${now.toISOString()}`,
    );
    const tournaments =
      await this.tournamentRepository.findByStatus("registering");

    this.logger.debug(
      `[Scheduler] Found ${tournaments.length} tournaments in "registering" status`,
    );

    for (const tournament of tournaments) {
      this.logger.debug(
        `[Scheduler] Checking tournament: ${tournament.name} (${tournament.id})`,
      );
      this.logger.debug(`[Scheduler]   Type: ${tournament.type}`);
      this.logger.debug(
        `[Scheduler]   Scheduled start: ${tournament.scheduled_start_at?.toISOString()}`,
      );
      this.logger.debug(
        `[Scheduler]   Active: ${!this.activeDirectors.has(tournament.id)}`,
      );

      if (
        tournament.type === "scheduled" &&
        tournament.scheduled_start_at &&
        tournament.scheduled_start_at <= now &&
        !this.activeDirectors.has(tournament.id)
      ) {
        try {
          const entries = await this.tournamentRepository.getEntries(
            tournament.id,
          );
          const activeEntries = entries.filter(
            (e) => e.finish_position === null,
          );
          this.logger.log(
            `[Scheduler] Tournament ${tournament.name}: ${activeEntries.length}/${tournament.min_players} players`,
          );

          if (activeEntries.length < tournament.min_players) {
            this.logger.warn(
              `[Scheduler] Tournament ${tournament.name}: scheduled start passed but only ${activeEntries.length}/${tournament.min_players} players — cancelling`,
            );
            await this.tournamentRepository.updateStatus(
              tournament.id,
              "cancelled",
            );
            continue;
          }

          this.logger.log(
            `[Scheduler] ✅ Starting scheduled tournament: ${tournament.name} (${activeEntries.length} players)`,
          );
          await this.startTournament(tournament.id);
          this.logger.log(
            `[Scheduler] ✅ Tournament started successfully: ${tournament.name}`,
          );
        } catch (error) {
          this.logger.error(
            `[Scheduler] ❌ Error starting tournament ${tournament.name} (${tournament.id}):`,
            error instanceof Error ? error.stack : String(error),
          );
          // Continue to next tournament instead of crashing the scheduler
          continue;
        }
      } else {
        const reasons = [];
        if (tournament.type !== "scheduled")
          reasons.push(`type=${tournament.type}`);
        if (!tournament.scheduled_start_at)
          reasons.push(`no scheduled_start_at`);
        if (
          tournament.scheduled_start_at &&
          tournament.scheduled_start_at > now
        )
          reasons.push(
            `start in ${Math.round((tournament.scheduled_start_at.getTime() - now.getTime()) / 1000)}s`,
          );
        if (this.activeDirectors.has(tournament.id))
          reasons.push(`already active`);
        this.logger.debug(
          `[Scheduler] Skipping ${tournament.name}: ${reasons.join(", ")}`,
        );
      }
    }
  }

  /**
   * On startup, recreate ActiveTournament directors for any tournaments that
   * were running when the server last shut down. Without this, game loops
   * keep playing (recovered from Redis hot state) but bust detection,
   * chip sync, and blind advancement are all dead.
   */
  private async recoverRunningTournaments(): Promise<void> {
    const running = await this.tournamentRepository.findByStatus("running");
    if (running.length === 0) return;

    this.logger.log(
      `Recovering ${running.length} running tournament(s) after restart...`,
    );

    for (const tournament of running) {
      if (this.activeDirectors.has(tournament.id)) continue;
      try {
        const entries = await this.tournamentRepository.getEntries(
          tournament.id,
        );
        const director = new ActiveTournament(
          tournament.id,
          tournament.name,
          entries,
          tournament,
          this.logger,
          this.eventEmitter,
          this.liveGameManager,
          this.tournamentRepository,
          this.dataSource,
          this.redisService,
        );
        // Restore in-memory state from DB without creating new tables/games
        await director.recoverFromDb();
        this.activeDirectors.set(tournament.id, director);
        this.logger.log(
          `Recovered director for tournament "${tournament.name}" (${tournament.id})`,
        );
      } catch (e: any) {
        this.logger.error(
          `Failed to recover director for tournament ${tournament.id}: ${e.message}`,
        );
      }
    }
  }

  async startTournament(tournamentId: string): Promise<void> {
    if (this.activeDirectors.has(tournamentId)) {
      throw new Error("Tournament already running");
    }

    const tournament = await this.tournamentRepository.findById(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    if (tournament.status !== "registering") {
      throw new Error(
        `Tournament cannot be started (status: ${tournament.status})`,
      );
    }

    const entries = await this.tournamentRepository.getEntries(tournamentId);
    if (entries.length < 2) {
      throw new Error(`Not enough players: ${entries.length}/2`);
    }

    const director = new ActiveTournament(
      tournamentId,
      tournament.name,
      entries,
      tournament,
      this.logger,
      this.eventEmitter,
      this.liveGameManager,
      this.tournamentRepository,
      this.dataSource,
      this.redisService,
    );

    // Mark as running BEFORE inserting tables so the scheduler never double-starts
    // if director.start() fails mid-way (partial tables already inserted).
    await this.tournamentRepository.updateStatus(tournamentId, "running");
    this.activeDirectors.set(tournamentId, director);

    try {
      await director.start();
    } catch (error) {
      // Start failed — cancel so it doesn't get stuck in limbo
      this.activeDirectors.delete(tournamentId);
      await this.tournamentRepository.updateStatus(tournamentId, "cancelled");
      this.logger.error(
        `Failed to start tournament ${tournamentId}, marked as cancelled:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
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

  getTournamentProgress(tournamentId: string): {
    handsProcessed: number;
    totalHands: number;
    hps: number;
    topStacks: Array<{ botName: string; chips: number; rank: number }>;
  } | null {
    const director = this.activeDirectors.get(tournamentId);
    if (!director) return null;
    return director.getProgressData();
  }

  async stopTournament(tournamentId: string): Promise<void> {
    const director = this.activeDirectors.get(tournamentId);
    if (director) {
      director.stop();
      this.activeDirectors.delete(tournamentId);
    }
  }
}

// ─── Barrier Coordinator ─────────────────────────────────────────────────────

/**
 * Synchronizes multiple concurrent game tables during hand-for-hand play.
 * Each table calls checkIn() after completing a hand; all tables block until
 * every table has checked in (or the 30-second safety timeout fires).
 */
class BarrierCoordinator {
  private checkedIn = new Set<string>();
  private waiters: Array<() => void> = [];
  private timeoutHandle?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly logger: Logger,
    private readonly tournamentId: string,
    private readonly onStuckTables: (stuckIds: string[]) => Promise<void>,
  ) {}

  async checkIn(
    tableId: string,
    totalTables: number,
    allTableIds: string[],
  ): Promise<void> {
    this.checkedIn.add(tableId);

    if (this.checkedIn.size === 1) {
      // Start deadlock protection on the first table to check in
      this.timeoutHandle = setTimeout(async () => {
        const stuck = allTableIds.filter((id) => !this.checkedIn.has(id));
        this.logger.error(
          `[H2H ${this.tournamentId}] Barrier timeout — stuck tables: [${stuck.join(", ")}]`,
        );
        await this.onStuckTables(stuck);
        this.release();
      }, 30_000);
    }

    if (this.checkedIn.size >= totalTables) {
      this.release();
      return;
    }

    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    clearTimeout(this.timeoutHandle);
    this.timeoutHandle = undefined;
    this.checkedIn.clear();
    const resolvers = this.waiters.splice(0);
    for (const r of resolvers) r();
  }
}

// ─── Seeding helpers ──────────────────────────────────────────────────────────

function hasDuplicateOwner(seats: BotInfo[]): boolean {
  const seen = new Set<string>();
  for (const s of seats) {
    if (s.userId === "unknown") continue;
    if (seen.has(s.userId)) return true;
    seen.add(s.userId);
  }
  return false;
}

// ─── ActiveTournament ─────────────────────────────────────────────────────────

class ActiveTournament {
  private tables = new Map<string, TableEntry>();
  private tableHandNumbers = new Map<string, number>();
  private currentLevel = 1;
  private handsThisLevel = 0;
  private activeBots = new Map<string, BotInfo>();
  private bustOrder: BustRecord[] = [];
  private bustedBots = new Set<string>();
  private running = false;
  private handLock = false;
  private totalEntrants: number;
  private eventHandlerRefs: Array<{
    event: string;
    handler: (...args: any[]) => void;
  }> = [];
  private safetyNetInterval?: ReturnType<typeof setInterval>;
  private chipSnapshot = new Map<string, number>();
  private roundCounter = 0;
  private handForHandMode = false;
  private handCount = 0;
  private lastHandTs = 0; // 0 = not yet set; initialised on first hand
  private rollingHps = 0;
  private readonly barrier: BarrierCoordinator;

  constructor(
    private readonly tournamentId: string,
    private readonly name: string,
    private readonly entries: any[],
    private readonly config: any,
    private readonly logger: Logger,
    private readonly eventEmitter: EventEmitter2,
    private readonly liveGameManager: LiveGameManagerService,
    private readonly tournamentRepository: TournamentRepository,
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {
    this.totalEntrants = entries.length;
    this.barrier = new BarrierCoordinator(
      this.logger,
      this.tournamentId,
      this.onStuckTables.bind(this),
    );
  }

  async start(): Promise<void> {
    this.running = true;
    this.logger.log(
      `Starting tournament ${this.name} with ${this.entries.length} players`,
    );

    const startingChips = this.config.starting_chips;

    for (const entry of this.entries) {
      this.activeBots.set(entry.bot_id, {
        botId: entry.bot_id,
        name: entry.bot?.name || "Unknown",
        userName: entry.bot?.user?.name || "Unknown",
        userId: entry.bot?.user?.id || "unknown",
        elo: 0,
        strategy: entry.bot?.strategy || null,
        chips: startingChips,
        tableDbId: null,
      });
    }

    // Populate ELO (tournament_wins) for snake seeding
    const eloMap = await this.fetchBotElos([...this.activeBots.keys()]);
    for (const info of this.activeBots.values()) {
      info.elo = eloMap.get(info.botId) ?? 0;
    }

    await this.createInitialTables();
    await this.startBlindLevel(1);
    this.emitStateUpdate();

    this.registerEventHandlers();
    this.startSafetyNet();
  }

  /**
   * Rebuild in-memory state from DB after a server restart.
   * Does NOT create new DB records — only wires up existing live game instances.
   */
  async recoverFromDb(): Promise<void> {
    this.running = true;

    // ── 1. Load all seats; active = not busted ────────────────────────────
    const allSeats = await this.tournamentRepository.getSeats(
      this.tournamentId,
    );
    for (const seat of allSeats) {
      if (seat.busted) {
        this.bustedBots.add(seat.bot_id);
      } else {
        const entry = this.entries.find((e) => e.bot_id === seat.bot_id);
        this.activeBots.set(seat.bot_id, {
          botId: seat.bot_id,
          name: entry?.bot?.name || "Unknown",
          userName: entry?.bot?.user?.name || "Unknown",
          userId: entry?.bot?.user?.id || "unknown",
          elo: 0,
          strategy: entry?.bot?.strategy || null,
          chips: BigInt(seat.chips),
          tableDbId: seat.tournament_table_id,
        });
      }
    }

    // ── 2. Attach to running game instances from liveGameManager ──────────
    const dbTables = await this.tournamentRepository.getTables(
      this.tournamentId,
    );
    for (const table of dbTables) {
      const liveGame = this.liveGameManager.getGame(table.id);
      if (!liveGame) {
        this.logger.warn(
          `[Recovery] No live game for table ${table.id.slice(0, 8)}`,
        );
        continue;
      }

      const tableEntry: TableEntry = {
        game: liveGame.game,
        tableDbId: table.id,
        gameDbId: liveGame.gameDbId,
        tableNumber: table.table_number,
        botIdMap: {},
      };

      this.tables.set(table.id, tableEntry);
      this.tableHandNumbers.set(table.id, liveGame.game.handNumber);

      // Re-wire inter-hand hook for hand-for-hand sync
      const tableId = table.id;
      liveGame.game.interHandHook = async () => {
        if (!this.handForHandMode) return;
        const allIds = [...this.tables.keys()];
        await this.barrier.checkIn(tableId, this.tables.size, allIds);
      };

      this.logger.log(
        `[Recovery] Reattached table ${table.table_number} game=${liveGame.gameDbId.slice(0, 8)} hand=${liveGame.game.handNumber}`,
      );
    }

    // ── 3. Restore chip snapshot from current game state ──────────────────
    for (const [, tableEntry] of this.tables) {
      const state = tableEntry.game.getPublicState();
      for (const player of state.players) {
        this.chipSnapshot.set(player.id, Number(player.chips));
      }
    }

    // ── 4. Restore blind level from DB ────────────────────────────────────
    const currentLevel = await this.tournamentRepository.getCurrentLevel(
      this.tournamentId,
    );
    if (currentLevel) {
      this.currentLevel = currentLevel.level;
    }

    this.logger.log(
      `[Recovery] Tournament "${this.name}": ${this.tables.size} tables, ${this.activeBots.size} active bots, level ${this.currentLevel}`,
    );

    this.registerEventHandlers();
    this.startSafetyNet();
  }

  private get seatsPerTable(): number {
    return this.config.players_per_table ?? SEATS_PER_TABLE;
  }

  private async createInitialTables(): Promise<void> {
    const bots = Array.from(this.activeBots.values());
    const numTables = Math.ceil(bots.length / this.seatsPerTable);

    // ── Step A: Sort by ELO (tournament_wins) descending ─────────────────
    const ranked = [...bots].sort((a, b) => b.elo - a.elo);

    // ── Step B: Snake seeding — distribute skill evenly across tables ─────
    const tables: BotInfo[][] = Array.from({ length: numTables }, () => []);
    if (numTables === 1) {
      tables[0] = ranked;
    } else {
      let idx = 0;
      let dir = 1;
      for (const bot of ranked) {
        tables[idx].push(bot);
        // Endpoint reached: flip direction WITHOUT advancing so the endpoint
        // table is double-visited (standard snake seeding behavior).
        const next = idx + dir;
        if (next >= numTables) {
          dir = -1;
        } else if (next < 0) {
          dir = 1;
        } else {
          idx = next;
        }
      }
    }

    // ── Step C: Owner isolation (greedy swap) — priority over skill balance
    for (let t = 0; t < numTables; t++) {
      for (let i = 0; i < tables[t].length; i++) {
        const conflictIdx = tables[t].findIndex(
          (b, j) => j !== i && b.userId === tables[t][i].userId,
        );
        if (conflictIdx === -1) continue;

        let swapped = false;
        for (let t2 = 0; t2 < numTables && !swapped; t2++) {
          if (t2 === t) continue;
          for (let j = 0; j < tables[t2].length && !swapped; j++) {
            const tAfter = tables[t]
              .filter((_, k) => k !== conflictIdx)
              .concat(tables[t2][j]);
            const t2After = tables[t2]
              .filter((_, k) => k !== j)
              .concat(tables[t][conflictIdx]);
            if (!hasDuplicateOwner(tAfter) && !hasDuplicateOwner(t2After)) {
              [tables[t][conflictIdx], tables[t2][j]] = [
                tables[t2][j],
                tables[t][conflictIdx],
              ];
              swapped = true;
            }
          }
        }

        if (!swapped) {
          this.logger.warn(
            `Owner isolation: could not isolate userId ${tables[t][i].userId} on table ${t + 1}`,
          );
        }
      }
    }

    this.logger.log(`Creating ${numTables} tables for ${bots.length} players`);
    for (let i = 0; i < numTables; i++) {
      await this.createTable(i + 1, tables[i]);
    }
  }

  private async fetchBotElos(botIds: string[]): Promise<Map<string, number>> {
    if (botIds.length === 0) return new Map();
    const stats = await this.dataSource
      .getRepository(BotStats)
      .createQueryBuilder("s")
      .where("s.bot_id IN (:...ids)", { ids: botIds })
      .getMany();
    return new Map(stats.map((s) => [s.bot_id, s.tournament_wins]));
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
      startingChips: Number(this.config.starting_chips),
      turnTimeoutMs: this.config.turn_timeout_ms,
    });

    // Wire the inter-hand hook for hand-for-hand synchronization.
    // The hook is a no-op when handForHandMode is false, so it's safe on all tables.
    game.interHandHook = async () => {
      if (!this.handForHandMode) return;
      const allIds = [...this.tables.keys()];
      await this.barrier.checkIn(tableDbId, this.tables.size, allIds);
    };

    const tableEntry: TableEntry = {
      game,
      tableDbId,
      gameDbId,
      tableNumber,
      botIdMap: {},
    };

    // Add all players synchronously first — avoids the setImmediate race condition
    // where interleaved await seatBot() calls let the game start before all
    // players are seated (setImmediate fires between awaits in Node.js I/O loop).
    for (const bot of bots) {
      game.addPlayer({
        id: bot.botId,
        name: bot.userName,
        strategy: bot.strategy as any,
        chips: Number(bot.chips),
      });
      tableEntry.botIdMap[bot.name] = bot.botId;
      bot.tableDbId = tableDbId;
    }

    // Register table in memory BEFORE the async seatBot calls so that
    // ownsGame() / tableHandNumbers lookups work correctly if game.handStarted
    // fires via setImmediate before the Promise.all resolves.
    this.tables.set(tableDbId, tableEntry);
    this.tableHandNumbers.set(tableDbId, 0);

    // Now batch-persist all seat records in parallel
    await Promise.all(
      bots.map((bot, idx) =>
        this.tournamentRepository.seatBot({
          tournament_id: this.tournamentId,
          tournament_table_id: tableDbId,
          bot_id: bot.botId,
          seat_number: idx + 1,
          chips: bot.chips,
          busted: false,
        }),
      ),
    );
    this.logger.log(`Created table ${tableNumber} with ${bots.length} players`);
  }

  private async persistTournamentGame(
    tableDbId: string,
    gameDbId: string,
    bots: Array<{ botId: string; chips: bigint }>,
    options?: {
      createTable?: boolean;
      tableNumber?: number;
      tableStatus?: "active" | "broken" | "finished";
    },
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const gameRepository = manager.getRepository(Game);
      const gamePlayerRepository = manager.getRepository(GamePlayer);
      const tableRepository = manager.getRepository(Table);

      // Create tables entry FIRST (required by FK: games.table_id → tables.id)
      // Only create if this is a new table for the tournament
      if (options?.createTable) {
        this.logger.debug(`[DB] Inserting table: ${tableDbId}`);
        await tableRepository.save(
          tableRepository.create({
            id: tableDbId,
            name: `Tournament Table ${options?.tableNumber || 1}`,
            small_blind: 10, // Will be set by blind level during game creation
            big_blind: 20, // Will be set by blind level during game creation
            starting_chips: Number(this.config.starting_chips),
            max_players: 9,
            turn_timeout_ms: this.config.turn_timeout_ms,
            status: "waiting",
          }),
        );

        this.logger.debug(`[DB] Inserting tournament_table: ${tableDbId}`);
        await manager.query(
          `INSERT INTO tournament_tables (id, tournament_id, table_number, status, game_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NULL, NOW(), NOW())`,
          [
            tableDbId,
            this.tournamentId,
            options.tableNumber,
            options.tableStatus ?? "active",
          ],
        );
      }

      // Now create the game (FK: games.table_id → tables.id is now satisfied)
      this.logger.debug(
        `[DB] Inserting game: ${gameDbId} with table_id: ${tableDbId}`,
      );
      await gameRepository.save(
        gameRepository.create({
          id: gameDbId,
          table_id: tableDbId,
          tournament_id: this.tournamentId,
          status: "waiting",
          total_hands: 0,
          started_at: new Date(),
          finished_at: undefined,
        }),
      );

      // Always update tournament_table with the current game_id so that
      // GET /my-current-table always returns the active game (not a stale one
      // from a previous round on the same table).
      this.logger.debug(
        `[DB] Updating tournament_table game_id: ${tableDbId} -> ${gameDbId}`,
      );
      await this.tournamentRepository.updateTableGame(
        tableDbId,
        gameDbId,
        manager,
      );

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
    players: Array<{ botId: string; chips: bigint }>,
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
      small_blind: BigInt(blindLevel.small_blind),
      big_blind: BigInt(blindLevel.big_blind),
      ante: BigInt(blindLevel.ante),
    });

    this.eventEmitter.emit("tournament.levelChanged", {
      tournamentId: this.tournamentId,
      level,
      blinds: blindLevel,
    });

    // Emit blind increased event for WebSocket clients
    this.eventEmitter.emit("tournament.blindIncreased", {
      tournamentId: this.tournamentId,
      blindLevel: level,
      smallBlind: blindLevel.small_blind,
      bigBlind: blindLevel.big_blind,
    });
  }

  /** Returns true if the given gameId belongs to a table in this tournament. */
  private ownsGame(gameId: string): boolean {
    for (const entry of this.tables.values()) {
      if (entry.gameDbId === gameId) return true;
    }
    return false;
  }

  private registerEventHandlers(): void {
    const onHandComplete = async (event: {
      gameId: string;
      handNumber: number;
      winners: any[];
      players?: any[];
      atShowdown?: boolean;
      communityCards?: any[];
      pot?: number;
    }) => {
      if (!this.running || !this.ownsGame(event.gameId)) return;
      try {
        await this.handleHandComplete(event);
      } catch (e: any) {
        this.logger.error(
          `[Tournament ${this.tournamentId}] handleHandComplete error: ${e.message}`,
          e.stack,
        );
      }
    };

    const onGameFinished = async (event: {
      tableId: string;
      gameId: string;
      winnerId?: string;
      reason?: string;
      handNumber?: number;
      players?: any[];
    }) => {
      if (!this.running || !this.ownsGame(event.gameId)) return;
      try {
        await this.handleGameFinished(event);
      } catch (e: any) {
        this.logger.error(
          `[Tournament ${this.tournamentId}] handleGameFinished error: ${e.message}`,
          e.stack,
        );
      }
    };

    const onGameStuck = async (event: {
      tableId: string;
      gameId: string;
      tournamentId?: string;
      silenceMs: number;
    }) => {
      if (!this.running || event.tournamentId !== this.tournamentId) return;
      try {
        await this.handleGameStuck(event);
      } catch (e: any) {
        this.logger.error(
          `[Tournament ${this.tournamentId}] handleGameStuck error: ${e.message}`,
          e.stack,
        );
      }
    };

    const onHandStarted = (event: {
      gameId: string;
      players?: Array<{ id: string; chips: number | bigint }>;
    }) => {
      if (!this.running || !this.ownsGame(event.gameId)) return;
      if (event.players) {
        for (const p of event.players) {
          this.chipSnapshot.set(p.id, Number(p.chips));
        }
      }
    };

    const onMonitorStuck = async (event: {
      tableId: string;
      gameId: string;
      handNumber: number;
    }) => {
      if (!this.running || !this.tables.has(event.tableId)) return;
      try {
        await this.handleMonitorStuck(event);
      } catch (e: any) {
        this.logger.error(
          `[Tournament ${this.tournamentId}] handleMonitorStuck error: ${e.message}`,
          e.stack,
        );
      }
    };

    this.eventEmitter.on("game.handStarted", onHandStarted);
    this.eventEmitter.on("game.handComplete", onHandComplete);
    this.eventEmitter.on("game.finished", onGameFinished);
    this.eventEmitter.on("game.stuck", onGameStuck);
    this.eventEmitter.on("game.monitor.stuck", onMonitorStuck);

    this.eventHandlerRefs.push(
      { event: "game.handStarted", handler: onHandStarted },
      { event: "game.handComplete", handler: onHandComplete },
      { event: "game.finished", handler: onGameFinished },
      { event: "game.stuck", handler: onGameStuck },
      { event: "game.monitor.stuck", handler: onMonitorStuck },
    );
  }

  private removeEventHandlers(): void {
    for (const { event, handler } of this.eventHandlerRefs) {
      this.eventEmitter.removeListener(event, handler);
    }
    this.eventHandlerRefs = [];
  }

  /**
   * Safety-net interval (30s) catches edge cases that events might miss,
   * e.g. tournament completion check or orphaned tables.
   */
  private startSafetyNet(): void {
    this.safetyNetInterval = setInterval(async () => {
      if (!this.running) return;
      try {
        if (this.activeBots.size <= 1) {
          await this.finishTournament();
        }
      } catch (e: any) {
        this.logger.error(
          `[Tournament ${this.tournamentId}] safety-net error: ${e.message}`,
          e.stack,
        );
      }
    }, 30_000);
  }

  /**
   * Consolidated handler for each hand completion: bust detection, chip sync,
   * blind advancement, table balancing, and state emission.
   */
  private async handleHandComplete(_event: {
    gameId: string;
    handNumber: number;
    winners: any[];
    players?: any[];
    pot?: number;
  }): Promise<void> {
    this.roundCounter++;

    // Track hand count and rolling HPS for telemetry
    this.handCount++;
    const now = Date.now();
    if (this.lastHandTs === 0) {
      // First hand — just record the timestamp; no HPS sample yet
      this.lastHandTs = now;
    } else {
      const dt = (now - this.lastHandTs) / 1000;
      if (dt > 0) {
        // Keep as float; only round when emitting so EMA doesn't collapse to 0
        this.rollingHps = 0.2 * (1 / dt) + 0.8 * this.rollingHps;
      }
      this.lastHandTs = now;
    }

    // Detect busted players with same-hand tie-breaking
    await this.checkForBustedPlayers();

    // Sync chip counts to database
    await this.syncChipsToDatabase();

    // Advance blind level if needed
    await this.checkBlindLevelAdvance();

    // Check table balancing (only meaningful with multiple tables)
    await this.checkTableBalancing();

    // Toggle hand-for-hand mode based on bubble state
    this.checkHandForHandTransition();

    // Check tournament completion
    if (this.activeBots.size <= 1) {
      await this.finishTournament();
      return;
    }

    this.emitProgressUpdate();
    this.emitStateUpdate();
  }

  /**
   * Handler for game.finished — catches disconnected stragglers.
   */
  private async handleGameFinished(_event: {
    tableId: string;
    gameId: string;
    players?: any[];
  }): Promise<void> {
    await this.checkFinishedGames();

    if (this.activeBots.size <= 1) {
      await this.finishTournament();
      return;
    }

    await this.checkTableBalancing();
    this.emitStateUpdate();
  }

  /**
   * Handler for game.stuck — attempt error recovery for the stuck table.
   */
  private async handleGameStuck(_event: {
    tableId: string;
    gameId: string;
  }): Promise<void> {
    await this.checkAndRecoverErroredGames();
    this.emitStateUpdate();
  }

  /**
   * Handler for game.monitor.stuck — self-healing with retry limit.
   *
   * Recovery flow:
   *   1. Check recovery count in Redis for this (tableId, handNumber) pair.
   *   2. If count >= 3: terminate permanently, log Fatal Logic Error, write LogicBug.
   *   3. Otherwise: increment count, stop old game, fetch hot state, respawn.
   */
  private async handleMonitorStuck(event: {
    tableId: string;
    gameId: string;
    handNumber: number;
  }): Promise<void> {
    const tableEntry = this.tables.get(event.tableId);
    if (!tableEntry) return;

    const recoveryCountKey = `game:recovery_count:${event.tableId}:${event.handNumber}`;
    const countRaw = await this.redis.get(recoveryCountKey);
    const recoveryCount = countRaw ? parseInt(countRaw, 10) : 0;

    if (recoveryCount >= 3) {
      this.logger.fatal(
        `Table ${event.tableId}: Fatal Logic Error — recovery loop detected ` +
          `(${recoveryCount} attempts at hand ${event.handNumber}). Terminating permanently.`,
      );
      await this.dataSource.getRepository(LogicBug).save({
        hand_id: undefined,
        check_name: "recovery_loop_detected",
        description: `Table ${event.tableId} stuck in recovery loop at hand ${event.handNumber}`,
        details: {
          tableId: event.tableId,
          gameId: event.gameId,
          handNumber: event.handNumber,
          recoveryCount,
          tournamentId: this.tournamentId,
        },
      });
      tableEntry.game.stop();
      this.liveGameManager.removeGameSync(event.tableId);
      this.tables.delete(event.tableId);
      this.tableHandNumbers.delete(event.tableId);
      return;
    }

    this.logger.error(
      `Table ${event.tableId} stuck at hand ${event.handNumber}. Initiating recovery. ` +
        `(attempt ${recoveryCount + 1}/3)`,
    );

    // Increment recovery count — expires in 1 hour (covers a full session)
    await this.redis.set(recoveryCountKey, String(recoveryCount + 1), 3600);

    // Fetch latest hot state from Redis
    const hotRaw = await this.redis.get(`hot:game:${event.gameId}`);
    if (!hotRaw) {
      this.logger.error(
        `No hot state for table ${event.tableId} (game ${event.gameId}) — cannot recover.`,
      );
      return;
    }
    const hotState = JSON.parse(hotRaw) as {
      hand_number: number;
      players: Array<{
        id: string;
        chips: string;
        disconnected: boolean;
        strategy: any;
      }>;
    };

    // Stop old game instance
    tableEntry.game.stop();
    this.liveGameManager.removeGameSync(event.tableId);

    // Finalize old DB record before creating a new one
    await this.finalizePersistedGame(
      tableEntry.gameDbId,
      hotState.players.map((p) => ({ botId: p.id, chips: BigInt(p.chips) })),
      hotState.hand_number,
    ).catch((e: any) =>
      this.logger.warn(`Finalize old game failed (non-fatal): ${e.message}`),
    );

    // Respawn new game from hot state
    const activePlayers = hotState.players.filter(
      (p) => !p.disconnected && Number(p.chips) > 0,
    );
    const blindLevel = getBlindLevel(this.currentLevel);
    const newGameDbId = crypto.randomUUID();

    await this.persistTournamentGame(
      event.tableId,
      newGameDbId,
      activePlayers.map((p) => ({ botId: p.id, chips: BigInt(p.chips) })),
    );

    const newGame = this.liveGameManager.createGameSync({
      tableId: event.tableId,
      gameDbId: newGameDbId,
      tournamentId: this.tournamentId,
      smallBlind: blindLevel.small_blind,
      bigBlind: blindLevel.big_blind,
      ante: blindLevel.ante,
      startingChips: Number(this.config.starting_chips),
      turnTimeoutMs: this.config.turn_timeout_ms,
    });

    // Re-wire inter-hand hook for hand-for-hand sync
    newGame.interHandHook = async () => {
      if (!this.handForHandMode) return;
      const allIds = [...this.tables.keys()];
      await this.barrier.checkIn(event.tableId, this.tables.size, allIds);
    };

    for (const p of activePlayers) {
      const bot = this.activeBots.get(p.id);
      if (bot) {
        newGame.addPlayer({
          id: p.id,
          name: bot.userName,
          strategy: bot.strategy as any,
          chips: Number(p.chips),
        });
      }
    }

    tableEntry.game = newGame;
    tableEntry.gameDbId = newGameDbId;
    this.tableHandNumbers.set(event.tableId, hotState.hand_number ?? 0);
    this.logger.log(
      `Table ${event.tableId} respawned with ${activePlayers.length} players ` +
        `(hand ${hotState.hand_number ?? 0}).`,
    );
    this.emitStateUpdate();
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
          (p) => p.chips > 0n && !p.disconnected,
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
                name: bot.userName,
                strategy: bot.strategy as any,
                chips: Number(player.chips),
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
    // ── 1. Collect all busted players across all tables ────────────────
    const bustedThisRound: Array<{
      botId: string;
      playerName: string;
      chipsAtStart: number;
      tableEntry: TableEntry;
    }> = [];

    for (const [_tableId, tableEntry] of this.tables) {
      const state = tableEntry.game.getPublicState();
      for (const player of state.players) {
        if (
          player.chips === 0n &&
          !player.disconnected &&
          !this.bustedBots.has(player.id)
        ) {
          const bot = this.activeBots.get(player.id);
          if (bot) {
            bustedThisRound.push({
              botId: player.id,
              playerName: player.name,
              chipsAtStart: this.chipSnapshot.get(player.id) ?? 0,
              tableEntry,
            });
          }
        }
      }
    }

    if (bustedThisRound.length === 0) return;

    // ── 2. Sort by chips at hand start descending (more chips = better rank) ──
    bustedThisRound.sort((a, b) => b.chipsAtStart - a.chipsAtStart);

    // ── 3. Assign positions with tie detection ────────────────────────
    const baseBestPosition =
      this.totalEntrants - this.bustOrder.length - bustedThisRound.length + 1;

    let i = 0;
    while (i < bustedThisRound.length) {
      // Find tie group: all with same chipsAtStart
      let j = i;
      while (
        j < bustedThisRound.length &&
        bustedThisRound[j].chipsAtStart === bustedThisRound[i].chipsAtStart
      ) {
        j++;
      }

      const groupSize = j - i;
      const sharedPosition = baseBestPosition + i;
      const isTied = groupSize > 1;

      for (let k = i; k < j; k++) {
        const bust = bustedThisRound[k];
        this.bustedBots.add(bust.botId);
        this.bustOrder.push({
          botId: bust.botId,
          bustLevel: this.currentLevel,
          bustHandNumber: this.roundCounter,
          chipsAtHandStart: bust.chipsAtStart,
          finishPosition: sharedPosition,
          isTied,
        });
        this.activeBots.delete(bust.botId);
        bust.tableEntry.game.removePlayer(bust.botId);

        await this.tournamentRepository.bustEntry(
          this.tournamentId,
          bust.botId,
          this.currentLevel,
          sharedPosition,
          this.roundCounter,
          bust.chipsAtStart,
        );
        await this.tournamentRepository.bustSeat(this.tournamentId, bust.botId);

        this.logger.log(
          `${bust.playerName} busted in position ${sharedPosition}${isTied ? " (tied)" : ""} (chips at start: ${bust.chipsAtStart})`,
        );

        this.eventEmitter.emit("tournament.playerBusted", {
          tournamentId: this.tournamentId,
          botId: bust.botId,
          position: sharedPosition,
          isTied,
        });
      }

      i = j;
    }

    // Clean up snapshots for busted players
    for (const bust of bustedThisRound) {
      this.chipSnapshot.delete(bust.botId);
    }
  }

  /**
   * When a game ends because all remaining players were disconnected (3 strikes),
   * those players still have chips > 0 so checkForBustedPlayers won't catch them.
   * This method detects finished games and busts any disconnected players in them,
   * allowing the tournament to continue or finish normally.
   */
  private async checkFinishedGames(): Promise<void> {
    for (const [_tableId, tableEntry] of this.tables) {
      const state = tableEntry.game.getPublicState();
      if (state.status !== "finished") continue;

      const disconnectedWithChips = state.players.filter(
        (p) => p.disconnected && p.chips > 0n && !this.bustedBots.has(p.id),
      );

      for (const player of disconnectedWithChips) {
        const bot = this.activeBots.get(player.id);
        if (!bot) continue;

        const chipsAtStart =
          this.chipSnapshot.get(player.id) ?? Number(player.chips);
        this.bustedBots.add(player.id);
        const position = this.totalEntrants - this.bustOrder.length - 1 + 1;
        this.bustOrder.push({
          botId: player.id,
          bustLevel: this.currentLevel,
          bustHandNumber: this.roundCounter,
          chipsAtHandStart: chipsAtStart,
          finishPosition: position,
          isTied: false,
        });
        this.activeBots.delete(player.id);
        this.chipSnapshot.delete(player.id);

        this.logger.log(
          `${player.name} busted (disconnected, game finished) in position ${position}`,
        );

        await this.tournamentRepository.bustEntry(
          this.tournamentId,
          player.id,
          this.currentLevel,
          position,
          this.roundCounter,
          chipsAtStart,
        );
        await this.tournamentRepository.bustSeat(this.tournamentId, player.id);

        this.eventEmitter.emit("tournament.playerBusted", {
          tournamentId: this.tournamentId,
          botId: player.id,
          position,
          isTied: false,
        });
      }
    }
  }

  private async checkTableBalancing(): Promise<void> {
    if (this.tables.size <= 1) return;

    const tableSizes = Array.from(this.tables.entries()).map(([id, entry]) => ({
      id,
      size: entry.game.players.filter((p) => !p.disconnected && p.chips > 0n)
        .length,
    }));

    const minTable = tableSizes.reduce((a, b) => (a.size < b.size ? a : b));
    const maxTable = tableSizes.reduce((a, b) => (a.size > b.size ? a : b));

    // Full break: table too small to run a hand
    if (minTable.size < 2) {
      await this.breakTable(minTable.id);
      return;
    }

    // Continuous balancing: whenever any two tables differ by > 1, move one player
    if (maxTable.size - minTable.size > 1) {
      await this.movePlayerForBalancing(maxTable.id, minTable.id);
    }
  }

  /**
   * Move exactly ONE player from the largest table to the smallest table.
   * Selects the player with the largest stack (least disruption), preferring
   * moves that don't violate owner isolation. Uses position equity to seat
   * the arriving player furthest from the upcoming Big Blind.
   */
  private async movePlayerForBalancing(
    fromTableId: string,
    toTableId: string,
  ): Promise<void> {
    const fromEntry = this.tables.get(fromTableId);
    const toEntry = this.tables.get(toTableId);
    if (!fromEntry || !toEntry) return;

    const activePlayers = fromEntry.game.players.filter(
      (p) => !p.disconnected && p.chips > 0n,
    );
    if (activePlayers.length === 0) return;

    // Sort largest stack first so the chip leader is preferred for the move
    const candidates = [...activePlayers].sort((a, b) =>
      b.chips > a.chips ? 1 : b.chips < a.chips ? -1 : 0,
    );

    // Pick the first candidate that won't violate owner isolation on the target
    const playerToMove =
      candidates.find((p) => {
        const movingBot = this.activeBots.get(p.id);
        if (!movingBot) return true;
        return !toEntry.game.players.some(
          (tp) =>
            !tp.disconnected &&
            tp.chips > 0n &&
            this.activeBots.get(tp.id)?.userId === movingBot.userId,
        );
      }) ?? candidates[0]; // fallback: move even if isolation can't be preserved

    if (!playerToMove) return;

    const movingBot = this.activeBots.get(playerToMove.id);

    // ── Position equity: seat furthest from the upcoming Big Blind ──────────
    const targetActive = toEntry.game.players.filter(
      (p) => !p.disconnected && p.chips > 0n,
    ).length;
    const targetDealerIdx = toEntry.game.dealerIndex;
    // Insert at the current BB position: the new player gets a full N-hand
    // rotation before being forced to post the big blind again.
    const bestSeat =
      targetActive > 0 ? (targetDealerIdx + 2) % targetActive : 0;

    const fromSeat =
      fromEntry.game.players.findIndex((p) => p.id === playerToMove.id) + 1;
    const movingChips = Number(playerToMove.chips);

    // ── Atomic Redis: move lock + seat assignment ────────────────────────────
    const lockKey = `tournament:move:${this.tournamentId}:${playerToMove.id}`;
    const moveData = JSON.stringify({
      botId: playerToMove.id,
      fromTable: fromTableId,
      toTable: toTableId,
      chips: movingChips,
      timestamp: Date.now(),
    });
    const pipeline = this.redis.multi();
    pipeline.set(lockKey, moveData, "EX", 30);
    pipeline.hset(
      `tournament:seats:${this.tournamentId}`,
      playerToMove.id,
      JSON.stringify({ tableId: toTableId, chips: movingChips }),
    );
    await pipeline.exec();

    // ── In-memory move ───────────────────────────────────────────────────────
    fromEntry.game.removePlayer(playerToMove.id);
    toEntry.game.addPlayer({
      id: playerToMove.id,
      name: movingBot?.userName || playerToMove.name,
      strategy: (movingBot?.strategy as any) || null,
      chips: movingChips,
      insertAt: bestSeat,
    });
    if (movingBot) movingBot.tableDbId = toTableId;

    // ── DB seat update ───────────────────────────────────────────────────────
    await this.tournamentRepository.seatBot({
      tournament_id: this.tournamentId,
      tournament_table_id: toTableId,
      bot_id: playerToMove.id,
      seat_number: bestSeat + 1,
      chips: playerToMove.chips,
      busted: false,
    });

    // ── Persistent audit record ──────────────────────────────────────────────
    await this.persistTableMoveEvent({
      botId: playerToMove.id,
      fromTableId,
      toTableId,
      fromSeat,
      toSeat: bestSeat + 1,
      chipsAtMove: playerToMove.chips,
    });

    // ── Audit log + clear lock ───────────────────────────────────────────────
    this.logger.log(
      JSON.stringify({
        audit: "TABLE_MOVE",
        tournamentId: this.tournamentId,
        botId: playerToMove.id,
        botName: movingBot?.name,
        fromTableId,
        toTableId,
        chips: movingChips,
        reason: "balancing",
        timestamp: new Date().toISOString(),
      }),
    );
    await this.redis.del(lockKey);

    this.eventEmitter.emit("tournament.playerMoved", {
      tournamentId: this.tournamentId,
      botId: playerToMove.id,
      fromTableId,
      toTableId,
      chips: movingChips,
    });
  }

  /**
   * Persist a TABLE_MOVE event to the tournament_events table for replay support.
   */
  private async persistTableMoveEvent(params: {
    botId: string;
    fromTableId: string;
    toTableId: string;
    fromSeat: number;
    toSeat: number;
    chipsAtMove: bigint;
  }): Promise<void> {
    try {
      await this.dataSource.getRepository(TournamentEvent).save({
        tournament_id: this.tournamentId,
        event_type: EVENT_TABLE_MOVE,
        bot_id: params.botId,
        from_table_id: params.fromTableId,
        to_table_id: params.toTableId,
        from_seat: params.fromSeat,
        to_seat: params.toSeat,
        chips_at_move: params.chipsAtMove,
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to persist TABLE_MOVE event for bot ${params.botId}: ${err.message}`,
      );
    }
  }

  private async breakTable(tableId: string): Promise<void> {
    const tableEntry = this.tables.get(tableId);
    if (!tableEntry) return;

    this.logger.log(`Breaking table ${tableEntry.tableNumber}`);

    const playersToMove = tableEntry.game.players.filter(
      (p) => !p.disconnected && p.chips > 0n,
    );

    const remainingTables = Array.from(this.tables.entries())
      .filter(([id]) => id !== tableId)
      .map(([, entry]) => entry);
    const availableSeats = remainingTables.reduce(
      (sum, entry) =>
        sum +
        Math.max(
          0,
          this.seatsPerTable -
            entry.game.players.filter((p) => !p.disconnected && p.chips > 0n)
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
      const movingBotForSort = this.activeBots.get(player.id);
      const targetTable = remainingTables
        .filter(
          (entry) =>
            entry.game.players.filter((p) => !p.disconnected && p.chips > 0n)
              .length < this.seatsPerTable,
        )
        .sort((left, right) => {
          const lCount = left.game.players.filter(
            (p) => !p.disconnected && p.chips > 0n,
          ).length;
          const rCount = right.game.players.filter(
            (p) => !p.disconnected && p.chips > 0n,
          ).length;
          if (lCount !== rCount) return lCount - rCount;
          // Tiebreak: prefer tables without a bot from the same owner
          if (!movingBotForSort) return 0;
          const lConflict = left.game.players.some(
            (p) =>
              !p.disconnected &&
              p.chips > 0n &&
              this.activeBots.get(p.id)?.userId === movingBotForSort.userId,
          );
          const rConflict = right.game.players.some(
            (p) =>
              !p.disconnected &&
              p.chips > 0n &&
              this.activeBots.get(p.id)?.userId === movingBotForSort.userId,
          );
          return (lConflict ? 1 : 0) - (rConflict ? 1 : 0);
        })[0];

      if (!targetTable) {
        throw new Error(
          `No target table available while redistributing players from table ${tableEntry.tableNumber}`,
        );
      }

      const movingBot = movingBotForSort;

      // ── 1. Atomic Redis: set move lock + seat assignment ──────────
      const lockKey = `tournament:move:${this.tournamentId}:${player.id}`;
      const moveData = JSON.stringify({
        botId: player.id,
        fromTable: tableId,
        toTable: targetTable.tableDbId,
        chips: Number(player.chips),
        timestamp: Date.now(),
      });
      const pipeline = this.redis.multi();
      pipeline.set(lockKey, moveData, "EX", 30);
      pipeline.hset(
        `tournament:seats:${this.tournamentId}`,
        player.id,
        JSON.stringify({
          tableId: targetTable.tableDbId,
          chips: Number(player.chips),
        }),
      );
      await pipeline.exec();

      // ── 2. In-memory move with position equity ────────────────────
      const targetActive = targetTable.game.players.filter(
        (p) => !p.disconnected && p.chips > 0n,
      ).length;
      const bestSeat =
        targetActive > 0
          ? (targetTable.game.dealerIndex + 2) % targetActive
          : 0;
      const fromSeat = playersToMove.findIndex((p) => p.id === player.id) + 1;

      targetTable.game.addPlayer({
        id: player.id,
        name: movingBot?.userName || player.name,
        strategy: (movingBot?.strategy as any) || null,
        chips: Number(player.chips),
        insertAt: bestSeat,
      });
      if (movingBot) {
        movingBot.tableDbId = targetTable.tableDbId;
      }

      // ── 3. DB seat update ─────────────────────────────────────────
      await this.tournamentRepository.seatBot({
        tournament_id: this.tournamentId,
        tournament_table_id: targetTable.tableDbId,
        bot_id: player.id,
        seat_number: bestSeat + 1,
        chips: player.chips,
        busted: false,
      });

      // ── 4. Persistent audit record + log ─────────────────────────
      await this.persistTableMoveEvent({
        botId: player.id,
        fromTableId: tableId,
        toTableId: targetTable.tableDbId,
        fromSeat,
        toSeat: bestSeat + 1,
        chipsAtMove: player.chips,
      });

      this.logger.log(
        JSON.stringify({
          audit: "TABLE_MOVE",
          tournamentId: this.tournamentId,
          botId: player.id,
          botName: movingBot?.name,
          fromTableId: tableId,
          fromTableNumber: tableEntry.tableNumber,
          toTableId: targetTable.tableDbId,
          toTableNumber: targetTable.tableNumber,
          chips: Number(player.chips),
          reason: "table_break",
          timestamp: new Date().toISOString(),
        }),
      );

      // ── 5. Clear Redis move lock (move complete) ──────────────────
      await this.redis.del(lockKey);

      this.eventEmitter.emit("tournament.playerMoved", {
        tournamentId: this.tournamentId,
        botId: player.id,
        fromTableId: tableId,
        toTableId: targetTable.tableDbId,
        chips: Number(player.chips),
      });
    }

    this.eventEmitter.emit("tournament.tableBreak", {
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

    const handsPerLevel = this.config.hands_per_level ?? HANDS_PER_LEVEL;
    while (this.handsThisLevel >= handsPerLevel) {
      const overflowHands = this.handsThisLevel - handsPerLevel;
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
        tableEntry.game.smallBlind = BigInt(blindLevel.small_blind);
        tableEntry.game.bigBlind = BigInt(blindLevel.big_blind);
        tableEntry.game.ante = BigInt(blindLevel.ante);
      }
    }
  }

  private async finishTournament(): Promise<void> {
    if (!this.running) return; // guard against double-finish from safety-net + event
    this.running = false;
    this.barrier.release(); // unblock any tables waiting at barrier before stopping them
    this.removeEventHandlers();
    if (this.safetyNetInterval) {
      clearInterval(this.safetyNetInterval);
      this.safetyNetInterval = undefined;
    }

    const winner = Array.from(this.activeBots.values())[0];
    if (winner) {
      this.bustOrder.push({
        botId: winner.botId,
        bustLevel: this.currentLevel,
        bustHandNumber: this.roundCounter,
        chipsAtHandStart: 0,
        finishPosition: 1,
        isTied: false,
      });
    }

    const prizePool = BigInt(this.totalEntrants) * this.config.buy_in;
    const payouts = calculatePrizes(prizePool, this.totalEntrants);
    const payoutByPosition = new Map(
      payouts.map((payout) => [payout.position, payout.amount]),
    );

    const finalOrder = [...this.bustOrder].reverse();
    for (let index = 0; index < finalOrder.length; index++) {
      const position = index + 1;
      const botId = finalOrder[index].botId;
      await this.tournamentRepository.setEntryPayout(
        this.tournamentId,
        botId,
        payoutByPosition.get(position) ?? 0n,
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
  }

  getState(): TournamentState {
    const blindLevel = getBlindLevel(this.currentLevel);
    return {
      tournamentId: this.tournamentId,
      name: this.name,
      status: this.running ? "running" : "finished",
      level: this.currentLevel,
      handsThisLevel: this.handsThisLevel,
      handsPerLevel: this.config.hands_per_level ?? HANDS_PER_LEVEL,
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
      buyIn: Number(this.config.buy_in),
      prizePool: this.totalEntrants * Number(this.config.buy_in),
      handForHand: this.handForHandMode,
    };
  }

  private emitStateUpdate(): void {
    const state = this.getState();
    this.logger.debug(
      `[Tournament ${this.tournamentId}] Emitting state update: status=${state.status}, players=${state.playersRemaining}/${state.totalEntrants}`,
    );
    this.eventEmitter.emit("tournament.stateUpdated", {
      tournamentId: this.tournamentId,
      state,
    });
  }

  private emitProgressUpdate(): void {
    const topStacks = [...this.chipSnapshot.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([botId, chips], i) => ({
        botName: this.activeBots.get(botId)?.name ?? botId,
        chips,
        rank: i + 1,
      }));

    this.eventEmitter.emit("tournament.progress", {
      tournamentId: this.tournamentId,
      handsProcessed: this.handCount,
      totalHands: this.totalEntrants,
      hps: Math.round(this.rollingHps),
      topStacks,
    });
  }

  getProgressData(): {
    handsProcessed: number;
    totalHands: number;
    hps: number;
    topStacks: Array<{ botName: string; chips: number; rank: number }>;
  } {
    const topStacks = [...this.chipSnapshot.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([botId, chips], i) => ({
        botName: this.activeBots.get(botId)?.name ?? botId,
        chips,
        rank: i + 1,
      }));
    return {
      handsProcessed: this.handCount,
      totalHands: this.totalEntrants,
      hps: Math.round(this.rollingHps),
      topStacks,
    };
  }

  /**
   * Activates hand-for-hand mode when the tournament reaches the bubble
   * (remaining players = paid places + 1 across multiple tables).
   * Deactivates once we're in the money.
   */
  private checkHandForHandTransition(): void {
    const paidPlaces = Math.max(1, Math.floor(this.totalEntrants * 0.15));
    const remaining = this.activeBots.size;
    const onBubble = remaining === paidPlaces + 1 && this.tables.size > 1;

    if (onBubble && !this.handForHandMode) {
      this.handForHandMode = true;
      this.logger.log(
        `[Tournament ${this.tournamentId}] Hand-for-hand ACTIVATED — ${remaining} players, ${paidPlaces} paid`,
      );
      this.eventEmitter.emit("tournament.handForHandStarted", {
        tournamentId: this.tournamentId,
        playersRemaining: remaining,
      });
    } else if (!onBubble && this.handForHandMode) {
      this.handForHandMode = false;
      this.barrier.release(); // unblock any tables held at the now-stale barrier
      this.logger.log(
        `[Tournament ${this.tournamentId}] Hand-for-hand DEACTIVATED — in the money`,
      );
    }
  }

  /**
   * Called by BarrierCoordinator when the 30-second timeout fires for stuck tables.
   * Logs each stuck table and triggers the existing error-recovery path.
   */
  private async onStuckTables(stuckIds: string[]): Promise<void> {
    for (const tableId of stuckIds) {
      const entry = this.tables.get(tableId);
      this.logger.error(
        `[Tournament ${this.tournamentId}] Force-recovering stuck table ${entry?.tableNumber ?? tableId} at H2H barrier`,
      );
    }
    await this.checkAndRecoverErroredGames();
  }

  stop(): void {
    this.running = false;
    this.barrier.release(); // unblock any tables waiting at barrier
    this.removeEventHandlers();
    if (this.safetyNetInterval) {
      clearInterval(this.safetyNetInterval);
      this.safetyNetInterval = undefined;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
