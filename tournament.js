/**
 * TournamentDirector
 * ==================
 * Manages a running tournament: table assignments, blind levels,
 * table balancing, table breaking, final table consolidation, and payouts.
 *
 * Sits above PokerGame — creates/destroys game instances, moves players
 * between tables, and declares the tournament finished.
 *
 * The game engine (game.js) is unchanged. The director feeds it players
 * and reacts to hand completions.
 */

const { PokerGame } = require('./game');
const { GameRecorder } = require('./recorder');
const db = require('./db');
const logger = require('./logger');
const {
  HANDS_PER_LEVEL,
  getBlindLevel,
  calculatePayouts,
} = require('../tournaments.config');

const SEATS_PER_TABLE = 9;
// Break a table when it falls to this many players AND another table has room
const BREAK_THRESHOLD = 4;

class TournamentDirector {
  /**
   * @param {object} config
   * @param {string} config.tournamentId
   * @param {Function} config.callBot         — (endpoint, payload) => action
   * @param {Function} config.onStateUpdate   — (tournamentId, state) => void
   * @param {Function} config.onFinished      — (tournamentId, results) => void
   */
  constructor({ tournamentId, callBot, onStateUpdate, onFinished }) {
    this.tournamentId = tournamentId;
    this.callBot = callBot;
    this.onStateUpdate = onStateUpdate || (() => {});
    this.onFinished = onFinished || (() => {});

    // Live state
    this.tables = new Map();       // tableDbId -> { game, tableRow, botIdMap }
    this.currentLevel = 1;
    this.handsThisLevel = 0;
    this.activeBots = new Map();   // botId -> { chips, name, endpoint, tableDbId }
    this.bustOrder = [];           // botIds in bust order (first busted = last position)
    this.running = false;
    this._handLock = false;        // prevent concurrent hand completions
  }

  // ─────────────────────────────────────────────
  // START
  // ─────────────────────────────────────────────

  async start() {
    if (this.running) return;
    this.running = true;

    const tourn = db.getTournamentById(this.tournamentId);
    const entries = db.getEntries(this.tournamentId);
    const levelConfig = getBlindLevel(1);

    db.updateTournamentStatus(this.tournamentId, 'running');
    db.startBlindLevel({
      tournament_id: this.tournamentId,
      level: 1,
      ...levelConfig,
    });

    // Load all entrants into activeBots
    for (const e of entries) {
      this.activeBots.set(e.bot_id, {
        botId: e.bot_id,
        name: e.bot_name,
        endpoint: e.endpoint,
        chips: tourn.starting_chips,
        tableDbId: null,
      });
    }

    logger.info('tournament', 'Tournament started', { tournamentId: this.tournamentId, entrants: entries.length });
    this._assignTables(tourn);
    this._broadcastState();
  }

  // ─────────────────────────────────────────────
  // TABLE ASSIGNMENT
  // ─────────────────────────────────────────────

  _assignTables(tourn) {
    const bots = [...this.activeBots.values()];
    const numTables = Math.ceil(bots.length / SEATS_PER_TABLE);

    // Shuffle bots for random seating
    const shuffled = [...bots].sort(() => Math.random() - 0.5);

    this._log(`Assigning ${bots.length} players to ${numTables} table(s)`);

    for (let t = 0; t < numTables; t++) {
      const tableRow = db.createTournamentTable({
        tournament_id: this.tournamentId,
        table_number: t + 1,
      });
      const tableBots = shuffled.slice(t * SEATS_PER_TABLE, (t + 1) * SEATS_PER_TABLE);
      this._startTable(tableRow, tableBots, tourn);
    }
  }

