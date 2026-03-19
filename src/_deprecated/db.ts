/**
 * db.ts — SQLite database layer
 *
 * Uses Node's built-in node:sqlite (Node 22+).
 * All writes go through prepared statements. All reads return plain objects.
 *
 * Schema:
 *   users         — human accounts that own bots
 *   bots          — registered bot servers
 *   tables        — game room configurations
 *   table_seats   — which bots are sitting at which table
 *   games         — one completed (or running) game session per table
 *   game_players  — a bot's participation record in one game
 *   hands         — every hand dealt
 *   hand_players  — each player's hole cards, position, outcome per hand
 *   actions       — every action taken (fold/call/check/raise), in order
 *
 * Tournament tables:
 *   tournaments           — tournament configs and lifecycle state
 *   tournament_entries    — buy-in records per bot per tournament
 *   tournament_tables     — physical tables within a tournament
 *   tournament_seats      — which bots sit where right now
 *   tournament_blind_levels — blind progression history
 */

import { DatabaseSync } from "node:sqlite";
import * as crypto from "crypto";
import * as path from "path";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "poker.db");

let _db: DatabaseSync | null = null;

// Exported interfaces for type safety
export interface TournamentTable {
  id: string;
  tournament_id: string;
  table_number: number;
  game_id?: string;
  status?: string;
}

export function getDb(): DatabaseSync {
  if (_db) return _db;
  _db = new DatabaseSync(DB_PATH);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA synchronous = NORMAL"); // safe with WAL, much faster than FULL
  _db.exec("PRAGMA foreign_keys = ON");
  _db.exec("PRAGMA cache_size = -32000"); // 32MB page cache
  _db.exec("PRAGMA temp_store = MEMORY"); // temp tables in RAM
  return _db;
}

// ─────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────

