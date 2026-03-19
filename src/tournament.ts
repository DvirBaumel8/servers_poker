/**
 * TournamentDirector
 * ==================
 * Manages a running tournament: table assignments, blind levels,
 * table balancing, table breaking, final table consolidation, and payouts.
 *
 * Sits above PokerGame — creates/destroys game instances, moves players
 * between tables, and declares the tournament finished.
 *
 * The game engine (game.ts) is unchanged. The director feeds it players
 * and reacts to hand completions.
 */

import { PokerGame } from "./game";
import { GameRecorder } from "./recorder";
import * as db from "./db";
import type { TournamentTable } from "./db";
import logger from "./logger";
import {
  HANDS_PER_LEVEL,
  getBlindLevel,
  calculatePayouts,
} from "../tournaments.config";

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
  game: PokerGame;
  tableRow: TournamentTable;
  botIdMap: Record<string, string>;
  gameDbId: string;
}

interface TournamentState {
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
  tables: TableState[];
  buyIn: number;
  prizePool: number;
}

interface TableState {
  tableId: string;
  tableNumber: number;
  isFinalTable: boolean;
  gameState: any;
}

interface TournamentDirectorConfig {
  tournamentId: string;
  callBot: (endpoint: string, payload: any) => Promise<any>;
  onStateUpdate?: (tournamentId: string, state: TournamentState) => void;
  onFinished?: (tournamentId: string, results: any[]) => void;
}

export class TournamentDirector {
  tournamentId: string;
  private callBot: (endpoint: string, payload: any) => Promise<any>;
  private onStateUpdate: (tournamentId: string, state: TournamentState) => void;
  private onFinished: (tournamentId: string, results: any[]) => void;

  private tables: Map<string, TableEntry>;
  private currentLevel: number;
  private handsThisLevel: number;
  private activeBots: Map<string, BotInfo>;
  private bustOrder: string[];
  private running: boolean;
  private _handLock: boolean;

  constructor({
    tournamentId,
    callBot,
    onStateUpdate,
    onFinished,
  }: TournamentDirectorConfig) {
    this.tournamentId = tournamentId;
    this.callBot = callBot;
    this.onStateUpdate = onStateUpdate || (() => {});
    this.onFinished = onFinished || (() => {});

    this.tables = new Map();
    this.currentLevel = 1;
    this.handsThisLevel = 0;
    this.activeBots = new Map();
    this.bustOrder = [];
    this.running = false;
    this._handLock = false;
  }

  // ─────────────────────────────────────────────
  // START
  // ─────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const tourn = db.getTournamentById(this.tournamentId);
    const entries = db.getEntries(this.tournamentId);
    const levelConfig = getBlindLevel(1);

    db.updateTournamentStatus(this.tournamentId, "running");
    db.startBlindLevel({
      tournament_id: this.tournamentId,
      level: 1,
      ...levelConfig,
    });

    for (const e of entries) {
      this.activeBots.set(e.bot_id, {
        botId: e.bot_id,
        name: e.bot_name,
        endpoint: e.endpoint,
        chips: tourn.starting_chips,
        tableDbId: null,
      });
    }