  _startTable(tableRow, bots, tourn) {
    tourn = tourn || db.getTournamentById(this.tournamentId);
    const level = getBlindLevel(this.currentLevel);
    const botIdMap = {};

    const game = new PokerGame({
      gameId: tableRow.id,
      smallBlind: level.small_blind,
      bigBlind: level.big_blind,
      ante: level.ante || 0,
      startingChips: tourn.starting_chips,
      turnTimeoutMs: tourn.turn_timeout_ms,
      botCaller: this.callBot,
      onStateUpdate: state => {
        // Update chip counts in our active bot registry
        for (const p of state.players) {
          if (this.activeBots.has(p.id)) {
            this.activeBots.get(p.id).chips = p.chips;
          }
        }
        this.onStateUpdate(this.tournamentId, this._buildState());
      },
      onHandComplete: results => this._onHandComplete(tableRow.id, results),
      onPlayerRemoved: player => {
        this._log(`${player.name} disconnected from table ${tableRow.id} — treating as bust`);
        this._eliminateBot(player.id, tableRow.id);
      },
    });

    // Seat bots
    bots.forEach((bot, i) => {
      botIdMap[bot.name] = bot.botId;
      game.addPlayer({ id: bot.botId, name: bot.name, endpoint: bot.endpoint });
      bot.tableDbId = tableRow.id;
      this.activeBots.get(bot.botId).tableDbId = tableRow.id;

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
        reason: 'initial',
      });
    });

    // Create game record
    const gameRow = db.createGame(tableRow.id);
    db.updateTournamentTable(tableRow.id, { game_id: gameRow.id });

    // Attach recorder
    const recorder = new GameRecorder({
      game,
      gameDbId: gameRow.id,
      tableId: tableRow.id,
      botIdMap,
      tournamentId: this.tournamentId,
    });
    recorder.attach();

    this.tables.set(tableRow.id, { game, tableRow, botIdMap, gameDbId: gameRow.id });
    this._log(`Table ${tableRow.table_number} started with ${bots.length} players`);
  }

  // ─────────────────────────────────────────────
  // HAND COMPLETION
  // ─────────────────────────────────────────────

  async _onHandComplete(tableDbId, results) {
    if (this._handLock) return;
    this._handLock = true;

    try {
      const entry = this.tables.get(tableDbId);
      if (!entry) return;
      logger.debug('tournament', `Hand complete on table ${tableDbId}`, {
        tournamentId: this.tournamentId,
        level: this.currentLevel,
        handsThisLevel: this.handsThisLevel,
        activeBots: this.activeBots.size,
      });

      // Count hand and check level advance
      this.handsThisLevel++;
      db.incrementLevelHands(this.tournamentId, this.currentLevel);

      if (this.handsThisLevel >= HANDS_PER_LEVEL) {
        await this._advanceBlindLevel(tableDbId);
      }

      // Detect busted players (chips = 0)
      const game = entry.game;
      for (const p of game.players) {
        if (p.chips === 0 && this.activeBots.has(p.id)) {
          await this._eliminateBot(p.id, tableDbId);
        }
      }

      // Update chip counts in DB for all active players at this table
      for (const p of game.players) {
        if (p.chips > 0) {
          db.updateSeatChips(this.tournamentId, p.id, p.chips);
        }
      }

      // Check if tournament is over
      if (this.activeBots.size <= 1) {
        await this._finishTournament();
        return;
      }

      // Balance and break tables if needed
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

  async _advanceBlindLevel(triggerTableId) {
    this.handsThisLevel = 0;
    this.currentLevel++;

    const levelConfig = getBlindLevel(this.currentLevel);
    db.startBlindLevel({
      tournament_id: this.tournamentId,
      level: this.currentLevel,
      ...levelConfig,
    });

    this._log(`Level ${this.currentLevel}: blinds ${levelConfig.small_blind}/${levelConfig.big_blind}${levelConfig.ante > 0 ? ` ante ${levelConfig.ante}` : ''}`);

    // Update blinds and antes on all running game instances
    for (const [, { game }] of this.tables) {
      game.smallBlind = levelConfig.small_blind;
      game.bigBlind = levelConfig.big_blind;
      game.ante = levelConfig.ante || 0;
    }
  }

  // ─────────────────────────────────────────────
  // ELIMINATION
  // ─────────────────────────────────────────────

  async _eliminateBot(botId, tableDbId) {
    if (!this.activeBots.has(botId)) return; // already eliminated

    const position = this.activeBots.size; // current remaining = their finish position
    const bot = this.activeBots.get(botId);

    this.activeBots.delete(botId);
    this.bustOrder.unshift(botId); // track bust order (earliest bust at end of array)

    db.bustEntry(this.tournamentId, botId, this.currentLevel, position);
    db.bustSeat(this.tournamentId, botId);
    db.closeSeatHistory(this.tournamentId, botId);

    this._log(`${bot.name} eliminated in position ${position}`);

    // Check for final table condition
    if (this.activeBots.size <= SEATS_PER_TABLE && this.tables.size > 1) {
      await this._consolidateToFinalTable();
    }
  }

  // ─────────────────────────────────────────────
  // TABLE BALANCING
  // ─────────────────────────────────────────────

  async _rebalanceTables() {
    if (this.tables.size <= 1) return;

    // Find tables that need breaking (too few players) or balancing
    const tableCounts = [...this.tables.entries()].map(([id, { game }]) => ({
      id,
      active: game.players.filter(p => p.chips > 0 && !p.disconnected).length,
    }));

    // Sort by player count
    tableCounts.sort((a, b) => a.active - b.active);
    const smallest = tableCounts[0];
    const largest = tableCounts[tableCounts.length - 1];

    // Break a table if it's too small and we can absorb its players
    if (smallest.active <= BREAK_THRESHOLD) {
      const canAbsorb = tableCounts.slice(1).some(t =>
        t.active + smallest.active <= SEATS_PER_TABLE
      );
      if (canAbsorb) {
        await this._breakTable(smallest.id);
        return;
      }
    }

    // Balance: move one player from the largest to the smallest if gap > 2
    if (largest.active - smallest.active > 2) {
      await this._movePlayerBetweenTables(largest.id, smallest.id);
    }
  }

  async _breakTable(tableDbId) {
    const entry = this.tables.get(tableDbId);
    if (!entry) return;

    const { game, tableRow } = entry;
    const activePlayers = game.players.filter(p => p.chips > 0 && !p.disconnected);

    this._log(`Breaking table ${tableRow.table_number}, moving ${activePlayers.length} players`);

    // Stop the game at this table
    game.stop();
    this.tables.delete(tableDbId);
    db.updateTournamentTable(tableDbId, { status: 'broken' });

    // Distribute players across remaining tables (round-robin)
    const remainingTables = [...this.tables.values()];
    for (let i = 0; i < activePlayers.length; i++) {
      const p = activePlayers[i];
      const target = remainingTables[i % remainingTables.length];
      await this._movePlayerToTable(p.id, p.chips, p.name, p.endpoint, target.tableRow.id);
    }
  }

  async _movePlayerBetweenTables(fromTableId, toTableId) {
    const fromEntry = this.tables.get(fromTableId);
    if (!fromEntry) return;

    // Pick the player furthest from the button (least positional advantage lost)
    const candidates = fromEntry.game.players.filter(p => p.chips > 0 && !p.disconnected);
    if (!candidates.length) return;
    const mover = candidates[Math.floor(Math.random() * candidates.length)];

    this._log(`Moving ${mover.name} from table ${fromEntry.tableRow.table_number}`);
    fromEntry.game.players.find(p => p.id === mover.id).disconnected = true;
    await this._movePlayerToTable(mover.id, mover.chips, mover.name, mover.endpoint, toTableId);
  }

  async _movePlayerToTable(botId, chips, name, endpoint, toTableDbId) {
    const toEntry = this.tables.get(toTableDbId);
    if (!toEntry) return;

    // Give the player the correct chip count at the new table
    const startingChips = toEntry.game.startingChips;
    toEntry.game.startingChips = chips; // temporarily override so addPlayer gives correct stack
    toEntry.game.addPlayer({ id: botId, name, endpoint });
    toEntry.game.startingChips = startingChips; // restore

    // Correct the chip count directly (addPlayer resets to startingChips)
    const player = toEntry.game.players.find(p => p.id === botId);
    if (player) player.chips = chips;

    // Update bot registry
    if (this.activeBots.has(botId)) {
      this.activeBots.get(botId).tableDbId = toTableDbId;
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
      reason: 'balance_move',
    });
  }

  // ─────────────────────────────────────────────
  // FINAL TABLE
  // ─────────────────────────────────────────────

  async _consolidateToFinalTable() {
    if (this.tables.size <= 1) return;

    this._log(`Consolidating to final table — ${this.activeBots.size} players remaining`);
    db.updateTournamentStatus(this.tournamentId, 'final_table');

    // Collect all surviving players with their current chips
    // Must use { botId, chips, name, endpoint } shape — matches what _startTable expects
    const survivors = [];
    for (const [tableDbId, { game }] of this.tables) {
      for (const p of game.players) {
        if (p.chips > 0 && !p.disconnected && this.activeBots.has(p.id)) {
          survivors.push({ botId: p.id, chips: p.chips, name: p.name, endpoint: p.endpoint });
        }
      }
      game.stop();
      db.updateTournamentTable(tableDbId, { status: 'broken' });
    }
    this.tables.clear();

    // Create final table
    const finalTableRow = db.createTournamentTable({
      tournament_id: this.tournamentId,
      table_number: 99, // final table convention
    });
    db.updateTournamentTable(finalTableRow.id, { status: 'active' });

    this._log(`Final table: ${survivors.map(s => s.name).join(', ')}`);
    this._startTable(finalTableRow, survivors, null);
    this._broadcastState();
  }

  // ─────────────────────────────────────────────
  // FINISH
  // ─────────────────────────────────────────────

  async _finishTournament() {
    this.running = false;

    // Stop all tables
    for (const [, { game }] of this.tables) game.stop();
    this.tables.clear();

    const winner = [...this.activeBots.values()][0];
    if (winner) {
      this._log(`Tournament winner: ${winner.name}`);
    }

    // Calculate payouts
    const tourn = db.getTournamentById(this.tournamentId);
    const allEntries = db.getEntries(this.tournamentId);
    const entrantCount = allEntries.length;
    const prizePool = entrantCount * tourn.buy_in;
    const payouts = calculatePayouts(prizePool, entrantCount);

    this._log(`Prize pool: ${prizePool} — paying ${payouts.length} places`);

    // Assign payouts: winner first, then bust order in reverse
    const finishOrder = winner ? [winner.botId] : [];
    // bustOrder[0] = last busted (2nd place), bustOrder[end] = first busted
    finishOrder.push(...this.bustOrder);

    for (let i = 0; i < finishOrder.length; i++) {
      const botId = finishOrder[i];
      const position = i + 1;
      const payoutEntry = payouts.find(p => p.position === position);
      const amount = payoutEntry?.amount || 0;
      db.setEntryPayout(this.tournamentId, botId, amount, position);
      if (amount > 0) {
        const name = db.getBotById(botId)?.name || botId;
        this._log(`${name} finishes ${position}${this._ordinal(position)} — payout: ${amount}`);
      }
    }

    db.updateTournamentStatus(this.tournamentId, 'finished');
    // Increment total_tournaments for every entrant
    for (const e of db.getEntries(this.tournamentId)) {
      db.ensureBotStats(e.bot_id);
      db.getDb().prepare(
        'UPDATE bot_stats SET total_tournaments = total_tournaments + 1, updated_at = unixepoch() WHERE bot_id = ?'
      ).run(e.bot_id);
    }
    const results = db.getTournamentResults(this.tournamentId);
    // Update total_net in bot_stats from payouts
    for (const r of results) {
      if (r.payout > 0) {
        db.getDb().prepare(
          'UPDATE bot_stats SET total_net = total_net + ?, updated_at = unixepoch() WHERE bot_id = (SELECT id FROM bots WHERE name = ?)'
        ).run(r.payout, r.bot_name);
      }
    }
    this.onFinished(this.tournamentId, results);
    this._broadcastState();
  }

  // ─────────────────────────────────────────────
  // LATE REGISTRATION
  // ─────────────────────────────────────────────

  addLateEntry(bot) {
    const tourn = db.getTournamentById(this.tournamentId);
    if (this.currentLevel > tourn.late_reg_ends_level) {
      throw new Error(`Late registration closed (past level ${tourn.late_reg_ends_level})`);
    }

    this.activeBots.set(bot.botId, {
      botId: bot.botId,
      name: bot.name,
      endpoint: bot.endpoint,
      chips: tourn.starting_chips,
      tableDbId: null,
    });

    // Seat at the table with fewest players
    const tablesBySize = [...this.tables.entries()]
      .map(([id, { game }]) => ({
        id,
        count: game.players.filter(p => p.chips > 0).length,
      }))
      .sort((a, b) => a.count - b.count);

    if (tablesBySize.length && tablesBySize[0].count < SEATS_PER_TABLE) {
      const target = tablesBySize[0];
      this._movePlayerToTable(bot.botId, tourn.starting_chips, bot.name, bot.endpoint, target.id);
    } else {
      // Need a new table — start one
      const tableCount = db.getTournamentTables(this.tournamentId).length;
      const tableRow = db.createTournamentTable({
        tournament_id: this.tournamentId,
        table_number: tableCount + 1,
      });
      this._startTable(tableRow, [this.activeBots.get(bot.botId)], tourn);
    }

    this._log(`${bot.name} joined as late entry`);
    this._broadcastState();
  }

  // ─────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────

  _buildState() {
    const tourn = db.getTournamentById(this.tournamentId);
    const levelConfig = getBlindLevel(this.currentLevel);
    const tableStates = [];

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

  _broadcastState() {
    this.onStateUpdate(this.tournamentId, this._buildState());
  }

  _log(msg, context = {}) {
    logger.info('tournament', msg, { tournamentId: this.tournamentId, ...context });
  }

  _logError(msg, context = {}, err = null) {
    logger.tournamentError('tournament', msg, this, context, err);
  }

  _ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
}

module.exports = { TournamentDirector };