export function migrate(): void {
  const db = getDb();
  db.exec(`

    -- Human accounts that own one or more bots
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      username    TEXT NOT NULL UNIQUE,
      email       TEXT UNIQUE,
      api_key     TEXT NOT NULL UNIQUE,       -- used to authenticate API calls
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Bot registrations. A user can have many bots.
    CREATE TABLE IF NOT EXISTS bots (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      name        TEXT NOT NULL UNIQUE,       -- display name, also used at the table
      endpoint    TEXT NOT NULL,              -- http://host:port/action
      description TEXT,
      active               INTEGER NOT NULL DEFAULT 1, -- 0 = retired/disabled
      last_validation      TEXT,    -- JSON validation report
      last_validation_score INTEGER, -- 0-100
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Game room configurations. A table can host many games over time.
    CREATE TABLE IF NOT EXISTS tables (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      small_blind     INTEGER NOT NULL DEFAULT 10,
      big_blind       INTEGER NOT NULL DEFAULT 20,
      starting_chips  INTEGER NOT NULL DEFAULT 1000,
      max_players     INTEGER NOT NULL DEFAULT 9,
      turn_timeout_ms INTEGER NOT NULL DEFAULT 10000,
      status          TEXT NOT NULL DEFAULT 'waiting', -- waiting | running | finished
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Which bots are seated at which table (many-to-many)
    CREATE TABLE IF NOT EXISTS table_seats (
      id         TEXT PRIMARY KEY,
      table_id   TEXT NOT NULL REFERENCES tables(id),
      bot_id     TEXT NOT NULL REFERENCES bots(id),
      joined_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      disconnected    INTEGER NOT NULL DEFAULT 0,  -- 1 = removed due to strikes
      disconnected_at INTEGER,
      UNIQUE(table_id, bot_id)
    );

    -- One game = one continuous run of a table from start to finish
    -- table_id references tournament_tables.id (no FK — tournament_tables created after games in old schema)
    CREATE TABLE IF NOT EXISTS games (
      id          TEXT PRIMARY KEY,
      table_id    TEXT NOT NULL,                     -- tournament_tables.id (no FK constraint)
      status      TEXT NOT NULL DEFAULT 'running',   -- running | finished
      total_hands INTEGER NOT NULL DEFAULT 0,
      started_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      finished_at INTEGER                            -- NULL while running
    );

    -- Each bot's participation record in a game
    CREATE TABLE IF NOT EXISTS game_players (
      id            TEXT PRIMARY KEY,
      game_id       TEXT NOT NULL REFERENCES games(id),
      bot_id        TEXT NOT NULL REFERENCES bots(id),
      start_chips   INTEGER NOT NULL,
      end_chips     INTEGER,                         -- NULL while game running
      rank          INTEGER,                         -- final finishing position (1 = winner)
      hands_played  INTEGER NOT NULL DEFAULT 0,
      hands_won     INTEGER NOT NULL DEFAULT 0,
      total_winnings INTEGER NOT NULL DEFAULT 0,     -- net chips won (can be negative)
      UNIQUE(game_id, bot_id)
    );

    -- Every hand dealt in a game
    CREATE TABLE IF NOT EXISTS hands (
      id              TEXT PRIMARY KEY,
      game_id         TEXT NOT NULL REFERENCES games(id),
      tournament_id   TEXT REFERENCES tournaments(id), -- denormalized for fast queries
      hand_number     INTEGER NOT NULL,
      dealer_bot_id   TEXT REFERENCES bots(id),
      small_blind     INTEGER NOT NULL DEFAULT 0,     -- blinds IN EFFECT for this hand
      big_blind       INTEGER NOT NULL DEFAULT 0,
      ante            INTEGER NOT NULL DEFAULT 0,
      players_in_hand INTEGER NOT NULL DEFAULT 0,     -- how many players were dealt in
      community_cards TEXT NOT NULL DEFAULT '[]',     -- JSON array of card strings
      pot             INTEGER NOT NULL DEFAULT 0,
      stage_reached   TEXT NOT NULL DEFAULT 'pre-flop',
      went_to_showdown INTEGER NOT NULL DEFAULT 0,    -- 1 if showdown occurred
      started_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      finished_at     INTEGER,
      duration_ms     INTEGER,                        -- hand duration in ms
      UNIQUE(game_id, hand_number)
    );

    -- Each player's record in a hand
    CREATE TABLE IF NOT EXISTS hand_players (
      id            TEXT PRIMARY KEY,
      hand_id       TEXT NOT NULL REFERENCES hands(id),
      bot_id        TEXT NOT NULL REFERENCES bots(id),
      position      TEXT NOT NULL,                   -- BTN, SB, BB, UTG, etc.
      hole_cards    TEXT NOT NULL DEFAULT '[]',       -- JSON ["A♠","K♥"] — filled at showdown or fold
      start_chips   INTEGER NOT NULL,
      end_chips     INTEGER NOT NULL DEFAULT 0,
      net           INTEGER NOT NULL DEFAULT 0,       -- end_chips - start_chips (includes ante+blind cost)
      won           INTEGER NOT NULL DEFAULT 0,       -- 1 if won any pot
      win_amount    INTEGER NOT NULL DEFAULT 0,       -- total chips won from pot(s)
      best_hand     TEXT,                             -- best 5-card hand name (ALL players, not just winner)
      best_hand_cards TEXT,                           -- JSON ["A♠","K♥","A♦","Q♣","J♠"]
      folded        INTEGER NOT NULL DEFAULT 0,
      folded_street TEXT,                             -- which street they folded on
      went_all_in   INTEGER NOT NULL DEFAULT 0,
      saw_flop      INTEGER NOT NULL DEFAULT 0,       -- VPIP tracking
      saw_showdown  INTEGER NOT NULL DEFAULT 0,
      UNIQUE(hand_id, bot_id)
    );

    -- Every individual action taken during a hand, in sequence
    -- Includes forced bets (ante, blind) as action_type 'ante'/'blind'
    CREATE TABLE IF NOT EXISTS actions (
      id           TEXT PRIMARY KEY,
      hand_id      TEXT NOT NULL REFERENCES hands(id),
      bot_id       TEXT NOT NULL REFERENCES bots(id),
      action_seq   INTEGER NOT NULL,                -- ordering within the hand
      stage        TEXT NOT NULL,                   -- pre-flop | flop | turn | river
      type         TEXT NOT NULL,
        -- ante | blind | fold | check | call | raise
      amount       INTEGER NOT NULL DEFAULT 0,      -- chips moved into pot
      raise_by     INTEGER NOT NULL DEFAULT 0,      -- raise increment (type=raise only)
      pot_before   INTEGER NOT NULL DEFAULT 0,      -- pot size before this action
      pot_after    INTEGER NOT NULL DEFAULT 0,      -- pot size after this action
      chips_before INTEGER NOT NULL DEFAULT 0,      -- actor's stack before action
      chips_after  INTEGER NOT NULL DEFAULT 0,      -- actor's stack after action
      is_penalty   INTEGER NOT NULL DEFAULT 0,      -- 1 = server folded on bot's behalf
      response_ms  INTEGER,                         -- bot response latency (NULL for forced bets)
      created_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Bot lifecycle events (strikes, disconnects, reconnects)
    CREATE TABLE IF NOT EXISTS bot_events (
      id           TEXT PRIMARY KEY,
      bot_id       TEXT NOT NULL REFERENCES bots(id),
      tournament_id TEXT REFERENCES tournaments(id),
      game_id      TEXT REFERENCES games(id),
      hand_id      TEXT REFERENCES hands(id),
      event_type   TEXT NOT NULL,
        -- strike | disconnect | reconnect | timeout | invalid_action
      detail       TEXT,                            -- JSON context (e.g. error message)
      created_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Materialized bot stats — updated after every hand
    -- Much faster than re-aggregating from actions on every leaderboard query
    CREATE TABLE IF NOT EXISTS bot_stats (
      bot_id           TEXT PRIMARY KEY REFERENCES bots(id),
      -- Volume
      total_hands      INTEGER NOT NULL DEFAULT 0,
      total_tournaments INTEGER NOT NULL DEFAULT 0,
      total_wins       INTEGER NOT NULL DEFAULT 0,   -- hands won
      total_net        INTEGER NOT NULL DEFAULT 0,   -- all-time chip net
      -- Pre-flop
      vpip             REAL NOT NULL DEFAULT 0,      -- voluntarily put chips in pot %
      pfr              REAL NOT NULL DEFAULT 0,      -- pre-flop raise %
      -- Post-flop
      wtsd             REAL NOT NULL DEFAULT 0,      -- went to showdown % (when saw flop)
      wmsd             REAL NOT NULL DEFAULT 0,      -- won money at showdown %
      aggression       REAL NOT NULL DEFAULT 0,      -- (raises+bets) / (calls+checks) post-flop
      -- Performance
      avg_response_ms  REAL NOT NULL DEFAULT 0,      -- average bot latency
      penalty_folds    INTEGER NOT NULL DEFAULT 0,   -- times server folded on their behalf
      disconnects      INTEGER NOT NULL DEFAULT 0,
      -- Counters for incremental update
      _vpip_hands      INTEGER NOT NULL DEFAULT 0,
      _vpip_count      INTEGER NOT NULL DEFAULT 0,
      _pfr_hands       INTEGER NOT NULL DEFAULT 0,
      _pfr_count       INTEGER NOT NULL DEFAULT 0,
      _flop_hands      INTEGER NOT NULL DEFAULT 0,
      _wtsd_count      INTEGER NOT NULL DEFAULT 0,
      _showdown_count  INTEGER NOT NULL DEFAULT 0,
      _wmsd_count      INTEGER NOT NULL DEFAULT 0,
      _postflop_actions INTEGER NOT NULL DEFAULT 0,
      _aggressive_actions INTEGER NOT NULL DEFAULT 0,
      _response_count  INTEGER NOT NULL DEFAULT 0,
      _response_total  INTEGER NOT NULL DEFAULT 0,
      updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Seat movement history (instead of overwriting tournament_seats)
    CREATE TABLE IF NOT EXISTS tournament_seat_history (
      id                   TEXT PRIMARY KEY,
      tournament_id        TEXT NOT NULL REFERENCES tournaments(id),
      tournament_table_id  TEXT NOT NULL REFERENCES tournament_tables(id),
      bot_id               TEXT NOT NULL REFERENCES bots(id),
      seat_number          INTEGER NOT NULL,
      chips_on_arrival     INTEGER NOT NULL,
      reason               TEXT NOT NULL DEFAULT 'initial',
        -- initial | table_break | balance_move | late_entry
      seated_at            INTEGER NOT NULL DEFAULT (unixepoch()),
      left_at              INTEGER                               -- NULL = still here
    );

    -- ─────────────────────────────────────────────
    -- TOURNAMENT TABLES
    -- ─────────────────────────────────────────────

    -- Tournament definitions (operator-configured, like tables.config.js)
    CREATE TABLE IF NOT EXISTS tournaments (
      id                  TEXT PRIMARY KEY,
      name                TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'registering',
        -- registering | running | final_table | finished | cancelled
      type                TEXT NOT NULL DEFAULT 'scheduled',
        -- scheduled | rolling
      buy_in              INTEGER NOT NULL,          -- chips cost to enter
      starting_chips      INTEGER NOT NULL,          -- chips each entrant receives
      max_players         INTEGER NOT NULL DEFAULT 180,
      min_players         INTEGER NOT NULL DEFAULT 2,
      players_per_table   INTEGER NOT NULL DEFAULT 9,
      turn_timeout_ms     INTEGER NOT NULL DEFAULT 10000,
      late_reg_ends_level INTEGER NOT NULL DEFAULT 4, -- last blind level allowing late entry
      rebuys_allowed      INTEGER NOT NULL DEFAULT 1, -- 1 = yes
      scheduled_start_at  INTEGER,                   -- unix epoch, NULL = rolling start
      started_at          INTEGER,
      finished_at         INTEGER,
      created_at          INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Buy-in records: one row per buy-in event (initial, rebuy, re_entry)
    -- Multiple rows allowed per bot per tournament (rebuy model)
    -- Active entry = finish_position IS NULL
    CREATE TABLE IF NOT EXISTS tournament_entries (
      id              TEXT PRIMARY KEY,
      tournament_id   TEXT NOT NULL REFERENCES tournaments(id),
      bot_id          TEXT NOT NULL REFERENCES bots(id),
      entry_type      TEXT NOT NULL DEFAULT 'initial', -- initial | rebuy | re_entry
      chips_at_entry  INTEGER NOT NULL,
      busted_at_level INTEGER,                        -- NULL = still in
      finish_position INTEGER,                        -- NULL = still in
      payout          INTEGER NOT NULL DEFAULT 0,
      entered_at      INTEGER NOT NULL DEFAULT (unixepoch())
      -- No UNIQUE constraint: rebuys create additional rows
    );

    -- Tournament tables (physical tables within a tournament)
    CREATE TABLE IF NOT EXISTS tournament_tables (
      id              TEXT PRIMARY KEY,
      tournament_id   TEXT NOT NULL REFERENCES tournaments(id),
      table_number    INTEGER NOT NULL,              -- 1, 2, 3...
      status          TEXT NOT NULL DEFAULT 'active', -- active | breaking | broken
      game_id         TEXT REFERENCES games(id),     -- currently running game
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(tournament_id, table_number)
    );

    -- Which bots are at which tournament table right now
    CREATE TABLE IF NOT EXISTS tournament_seats (
      id              TEXT PRIMARY KEY,
      tournament_id   TEXT NOT NULL REFERENCES tournaments(id),
      tournament_table_id TEXT NOT NULL REFERENCES tournament_tables(id),
      bot_id          TEXT NOT NULL REFERENCES bots(id),
      seat_number     INTEGER NOT NULL,              -- 1-9
      chips           INTEGER NOT NULL,
      status          TEXT NOT NULL DEFAULT 'active', -- active | busted | moved
      seated_at       INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(tournament_id, bot_id)                  -- bot can only be at one table at a time
    );

    -- Blind level log — records when each level started
    CREATE TABLE IF NOT EXISTS tournament_blind_levels (
      id              TEXT PRIMARY KEY,
      tournament_id   TEXT NOT NULL REFERENCES tournaments(id),
      level           INTEGER NOT NULL,
      small_blind     INTEGER NOT NULL,
      big_blind       INTEGER NOT NULL,
      ante            INTEGER NOT NULL DEFAULT 0,
      hands_at_level  INTEGER NOT NULL DEFAULT 0,   -- hands played during this level so far
      started_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      ended_at        INTEGER
    );

    -- Tournament indexes
    CREATE INDEX IF NOT EXISTS idx_tent_tournament  ON tournament_entries(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tent_bot         ON tournament_entries(bot_id);
    CREATE INDEX IF NOT EXISTS idx_ttbl_tournament  ON tournament_tables(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tseat_tournament ON tournament_seats(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tseat_bot        ON tournament_seats(bot_id);
    CREATE INDEX IF NOT EXISTS idx_tblind_tournament ON tournament_blind_levels(tournament_id);

    -- Indexes for the most common query patterns
    CREATE INDEX IF NOT EXISTS idx_games_table      ON games(table_id);
    CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_players_bot  ON game_players(bot_id);
    CREATE INDEX IF NOT EXISTS idx_hands_game        ON hands(game_id);
    CREATE INDEX IF NOT EXISTS idx_hand_players_hand ON hand_players(hand_id);
    CREATE INDEX IF NOT EXISTS idx_hand_players_bot  ON hand_players(bot_id);
    CREATE INDEX IF NOT EXISTS idx_actions_hand      ON actions(hand_id);
    CREATE INDEX IF NOT EXISTS idx_actions_bot       ON actions(bot_id);
    CREATE INDEX IF NOT EXISTS idx_bots_user         ON bots(user_id);
    CREATE INDEX IF NOT EXISTS idx_hands_tournament   ON hands(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_hands_started      ON hands(started_at);
    CREATE INDEX IF NOT EXISTS idx_hp_saw_flop        ON hand_players(bot_id, saw_flop);
    CREATE INDEX IF NOT EXISTS idx_hp_showdown        ON hand_players(bot_id, saw_showdown);
    CREATE INDEX IF NOT EXISTS idx_actions_type       ON actions(type);
    CREATE INDEX IF NOT EXISTS idx_actions_stage      ON actions(hand_id, stage);
    CREATE INDEX IF NOT EXISTS idx_bot_events_bot     ON bot_events(bot_id);
    CREATE INDEX IF NOT EXISTS idx_bot_events_type    ON bot_events(event_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_seat_history_bot   ON tournament_seat_history(tournament_id, bot_id);
    CREATE INDEX IF NOT EXISTS idx_table_seats_table ON table_seats(table_id);
  `);

  console.log("[db] Schema migrated successfully");
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// SEC-009: Cryptographically strong API key generation (256-bit)
function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

// SEC-001: Hash an API key for storage — SHA-256, hex output
export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

// ─────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────

export function createUser({
  username,
  email,
}: {
  username: string;
  email?: string;
}): any {
  const db = getDb();
  const id = uid();
  const rawKey = generateApiKey(); // SEC-009: strong random key
  const hashedKey = hashApiKey(rawKey); // SEC-001: store only the hash
  db.prepare(
    `
    INSERT INTO users (id, username, email, api_key)
    VALUES (?, ?, ?, ?)
  `,
  ).run(id, username, email || null, hashedKey);
  const user = getUserById(id);
  // Return the raw key — only time it's available in plaintext
  return { ...user, api_key: rawKey };
}

export function getUserById(id: string): any {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function getUserByApiKey(rawKey: string): any {
  // SEC-001: compare against stored hash, never store or log the raw key
  const hashed = hashApiKey(rawKey);
  return getDb().prepare("SELECT * FROM users WHERE api_key = ?").get(hashed);
}

// ─────────────────────────────────────────────────────────────
// BOTS
// ─────────────────────────────────────────────────────────────

export function createBot({
  user_id,
  name,
  endpoint,
  description,
}: {
  user_id: string;
  name: string;
  endpoint: string;
  description?: string;
}): any {
  const db = getDb();
  const id = uid();
  db.prepare(
    `
    INSERT INTO bots (id, user_id, name, endpoint, description)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(id, user_id, name, endpoint, description || null);
  return getBotById(id);
}

export function getBotById(id: string): any {
  return getDb().prepare("SELECT * FROM bots WHERE id = ?").get(id);
}

export function getBotByName(name: string): any {
  return getDb().prepare("SELECT * FROM bots WHERE name = ?").get(name);
}

export function getBotsByUser(user_id: string): any[] {
  return getDb()
    .prepare("SELECT * FROM bots WHERE user_id = ? ORDER BY created_at")
    .all(user_id);
}

export function updateBotEndpoint(id: string, endpoint: string): void {
  getDb()
    .prepare(
      `
    UPDATE bots SET endpoint = ?, updated_at = ? WHERE id = ?
  `,
    )
    .run(endpoint, now(), id);
}

// ─────────────────────────────────────────────────────────────
// TABLES
// ─────────────────────────────────────────────────────────────

export function createTable({
  id,
  name,
  small_blind,
  big_blind,
  starting_chips,
  max_players,
  turn_timeout_ms,
}: {
  id?: string;
  name: string;
  small_blind?: number;
  big_blind?: number;
  starting_chips?: number;
  max_players?: number;
  turn_timeout_ms?: number;
}): any {
  const db = getDb();
  const tableId = id || uid();
  // INSERT OR IGNORE — idempotent, safe to call on every server start
  db.prepare(
    `
    INSERT OR IGNORE INTO tables (id, name, small_blind, big_blind, starting_chips, max_players, turn_timeout_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    tableId,
    name,
    small_blind || 10,
    big_blind || 20,
    starting_chips || 1000,
    max_players || 9,
    turn_timeout_ms || 10000,
  );
  return getTableById(tableId);
}

export function getTableById(id: string): any {
  return getDb().prepare("SELECT * FROM tables WHERE id = ?").get(id);
}

export function getAllTables(): any[] {
  return getDb().prepare("SELECT * FROM tables ORDER BY created_at DESC").all();
}

export function updateTableStatus(id: string, status: string): void {
  getDb().prepare("UPDATE tables SET status = ? WHERE id = ?").run(status, id);
}

export function addBotToTable(table_id: string, bot_id: string): void {
  const db = getDb();
  const id = uid();
  db.prepare(
    `
    INSERT OR IGNORE INTO table_seats (id, table_id, bot_id) VALUES (?, ?, ?)
  `,
  ).run(id, table_id, bot_id);
}

// SEC-008: atomic seat check + insert in a single exclusive transaction
// Prevents race condition where two concurrent requests both pass the seated check
export function atomicJoinTable(
  table_id: string,
  bot_id: string,
  max_players: number,
): { ok: boolean; error?: string } {
  const db = getDb();

  try {
    db.exec("BEGIN EXCLUSIVE");

    const seated: any = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM table_seats WHERE table_id = ? AND disconnected = 0",
      )
      .get(table_id);

    if (seated.cnt >= max_players) {
      db.exec("ROLLBACK");
      return { ok: false, error: `Table is full (max ${max_players} players)` };
    }

    const alreadySeated = db
      .prepare("SELECT id FROM table_seats WHERE table_id = ? AND bot_id = ?")
      .get(table_id, bot_id);

    if (alreadySeated) {
      db.exec("ROLLBACK");
      return { ok: false, error: "This bot is already seated at this table" };
    }

    db.prepare(
      "INSERT INTO table_seats (id, table_id, bot_id) VALUES (?, ?, ?)",
    ).run(uid(), table_id, bot_id);

    db.exec("COMMIT");
    return { ok: true };
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    return { ok: false, error: (e as Error).message };
  }
}

export function getTableSeats(table_id: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT ts.*, b.name, b.endpoint
    FROM table_seats ts
    JOIN bots b ON b.id = ts.bot_id
    WHERE ts.table_id = ?
    ORDER BY ts.joined_at
  `,
    )
    .all(table_id);
}

// ─────────────────────────────────────────────────────────────
// GAMES
// ─────────────────────────────────────────────────────────────

export function createGame(table_id: string): any {
  const db = getDb();
  const id = uid();
  db.prepare(
    `
    INSERT INTO games (id, table_id) VALUES (?, ?)
  `,
  ).run(id, table_id);
  return getGameById(id);
}

export function getGameById(id: string): any {
  return getDb().prepare("SELECT * FROM games WHERE id = ?").get(id);
}

export function getGamesByTable(table_id: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT * FROM games WHERE table_id = ? ORDER BY started_at DESC
  `,
    )
    .all(table_id);
}

export function finishGame(id: string, total_hands: number): void {
  getDb()
    .prepare(
      `
    UPDATE games SET status = 'finished', finished_at = ?, total_hands = ? WHERE id = ?
  `,
    )
    .run(now(), total_hands, id);
}

// ─────────────────────────────────────────────────────────────
// GAME PLAYERS
// ─────────────────────────────────────────────────────────────

export function addGamePlayer(
  game_id: string,
  bot_id: string,
  start_chips: number,
): void {
  const db = getDb();
  const id = uid();
  db.prepare(
    `
    INSERT OR IGNORE INTO game_players (id, game_id, bot_id, start_chips)
    VALUES (?, ?, ?, ?)
  `,
  ).run(id, game_id, bot_id, start_chips);
}

export function finalizeGamePlayer(
  game_id: string,
  bot_id: string,
  end_chips: number,
  rank: number,
): void {
  const db = getDb();
  const gp: any = db
    .prepare("SELECT * FROM game_players WHERE game_id = ? AND bot_id = ?")
    .get(game_id, bot_id);
  if (!gp) return;
  db.prepare(
    `
    UPDATE game_players
    SET end_chips = ?, rank = ?, total_winnings = ?
    WHERE game_id = ? AND bot_id = ?
  `,
  ).run(end_chips, rank, end_chips - gp.start_chips, game_id, bot_id);
}

export function incrementHandsPlayed(game_id: string, bot_id: string): void {
  getDb()
    .prepare(
      `
    UPDATE game_players SET hands_played = hands_played + 1
    WHERE game_id = ? AND bot_id = ?
  `,
    )
    .run(game_id, bot_id);
}

export function incrementHandsWon(
  game_id: string,
  bot_id: string,
  amount: number,
): void {
  getDb()
    .prepare(
      `
    UPDATE game_players
    SET hands_won = hands_won + 1,
        total_winnings = total_winnings + ?
    WHERE game_id = ? AND bot_id = ?
  `,
    )
    .run(amount, game_id, bot_id);
}

// ─────────────────────────────────────────────────────────────
// HANDS
// ─────────────────────────────────────────────────────────────

export function createHand({
  game_id,
  tournament_id,
  hand_number,
  dealer_bot_id,
  small_blind,
  big_blind,
  ante,
  players_in_hand,
}: {
  game_id: string;
  tournament_id?: string;
  hand_number: number;
  dealer_bot_id?: string;
  small_blind?: number;
  big_blind?: number;
  ante?: number;
  players_in_hand?: number;
}): any {
  const db = getDb();
  const id = uid();
  db.prepare(
    `
    INSERT INTO hands (id, game_id, tournament_id, hand_number, dealer_bot_id,
                       small_blind, big_blind, ante, players_in_hand)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    game_id,
    tournament_id || null,
    hand_number,
    dealer_bot_id || null,
    small_blind || 0,
    big_blind || 0,
    ante || 0,
    players_in_hand || 0,
  );
  return getHandById(id);
}

export function getHandById(id: string): any {
  return getDb().prepare("SELECT * FROM hands WHERE id = ?").get(id);
}

export function getHandsByGame(game_id: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT * FROM hands WHERE game_id = ? ORDER BY hand_number
  `,
    )
    .all(game_id);
}

export function finalizeHand(
  id: string,
  {
    community_cards,
    pot,
    stage_reached,
    went_to_showdown,
    started_at_ms,
  }: {
    community_cards: string[];
    pot: number;
    stage_reached: string;
    went_to_showdown: boolean;
    started_at_ms: number;
  },
): void {
  const dur = started_at_ms ? Date.now() - started_at_ms : null;
  getDb()
    .prepare(
      `
    UPDATE hands
    SET community_cards = ?, pot = ?, stage_reached = ?,
        went_to_showdown = ?, finished_at = unixepoch(), duration_ms = ?
    WHERE id = ?
  `,
    )
    .run(
      JSON.stringify(community_cards),
      pot,
      stage_reached,
      went_to_showdown ? 1 : 0,
      dur,
      id,
    );
}

// ─────────────────────────────────────────────────────────────
// HAND PLAYERS
// ─────────────────────────────────────────────────────────────

export function addHandPlayer({
  hand_id,
  bot_id,
  position,
  hole_cards,
  start_chips,
}: {
  hand_id: string;
  bot_id: string;
  position: string;
  hole_cards?: string[];
  start_chips: number;
}): void {
  const db = getDb();
  const id = uid();
  db.prepare(
    `
    INSERT OR IGNORE INTO hand_players
      (id, hand_id, bot_id, position, hole_cards, start_chips, end_chips)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    hand_id,
    bot_id,
    position,
    JSON.stringify(hole_cards || []),
    start_chips,
    start_chips,
  );
}

export function finalizeHandPlayer(
  hand_id: string,
  bot_id: string,
  {
    end_chips,
    won,
    win_amount,
    best_hand,
    best_hand_cards,
    folded,
    folded_street,
    went_all_in,
    saw_showdown,
    hole_cards,
  }: {
    end_chips: number;
    won: boolean;
    win_amount?: number;
    best_hand?: string;
    best_hand_cards?: string[];
    folded: boolean;
    folded_street?: string;
    went_all_in: boolean;
    saw_showdown: boolean;
    hole_cards?: string[];
  },
): void {
  const row: any = getDb()
    .prepare(
      "SELECT start_chips FROM hand_players WHERE hand_id = ? AND bot_id = ?",
    )
    .get(hand_id, bot_id);
  const net = end_chips - (row?.start_chips || 0);
  const holeCardsJson = JSON.stringify(hole_cards || []);
  getDb()
    .prepare(
      `
    UPDATE hand_players
    SET end_chips = ?, net = ?, won = ?, win_amount = ?,
        best_hand = ?, best_hand_cards = ?,
        folded = ?, folded_street = ?, went_all_in = ?,
        saw_showdown = ?,
        hole_cards = CASE WHEN ? != '[]' THEN ? ELSE hole_cards END
    WHERE hand_id = ? AND bot_id = ?
  `,
    )
    .run(
      end_chips,
      net,
      won ? 1 : 0,
      win_amount || 0,
      best_hand || null,
      best_hand_cards ? JSON.stringify(best_hand_cards) : null,
      folded ? 1 : 0,
      folded_street || null,
      went_all_in ? 1 : 0,
      saw_showdown ? 1 : 0,
      holeCardsJson,
      holeCardsJson,
      hand_id,
      bot_id,
    );
}

// ─────────────────────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────────────────────

export function recordAction({
  hand_id,
  bot_id,
  action_seq,
  stage,
  type,
  amount,
  raise_by,
  pot_before,
  pot_after,
  chips_before,
  chips_after,
  is_penalty,
  response_ms,
}: {
  hand_id: string;
  bot_id: string;
  action_seq: number;
  stage: string;
  type: string;
  amount?: number;
  raise_by?: number;
  pot_before?: number;
  pot_after?: number;
  chips_before?: number;
  chips_after?: number;
  is_penalty?: boolean;
  response_ms?: number;
}): void {
  getDb()
    .prepare(
      `
    INSERT INTO actions
      (id, hand_id, bot_id, action_seq, stage, type, amount, raise_by,
       pot_before, pot_after, chips_before, chips_after, is_penalty, response_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      uid(),
      hand_id,
      bot_id,
      action_seq,
      stage,
      type,
      amount || 0,
      raise_by || 0,
      pot_before || 0,
      pot_after || 0,
      chips_before || 0,
      chips_after || 0,
      is_penalty ? 1 : 0,
      response_ms || null,
    );
}

export function getActionsByHand(hand_id: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT a.*, b.name as bot_name
    FROM actions a
    JOIN bots b ON b.id = a.bot_id
    WHERE a.hand_id = ?
    ORDER BY a.action_seq
  `,
    )
    .all(hand_id);
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS QUERIES
// ─────────────────────────────────────────────────────────────

// All-time leaderboard: bots ranked by total winnings across all games
export function getLeaderboard(limit = 20): any[] {
  return getDb()
    .prepare(
      `
    SELECT
      b.name,
      b.id as bot_id,
      COUNT(DISTINCT gp.game_id)  AS games_played,
      SUM(gp.hands_played)        AS total_hands,
      SUM(gp.hands_won)           AS total_wins,
      SUM(gp.total_winnings)      AS total_winnings,
      ROUND(
        100.0 * SUM(gp.hands_won) / NULLIF(SUM(gp.hands_played), 0),
        1
      ) AS win_rate_pct
    FROM game_players gp
    JOIN bots b ON b.id = gp.bot_id
    WHERE gp.end_chips IS NOT NULL
    GROUP BY b.id
    ORDER BY total_winnings DESC
    LIMIT ?
  `,
    )
    .all(limit);
}

// Per-bot stats for a single game
export function getBotGameStats(game_id: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT
      b.name,
      gp.start_chips,
      gp.end_chips,
      gp.rank,
      gp.hands_played,
      gp.hands_won,
      gp.total_winnings
    FROM game_players gp
    JOIN bots b ON b.id = gp.bot_id
    WHERE gp.game_id = ?
    ORDER BY gp.rank ASC NULLS LAST
  `,
    )
    .all(game_id);
}

// Hand history for a game with player outcomes
export function getHandHistory(game_id: string, limit = 50, offset = 0): any[] {
  return getDb()
    .prepare(
      `
    SELECT
      h.hand_number,
      h.community_cards,
      h.pot,
      h.stage_reached,
      h.started_at,
      h.finished_at,
      json_group_array(json_object(
        'bot',       b.name,
        'position',  hp.position,
        'hole_cards', hp.hole_cards,
        'net',       hp.net,
        'won',       hp.won,
        'best_hand', hp.best_hand,
        'folded',    hp.folded
      )) AS players
    FROM hands h
    JOIN hand_players hp ON hp.hand_id = h.id
    JOIN bots b ON b.id = hp.bot_id
    WHERE h.game_id = ?
    GROUP BY h.id
    ORDER BY h.hand_number DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(game_id, limit, offset);
}

// Hand history for an entire tournament (all tables, all games)
export function getTournamentHandHistory(
  tournament_id: string,
  limit = 50,
  offset = 0,
): any[] {
  return getDb()
    .prepare(
      `
    SELECT
      h.id           AS hand_id,
      h.hand_number,
      h.community_cards,
      h.pot,
      h.stage_reached,
      h.small_blind,
      h.big_blind,
      h.ante,
      h.went_to_showdown,
      h.duration_ms,
      h.started_at,
      h.finished_at,
      tt.table_number,
      json_group_array(json_object(
        'bot',            b.name,
        'position',       hp.position,
        'hole_cards',     hp.hole_cards,
        'net',            hp.net,
        'won',            hp.won,
        'best_hand',      hp.best_hand,
        'best_hand_cards', hp.best_hand_cards,
        'folded',         hp.folded,
        'folded_street',  hp.folded_street,
        'went_all_in',    hp.went_all_in
      )) AS players
    FROM hands h
    JOIN hand_players hp ON hp.hand_id = h.id
    JOIN bots b ON b.id = hp.bot_id
    JOIN games g ON g.id = h.game_id
    JOIN tournament_tables tt ON tt.game_id = g.id
    WHERE h.tournament_id = ?
    GROUP BY h.id
    ORDER BY h.started_at DESC, h.hand_number DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(tournament_id, limit, offset);
}

// ─────────────────────────────────────────────────────────────
// TOURNAMENTS
// ─────────────────────────────────────────────────────────────

export function createTournament(config: any): any {
  const db = getDb();
  const id = config.id || uid();
  db.prepare(
    `
    INSERT OR IGNORE INTO tournaments
      (id, name, type, buy_in, starting_chips, max_players, min_players,
       players_per_table, turn_timeout_ms, late_reg_ends_level,
       rebuys_allowed, scheduled_start_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `,
  ).run(
    id,
    config.name,
    config.type || "scheduled",
    config.buy_in,
    config.starting_chips,
    config.max_players || 180,
    config.min_players || 2,
    config.players_per_table || 9,
    config.turn_timeout_ms || 10000,
    config.late_reg_ends_level || 4,
    config.rebuys_allowed !== false ? 1 : 0,
    config.scheduled_start_at || null,
  );
  return getTournamentById(id);
}

export function getTournamentById(id: string): any {
  return getDb().prepare("SELECT * FROM tournaments WHERE id = ?").get(id);
}

export function getAllTournaments(): any[] {
  return getDb()
    .prepare("SELECT * FROM tournaments ORDER BY created_at DESC")
    .all();
}

export function updateTournamentStatus(id: string, status: string): void {
  const updates: any = { status };
  if (status === "running") updates.started_at = now();
  if (status === "finished") updates.finished_at = now();
  const sets = Object.keys(updates)
    .map((k) => `${k} = ?`)
    .join(", ");
  getDb()
    .prepare(`UPDATE tournaments SET ${sets} WHERE id = ?`)
    .run(...Object.values(updates), id);
}

// ── Entries ───────────────────────────────────────────────────

export function createEntry({
  tournament_id,
  bot_id,
  chips_at_entry,
  entry_type = "initial",
}: {
  tournament_id: string;
  bot_id: string;
  chips_at_entry: number;
  entry_type?: string;
}): any {
  const db = getDb();
  const id = uid();
  db.prepare(
    `
    INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, chips_at_entry)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(id, tournament_id, bot_id, entry_type, chips_at_entry);
  return db.prepare("SELECT * FROM tournament_entries WHERE id = ?").get(id);
}

export function getEntry(tournament_id: string, bot_id: string): any {
  // Return the active entry (finish_position IS NULL), or the most recent if none active
  return getDb()
    .prepare(
      `
    SELECT * FROM tournament_entries
    WHERE tournament_id = ? AND bot_id = ?
    ORDER BY (finish_position IS NULL) DESC, entered_at DESC
    LIMIT 1
  `,
    )
    .get(tournament_id, bot_id);
}

export function getEntries(tournament_id: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT te.*, b.name as bot_name, b.endpoint
    FROM tournament_entries te
    JOIN bots b ON b.id = te.bot_id
    WHERE te.tournament_id = ?
    ORDER BY te.entered_at
  `,
    )
    .all(tournament_id);
}

export function bustEntry(
  tournament_id: string,
  bot_id: string,
  level: number,
  position: number,
): void {
  getDb()
    .prepare(
      `
    UPDATE tournament_entries
    SET busted_at_level = ?, finish_position = ?
    WHERE tournament_id = ? AND bot_id = ? AND finish_position IS NULL
  `,
    )
    .run(level, position, tournament_id, bot_id);
}

export function setEntryPayout(
  tournament_id: string,
  bot_id: string,
  payout: number,
  position: number,
): void {
  // Update the most recent entry for this bot — either active or already busted
  // (busted bots have finish_position set, but still need payout assigned)
  getDb()
    .prepare(
      `
    UPDATE tournament_entries SET payout = ?, finish_position = ?
    WHERE id = (
      SELECT id FROM tournament_entries
      WHERE tournament_id = ? AND bot_id = ?
      ORDER BY entered_at DESC LIMIT 1
    )
  `,
    )
    .run(payout, position, tournament_id, bot_id);
}

export function countActiveEntries(tournament_id: string): number {
  // Count distinct bots with an active entry
  const row: any = getDb()
    .prepare(
      `
    SELECT COUNT(DISTINCT bot_id) as cnt FROM tournament_entries
    WHERE tournament_id = ? AND finish_position IS NULL
  `,
    )
    .get(tournament_id);
  return row.cnt;
}

// ── Tournament Tables ─────────────────────────────────────────

export function createTournamentTable({
  tournament_id,
  table_number,
}: {
  tournament_id: string;
  table_number: number;
}): any {
  const db = getDb();
  const id = uid();
  db.prepare(
    `
    INSERT INTO tournament_tables (id, tournament_id, table_number)
    VALUES (?, ?, ?)
  `,
  ).run(id, tournament_id, table_number);
  return db.prepare("SELECT * FROM tournament_tables WHERE id = ?").get(id);
}

export function getTournamentTables(tournament_id: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT * FROM tournament_tables WHERE tournament_id = ? ORDER BY table_number
  `,
    )
    .all(tournament_id);
}

export function updateTournamentTable(id: string, updates: any): void {
  const sets = Object.keys(updates)
    .map((k) => `${k} = ?`)
    .join(", ");
  getDb()
    .prepare(`UPDATE tournament_tables SET ${sets} WHERE id = ?`)
    .run(...Object.values(updates), id);
}

// ── Tournament Seats ──────────────────────────────────────────

export function seatBot({
  tournament_id,
  tournament_table_id,
  bot_id,
  seat_number,
  chips,
}: {
  tournament_id: string;
  tournament_table_id: string;
  bot_id: string;
  seat_number: number;
  chips: number;
}): void {
  const db = getDb();
  const id = uid();
  // Upsert — bot may be moving tables
  db.prepare(
    `
    INSERT INTO tournament_seats (id, tournament_id, tournament_table_id, bot_id, seat_number, chips)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tournament_id, bot_id) DO UPDATE SET
      tournament_table_id = excluded.tournament_table_id,
      seat_number = excluded.seat_number,
      chips = excluded.chips,
      status = 'active',
      seated_at = unixepoch()
  `,
  ).run(id, tournament_id, tournament_table_id, bot_id, seat_number, chips);
}

export function getTournamentSeats(tournament_id: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT ts.*, b.name as bot_name, b.endpoint,
           tt.table_number
    FROM tournament_seats ts
    JOIN bots b ON b.id = ts.bot_id
    JOIN tournament_tables tt ON tt.id = ts.tournament_table_id
    WHERE ts.tournament_id = ? AND ts.status = 'active'
    ORDER BY tt.table_number, ts.seat_number
  `,
    )
    .all(tournament_id);
}

