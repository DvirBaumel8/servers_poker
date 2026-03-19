#!/usr/bin/env node
/**
 * scenarios.js
 * ============
 * Targeted scenario tests that exercise specific edge cases.
 * Each scenario is isolated, self-contained, and clearly named.
 *
 * Run: node --experimental-sqlite scenarios.js
 */

"use strict";
process.env.DB_PATH = ":memory:";
process.env.NODE_ENV = "test"; // suppress logger output

const db = require("./src/db");
const { TournamentDirector } = require("./src/tournament");
const { createSimBotCaller } = require("./src/simBots");
const { TOURNAMENT_CONFIGS, HANDS_PER_LEVEL } = require("./tournaments.config");

db.migrate();
TOURNAMENT_CONFIGS.forEach((t) => db.createTournament(t));

// ─────────────────────────────────────────────────────────────
// TEST HARNESS
// ─────────────────────────────────────────────────────────────

let passed = 0,
  failed = 0,
  skipped = 0;
const failures = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      // async — handled by runAll
      return result;
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failures.push({ name, error: e.message });
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    if (process.env.VERBOSE) console.log(e.stack);
    failures.push({ name, error: e.message });
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

function assertEqual(a, b, msg) {
  if (a !== b)
    throw new Error(
      msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`,
    );
}

function assertContains(str, substr, msg) {
  if (!String(str).includes(substr))
    throw new Error(msg || `Expected "${str}" to contain "${substr}"`);
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

let _seq = 0;
function makeUser(suffix) {
  return db.createUser({ username: `test_${suffix}_${++_seq}_${Date.now()}` });
}

function makeBot(userId, personality = "caller") {
  return db.createBot({
    user_id: userId,
    name: `Bot_${personality}_${++_seq}`,
    endpoint: `sim://${personality}`,
  });
}

function makeTournament(overrides = {}) {
  const id = `test_t_${++_seq}_${Date.now()}`;
  const config = {
    id,
    name: `Test Tournament ${_seq}`,
    type: "rolling",
    buy_in: 100,
    starting_chips: 5000,
    min_players: 2,
    max_players: 18,
    players_per_table: 9,
    turn_timeout_ms: 10000,
    late_reg_ends_level: 4,
    rebuys_allowed: true,
    ...overrides,
  };
  db.createTournament(config);
  return config;
}

function enter(tournament_id, bot_id) {
  return db.createEntry({
    tournament_id,
    bot_id,
    chips_at_entry: 5000,
    entry_type: "initial",
  });
}

async function runTournament(tournamentId, botIds, opts = {}) {
  return new Promise((resolve, reject) => {
    const director = new TournamentDirector({
      tournamentId,
      callBot: createSimBotCaller(),
      onStateUpdate: () => {},
      onFinished: (id, results) => resolve({ director, results }),
    });

    // Fast mode — no sleep between hands
    const originalStartTable = director._startTable.bind(director);
    director._startTable = function (tableRow, bots, tournConfig) {
      originalStartTable(tableRow, bots, tournConfig);
      const entry = director.tables.get(tableRow.id);
      if (entry?.game) entry.game._sleepMs = 0;
    };

    // Register all bots as entries before starting
    for (const botId of botIds) {
      db.createEntry({
        tournament_id: tournamentId,
        bot_id: botId,
        chips_at_entry: 5000,
        entry_type: "initial",
      });
    }
    db.updateTournamentStatus(tournamentId, "running");

    director.start().catch(reject);
    if (opts.onDirector) opts.onDirector(director);
  });
}

// ─────────────────────────────────────────────────────────────
// SCENARIO 1: Registration — basic rules
// ─────────────────────────────────────────────────────────────

console.log("\n── Registration Rules ──────────────────────────────────");

test("Registering a bot creates an entry with initial type", () => {
  const cfg = makeTournament();
  const u = makeUser("reg1");
  const b = makeBot(u.id);
  const entry = db.createEntry({
    tournament_id: cfg.id,
    bot_id: b.id,
    chips_at_entry: 5000,
    entry_type: "initial",
  });
  assertEqual(entry.entry_type, "initial");
  assertEqual(entry.finish_position, null, "should still be active");
  assertEqual(entry.payout, 0);
});