    logger.info("tournament", "Tournament started", {
      tournamentId: this.tournamentId,
      entrants: entries.length,
    });
    this._assignTables(tourn);
    this._broadcastState();
  }

  // ─────────────────────────────────────────────
  // TABLE ASSIGNMENT
  // ─────────────────────────────────────────────

  private _assignTables(tourn: any): void {
    const bots = [...this.activeBots.values()];
    const numTables = Math.ceil(bots.length / SEATS_PER_TABLE);

    const shuffled = [...bots].sort(() => Math.random() - 0.5);

    this._log(`Assigning ${bots.length} players to ${numTables} table(s)`);

    for (let t = 0; t < numTables; t++) {
      const tableRow = db.createTournamentTable({
        tournament_id: this.tournamentId,
        table_number: t + 1,
      });
      const tableBots = shuffled.slice(
        t * SEATS_PER_TABLE,
        (t + 1) * SEATS_PER_TABLE,
      );
      this._startTable(tableRow, tableBots, tourn);
    }
  }

  private _startTable(
    tableRow: TournamentTable,
    bots: BotInfo[],
    tourn: any,
  ): void {
    tourn = tourn || db.getTournamentById(this.tournamentId);
    const level = getBlindLevel(this.currentLevel);
    const botIdMap: Record<string, string> = {};

    const game = new PokerGame({
      gameId: tableRow.id,
      smallBlind: level.small_blind,
      bigBlind: level.big_blind,
      ante: level.ante || 0,
      startingChips: tourn.starting_chips,
      turnTimeoutMs: tourn.turn_timeout_ms,
      botCaller: this.callBot,
      onStateUpdate: (state: any) => {
        for (const p of state.players) {
          if (this.activeBots.has(p.id)) {
            this.activeBots.get(p.id)!.chips = p.chips;
          }
        }
        this.onStateUpdate(this.tournamentId, this._buildState());
      },
      onHandComplete: (results: any) =>
        this._onHandComplete(tableRow.id, results),
      onPlayerRemoved: (player: any) => {
        this._log(
          `${player.name} disconnected from table ${tableRow.id} — treating as bust`,
        );
        this._eliminateBot(player.id, tableRow.id);
      },
    });

    bots.forEach((bot, i) => {
      botIdMap[bot.name] = bot.botId;
      game.addPlayer({ id: bot.botId, name: bot.name, endpoint: bot.endpoint });
      bot.tableDbId = tableRow.id;
      this.activeBots.get(bot.botId)!.tableDbId = tableRow.id;

      db.seatBot({
        tournament_id: this.tournamentId,
        tournament_table_id: tableRow.id,
        bot_id: bot.botId,
        seat_number: i + 1,
        chips: bot.chips,
      });
      db.recordSeatHistory({
        tournament_id: this.tournamentId,
        tournament_table_id: tableRow.id,
        bot_id: bot.botId,
        seat_number: i + 1,
        chips_on_arrival: bot.chips,
        reason: "initial",
      });
    });

    const gameRow = db.createGame(tableRow.id);
    db.updateTournamentTable(tableRow.id, { game_id: gameRow.id });

    const recorder = new GameRecorder({
      game,
      gameDbId: gameRow.id,
      tableId: tableRow.id,
      botIdMap,
      tournamentId: this.tournamentId,
    });
    recorder.attach();

    this.tables.set(tableRow.id, {
      game,
      tableRow,
      botIdMap,
      gameDbId: gameRow.id,
    });
    this._log(
      `Table ${tableRow.table_number} started with ${bots.length} players`,
    );
  }

  // ─────────────────────────────────────────────
  // HAND COMPLETION
  // ─────────────────────────────────────────────

  private async _onHandComplete(
    tableDbId: string,
    _results: any,
  ): Promise<void> {
    if (this._handLock) return;
    this._handLock = true;

    try {
      const entry = this.tables.get(tableDbId);
      if (!entry) return;
      logger.debug("tournament", `Hand complete on table ${tableDbId}`, {
        tournamentId: this.tournamentId,
        level: this.currentLevel,
        handsThisLevel: this.handsThisLevel,
        activeBots: this.activeBots.size,
      });

      this.handsThisLevel++;
      db.incrementLevelHands(this.tournamentId, this.currentLevel);

      if (this.handsThisLevel >= HANDS_PER_LEVEL) {
        await this._advanceBlindLevel(tableDbId);
      }

      const game = entry.game;
      for (const p of game.players) {
        if (p.chips === 0 && this.activeBots.has(p.id)) {
          await this._eliminateBot(p.id, tableDbId);
        }
      }

      for (const p of game.players) {
        if (p.chips > 0) {
          db.updateSeatChips(this.tournamentId, p.id, p.chips);
        }
      }

      if (this.activeBots.size <= 1) {
        await this._finishTournament();
        return;
      }

      await this._rebalanceTables();
      this._broadcastState();
    } catch (e) {
      this._logError(`_onHandComplete crashed on table ${tableDbId}`, {}, e);
      throw e;
    } finally {
      this._handLock = false;
    }
  }

  // ─────────────────────────────────────────────
  // BLIND LEVEL ADVANCEMENT
  // ─────────────────────────────────────────────

  private async _advanceBlindLevel(_triggerTableId: string): Promise<void> {
    this.handsThisLevel = 0;
    this.currentLevel++;

    const levelConfig = getBlindLevel(this.currentLevel);
    db.startBlindLevel({
      tournament_id: this.tournamentId,
      level: this.currentLevel,
      ...levelConfig,
    });

    this._log(
      `Level ${this.currentLevel}: blinds ${levelConfig.small_blind}/${levelConfig.big_blind}${levelConfig.ante > 0 ? ` ante ${levelConfig.ante}` : ""}`,
    );

    for (const [, { game }] of this.tables) {
      game.smallBlind = levelConfig.small_blind;
      game.bigBlind = levelConfig.big_blind;
      game.ante = levelConfig.ante || 0;
    }
  }

  // ─────────────────────────────────────────────
  // ELIMINATION
  // ─────────────────────────────────────────────

  private async _eliminateBot(
    botId: string,
    _tableDbId: string,
  ): Promise<void> {
    if (!this.activeBots.has(botId)) return;

    const position = this.activeBots.size;
    const bot = this.activeBots.get(botId)!;

    this.activeBots.delete(botId);
    this.bustOrder.unshift(botId);

    db.bustEntry(this.tournamentId, botId, this.currentLevel, position);
    db.bustSeat(this.tournamentId, botId);
    db.closeSeatHistory(this.tournamentId, botId);

    this._log(`${bot.name} eliminated in position ${position}`);

    if (this.activeBots.size <= SEATS_PER_TABLE && this.tables.size > 1) {
      await this._consolidateToFinalTable();
    }
  }

  // ─────────────────────────────────────────────
  // TABLE BALANCING
  // ─────────────────────────────────────────────

  private async _rebalanceTables(): Promise<void> {
    if (this.tables.size <= 1) return;

    const tableCounts = [...this.tables.entries()].map(([id, { game }]) => ({
      id,
      active: game.players.filter((p: any) => p.chips > 0 && !p.disconnected)
        .length,
    }));

    tableCounts.sort((a, b) => a.active - b.active);
    const smallest = tableCounts[0];
    const largest = tableCounts[tableCounts.length - 1];

    if (smallest.active <= BREAK_THRESHOLD) {
      const canAbsorb = tableCounts
        .slice(1)
        .some((t) => t.active + smallest.active <= SEATS_PER_TABLE);
      if (canAbsorb) {
        await this._breakTable(smallest.id);
        return;
      }
    }

    if (largest.active - smallest.active > 2) {
      await this._movePlayerBetweenTables(largest.id, smallest.id);
    }
  }

  private async _breakTable(tableDbId: string): Promise<void> {
    const entry = this.tables.get(tableDbId);
    if (!entry) return;

    const { game, tableRow } = entry;
    const activePlayers = game.players.filter(
      (p: any) => p.chips > 0 && !p.disconnected,
    );

    this._log(
      `Breaking table ${tableRow.table_number}, moving ${activePlayers.length} players`,
    );

    game.stop();
    this.tables.delete(tableDbId);
    db.updateTournamentTable(tableDbId, { status: "broken" });

    const remainingTables = [...this.tables.values()];
    for (let i = 0; i < activePlayers.length; i++) {
      const p = activePlayers[i];
      const target = remainingTables[i % remainingTables.length];
      await this._movePlayerToTable(
        p.id,
        p.chips,
        p.name,
        p.endpoint,
        target.tableRow.id,
      );
    }
  }

  private async _movePlayerBetweenTables(
    fromTableId: string,
    toTableId: string,
  ): Promise<void> {
    const fromEntry = this.tables.get(fromTableId);
    if (!fromEntry) return;

    const candidates = fromEntry.game.players.filter(
      (p: any) => p.chips > 0 && !p.disconnected,
    );
    if (!candidates.length) return;
    const mover = candidates[Math.floor(Math.random() * candidates.length)];

    this._log(
      `Moving ${mover.name} from table ${fromEntry.tableRow.table_number}`,
    );
    fromEntry.game.players.find((p: any) => p.id === mover.id).disconnected =
      true;
    await this._movePlayerToTable(
      mover.id,
      mover.chips,
      mover.name,
      mover.endpoint,
      toTableId,
    );
  }

  private async _movePlayerToTable(
    botId: string,
    chips: number,
    name: string,
    endpoint: string,
    toTableDbId: string,
  ): Promise<void> {
    const toEntry = this.tables.get(toTableDbId);
    if (!toEntry) return;

    const startingChips = toEntry.game.startingChips;
    toEntry.game.startingChips = chips;
    toEntry.game.addPlayer({ id: botId, name, endpoint });
    toEntry.game.startingChips = startingChips;

    const player = toEntry.game.players.find((p: any) => p.id === botId);
    if (player) player.chips = chips;

    if (this.activeBots.has(botId)) {
      this.activeBots.get(botId)!.tableDbId = toTableDbId;
    }

    db.seatBot({
      tournament_id: this.tournamentId,
      tournament_table_id: toTableDbId,
      bot_id: botId,
      seat_number: toEntry.game.players.length,
      chips,
    });
    db.recordSeatHistory({
      tournament_id: this.tournamentId,
      tournament_table_id: toTableDbId,
      bot_id: botId,
      seat_number: toEntry.game.players.length,
      chips_on_arrival: chips,
      reason: "balance_move",
    });
  }

  // ─────────────────────────────────────────────
  // FINAL TABLE
  // ─────────────────────────────────────────────

  private async _consolidateToFinalTable(): Promise<void> {
    if (this.tables.size <= 1) return;

    this._log(
      `Consolidating to final table — ${this.activeBots.size} players remaining`,
    );
    db.updateTournamentStatus(this.tournamentId, "final_table");

    const survivors: BotInfo[] = [];
    for (const [tableDbId, { game }] of this.tables) {
      for (const p of game.players) {
        if (p.chips > 0 && !p.disconnected && this.activeBots.has(p.id)) {
          survivors.push({
            botId: p.id,
            chips: p.chips,
            name: p.name,
            endpoint: p.endpoint,
            tableDbId: null,
          });
        }
      }
      game.stop();
      db.updateTournamentTable(tableDbId, { status: "broken" });
    }
    this.tables.clear();

    const finalTableRow = db.createTournamentTable({
      tournament_id: this.tournamentId,
      table_number: 99,
    });
    db.updateTournamentTable(finalTableRow.id, { status: "active" });

    this._log(`Final table: ${survivors.map((s) => s.name).join(", ")}`);
    this._startTable(finalTableRow, survivors, null);
    this._broadcastState();
  }

  // ─────────────────────────────────────────────
  // FINISH
  // ─────────────────────────────────────────────

  private async _finishTournament(): Promise<void> {
    this.running = false;

    for (const [, { game }] of this.tables) game.stop();
    this.tables.clear();

    const winner = [...this.activeBots.values()][0];
    if (winner) {
      this._log(`Tournament winner: ${winner.name}`);
    }

    const tourn = db.getTournamentById(this.tournamentId);
    const allEntries = db.getEntries(this.tournamentId);
    const entrantCount = allEntries.length;
    const prizePool = entrantCount * tourn.buy_in;
    const payouts = calculatePayouts(prizePool, entrantCount);

    this._log(`Prize pool: ${prizePool} — paying ${payouts.length} places`);

    const finishOrder = winner ? [winner.botId] : [];
    finishOrder.push(...this.bustOrder);

    for (let i = 0; i < finishOrder.length; i++) {
      const botId = finishOrder[i];
      const position = i + 1;
      const payoutEntry = payouts.find((p) => p.position === position);
      const amount = payoutEntry?.amount || 0;
      db.setEntryPayout(this.tournamentId, botId, amount, position);
      if (amount > 0) {
        const name = db.getBotById(botId)?.name || botId;
        this._log(
          `${name} finishes ${position}${this._ordinal(position)} — payout: ${amount}`,
        );
      }
    }

    db.updateTournamentStatus(this.tournamentId, "finished");
    for (const e of db.getEntries(this.tournamentId)) {
      db.ensureBotStats(e.bot_id);
      db.getDb()
        .prepare(
          "UPDATE bot_stats SET total_tournaments = total_tournaments + 1, updated_at = unixepoch() WHERE bot_id = ?",
        )
        .run(e.bot_id);
    }
    const results = db.getTournamentResults(this.tournamentId);
    for (const r of results) {
      if (r.payout > 0) {
        db.getDb()
          .prepare(
            "UPDATE bot_stats SET total_net = total_net + ?, updated_at = unixepoch() WHERE bot_id = (SELECT id FROM bots WHERE name = ?)",
          )
          .run(r.payout, r.bot_name);
      }
    }
    this.onFinished(this.tournamentId, results);
    this._broadcastState();
  }

  // ─────────────────────────────────────────────
  // LATE REGISTRATION
  // ─────────────────────────────────────────────

  addLateEntry(bot: { botId: string; name: string; endpoint: string }): void {
    const tourn = db.getTournamentById(this.tournamentId);
    if (this.currentLevel > tourn.late_reg_ends_level) {
      throw new Error(
        `Late registration closed (past level ${tourn.late_reg_ends_level})`,
      );
    }

    this.activeBots.set(bot.botId, {
      botId: bot.botId,
      name: bot.name,
      endpoint: bot.endpoint,
      chips: tourn.starting_chips,
      tableDbId: null,
    });

    const tablesBySize = [...this.tables.entries()]
      .map(([id, { game }]) => ({
        id,
        count: game.players.filter((p: any) => p.chips > 0).length,
      }))
      .sort((a, b) => a.count - b.count);

    if (tablesBySize.length && tablesBySize[0].count < SEATS_PER_TABLE) {
      const target = tablesBySize[0];
      this._movePlayerToTable(
        bot.botId,
        tourn.starting_chips,
        bot.name,
        bot.endpoint,
        target.id,
      );
    } else {
      const tableCount = db.getTournamentTables(this.tournamentId).length;
      const tableRow = db.createTournamentTable({
        tournament_id: this.tournamentId,
        table_number: tableCount + 1,
      });
      this._startTable(tableRow, [this.activeBots.get(bot.botId)!], tourn);
    }

    this._log(`${bot.name} joined as late entry`);
    this._broadcastState();
  }

  // ─────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────

  private _buildState(): TournamentState {
    const tourn = db.getTournamentById(this.tournamentId);
    const levelConfig = getBlindLevel(this.currentLevel);
    const tableStates: TableState[] = [];

    for (const [tableDbId, { game, tableRow }] of this.tables) {
      tableStates.push({
        tableId: tableDbId,
        tableNumber: tableRow.table_number,
        isFinalTable: tableRow.table_number === 99,
        gameState: game.getPublicState(),
      });
    }

    return {
      tournamentId: this.tournamentId,
      name: tourn.name,
      status: tourn.status,
      level: this.currentLevel,
      handsThisLevel: this.handsThisLevel,
      handsPerLevel: HANDS_PER_LEVEL,
      blinds: {
        small: levelConfig.small_blind,
        big: levelConfig.big_blind,
        ante: levelConfig.ante || 0,
      },
      playersRemaining: this.activeBots.size,
      totalEntrants: db.getEntries(this.tournamentId).length,
      tables: tableStates,
      buyIn: tourn.buy_in,
      prizePool: db.getEntries(this.tournamentId).length * tourn.buy_in,
    };
  }

  private _broadcastState(): void {
    this.onStateUpdate(this.tournamentId, this._buildState());
  }

  private _log(msg: string, context: Record<string, any> = {}): void {
    logger.info("tournament", msg, {
      tournamentId: this.tournamentId,
      ...context,
    });
  }

  private _logError(
    msg: string,
    context: Record<string, any> = {},
    err: any = null,
  ): void {
    logger.tournamentError("tournament", msg, this, context, err);
  }

  private _ordinal(n: number): string {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
}