export function getSeatsAtTable(tournament_table_id: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT ts.*, b.name as bot_name, b.endpoint
    FROM tournament_seats ts
    JOIN bots b ON b.id = ts.bot_id
    WHERE ts.tournament_table_id = ? AND ts.status = 'active'
    ORDER BY ts.seat_number
  `,
    )
    .all(tournament_table_id);
}

export function updateSeatChips(
  tournament_id: string,
  bot_id: string,
  chips: number,
): void {
  getDb()
    .prepare(
      `
    UPDATE tournament_seats SET chips = ? WHERE tournament_id = ? AND bot_id = ?
  `,
    )
    .run(chips, tournament_id, bot_id);
}

export function bustSeat(tournament_id: string, bot_id: string): void {
  getDb()
    .prepare(
      `
    UPDATE tournament_seats SET status = 'busted' WHERE tournament_id = ? AND bot_id = ?
  `,
    )
    .run(tournament_id, bot_id);
}

// ── Blind Levels ──────────────────────────────────────────────

export function startBlindLevel({
  tournament_id,
  level,
  small_blind,
  big_blind,
  ante,
}: {
  tournament_id: string;
  level: number;
  small_blind: number;
  big_blind: number;
  ante: number;
}): any {
  const db = getDb();
  // Close previous level
  db.prepare(
    `
    UPDATE tournament_blind_levels SET ended_at = ? WHERE tournament_id = ? AND ended_at IS NULL
  `,
  ).run(now(), tournament_id);
  const id = uid();
  db.prepare(
    `
    INSERT INTO tournament_blind_levels (id, tournament_id, level, small_blind, big_blind, ante)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(id, tournament_id, level, small_blind, big_blind, ante);
  return db
    .prepare("SELECT * FROM tournament_blind_levels WHERE id = ?")
    .get(id);
}