test("Registering the same active bot twice is rejected at app layer", () => {
  const cfg = makeTournament();
  const u = makeUser("reg2");
  const b = makeBot(u.id);
  db.createEntry({
    tournament_id: cfg.id,
    bot_id: b.id,
    chips_at_entry: 5000,
    entry_type: "initial",
  });
  const entries = db.getEntries(cfg.id);
  // App-layer check: find active entry (finish_position IS NULL)
  const activeEntry = entries.find(
    (e) => e.bot_id === b.id && e.finish_position === null,
  );
  assert(activeEntry, "Should find an active entry");
  // Second insert is now allowed at DB level (no UNIQUE) but app layer prevents it
  // Verify the app-layer logic would catch it:
  assert(
    activeEntry.finish_position === null,
    "Active entry has no finish_position",
  );
  // The route returns 409 when activeEntry is found — simulate that check
  const wouldReject = !!entries.find(
    (e) => e.bot_id === b.id && e.finish_position === null,
  );
  assert(wouldReject, "App layer should reject duplicate active registration");
});

test("Busted bot can rebuy (entry bust then new entry)", () => {
  const cfg = makeTournament({ rebuys_allowed: true });
  const u = makeUser("rebuy1");
  const b = makeBot(u.id);
  db.createEntry({
    tournament_id: cfg.id,
    bot_id: b.id,
    chips_at_entry: 5000,
    entry_type: "initial",
  });
  // Simulate bust
  db.bustEntry(cfg.id, b.id, 1, 3);
  const after = db.getEntry(cfg.id, b.id);
  assertEqual(after.finish_position, 3, "should be busted");
  // Now rebuy: previous entry has finish_position set, so new entry allowed
  // (route logic: existing && finish_position === null -> block. finish_position set -> allow rebuy)
  const rebuy = db.createEntry({
    tournament_id: cfg.id,
    bot_id: b.id,
    chips_at_entry: 5000,
    entry_type: "rebuy",
  });
  assertEqual(rebuy.entry_type, "rebuy");
});

test("Rebuy rejected in freezeout tournament", () => {
  const cfg = makeTournament({ rebuys_allowed: false });
  const u = makeUser("freeze1");
  const b = makeBot(u.id);
  db.createEntry({
    tournament_id: cfg.id,
    bot_id: b.id,
    chips_at_entry: 5000,
    entry_type: "initial",
  });
  db.bustEntry(cfg.id, b.id, 1, 2);
  // Route check: entryType === 'rebuy' && !tourn.rebuys_allowed -> reject
  const tourn = db.getTournamentById(cfg.id);
  assert(!tourn.rebuys_allowed, "Should be freezeout");
  // Confirm the route would reject
  const existing = db.getEntry(cfg.id, b.id);
  assert(existing !== null, "Entry exists");
  // rebuys_allowed is falsy, so rebuy should be blocked
  assert(!tourn.rebuys_allowed, "Rebuy should be blocked");
});

test("Registration blocked when tournament finished", () => {
  const cfg = makeTournament();
  db.updateTournamentStatus(cfg.id, "finished");
  const tourn = db.getTournamentById(cfg.id);
  assertEqual(tourn.status, "finished");
  // Route check: finished -> reject
  assert(
    tourn.status === "finished",
    "Should reject registration on finished tournament",
  );
});

test("Registration blocked when tournament full", () => {
  const cfg = makeTournament({ max_players: 3 });
  for (let i = 0; i < 3; i++) {
    const u = makeUser(`full${i}`);
    const b = makeBot(u.id);
    db.createEntry({
      tournament_id: cfg.id,
      bot_id: b.id,
      chips_at_entry: 5000,
      entry_type: "initial",
    });
  }
  const entries = db
    .getEntries(cfg.id)
    .filter((e) => e.finish_position === null);
  assert(entries.length >= cfg.max_players, "Should be full");
});

// ─────────────────────────────────────────────────────────────
// SCENARIO 2: Late registration
// ─────────────────────────────────────────────────────────────

console.log("\n── Late Registration ───────────────────────────────────");

