/**
 * seed-system-bots.ts
 *
 * Creates the BotRoyale system user and 8 personality-archetype system bots,
 * then seeds aggregated results from the 5,000-tournament stress test directly
 * into the underlying tables that feed mv_bot_leaderboard. Stats are persistent
 * through cron-driven MV refreshes and will be overwritten by real game data
 * as tournaments accumulate.
 *
 * Seeded metrics per bot:
 *   - bot_stats: total_tournaments, tournament_wins, total_net
 *   - hand_players + hands: bb_per_100 (one aggregate row encoding 1,174,694 hands)
 *   - tournament_entries + tournaments: itm_pct, roi_pct (100 scaled entries)
 *
 * Usage:
 *   npm run seed:system-bots
 */

import { DataSource } from "typeorm";
import { v4 as uuid } from "uuid";
import * as dotenv from "dotenv";
import * as bcrypt from "bcrypt";

dotenv.config();

const dataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "poker",
  synchronize: false,
  logging: false,
});

const SYSTEM_USER_EMAIL = "system@botroyale.internal";
const SYSTEM_USER_NAME = "BotRoyale Team";

const SYSTEM_BOTS = [
  { name: "The Shark",           personality: { aggression: 75, bluffFrequency: 20, riskTolerance: 50, tightness: 70 } },
  { name: "Balanced Pro",        personality: { aggression: 60, bluffFrequency: 30, riskTolerance: 55, tightness: 55 } },
  { name: "The Rock",            personality: { aggression: 25, bluffFrequency:  5, riskTolerance: 20, tightness: 90 } },
  { name: "Tricky",              personality: { aggression: 50, bluffFrequency: 55, riskTolerance: 45, tightness: 50 } },
  { name: "The Bully",           personality: { aggression: 85, bluffFrequency: 45, riskTolerance: 75, tightness: 40 } },
  { name: "The Nit",             personality: { aggression: 10, bluffFrequency:  0, riskTolerance: 10, tightness: 95 } },
  { name: "The Maniac",          personality: { aggression: 95, bluffFrequency: 70, riskTolerance: 90, tightness: 15 } },
  { name: "The Calling Station", personality: { aggression: 15, bluffFrequency:  5, riskTolerance: 50, tightness: 30 } },
];

// ── Stress-test results from 5,000-tournament run ──────────────────────────
// profitLoss is in normalized buy-in units (1 unit = 1 entry cost = 1,500 chips)
// roi is already a percentage (e.g. 13.82 = 13.82%)
// totalHands is the total number of hands played across all tournaments

interface BotStressStats {
  entries: number;
  wins: number;
  itmFinishes: number;
  totalPayout: number;  // in buy-in units
  profitLoss: number;   // in buy-in units (can be negative)
  roi: number;          // percentage
  itmPct: number;       // percentage
  totalHands: number;
}

// Bot name as it appears in stress_test_results.json profiles
const STRESS_DATA: Record<string, BotStressStats> = {
  "The Shark":           { entries: 4999, wins: 622,  itmFinishes: 1808, totalPayout: 5437.8,  profitLoss:  438.8,  roi:   8.78, itmPct: 36.17, totalHands: 1174694 },
  "Balanced Pro":        { entries: 4999, wins: 695,  itmFinishes: 1603, totalPayout: 5158.8,  profitLoss:  159.8,  roi:   3.20, itmPct: 32.07, totalHands: 1174694 },
  "The Rock":            { entries: 4999, wins:  67,  itmFinishes: 2296, totalPayout: 5323.5,  profitLoss:  324.5,  roi:   6.49, itmPct: 45.93, totalHands: 1174694 },
  "Tricky":              { entries: 4999, wins: 492,  itmFinishes: 1322, totalPayout: 4087.8,  profitLoss: -911.2,  roi: -18.23, itmPct: 26.45, totalHands: 1174694 },
  "The Bully":           { entries: 4999, wins: 954,  itmFinishes: 1368, totalPayout: 5210.1,  profitLoss:  211.1,  roi:   4.22, itmPct: 27.37, totalHands: 1174694 },
  "The Nit":             { entries: 4999, wins:  42,  itmFinishes: 2455, totalPayout: 5689.8,  profitLoss:  690.8,  roi:  13.82, itmPct: 49.11, totalHands: 1174694 },
  "The Maniac":          { entries: 4999, wins: 1018, itmFinishes: 1388, totalPayout: 5392.8,  profitLoss:  393.8,  roi:   7.88, itmPct: 27.77, totalHands: 1174694 },
  "The Calling Station": { entries: 4999, wins: 465,  itmFinishes: 1396, totalPayout: 4211.1,  profitLoss: -787.9,  roi: -15.76, itmPct: 27.93, totalHands: 1174694 },
};