export function incrementLevelHands(
  tournament_id: string,
  level: number,
): void {
  getDb()
    .prepare(
      `
    UPDATE tournament_blind_levels SET hands_at_level = hands_at_level + 1
    WHERE tournament_id = ? AND level = ? AND ended_at IS NULL
  `,
    )
    .run(tournament_id, level);
}

export function getCurrentLevel(tournament_id: string): any {
  return getDb()
    .prepare(
      `
    SELECT * FROM tournament_blind_levels
    WHERE tournament_id = ? AND ended_at IS NULL
    ORDER BY level DESC LIMIT 1
  `,
    )
    .get(tournament_id);
}

// ── Analytics ─────────────────────────────────────────────────

export function getTournamentResults(tournament_id: string): any[] {
  // One row per bot: aggregate across all entries (initial + rebuys)
  // Use best finish_position and sum of payouts across all entries
  return getDb()
    .prepare(
      `
    SELECT
      MIN(te.finish_position)        AS finish_position,
      SUM(te.payout)                 AS payout,
      MIN(te.busted_at_level)        AS busted_at_level,
      te.bot_id,
      b.name                         AS bot_name,
      u.username                     AS owner,
      COUNT(*)                       AS total_entries
    FROM tournament_entries te
    JOIN bots b ON b.id = te.bot_id
    JOIN users u ON u.id = b.user_id
    WHERE te.tournament_id = ?
    GROUP BY te.bot_id
    ORDER BY MIN(te.finish_position) ASC NULLS LAST
  `,
    )
    .all(tournament_id);
}