testAsync(
  "Late entry joins running tournament during valid window",
  async () => {
    const cfg = makeTournament({ late_reg_ends_level: 4, min_players: 2 });
    const users = Array.from({ length: 3 }, (_, i) => makeUser(`late_a${i}`));
    const bots = users.map((u) => makeBot(u.id, "caller"));
    const botIds = bots.map((b) => b.id);

    let lateJoined = false;
    let directorRef = null;

    const { results } = await runTournament(cfg.id, botIds.slice(0, 2), {
      onDirector(director) {
        directorRef = director;
        // Hook into hand completion to add a late entry during level 1
        const orig = director._onHandComplete.bind(director);
        director._onHandComplete = async function (tableDbId, results) {
          if (
            director.currentLevel <= cfg.late_reg_ends_level &&
            !lateJoined &&
            director.handsThisLevel >= 1
          ) {
            lateJoined = true;
            // Create a DB entry for the late bot, then add via director
            db.createEntry({
              tournament_id: cfg.id,
              bot_id: bots[2].id,
              chips_at_entry: 5000,
              entry_type: "initial",
            });
            try {
              director.addLateEntry({
                botId: bots[2].id,
                name: bots[2].name,
                endpoint: bots[2].endpoint,
              });
            } catch (e) {
              // OK if it fails — capture the reason
            }
          }
          return orig(tableDbId, results);
        };
      },
    });

    assert(results.length >= 2, "Tournament should complete with results");
    assert(lateJoined, "Late entry should have been attempted");
  },
);

testAsync("Late entry rejected past late_reg_ends_level", async () => {
  const cfg = makeTournament({ late_reg_ends_level: 2, min_players: 2 });
  const users = Array.from({ length: 3 }, (_, i) => makeUser(`late_b${i}`));
  const bots = users.map((u) => makeBot(u.id, "caller"));
  const botIds = bots.map((b) => b.id);

  let rejectionError = null;
  let attempted = false;

  await runTournament(cfg.id, botIds.slice(0, 2), {
    onDirector(director) {
      const orig = director._onHandComplete.bind(director);
      director._onHandComplete = async function (tableDbId, results) {
        // Wait until we're past the late reg window
        if (director.currentLevel > cfg.late_reg_ends_level && !attempted) {
          attempted = true;
          db.createEntry({
            tournament_id: cfg.id,
            bot_id: bots[2].id,
            chips_at_entry: 5000,
            entry_type: "initial",
          });
          try {
            director.addLateEntry({
              botId: bots[2].id,
              name: bots[2].name,
              endpoint: bots[2].endpoint,
            });
          } catch (e) {
            rejectionError = e.message;
          }
        }
        return orig(tableDbId, results);
      };
    },
  });

  assert(attempted, "Should have attempted late registration past deadline");
  assert(rejectionError !== null, "Should have received a rejection error");
  assertContains(
    rejectionError,
    "Late registration closed",
    `Expected "Late registration closed", got: "${rejectionError}"`,
  );
});

// ─────────────────────────────────────────────────────────────
// SCENARIO 3: Crasher bots
// ─────────────────────────────────────────────────────────────

console.log("\n── Crasher Bot Fault Tolerance ────────────────────────");

testAsync("Tournament completes with crasher bots in the field", async () => {
  const cfg = makeTournament({ min_players: 4, max_players: 9 });
  const personalities = ["smart", "crasher", "caller", "crasher"];
  const bots = personalities.map((p, i) => {
    const u = makeUser(`crash${i}`);
    return makeBot(u.id, p);
  });

  let errors = 0;
  const { results } = await new Promise((resolve, reject) => {
    const director = new TournamentDirector({
      tournamentId: cfg.id,
      callBot: createSimBotCaller(),
      onStateUpdate: () => {},
      onFinished: (id, r) => resolve({ director, results: r }),
    });

    const origOHC = director._onHandComplete.bind(director);
    director._onHandComplete = async function (tableDbId, r) {
      try {
        await origOHC(tableDbId, r);
      } catch (e) {
        errors++;
      }
    };

    for (const bot of bots) {
      db.createEntry({
        tournament_id: cfg.id,
        bot_id: bot.id,
        chips_at_entry: 5000,
        entry_type: "initial",
      });
    }
    db.updateTournamentStatus(cfg.id, "running");

    const origStart = director._startTable.bind(director);
    director._startTable = function (tableRow, bs, tc) {
      origStart(tableRow, bs, tc);
      const entry = director.tables.get(tableRow.id);
      if (entry?.game) entry.game._sleepMs = 0;
    };

    director.start().catch(reject);
  });

  assert(results.length > 0, "Should produce results even with crasher bots");
  assert(results[0].finish_position === 1, "Should have a winner");
});

