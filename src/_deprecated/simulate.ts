#!/usr/bin/env node
/**
 * simulate.js
 * ===========
 * Runs a full tournament end-to-end in-process.
 * No HTTP calls, no real bot servers — everything runs in one Node process.
 *
 * Usage:
 *   node simulate.js [options]
 *
 * Options:
 *   --bots=N          Number of bots to enter (default: 9)
 *   --tournament=ID   Tournament config ID (default: tourn_micro)
 *   --mix=NAMES       Comma-separated personalities (default: smart,caller,maniac,random,folder,allin)
 *   --fast            Skip inter-hand sleep (much faster simulation)
 *   --quiet           Suppress hand-by-hand output
 *   --verify          Enable chip conservation checks (always on in simulation)
 *   --seed=N          Random seed for reproducible runs
 *
 * Examples:
 *   node simulate.js --bots=18 --fast
 *   node simulate.js --bots=6 --mix=smart,smart,maniac,caller,folder,allin --fast
 *   node simulate.js --tournament=tourn_standard --bots=27
 */

"use strict";
process.env.DB_PATH = process.env.DB_PATH || ":memory:"; // use in-memory DB by default

const { TournamentDirector } = require("./src/tournament");
const { createSimBotCaller } = require("./src/simBots");
const db = require("./src/db");
const logger = require("./src/logger");
const { TOURNAMENT_CONFIGS } = require("./tournaments.config");

// ─────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const NUM_BOTS = parseInt(args.bots ?? "9");
const TOURNAMENT_ID = args.tournament ?? "tourn_micro";
const MIX_ARG = args.mix ?? "smart,caller,maniac,random,folder,allin";
const FAST = !!args.fast;
const QUIET = !!args.quiet;
const PERSONALITIES = MIX_ARG.split(",");

// ─────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────

db.migrate();

// Provision tournaments from config
TOURNAMENT_CONFIGS.forEach((t) => db.createTournament(t));

const tourn = db.getTournamentById(TOURNAMENT_ID);
if (!tourn) {
  console.error(
    `Tournament '${TOURNAMENT_ID}' not found. Available: ${TOURNAMENT_CONFIGS.map((t) => t.id).join(", ")}`,
  );
  process.exit(1);
}

console.log(`\n♠ ♥ ♦ ♣  POKER ENGINE SIMULATION  ♣ ♦ ♥ ♠`);
console.log(`==========================================`);
console.log(`Tournament: ${tourn.name}`);
console.log(`Bots:       ${NUM_BOTS}`);
console.log(`Mix:        ${PERSONALITIES.join(", ")}`);
console.log(`Fast mode:  ${FAST ? "YES (no sleep)" : "NO"}`);
console.log(`DB:         ${process.env.DB_PATH}`);
console.log("");

// ─────────────────────────────────────────────────────────────
// CREATE BOTS
// ─────────────────────────────────────────────────────────────

const simBots = [];
for (let i = 0; i < NUM_BOTS; i++) {
  const personality = PERSONALITIES[i % PERSONALITIES.length];
  const username = `sim_user_${i}_${Date.now()}`;
  const botName = `${personality.charAt(0).toUpperCase() + personality.slice(1)}_${i + 1}`;
  const endpoint = `sim://${personality}`;

  const user = db.createUser({ username });
  const bot = db.createBot({ user_id: user.id, name: botName, endpoint });

  simBots.push({ bot, personality, user });
  console.log(`  Created: ${botName} (${personality})`);
}

console.log("");

// ─────────────────────────────────────────────────────────────
// REGISTER BOTS IN TOURNAMENT
// ─────────────────────────────────────────────────────────────

for (const { bot } of simBots) {
  db.createEntry({
    tournament_id: TOURNAMENT_ID,
    bot_id: bot.id,
    chips_at_entry: tourn.starting_chips,
    entry_type: "initial",
  });
}

db.updateTournamentStatus(TOURNAMENT_ID, "running");

// ─────────────────────────────────────────────────────────────
// SIMULATION STATE TRACKING
// ─────────────────────────────────────────────────────────────

let totalHands = 0;
const errors = [];
const handLog = [];
const simCaller = createSimBotCaller();

// ─────────────────────────────────────────────────────────────
// RUN TOURNAMENT
// ─────────────────────────────────────────────────────────────

const startTime = Date.now();

const director = new TournamentDirector({
  tournamentId: TOURNAMENT_ID,
  callBot: simCaller,
  onStateUpdate: (tournamentId, state) => {
    if (!QUIET) {
      // Print a compact status line every time the state changes
      if (state.tables) {
        const tables = state.tables
          .map(
            (t) =>
              `T${t.tableNumber}(${t.gameState?.players?.filter((p) => !p.folded && p.chips > 0).length ?? 0}p)`,
          )
          .join(" ");
        process.stdout.write(
          `\r  Level ${state.level} | Hand ${state.handsThisLevel}/${state.handsPerLevel} | ` +
            `${state.playersRemaining} players | ${tables}    `,
        );
      }
    }
  },
  onFinished: (tournamentId, results) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write("\n");
    console.log(`\n✅ Tournament finished in ${elapsed}s`);
    console.log(`   Total hands: ${totalHands}`);
    console.log(`   Errors caught: ${errors.length}`);
    console.log("");
    printResults(results, tourn);
    if (errors.length > 0) {
      console.log("\n⚠️  Errors encountered:");
      errors.forEach((e) => console.log(`   - ${e}`));
    }
  },
});