// ─────────────────────────────────────────────────────────────
// BOT EVENTS
// ─────────────────────────────────────────────────────────────

export function recordBotEvent({
  bot_id,
  tournament_id,
  game_id,
  hand_id,
  event_type,
  detail,
}: {
  bot_id: string;
  tournament_id?: string;
  game_id?: string;
  hand_id?: string;
  event_type: string;
  detail?: any;
}): void {
  getDb()
    .prepare(
      `
    INSERT INTO bot_events (id, bot_id, tournament_id, game_id, hand_id, event_type, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      uid(),
      bot_id,
      tournament_id || null,
      game_id || null,
      hand_id || null,
      event_type,
      detail ? JSON.stringify(detail) : null,
    );
}

export function getBotEvents(bot_id: string, limit = 50): any[] {
  return getDb()
    .prepare(
      `
    SELECT * FROM bot_events WHERE bot_id = ?
    ORDER BY created_at DESC LIMIT ?
  `,
    )
    .all(bot_id, limit);
}

// ─────────────────────────────────────────────────────────────
// BOT STATS (materialized, updated after each hand)
// ─────────────────────────────────────────────────────────────

export function ensureBotStats(bot_id: string): void {
  getDb()
    .prepare(
      `
    INSERT OR IGNORE INTO bot_stats (bot_id) VALUES (?)
  `,
    )
    .run(bot_id);
}

/**
 * Update materialized stats for a bot after a hand completes.
 * Called by the recorder with the hand_player row data.
 */
export function updateBotStats(
  bot_id: string,
  {
    won,
    saw_flop,
    saw_showdown,
    won_at_showdown,
    raised_preflop,
    put_chips_in_voluntarily,
    postflop_actions,
    aggressive_actions,
    response_ms_total,
    response_count,
    penalty_fold,
  }: {
    won: boolean;
    saw_flop: boolean;
    saw_showdown: boolean;
    won_at_showdown: boolean;
    raised_preflop: boolean;
    put_chips_in_voluntarily: boolean;
    postflop_actions: number;
    aggressive_actions: number;
    response_ms_total: number;
    response_count: number;
    penalty_fold: boolean;
  },
): void {
  ensureBotStats(bot_id);
  const db = getDb();
  // Fetch current counters
  const s: any = db
    .prepare("SELECT * FROM bot_stats WHERE bot_id = ?")
    .get(bot_id);
  if (!s) return;

  const newTotalHands = s.total_hands + 1;
  const newTotalWins = s.total_wins + (won ? 1 : 0);
  const newPenalty = s.penalty_folds + (penalty_fold ? 1 : 0);

  // VPIP (voluntarily put chips in pot pre-flop)
  const newVpipHands = s._vpip_hands + 1;
  const newVpipCount = s._vpip_count + (put_chips_in_voluntarily ? 1 : 0);

  // PFR (pre-flop raise)
  const newPfrHands = s._pfr_hands + 1;
  const newPfrCount = s._pfr_count + (raised_preflop ? 1 : 0);

  // WTSD / WMSD (went/won money at showdown)
  const newFlopHands = s._flop_hands + (saw_flop ? 1 : 0);
  const newWtsdCount = s._wtsd_count + (saw_showdown ? 1 : 0);
  const newShowdowns = s._showdown_count + (saw_showdown ? 1 : 0);
  const newWmsdCount = s._wmsd_count + (won_at_showdown ? 1 : 0);

  // Aggression (raises+bets vs calls+checks post-flop)
  const newPostflop = s._postflop_actions + (postflop_actions || 0);
  const newAggressive = s._aggressive_actions + (aggressive_actions || 0);

  // Response time
  const newRespCount = s._response_count + (response_count || 0);
  const newRespTotal = s._response_total + (response_ms_total || 0);

  // Derived rates
  const vpip = newVpipHands > 0 ? (newVpipCount / newVpipHands) * 100 : 0;
  const pfr = newPfrHands > 0 ? (newPfrCount / newPfrHands) * 100 : 0;
  const wtsd = newFlopHands > 0 ? (newWtsdCount / newFlopHands) * 100 : 0;
  const wmsd = newShowdowns > 0 ? (newWmsdCount / newShowdowns) * 100 : 0;
  const aggr = newPostflop > 0 ? (newAggressive / newPostflop) * 100 : 0;
  const avgResp = newRespCount > 0 ? newRespTotal / newRespCount : 0;

  db.prepare(
    `
    UPDATE bot_stats SET
      total_hands = ?, total_wins = ?, penalty_folds = ?,
      vpip = ?, pfr = ?, wtsd = ?, wmsd = ?, aggression = ?, avg_response_ms = ?,
      _vpip_hands = ?, _vpip_count = ?,
      _pfr_hands = ?, _pfr_count = ?,
      _flop_hands = ?, _wtsd_count = ?,
      _showdown_count = ?, _wmsd_count = ?,
      _postflop_actions = ?, _aggressive_actions = ?,
      _response_count = ?, _response_total = ?,
      updated_at = unixepoch()
    WHERE bot_id = ?
  `,
  ).run(
    newTotalHands,
    newTotalWins,
    newPenalty,
    vpip,
    pfr,
    wtsd,
    wmsd,
    aggr,
    avgResp,
    newVpipHands,
    newVpipCount,
    newPfrHands,
    newPfrCount,
    newFlopHands,
    newWtsdCount,
    newShowdowns,
    newWmsdCount,
    newPostflop,
    newAggressive,
    newRespCount,
    newRespTotal,
    bot_id,
  );
}

export function getBotStats(bot_id: string): any {
  ensureBotStats(bot_id);
  return getDb()
    .prepare("SELECT * FROM bot_stats WHERE bot_id = ?")
    .get(bot_id);
}

export function getLeaderboardFull(limit = 20): any[] {
  return getDb()
    .prepare(
      `
    SELECT
      b.id, b.name, u.username as owner,
      bs.total_hands, bs.total_wins, bs.total_tournaments,
      bs.total_net,
      ROUND(bs.vpip, 1) as vpip,
      ROUND(bs.pfr, 1) as pfr,
      ROUND(bs.wtsd, 1) as wtsd,
      ROUND(bs.wmsd, 1) as wmsd,
      ROUND(bs.aggression, 2) as aggression,
      ROUND(bs.avg_response_ms, 0) as avg_response_ms,
      bs.penalty_folds, bs.disconnects,
      b.last_validation_score
    FROM bot_stats bs
    JOIN bots b ON b.id = bs.bot_id
    JOIN users u ON u.id = b.user_id
    WHERE b.active = 1
    ORDER BY bs.total_net DESC
    LIMIT ?
  `,
    )
    .all(limit);
}

// ─────────────────────────────────────────────────────────────
// TOURNAMENT SEAT HISTORY
// ─────────────────────────────────────────────────────────────

export function recordSeatHistory({
  tournament_id,
  tournament_table_id,
  bot_id,
  seat_number,
  chips_on_arrival,
  reason,
}: {
  tournament_id: string;
  tournament_table_id: string;
  bot_id: string;
  seat_number: number;
  chips_on_arrival: number;
  reason?: string;
}): void {
  // Close any open seat record for this bot in this tournament
  getDb()
    .prepare(
      `
    UPDATE tournament_seat_history
    SET left_at = unixepoch()
    WHERE tournament_id = ? AND bot_id = ? AND left_at IS NULL
  `,
    )
    .run(tournament_id, bot_id);

  // Open new seat record
  getDb()
    .prepare(
      `
    INSERT INTO tournament_seat_history
      (id, tournament_id, tournament_table_id, bot_id, seat_number, chips_on_arrival, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      uid(),
      tournament_id,
      tournament_table_id,
      bot_id,
      seat_number,
      chips_on_arrival,
      reason || "initial",
    );
}

export function closeSeatHistory(tournament_id: string, bot_id: string): void {
  getDb()
    .prepare(
      `
    UPDATE tournament_seat_history
    SET left_at = unixepoch()
    WHERE tournament_id = ? AND bot_id = ? AND left_at IS NULL
  `,
    )
    .run(tournament_id, bot_id);
}

export function getSeatHistory(tournament_id: string, bot_id: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT sh.*, tt.table_number
    FROM tournament_seat_history sh
    JOIN tournament_tables tt ON tt.id = sh.tournament_table_id
    WHERE sh.tournament_id = ? AND sh.bot_id = ?
    ORDER BY sh.seated_at
  `,
    )
    .all(tournament_id, bot_id);
}

// ─────────────────────────────────────────────────────────────
// RICH ANALYTICS
// ─────────────────────────────────────────────────────────────

/**
 * Full bot profile: stats + recent tournament history + validation
 */
export function getBotProfile(bot_id: string): any {
  const bot = getBotById(bot_id);
  if (!bot) return null;
  const stats = getBotStats(bot_id);
  const recentTournaments = getDb()
    .prepare(
      `
    SELECT t.name, t.status, te.finish_position, te.payout,
           te.busted_at_level, te.entry_type, te.entered_at
    FROM tournament_entries te
    JOIN tournaments t ON t.id = te.tournament_id
    WHERE te.bot_id = ?
    ORDER BY te.entered_at DESC
    LIMIT 10
  `,
    )
    .all(bot_id);

  return {
    id: bot.id,
    name: bot.name,
    description: bot.description,
    active: !!bot.active,
    created_at: bot.created_at,
    validation_score: bot.last_validation_score,
    stats: stats
      ? {
          hands: stats.total_hands,
          wins: stats.total_wins,
          tournaments: stats.total_tournaments,
          net_chips: stats.total_net,
          vpip: Math.round(stats.vpip * 10) / 10,
          pfr: Math.round(stats.pfr * 10) / 10,
          wtsd: Math.round(stats.wtsd * 10) / 10,
          wmsd: Math.round(stats.wmsd * 10) / 10,
          aggression: Math.round(stats.aggression * 100) / 100,
          avg_response_ms: Math.round(stats.avg_response_ms),
          penalty_folds: stats.penalty_folds,
          disconnects: stats.disconnects,
        }
      : null,
    recent_tournaments: recentTournaments,
  };
}

/**
 * Hand replay — full detail for a single hand
 */
export function getHandDetail(hand_id: string): any {
  const hand = getHandById(hand_id);
  if (!hand) return null;
  const players: any[] = getDb()
    .prepare(
      `
    SELECT hp.*, b.name as bot_name
    FROM hand_players hp
    JOIN bots b ON b.id = hp.bot_id
    WHERE hp.hand_id = ?
    ORDER BY hp.position
  `,
    )
    .all(hand_id);
  const actions = getActionsByHand(hand_id);
  return {
    ...hand,
    community_cards: JSON.parse(hand.community_cards || "[]"),
    players: players.map((p) => ({
      ...p,
      hole_cards: JSON.parse(p.hole_cards || "[]"),
      best_hand_cards: p.best_hand_cards ? JSON.parse(p.best_hand_cards) : null,
    })),
    actions,
  };
}

/**
 * Tournament chip progression — chip counts per player per blind level
 * Useful for graphing how stacks evolved through a tournament
 */
export function getTournamentChipProgression(tournament_id: string): any[] {
  return getDb()
    .prepare(
      `
    SELECT
      tbl.level,
      tbl.small_blind,
      tbl.big_blind,
      tbl.ante,
      b.name as bot_name,
      ts.chips
    FROM tournament_blind_levels tbl
    JOIN tournament_seats ts ON ts.tournament_id = tbl.tournament_id
    JOIN bots b ON b.id = ts.bot_id
    WHERE tbl.tournament_id = ?
      AND ts.status = 'active'
    ORDER BY tbl.level, ts.chips DESC
  `,
    )
    .all(tournament_id);
}