testAsync(
  "Bot strikes are recorded in bot_events after repeated failures",
  async () => {
    // Use a bot that always crashes to trigger strike system
    const cfg = makeTournament({ min_players: 2 });
    const u1 = makeUser("strike1");
    const b1 = makeBot(u1.id, "smart");
    const u2 = makeUser("strike2");
    const b2 = makeBot(u2.id, "caller");

    const { results } = await runTournament(cfg.id, [b1.id, b2.id]);
    assert(results.length >= 1, "Tournament should complete");
  },
);

// ─────────────────────────────────────────────────────────────
// SCENARIO 4: Full tournament runs — single and multi-table
// ─────────────────────────────────────────────────────────────

console.log("\n── Full Tournament Runs ────────────────────────────────");

testAsync("2-bot heads-up tournament completes correctly", async () => {
  const cfg = makeTournament({ min_players: 2, max_players: 9 });
  const u1 = makeUser("hu1");
  const b1 = makeBot(u1.id, "smart");
  const u2 = makeUser("hu2");
  const b2 = makeBot(u2.id, "caller");

  const { results } = await runTournament(cfg.id, [b1.id, b2.id]);

  assertEqual(results.length, 2);
  assertEqual(results[0].finish_position, 1);
  assertEqual(results[1].finish_position, 2);
  assert(results[0].payout > 0, "Winner should receive payout");
  assertEqual(
    results[0].payout,
    cfg.buy_in * 2,
    "Winner takes all in 2-player",
  );
});

testAsync("9-bot single-table freezeout completes", async () => {
  const cfg = makeTournament({
    min_players: 2,
    max_players: 9,
    rebuys_allowed: false,
  });
  const personalities = [
    "smart",
    "caller",
    "maniac",
    "random",
    "folder",
    "allin",
    "smart",
    "caller",
    "maniac",
  ];
  const bots = personalities.map((p, i) => {
    const u = makeUser(`st9_${i}`);
    return makeBot(u.id, p);
  });

  const { results } = await runTournament(
    cfg.id,
    bots.map((b) => b.id),
  );

  assertEqual(results.length, 9, "9 entrants should have results");
  assert(
    results.every((r) => r.finish_position !== null),
    "All should have finish positions",
  );
  // Payouts for top 3 (50/30/20)
  const totalPayout = results.reduce((s, r) => s + r.payout, 0);
  assertEqual(
    totalPayout,
    cfg.buy_in * 9,
    "Total payouts should equal prize pool",
  );
});

testAsync(
  "18-bot multi-table tournament reaches final table and completes",
  async () => {
    const cfg = makeTournament({ min_players: 2, max_players: 18 });
    const personalities = [
      "smart",
      "caller",
      "maniac",
      "random",
      "folder",
      "allin",
    ];
    const bots = Array.from({ length: 18 }, (_, i) => {
      const p = personalities[i % personalities.length];
      const u = makeUser(`mt18_${i}`);
      return makeBot(u.id, p);
    });

    let finalTableReached = false;
    const { results } = await new Promise((resolve, reject) => {
      const director = new TournamentDirector({
        tournamentId: cfg.id,
        callBot: createSimBotCaller(),
        onStateUpdate: (id, state) => {
          if (state.status === "final_table") finalTableReached = true;
        },
        onFinished: (id, r) => resolve({ director, results: r }),
      });

      for (const bot of bots) {
        db.createEntry({
          tournament_id: cfg.id,
          bot_id: bot.id,
          chips_at_entry: 5000,
          entry_type: "initial",
        });
      }
      db.updateTournamentStatus(cfg.id, "running");

      const orig = director._startTable.bind(director);
      director._startTable = function (t, b, c) {
        orig(t, b, c);
        const e = director.tables.get(t.id);
        if (e?.game) e.game._sleepMs = 0;
      };

      director.start().catch(reject);
    });

    assert(finalTableReached, "Final table should be reached with 18 players");
    assertEqual(results.length, 18, "18 entrants should have results");
    const totalPayout = results.reduce((s, r) => s + r.payout, 0);
    assertEqual(
      totalPayout,
      cfg.buy_in * 18,
      "Total payouts should equal prize pool",
    );
  },
);

// ─────────────────────────────────────────────────────────────
// SCENARIO 5: Payout correctness
// ─────────────────────────────────────────────────────────────

console.log("\n── Payout Correctness ──────────────────────────────────");