// ── Constants ───────────────────────────────────────────────────────────────
// The stress test used 1,500 starting chips.  Converting profitLoss (in buy-in
// units) to chips: 1 buy-in = 1,500 chips.
const CHIPS_PER_BUYIN = 1500;

// We encode the entire 1,174,694-hand run as ONE hand_player record.
// big_blind is set to totalHands × 20 so that SUM(big_blind) = totalHands × 20,
// giving BB/100 = (netChips / (totalHands × 20)) × 100.
const BB_VALUE = 20;

// We create 100 scaled tournament entries per bot (max_players=100, ITM≤15).
const SCALED_ENTRIES = 100;
const BUY_IN_CHIPS = 1500;
const MAX_PLAYERS_SCALED = 100; // ITM cutoff = CEIL(100 × 0.15) = 15

// Fixed UUID for the shared "Stress-Test-Archive" table row (idempotent reruns)
const STRESS_TABLE_ID = "00000000-0000-0000-0000-stress000001";

async function main() {
  await dataSource.initialize();
  console.log("Connected to database.");

  try {
    // ── 1. Upsert system user ────────────────────────────────────────────────
    const [existingUser] = await dataSource.query(
      `SELECT id FROM users WHERE email = $1`,
      [SYSTEM_USER_EMAIL],
    );

    let systemUserId: string;

    if (existingUser) {
      systemUserId = existingUser.id;
      console.log(`System user already exists: ${systemUserId}`);
    } else {
      systemUserId = uuid();
      const passwordHash = await bcrypt.hash(uuid(), 10);
      await dataSource.query(
        `INSERT INTO users (id, email, name, password_hash, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
        [systemUserId, SYSTEM_USER_EMAIL, SYSTEM_USER_NAME, passwordHash],
      );
      console.log(`Created system user: ${systemUserId}`);
    }

    // ── 2. Upsert each system bot ────────────────────────────────────────────
    const botIds: Record<string, string> = {};

    for (const bot of SYSTEM_BOTS) {
      const [existing] = await dataSource.query(
        `SELECT id FROM bots WHERE user_id = $1 AND name = $2`,
        [systemUserId, bot.name],
      );

      let botId: string;

      if (existing) {
        botId = existing.id;
        await dataSource.query(
          `UPDATE bots SET is_system = true WHERE id = $1`,
          [botId],
        );
        console.log(`Bot already exists, updated is_system flag: "${bot.name}" (${botId})`);
      } else {
        botId = uuid();
        const strategy = { tier: "quick", personality: bot.personality };
        await dataSource.query(
          `INSERT INTO bots (id, name, description, active, strategy, user_id, is_system, created_at, updated_at)
           VALUES ($1, $2, $3, true, $4, $5, true, NOW(), NOW())`,
          [botId, bot.name, `BotRoyale system bot — ${bot.name} archetype`, JSON.stringify(strategy), systemUserId],
        );
        console.log(`Created bot: "${bot.name}" (${botId})`);
      }

      botIds[bot.name] = botId;
    }

    // ── 3. Seed stress-test stats into underlying tables ────────────────────
    console.log("\nSeeding stress-test stats into underlying tables...");

    // 3a. Shared "Stress-Test-Archive" table row (used as FK for games)
    await dataSource.query(
      `INSERT INTO tables (id, name, small_blind, big_blind, starting_chips, max_players, status, created_at, updated_at)
       VALUES ($1, 'Stress-Test-Archive', 10, 20, 1500, 9, 'finished', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [STRESS_TABLE_ID],
    );

    for (const bot of SYSTEM_BOTS) {
      const botId = botIds[bot.name];
      const stats = STRESS_DATA[bot.name];

      if (!stats) {
        console.warn(`  No stress-test data found for "${bot.name}", skipping.`);
        continue;
      }

      // 3b. Upsert bot_stats (total_tournaments, tournament_wins, total_net)
      const totalNetChips = Math.round(stats.profitLoss * CHIPS_PER_BUYIN);
      await dataSource.query(
        `INSERT INTO bot_stats (id, bot_id, total_tournaments, tournament_wins, total_net, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (bot_id) DO UPDATE SET
           total_tournaments = EXCLUDED.total_tournaments,
           tournament_wins   = EXCLUDED.tournament_wins,
           total_net         = EXCLUDED.total_net`,
        [uuid(), botId, stats.entries, stats.wins, totalNetChips],
      );

      // 3c. One game → one hand → one hand_player (for bb_per_100)
      //     big_blind is set to totalHands × BB_VALUE so the MV formula gives the
      //     correct BB/100 from a single aggregate row.
      const gameId = uuid();
      const handId = uuid();
      const totalBb = stats.totalHands * BB_VALUE;            // the "total BB" denominator
      const netChips = Math.round(stats.profitLoss * CHIPS_PER_BUYIN);

      await dataSource.query(
        `INSERT INTO games (id, table_id, status, total_hands, started_at, finished_at, created_at, updated_at)
         VALUES ($1, $2, 'finished', 1, NOW(), NOW(), NOW(), NOW())`,
        [gameId, STRESS_TABLE_ID],
      );

      await dataSource.query(
        `INSERT INTO hands (id, game_id, hand_number, small_blind, big_blind, pot, stage, started_at, finished_at, is_audited, created_at, updated_at)
         VALUES ($1, $2, 1, $3, $4, 0, 'complete', NOW(), NOW(), true, NOW(), NOW())`,
        [handId, gameId, Math.floor(totalBb / 2), totalBb],
      );

      const amountBet  = netChips < 0 ? -netChips : 0;
      const amountWon  = netChips > 0 ? netChips  : null;

      await dataSource.query(
        `INSERT INTO hand_players (id, hand_id, bot_id, position, hole_cards, start_chips, end_chips, amount_bet, amount_won, folded, all_in, won, saw_flop, saw_showdown, card_status, created_at, updated_at)
         VALUES ($1, $2, $3, 0, '[]', 1500, NULL, $4, $5, false, false, $6, false, false, 'hidden', NOW(), NOW())`,
        [uuid(), handId, botId, amountBet, amountWon, netChips > 0],
      );

      // 3d. One scaled tournament + 100 entries (for itm_pct and roi_pct)
      //
      //     max_players = 100 → ITM cutoff = CEIL(100 × 0.15) = 15
      //     wins_scaled = max(1, round(wins / entries × 100))
      //     itm_scaled  = round(itmPct)   (includes wins_scaled)
      //
      //     Payout: give the entire budget to winner entries so ROI% is exact.
      //       total_buyin  = SCALED_ENTRIES × BUY_IN_CHIPS
      //       total_payout = total_buyin × (1 + roi / 100)   → must be ≥ 0

      const tournamentId   = uuid();
      const totalBuyin     = SCALED_ENTRIES * BUY_IN_CHIPS;                     // 150,000
      const totalPayout    = Math.max(0, Math.round(totalBuyin * (1 + stats.roi / 100)));
      const winsScaled     = Math.max(1, Math.round((stats.wins / stats.entries) * SCALED_ENTRIES));
      const itmScaled      = Math.round(stats.itmPct);                           // e.g. 49 for The Nit
      const nonWinItm      = Math.max(0, itmScaled - winsScaled);
      const nonItm         = SCALED_ENTRIES - winsScaled - nonWinItm;
      const payoutPerWin   = winsScaled > 0 ? Math.round(totalPayout / winsScaled) : 0;

      await dataSource.query(
        `INSERT INTO tournaments (id, name, type, status, buy_in, starting_chips, min_players, max_players, players_per_table, finished_at, is_archived, created_at, updated_at)
         VALUES ($1, $2, 'rolling', 'finished', $3, 1500, 9, $4, 9, NOW(), false, NOW(), NOW())`,
        [tournamentId, `Stress-Test 5000 — ${bot.name}`, BUY_IN_CHIPS, MAX_PLAYERS_SCALED],
      );

      // Winner entries (position = 1, ITM)
      for (let i = 0; i < winsScaled; i++) {
        await dataSource.query(
          `INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, finish_position, payout, created_at, updated_at)
           VALUES ($1, $2, $3, 'initial', 1, $4, NOW(), NOW())`,
          [uuid(), tournamentId, botId, payoutPerWin],
        );
      }

      // Non-win ITM entries (position = 8, safely ≤ 15)
      for (let i = 0; i < nonWinItm; i++) {
        await dataSource.query(
          `INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, finish_position, payout, created_at, updated_at)
           VALUES ($1, $2, $3, 'initial', 8, 0, NOW(), NOW())`,
          [uuid(), tournamentId, botId],
        );
      }

      // Non-ITM entries (position = 50, safely > 15)
      for (let i = 0; i < nonItm; i++) {
        await dataSource.query(
          `INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, finish_position, payout, created_at, updated_at)
           VALUES ($1, $2, $3, 'initial', 50, 0, NOW(), NOW())`,
          [uuid(), tournamentId, botId],
        );
      }

      console.log(
        `  Seeded "${bot.name}": ROI=${stats.roi}%, ITM=${stats.itmPct}%, ` +
        `wins=${stats.wins}, bb_entries=${winsScaled}+${nonWinItm}+${nonItm}`,
      );
    }

    // ── 4. Refresh MV so all seeded data is immediately visible ─────────────
    console.log("\nRefreshing mv_bot_leaderboard...");
    await dataSource.query(`REFRESH MATERIALIZED VIEW mv_bot_leaderboard`);
    console.log("Done! System bots are now live on the leaderboard with stress-test stats.");
    console.log("Real game data will progressively replace these seeded values.");
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
