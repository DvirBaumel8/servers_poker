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
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DataSource } from "typeorm";
import { TournamentRepository } from "../../repositories/tournament.repository";
import { BotRepository } from "../../repositories/bot.repository";
import {
  LiveGameManagerService,
  GameInstance,
} from "../../services/live-game-manager.service";
import { BotCallerService } from "../../services/bot-caller.service";
import {
  HANDS_PER_LEVEL,
  getBlindLevel,
  calculatePayouts,
} from "../../../tournaments.config";

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
  private schedulerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly tournamentRepository: TournamentRepository,
    private readonly botRepository: BotRepository,
    private readonly liveGameManager: LiveGameManagerService,
    private readonly botCaller: BotCallerService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.schedulerInterval = setInterval(() => {
      this.checkScheduledTournaments();
    }, 30000);
    this.logger.log("Tournament scheduler started");
  }

  onModuleDestroy(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }

    for (const [id, director] of this.activeDirectors) {
      this.logger.log(`Stopping tournament ${id}`);
      director.stop();
    }
    this.activeDirectors.clear();
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

    const tournament = await this.tournamentRepository.findById(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found");
    }

    if (tournament.status !== "registering") {
      throw new Error("Tournament cannot be started");
    }

    const entries = await this.tournamentRepository.getEntries(tournamentId);
    if (entries.length < tournament.min_players) {
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
    }
  }
}

class ActiveTournament {
  private tables = new Map<string, TableEntry>();
  private currentLevel = 1;
  private handsThisLevel = 0;
  private activeBots = new Map<string, BotInfo>();
  private bustOrder: string[] = [];
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
  ) {
    this.totalEntrants = entries.length;
  }

  async start(): Promise<void> {
    this.running = true;
    this.logger.log(
      `Starting tournament ${this.name} with ${this.entries.length} players`,
    );

    for (const entry of this.entries) {
      this.activeBots.set(entry.bot_id, {
        botId: entry.bot_id,
        name: entry.bot?.name || "Unknown",
        endpoint: entry.bot?.endpoint || "",
        chips: this.config.starting_chips,
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
    const tableDbId = `${this.tournamentId}_table_${tableNumber}`;
    const gameDbId = `${tableDbId}_game_${Date.now()}`;

    const blindLevel = getBlindLevel(this.currentLevel);

    const game = this.liveGameManager.createGame({
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
    }

    this.tables.set(tableDbId, tableEntry);
    this.logger.log(`Created table ${tableNumber} with ${bots.length} players`);
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
    }
  }

  private async checkForBustedPlayers(): Promise<void> {
    for (const [_tableId, tableEntry] of this.tables) {
      const state = tableEntry.game.getPublicState();

      for (const player of state.players) {
        if (player.chips === 0 && !player.disconnected) {
          const bot = this.activeBots.get(player.id);
          if (bot) {
            this.bustOrder.push(player.id);
            this.activeBots.delete(player.id);

            const position = this.totalEntrants - this.bustOrder.length + 1;
            this.logger.log(`${player.name} busted in position ${position}`);

            await this.tournamentRepository.bustEntry(
              this.tournamentId,
              player.id,
              this.currentLevel,
              position,
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

    tableEntry.game.stop();
    this.tables.delete(tableId);
    this.liveGameManager.removeGame(tableId);

    const remainingTables = Array.from(this.tables.values());
    let targetIndex = 0;

    for (const player of playersToMove) {
      const targetTable = remainingTables[targetIndex % remainingTables.length];
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

      targetIndex++;
    }

    this.eventEmitter.emit("tournament.tableBreak", {
      tournamentId: this.tournamentId,
      tableId,
      playersRedistributed: playersToMove.length,
    });
  }

  private async checkBlindLevelAdvance(): Promise<void> {
    let totalHands = 0;
    for (const [, tableEntry] of this.tables) {
      totalHands += tableEntry.game.handNumber;
    }

    const expectedHands = this.currentLevel * HANDS_PER_LEVEL;
    if (totalHands >= expectedHands) {
      await this.startBlindLevel(this.currentLevel + 1);

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

    for (let i = 0; i < payouts.length; i++) {
      const position = payouts[i].position;
      const amount = payouts[i].amount;
      const botId = this.bustOrder[this.bustOrder.length - position];

      if (botId) {
        await this.tournamentRepository.setEntryPayout(
          this.tournamentId,
          botId,
          amount,
          position,
        );
      }
    }

    await this.tournamentRepository.updateStatus(this.tournamentId, "finished");

    for (const [tableId, tableEntry] of this.tables) {
      tableEntry.game.stop();
      this.liveGameManager.removeGame(tableId);
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
    this.eventEmitter.emit("tournament.stateUpdated", {
      tournamentId: this.tournamentId,
      state: this.getState(),
    });
  }

  stop(): void {
    this.running = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