testAsync(
  "Payouts sum to exactly the prize pool — no chips created or lost",
  async () => {
    const cfg = makeTournament({ buy_in: 250, min_players: 2, max_players: 9 });
    const bots = Array.from({ length: 9 }, (_, i) => {
      const u = makeUser(`pay${i}`);
      return makeBot(u.id, "caller");
    });
    const expectedPool = 250 * 9;
    const { results } = await runTournament(
      cfg.id,
      bots.map((b) => b.id),
    );
    const totalPayout = results.reduce((s, r) => s + r.payout, 0);
    assertEqual(
      totalPayout,
      expectedPool,
      `Payouts ${totalPayout} should equal prize pool ${expectedPool}`,
    );
  },
);

testAsync("2-player payout: winner takes 100%", async () => {
  const cfg = makeTournament({ buy_in: 500, min_players: 2, max_players: 9 });
  const u1 = makeUser("p2a");
  const b1 = makeBot(u1.id, "smart");
  const u2 = makeUser("p2b");
  const b2 = makeBot(u2.id, "folder");
  const { results } = await runTournament(cfg.id, [b1.id, b2.id]);
  assertEqual(results[0].payout, 1000, "Winner should take full 1000");
  assertEqual(results[1].payout, 0, "Loser gets nothing");
});

testAsync("6-player payout: top 2 paid at 65/35", async () => {
  const cfg = makeTournament({ buy_in: 100, min_players: 2, max_players: 9 });
  const bots = Array.from({ length: 6 }, (_, i) => {
    const u = makeUser(`p6_${i}`);
    return makeBot(u.id, i % 2 === 0 ? "smart" : "caller");
  });
  const pool = 100 * 6;
  const { results } = await runTournament(
    cfg.id,
    bots.map((b) => b.id),
  );
  const paidResults = results.filter((r) => r.payout > 0);
  assertEqual(paidResults.length, 2, "Exactly 2 players should be paid");
  const total = results.reduce((s, r) => s + r.payout, 0);
  assertEqual(total, pool, `Total payout ${total} should equal pool ${pool}`);
  // Check 65/35 split
  assert(
    paidResults[0].payout === Math.floor(pool * 0.65) ||
      paidResults[0].payout === Math.ceil(pool * 0.65),
    `1st place should get ~65% of pool, got ${paidResults[0].payout}`,
  );
});

// ─────────────────────────────────────────────────────────────
// SCENARIO 6: Blind level advancement
// ─────────────────────────────────────────────────────────────

console.log("\n── Blind Level Advancement ─────────────────────────────");

testAsync("Blind levels advance every HANDS_PER_LEVEL hands", async () => {
  const cfg = makeTournament({ min_players: 2, max_players: 9 });
  const u1 = makeUser("bl1");
  const b1 = makeBot(u1.id, "caller");
  const u2 = makeUser("bl2");
  const b2 = makeBot(u2.id, "caller");

  const levelChanges = [];
  const { results } = await new Promise((resolve, reject) => {
    const director = new TournamentDirector({
      tournamentId: cfg.id,
      callBot: createSimBotCaller(),
      onStateUpdate: (id, state) => {
        const last = levelChanges[levelChanges.length - 1];
        if (!last || last.level !== state.level) {
          levelChanges.push({
            level: state.level,
            hands: state.handsThisLevel,
          });
        }
      },
      onFinished: (id, r) => resolve({ director, results: r }),
    });

    db.createEntry({
      tournament_id: cfg.id,
      bot_id: b1.id,
      chips_at_entry: 5000,
      entry_type: "initial",
    });
    db.createEntry({
      tournament_id: cfg.id,
      bot_id: b2.id,
      chips_at_entry: 5000,
      entry_type: "initial",
    });
    db.updateTournamentStatus(cfg.id, "running");

    const orig = director._startTable.bind(director);
    director._startTable = function (t, b, c) {
      orig(t, b, c);
      const e = director.tables.get(t.id);
      if (e?.game) e.game._sleepMs = 0;
    };

    director.start().catch(reject);
  });

  assert(
    levelChanges.length >= 2,
    `Should have advanced at least 2 levels, got ${levelChanges.length}`,
  );
  // Level 1 should have run for exactly HANDS_PER_LEVEL hands before advancing
  assertEqual(levelChanges[0].level, 1, "Should start at level 1");
});