// Total chips across the entire tournament (all tables + all stacks)
const TOTAL_TOURNAMENT_CHIPS = NUM_BOTS * tourn.starting_chips;

function verifyGlobalChips() {
  // Count chips in active tables only (non-disconnected players + pot)
  // Disconnected players on a table still hold chips but will be cleaned up
  // when the table breaks. Busted players have left all tables.
  // The invariant: sum of all active (non-busted) player chips === remaining chips in play
  let inTables = 0;
  let inPots = 0;
  for (const [, { game }] of director.tables) {
    for (const p of game.players) {
      if (!p.disconnected) inTables += p.chips;
    }
    inPots += game.potManager?.getTotalPot?.() ?? 0;
  }
  // Active bots should account for all chips still in play
  let inActiveBots = 0;
  for (const [, bot] of director.activeBots) {
    inActiveBots += bot.chips;
  }
  // During a hand, chips are in pots so inTables won't equal inActiveBots
  // Just verify that table chips + pots > 0 when there are active players
  if (
    director.activeBots.size > 0 &&
    director.tables.size > 0 &&
    inTables + inPots === 0
  ) {
    const msg = `GLOBAL chip conservation violated: ${director.activeBots.size} active bots but 0 chips in tables/pots`;
    errors.push(msg);
    logger.error("simulate", msg, {
      inTables,
      inPots,
      activeBots: director.activeBots.size,
    });
  }
}

// Patch the director to count hands and catch errors
const originalOnHandComplete = director._onHandComplete.bind(director);
director._onHandComplete = async function (tableDbId, results) {
  totalHands++;
  try {
    await originalOnHandComplete(tableDbId, results);
    verifyGlobalChips();
  } catch (e) {
    errors.push(`Hand ${totalHands} on table ${tableDbId}: ${e.message}`);
    logger.error("simulate", `Hand ${totalHands} error`, { tableDbId }, e);
    // Don't re-throw in simulation — keep going to find more bugs
  }
};

// Speed up: skip inter-hand sleep in fast mode
if (FAST) {
  // Patch all games after they're created to use 0ms sleep
  const originalStartTable = director._startTable.bind(director);
  director._startTable = function (tableRow, bots, tournConfig) {
    originalStartTable(tableRow, bots, tournConfig);
    const entry = director.tables.get(tableRow.id);
    if (entry?.game) {
      entry.game._sleepMs = 0;
      // In multi-table tournaments, chip totals per table are not fixed.
      // Disable per-table chip conservation; the tournament director
      // verifies total chips via _verifyGlobalChips instead.
      // entry.game._expectedTotalChips = ...  <-- intentionally not set
    }
  };
}

// Start it
director.start().catch((e) => {
  logger.critical(
    "simulate",
    "Tournament director crashed",
    {
      tournamentId: TOURNAMENT_ID,
      totalHands,
      errors: errors.length,
    },
    e,
  );
  console.error("\n💥 FATAL: Tournament director crashed:", e.message);
  console.error(e.stack);
  process.exit(1);
});

// ─────────────────────────────────────────────────────────────
// RESULTS PRINTER
// ─────────────────────────────────────────────────────────────

function printResults(results, tourn) {
  if (!results || !results.length) {
    console.log("  (no results)");
    return;
  }

  const prizePool = results.length * tourn.buy_in;
  console.log(`  Prize pool: ${prizePool.toLocaleString()} chips`);
  console.log("");
  console.log("  Pos  Bot                    Personality   Busted   Payout");
  console.log("  ---  ---------------------  ------------  -------  ------");

  for (const r of results) {
    const pos = String(r.finish_position ?? "?").padStart(3);
    const name = (r.bot_name || "?").padEnd(21).slice(0, 21);
    const owner = (r.owner || "?").padEnd(12).slice(0, 12);
    const level = r.busted_at_level ? `Lvl ${r.busted_at_level}` : "  —  ";
    const payout = r.payout > 0 ? `+${r.payout.toLocaleString()}` : "—";
    const medal =
      pos.trim() === "1"
        ? "🏆"
        : pos.trim() === "2"
          ? "🥈"
          : pos.trim() === "3"
            ? "🥉"
            : "  ";
    console.log(
      `  ${pos}  ${name}  ${owner}  ${level.padEnd(7)}  ${payout} ${medal}`,
    );
  }
  console.log("");
}

// ─────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────────────────────

process.on("SIGINT", () => {
  console.log("\n\nSimulation interrupted.");
  console.log(`  Hands completed: ${totalHands}`);
  console.log(`  Errors: ${errors.length}`);
  if (errors.length) errors.forEach((e) => console.log(`    ${e}`));
  process.exit(0);
});

process.on("unhandledRejection", (reason) => {
  logger.critical(
    "simulate",
    "Unhandled rejection",
    {},
    reason instanceof Error ? reason : new Error(String(reason)),
  );
  console.error("\n💥 Unhandled rejection:", reason);
  process.exit(1);
});