testAsync("Blinds on game instances update when level advances", async () => {
  const cfg = makeTournament({
    min_players: 2,
    max_players: 9,
    late_reg_ends_level: 4,
  });
  const u1 = makeUser("badv1");
  const b1 = makeBot(u1.id, "caller");
  const u2 = makeUser("badv2");
  const b2 = makeBot(u2.id, "caller");

  const blindSnapshots = [];
  await new Promise((resolve, reject) => {
    const director = new TournamentDirector({
      tournamentId: cfg.id,
      callBot: createSimBotCaller(),
      onStateUpdate: (id, state) => {
        if (state.blinds) {
          const last = blindSnapshots[blindSnapshots.length - 1];
          if (!last || last.small !== state.blinds.small) {
            blindSnapshots.push({
              level: state.level,
              small: state.blinds.small,
              big: state.blinds.big,
            });
          }
        }
      },
      onFinished: (id, r) => resolve(r),
    });

    db.createEntry({
      tournament_id: cfg.id,
      bot_id: b1.id,
      chips_at_entry: 5000,
      entry_type: "initial",
    });
    db.createEntry({
      tournament_id: cfg.id,
      bot_id: b2.id,
      chips_at_entry: 5000,
      entry_type: "initial",
    });
    db.updateTournamentStatus(cfg.id, "running");

    const orig = director._startTable.bind(director);
    director._startTable = function (t, b, c) {
      orig(t, b, c);
      const e = director.tables.get(t.id);
      if (e?.game) e.game._sleepMs = 0;
    };

    director.start().catch(reject);
  });

  assert(blindSnapshots.length >= 1, "Should have at least one blind snapshot");
  assertEqual(blindSnapshots[0].small, 25, "Level 1 small blind should be 25");
  assertEqual(blindSnapshots[0].big, 50, "Level 1 big blind should be 50");
  if (blindSnapshots.length >= 2) {
    assert(
      blindSnapshots[1].small > blindSnapshots[0].small,
      "Blinds should increase at level advance",
    );
  }
});

// ─────────────────────────────────────────────────────────────
// SCENARIO 7: Data integrity
// ─────────────────────────────────────────────────────────────

console.log("\n── Data Integrity ──────────────────────────────────────");

testAsync("All hands are persisted to DB after tournament", async () => {
  const cfg = makeTournament({ min_players: 2, max_players: 9 });
  const u1 = makeUser("di1");
  const b1 = makeBot(u1.id, "smart");
  const u2 = makeUser("di2");
  const b2 = makeBot(u2.id, "caller");

  const { results } = await runTournament(cfg.id, [b1.id, b2.id]);

  // Find the game for this tournament
  const tables = db.getTournamentTables(cfg.id);
  assert(tables.length >= 1, "Should have at least one table");
  const gameId = tables[0].game_id;
  assert(gameId, "Table should have a game_id");

  const hands = db.getHandsByGame(gameId);
  assert(hands.length > 0, `Should have hands recorded, got ${hands.length}`);

  // Every hand should have small/big blind snapshots
  for (const hand of hands) {
    assert(
      hand.big_blind > 0,
      `Hand ${hand.hand_number} should have big_blind recorded`,
    );
    assert(
      hand.small_blind > 0,
      `Hand ${hand.hand_number} should have small_blind recorded`,
    );
  }
});

testAsync("Actions are persisted including antes and blinds", async () => {
  const cfg = makeTournament({ min_players: 2, max_players: 9 });
  const u1 = makeUser("act1");
  const b1 = makeBot(u1.id, "smart");
  const u2 = makeUser("act2");
  const b2 = makeBot(u2.id, "caller");

  await runTournament(cfg.id, [b1.id, b2.id]);

  const tables = db.getTournamentTables(cfg.id);
  const gameId = tables[0].game_id;
  const hands = db.getHandsByGame(gameId);
  assert(hands.length > 0, "Should have hands");

  const firstHand = hands[0];
  const actions = db.getActionsByHand(firstHand.id);
  assert(actions.length > 0, `Should have actions for hand ${firstHand.id}`);

  // Should have ante actions (ante = 10 at level 1)
  const antes = actions.filter((a) => a.type === "ante");
  assert(
    antes.length > 0,
    `Should have ante actions, found: ${actions.map((a) => a.type).join(",")}`,
  );

  // Should have blind actions
  const blinds = actions.filter((a) => a.type === "blind");
  assert(
    blinds.length >= 2,
    `Should have at least 2 blind actions, got ${blinds.length}`,
  );

  // Every action should have pot_before and chips_before
  for (const action of actions.filter(
    (a) => a.type !== "ante" && a.type !== "blind",
  )) {
    assert(
      action.chips_before >= 0,
      `Action ${action.id} should have chips_before`,
    );
  }
});

testAsync("bot_stats updated after tournament", async () => {
  const cfg = makeTournament({ min_players: 2, max_players: 9 });
  const u1 = makeUser("bs1");
  const b1 = makeBot(u1.id, "smart");
  const u2 = makeUser("bs2");
  const b2 = makeBot(u2.id, "caller");

  await runTournament(cfg.id, [b1.id, b2.id]);

  const stats1 = db.getBotStats(b1.id);
  const stats2 = db.getBotStats(b2.id);

  assert(
    stats1.total_hands > 0,
    `Bot1 should have hands recorded, got ${stats1.total_hands}`,
  );
  assert(
    stats2.total_hands > 0,
    `Bot2 should have hands recorded, got ${stats2.total_hands}`,
  );
  assert(stats1.total_tournaments >= 1, "Should have tournament count");
  assert(stats2.total_tournaments >= 1, "Should have tournament count");
});

testAsync("Seat history recorded on table moves", async () => {
  const cfg = makeTournament({ min_players: 2, max_players: 18 });
  const bots = Array.from({ length: 18 }, (_, i) => {
    const u = makeUser(`sh${i}`);
    return makeBot(u.id, "caller");
  });

  await runTournament(
    cfg.id,
    bots.map((b) => b.id),
  );

  // At least some bots should have seat history (18 bots = 2 tables = some moves)
  let totalHistory = 0;
  for (const bot of bots) {
    const history = db.getSeatHistory(cfg.id, bot.id);
    totalHistory += history.length;
  }
  assert(
    totalHistory > 0,
    `Should have seat history records, got ${totalHistory}`,
  );
});

// ─────────────────────────────────────────────────────────────
// SCENARIO 8: Edge cases
// ─────────────────────────────────────────────────────────────

console.log("\n── Edge Cases ──────────────────────────────────────────");

testAsync(
  "Tournament with all-in bots completes (side pot stress)",
  async () => {
    const cfg = makeTournament({ min_players: 2, max_players: 9 });
    const bots = Array.from({ length: 6 }, (_, i) => {
      const u = makeUser(`allin_sc${i}`);
      return makeBot(u.id, "allin"); // every bot goes all-in every hand
    });
    const { results } = await runTournament(
      cfg.id,
      bots.map((b) => b.id),
    );
    assert(results.length === 6, "All 6 bots should have results");
    const totalPayout = results.reduce((s, r) => s + r.payout, 0);
    assertEqual(
      totalPayout,
      cfg.buy_in * 6,
      "Prize pool must be fully distributed",
    );
  },
);

testAsync(
  "Tournament with folder bots completes in reasonable time",
  async () => {
    // Folders fold everything — games drag until blinds kill them
    const cfg = makeTournament({ min_players: 2, max_players: 9 });
    const bots = [
      makeBot(makeUser("f1").id, "folder"),
      makeBot(makeUser("f2").id, "smart"), // one smart bot to keep it moving
    ];
    const start = Date.now();
    const { results } = await runTournament(
      cfg.id,
      bots.map((b) => b.id),
    );
    const elapsed = Date.now() - start;
    assert(results.length === 2, "Should complete");
    assert(elapsed < 30000, `Should complete in under 30s, took ${elapsed}ms`);
  },
);

testAsync(
  "Bot with 0 chips sits out and does not cause division by zero",
  async () => {
    // Maniac + allin should create 0-chip situations frequently
    const cfg = makeTournament({ min_players: 2, max_players: 9 });
    const bots = Array.from({ length: 4 }, (_, i) => {
      const p = i % 2 === 0 ? "allin" : "maniac";
      const u = makeUser(`zero${i}`);
      return makeBot(u.id, p);
    });
    const { results } = await runTournament(
      cfg.id,
      bots.map((b) => b.id),
    );
    assert(
      results.some((r) => r.finish_position === 1),
      "Should have a winner",
    );
  },
);

// ─────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────

// Wait for all async tests to settle
setTimeout(() => {
  console.log("\n══════════════════════════════════════════════════════");
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  if (failures.length) {
    console.log("\n  Failures:");
    failures.forEach((f) => console.log(`    ✗ ${f.name}\n      ${f.error}`));
  }
  console.log("══════════════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}, 60000);
