#!/usr/bin/env npx ts-node
/**
 * Battle Lab — 1,000 Headless Tournament Benchmark
 * =================================================
 * Runs 1,000 full 9-max tournaments via the WorkerPool and produces:
 *
 *   Primary:    ROI per profile, ITM%, total profit/loss
 *   Behavioral: VPIP, PFR, river bluff success rate
 *   Technical:  avg hands/tournament, total execution time
 *   Integrity:  negative-pot & split-pot errors → logs/engine_bugs.json
 *
 * Usage:
 *   npx ts-node scripts/battle-lab.ts [--tournaments=N] [--workers=N]
 *
 * Output:
 *   console.table summary
 *   battle_lab_results.json (aggregated analytics)
 *   logs/engine_bugs.json   (integrity violations, only if found)
 */

import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { WorkerPool } from "../src/workers/worker-pool";
import type { SimulationInput, SimulationOutput, SimBotEntry, SimBlindLevel } from "../src/workers/simulation.types";

// ─── CLI args ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const parseArg = (key: string, def: number) => {
  const found = argv.find((a) => a.startsWith(`--${key}=`));
  return found ? parseInt(found.split("=")[1], 10) || def : def;
};

const TOTAL_TOURNAMENTS = parseArg("tournaments", 200);
const WORKER_COUNT = parseArg("workers", Math.max(2, Math.min(os.cpus().length, 16)));
const STARTING_CHIPS = 1_500;
const SEATS_PER_TABLE = 9;

// ─── ANSI colours ─────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", magenta: "\x1b[35m",
};
const bold = (s: string) => `${C.bold}${s}${C.reset}`;
const dim  = (s: string) => `${C.dim}${s}${C.reset}`;
const cyan = (s: string) => `${C.cyan}${s}${C.reset}`;
const green = (s: string) => `${C.green}${s}${C.reset}`;
const yellow = (s: string) => `${C.yellow}${s}${C.reset}`;

function renderProgressBar(completed: number, total: number, elapsedSec: number): string {
  const pct = total > 0 ? completed / total : 0;
  const barWidth = 30;
  const filled = Math.round(pct * barWidth);
  const bar = '#'.repeat(filled) + ' '.repeat(barWidth - filled);
  const pctStr = Math.floor(pct * 100).toString().padStart(3);
  const eta = completed > 0 && completed < total
    ? `${Math.round((elapsedSec / completed) * (total - completed))}s`
    : completed >= total ? 'done' : '?';
  return `\r  [${cyan(bar)}] ${bold(pctStr + '%')}  ${completed.toLocaleString()}/${total.toLocaleString()}  ${dim(elapsedSec.toFixed(1) + 's')}  ETA: ${dim(eta)}  `;
}

// ─── Payout structure (9-player, top 3 paid) ──────────────────────────────────

const BUY_IN = 1; // 1 unit
const PRIZE_POOL = SEATS_PER_TABLE * BUY_IN; // 9 units
const PAYOUTS: Record<number, number> = {
  1: PRIZE_POOL * 0.50, // 4.5 units
  2: PRIZE_POOL * 0.30, // 2.7 units
  3: PRIZE_POOL * 0.20, // 1.8 units
};

// ─── Blind levels (9-player, fast escalation for headless speed) ──────────────

const BLIND_LEVELS: SimBlindLevel[] = [
  { level: 1, smallBlind:   25, bigBlind:   50, ante:   0, handsPerLevel: 15 },
  { level: 2, smallBlind:   50, bigBlind:  100, ante:  10, handsPerLevel: 15 },
  { level: 3, smallBlind:   75, bigBlind:  150, ante:  15, handsPerLevel: 12 },
  { level: 4, smallBlind:  100, bigBlind:  200, ante:  25, handsPerLevel: 12 },
  { level: 5, smallBlind:  150, bigBlind:  300, ante:  30, handsPerLevel: 10 },
  { level: 6, smallBlind:  200, bigBlind:  400, ante:  40, handsPerLevel: 10 },
  { level: 7, smallBlind:  300, bigBlind:  600, ante:  60, handsPerLevel:  8 },
  { level: 8, smallBlind:  500, bigBlind: 1000, ante: 100, handsPerLevel:  8 },
  { level: 9, smallBlind: 1000, bigBlind: 2000, ante: 200, handsPerLevel: 999 },
];

// ─── Bot profile definitions ──────────────────────────────────────────────────

/** Stable profile keys — used for grouping analytics. */
type ProfileKey = "The Shark" | "The Nit" | "Balanced Pro" | "Random" | "UserBot";

interface ProfileSlot {
  key: ProfileKey;
  /** Human-readable slot label, e.g. "shark_1" */
  slotId: string;
  buildStrategy: (tournamentIdx: number) => Record<string, any>;
}

function quickStrategy(personality: Record<string, number>) {
  return { version: 1, tier: "quick", personality };
}

function randomPersonality(seed: number) {
  // Deterministic-enough "random" per (tournament, slot) pair
  const r = (n: number) => Math.abs(Math.sin(seed * 7919 + n * 3571) * 100) % 100;
  return {
    aggression:     Math.floor(r(1)),
    bluffFrequency: Math.floor(r(2)),
    riskTolerance:  Math.floor(r(3)),
    tightness:      Math.floor(r(4)),
  };
}

const PROFILE_SLOTS: ProfileSlot[] = [
  {
    key: "The Shark",
    slotId: "shark_1",
    buildStrategy: () => quickStrategy({ aggression: 75, bluffFrequency: 20, riskTolerance: 50, tightness: 70 }),
  },
  {
    key: "The Shark",
    slotId: "shark_2",
    buildStrategy: () => quickStrategy({ aggression: 75, bluffFrequency: 20, riskTolerance: 50, tightness: 70 }),
  },
  {
    key: "The Nit",
    slotId: "nit_1",
    buildStrategy: () => quickStrategy({ aggression: 10, bluffFrequency: 0, riskTolerance: 10, tightness: 95 }),
  },
  {
    key: "The Nit",
    slotId: "nit_2",
    buildStrategy: () => quickStrategy({ aggression: 10, bluffFrequency: 0, riskTolerance: 10, tightness: 95 }),
  },
  {
    key: "Balanced Pro",
    slotId: "balanced_1",
    buildStrategy: () => quickStrategy({ aggression: 60, bluffFrequency: 30, riskTolerance: 55, tightness: 55 }),
  },
  {
    key: "Balanced Pro",
    slotId: "balanced_2",
    buildStrategy: () => quickStrategy({ aggression: 60, bluffFrequency: 30, riskTolerance: 55, tightness: 55 }),
  },
  {
    key: "Random",
    slotId: "random_1",
    buildStrategy: (idx) => quickStrategy(randomPersonality(idx * 2)),
  },
  {
    key: "Random",
    slotId: "random_2",
    buildStrategy: (idx) => quickStrategy(randomPersonality(idx * 2 + 1)),
  },
  {
    key: "UserBot",
    slotId: "userbot_1",
    // UserBot uses Balanced Pro settings — represents "current user logic"
    buildStrategy: () => quickStrategy({ aggression: 60, bluffFrequency: 30, riskTolerance: 55, tightness: 55 }),
  },
];

// ─── Analytics accumulators ───────────────────────────────────────────────────

interface ProfileStats {
  entries:          number; // total tournament entries (slots × tournaments)
  wins:             number; // 1st-place finishes
  itmFinishes:      number; // top-3 finishes
  totalPayout:      number; // sum of payout units received
  totalHands:       number; // hands participated in across all tournaments
  vpipHands:        number; // hands with a voluntary preflop call or raise
  pfrHands:         number; // hands with a preflop raise
  riverRaises:      number; // total river bet/raise actions
  riverRaiseWins:   number; // river raises where the bot won the hand
}

function emptyStats(): ProfileStats {
  return {
    entries: 0, wins: 0, itmFinishes: 0, totalPayout: 0,
    totalHands: 0, vpipHands: 0, pfrHands: 0,
    riverRaises: 0, riverRaiseWins: 0,
  };
}

const profileStats = new Map<ProfileKey, ProfileStats>();
for (const slot of PROFILE_SLOTS) {
  if (!profileStats.has(slot.key)) profileStats.set(slot.key, emptyStats());
}

// ─── Integrity guard ──────────────────────────────────────────────────────────

interface EngineBug {
  type: "negative_pot" | "split_pot_error";
  tournamentId: string;
  handId: string;
  details: Record<string, any>;
  /** Abbreviated hand history for debugging */
  handHistory: {
    communityCards: any[];
    players: Array<{ botId: string; startChips: number; endChips: number; amountBet: number; won: boolean; amountWon: number }>;
    actions: Array<{ botId: string; street: string; action: string; amount: number }>;
  };
}

const engineBugs: EngineBug[] = [];

function checkIntegrity(output: SimulationOutput): void {
  // Build a lookup: handId → list of handPlayer records
  const handPlayersByHand = new Map<string, typeof output.handPlayers>();
  for (const hp of output.handPlayers) {
    if (!handPlayersByHand.has(hp.handId)) handPlayersByHand.set(hp.handId, []);
    handPlayersByHand.get(hp.handId)!.push(hp);
  }

  // Build action lookup
  const actionsByHand = new Map<string, typeof output.actions>();
  for (const a of output.actions) {
    if (!actionsByHand.has(a.handId)) actionsByHand.set(a.handId, []);
    actionsByHand.get(a.handId)!.push(a);
  }

  for (const hand of output.hands) {
    const hps = handPlayersByHand.get(hand.handId) ?? [];

    const buildHistory = (): EngineBug["handHistory"] => ({
      communityCards: hand.communityCards,
      players: hps.map((hp) => ({
        botId: hp.botId, startChips: hp.startChips, endChips: hp.endChips,
        amountBet: hp.amountBet, won: hp.won, amountWon: hp.amountWon,
      })),
      actions: (actionsByHand.get(hand.handId) ?? []).map((a) => ({
        botId: a.botId, street: a.street, action: a.action, amount: a.amount,
      })),
    });

    // Check 1: negative pot
    if (hand.pot < 0) {
      engineBugs.push({
        type: "negative_pot",
        tournamentId: output.tournamentId,
        handId: hand.handId,
        details: { pot: hand.pot, handNumber: hand.handNumber },
        handHistory: buildHistory(),
      });
    }

    // Check 2: split pot error — sum of winner payouts vs pot (allow ±1 for rounding)
    const totalWon = hps.filter((hp) => hp.won).reduce((s, hp) => s + hp.amountWon, 0);
    if (hand.pot > 0 && Math.abs(totalWon - hand.pot) > 1) {
      engineBugs.push({
        type: "split_pot_error",
        tournamentId: output.tournamentId,
        handId: hand.handId,
        details: { pot: hand.pot, totalWon, delta: totalWon - hand.pot },
        handHistory: buildHistory(),
      });
    }
  }
}

// ─── Process one tournament result ───────────────────────────────────────────

function processTournamentResult(
  output: SimulationOutput,
  tournamentIdx: number,
): void {
  // Map botId → profileKey for this tournament
  const botToProfile = new Map<string, ProfileKey>();
  for (const slot of PROFILE_SLOTS) {
    const botId = `${slot.slotId}_t${tournamentIdx}`;
    botToProfile.set(botId, slot.key);
  }

  // Derive bust order from hand history.
  // Eliminated bots stay in event.players with chips=0 for all subsequent hands,
  // so we cannot use "last hand appeared in". Instead, find the BUST hand: the
  // highest-numbered hand where startChips > 0 && endChips = 0.
  // Higher bust-hand number = survived longer = better finish position.
  const handNumberByHandId = new Map<string, number>();
  for (const hand of output.hands) {
    handNumberByHandId.set(hand.handId, hand.handNumber);
  }
  const bustHandByBot = new Map<string, number>(); // handNumber where bot first hit 0 chips
  for (const hp of output.handPlayers) {
    if (hp.startChips > 0 && hp.endChips === 0) {
      const hNum = handNumberByHandId.get(hp.handId) ?? 0;
      const prev = bustHandByBot.get(hp.botId) ?? 0;
      if (hNum > prev) bustHandByBot.set(hp.botId, hNum);
    }
  }

  const positions = new Map<string, number>();
  if (output.winnerId) positions.set(output.winnerId, 1);
  // Sort busted bots by bust-hand DESC: busted latest = 2nd place
  const bustedBotIds = [...bustHandByBot.keys()].filter((id) => id !== output.winnerId);
  bustedBotIds.sort((a, b) => (bustHandByBot.get(b)! - bustHandByBot.get(a)!));
  bustedBotIds.forEach((botId, idx) => positions.set(botId, idx + 2));

  // Primary stats
  for (const [botId, position] of positions) {
    const profileKey = botToProfile.get(botId);
    if (!profileKey) continue;
    const stats = profileStats.get(profileKey)!;
    stats.entries++;
    const payout = PAYOUTS[position] ?? 0;
    stats.totalPayout += payout;
    if (position === 1) stats.wins++;
    if (position <= 3) stats.itmFinishes++;
  }

  // Behavioral: VPIP, PFR, river bluff
  // Collect hands won per bot for river raise win-rate
  const handsWonByBot = new Map<string, Set<string>>();
  for (const hp of output.handPlayers) {
    if (hp.won) {
      if (!handsWonByBot.has(hp.botId)) handsWonByBot.set(hp.botId, new Set());
      handsWonByBot.get(hp.botId)!.add(hp.handId);
    }
  }

  // Total hands per bot (from handPlayers)
  const handsDealtPerBot = new Map<string, number>();
  for (const hp of output.handPlayers) {
    handsDealtPerBot.set(hp.botId, (handsDealtPerBot.get(hp.botId) ?? 0) + 1);
  }

  // Preflop actions: VPIP = distinct hands with preflop call/raise; PFR = preflop raise
  const vpipHands = new Map<string, Set<string>>();   // botId → Set<handId>
  const pfrHands  = new Map<string, Set<string>>();
  const riverRaiseHands = new Map<string, string[]>(); // botId → handId[]

  for (const action of output.actions) {
    const profileKey = botToProfile.get(action.botId);
    if (!profileKey) continue;

    if (action.street === "preflop") {
      if (action.action === "call" || action.action === "raise" || action.action === "bet") {
        if (!vpipHands.has(action.botId)) vpipHands.set(action.botId, new Set());
        vpipHands.get(action.botId)!.add(action.handId);
      }
      if (action.action === "raise" || action.action === "bet") {
        if (!pfrHands.has(action.botId)) pfrHands.set(action.botId, new Set());
        pfrHands.get(action.botId)!.add(action.handId);
      }
    }

    if (action.street === "river" && (action.action === "raise" || action.action === "bet")) {
      if (!riverRaiseHands.has(action.botId)) riverRaiseHands.set(action.botId, []);
      riverRaiseHands.get(action.botId)!.push(action.handId);
    }
  }

  // Accumulate behavioral stats per profile
  for (const [botId, profileKey] of botToProfile) {
    const stats = profileStats.get(profileKey)!;
    stats.totalHands      += handsDealtPerBot.get(botId) ?? 0;
    stats.vpipHands       += vpipHands.get(botId)?.size ?? 0;
    stats.pfrHands        += pfrHands.get(botId)?.size ?? 0;

    const wonSet = handsWonByBot.get(botId) ?? new Set<string>();
    const rRaises = riverRaiseHands.get(botId) ?? [];
    stats.riverRaises     += rRaises.length;
    stats.riverRaiseWins  += rRaises.filter((hid) => wonSet.has(hid)).length;
  }

  // Integrity check
  checkIntegrity(output);
}

// ─── Build SimulationInput for one tournament ─────────────────────────────────

function buildInput(tournamentIdx: number): SimulationInput {
  const tournamentId = `battle-${tournamentIdx.toString().padStart(4, "0")}`;
  const entries: SimBotEntry[] = PROFILE_SLOTS.map((slot) => ({
    botId:    `${slot.slotId}_t${tournamentIdx}`,
    name:     `${slot.key} (${slot.slotId})`,
    strategy: slot.buildStrategy(tournamentIdx),
  }));

  return {
    config: {
      tournamentId,
      blindLevels: BLIND_LEVELS,
      startingChips: STARTING_CHIPS,
      seatsPerTable: SEATS_PER_TABLE,
      breakThreshold: SEATS_PER_TABLE - 1,
    },
    entries,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const workerPath = __filename.endsWith(".ts")
    ? path.join(__dirname, "../src/workers/pool-tournament-worker.ts")
    : path.join(__dirname, "../src/workers/pool-tournament-worker.js");
  const execArgv = __filename.endsWith(".ts") ? ["-r", "ts-node/register/transpile-only"] : [];

  console.log(`\n${bold("╔══════════════════════════════════════════════════╗")}`);
  console.log(`${bold("║          ⚔  BATTLE LAB — HEADLESS ARENA  ⚔        ║")}`);
  console.log(`${bold("╚══════════════════════════════════════════════════╝")}`);
  console.log(dim(`  ${TOTAL_TOURNAMENTS.toLocaleString()} tournaments · ${SEATS_PER_TABLE} seats · ${WORKER_COUNT} workers`));
  console.log(dim(`  Profiles: 2×Shark · 2×Nit · 2×BalancedPro · 2×Random · 1×UserBot\n`));

  const pool = new WorkerPool(WORKER_COUNT, workerPath, execArgv);
  const wallStart = Date.now();

  let completed = 0;
  let failed = 0;
  const profileTotalDurationMs: number[] = [];

  // Dispatch all tournaments; process results as they arrive (no batching needed —
  // the WorkerPool queues internally and each result is processed+GC'd immediately).
  const promises = Array.from({ length: TOTAL_TOURNAMENTS }, (_, i) =>
    pool
      .dispatch(`battle-${i}`, buildInput(i))
      .then((output) => {
        profileTotalDurationMs.push(output.durationMs);
        processTournamentResult(output, i);
        completed++;

        // Per-tournament log line
        const slotId = output.winnerId?.replace(/_t\d+$/, "") ?? "?";
        const winnerSlot = PROFILE_SLOTS.find((s) => s.slotId === slotId);
        const winnerName = winnerSlot ? winnerSlot.key : output.winnerId ?? "?";
        const handCount = output.hands.length;
        const tNum = (i + 1).toString().padStart(String(TOTAL_TOURNAMENTS).length, "0");
        process.stdout.write(
          `\n  ${dim(`T${tNum}`)}  winner: ${cyan(winnerName.padEnd(14))}  hands: ${String(handCount).padStart(3)}  ${dim(output.durationMs + "ms")}`,
        );

        process.stdout.write(renderProgressBar(completed, TOTAL_TOURNAMENTS, (Date.now() - wallStart) / 1000));
      })
      .catch((err) => {
        failed++;
        process.stderr.write(`\n  [WORKER ERROR] tournament ${i}: ${err.message}\n`);
      }),
  );

  await Promise.allSettled(promises);
  pool.shutdown();

  const wallMs = Date.now() - wallStart;
  const avgTournamentMs =
    profileTotalDurationMs.length > 0
      ? Math.round(profileTotalDurationMs.reduce((a, b) => a + b, 0) / profileTotalDurationMs.length)
      : 0;

  process.stdout.write("\n");

  // ─── Compute derived metrics ───────────────────────────────────────────────

  const successfulTournaments = TOTAL_TOURNAMENTS - failed;

  interface AnalyticsRow {
    Profile:           string;
    Entries:           number;
    "Win%":            string;
    "ITM%":            string;
    ROI:               string;
    "Total P/L":       string;
    "VPIP%":           string;
    "PFR%":            string;
    "River Aggr Win%": string;
  }

  const tableRows: AnalyticsRow[] = [];
  const profileAnalytics: Record<string, object> = {};

  for (const [key, stats] of profileStats) {
    const roi = stats.entries > 0
      ? ((stats.totalPayout - stats.entries * BUY_IN) / (stats.entries * BUY_IN)) * 100
      : 0;
    const profitLoss = stats.totalPayout - stats.entries * BUY_IN;
    const winPct     = stats.entries > 0 ? (stats.wins / stats.entries) * 100 : 0;
    const itmPct     = stats.entries > 0 ? (stats.itmFinishes / stats.entries) * 100 : 0;
    const vpipPct    = stats.totalHands > 0 ? (stats.vpipHands / stats.totalHands) * 100 : 0;
    const pfrPct     = stats.totalHands > 0 ? (stats.pfrHands / stats.totalHands) * 100 : 0;
    const riverWinPct = stats.riverRaises > 0 ? (stats.riverRaiseWins / stats.riverRaises) * 100 : 0;

    tableRows.push({
      Profile:           key,
      Entries:           stats.entries,
      "Win%":            `${winPct.toFixed(1)}%`,
      "ITM%":            `${itmPct.toFixed(1)}%`,
      ROI:               `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`,
      "Total P/L":       `${profitLoss >= 0 ? "+" : ""}${profitLoss.toFixed(1)}`,
      "VPIP%":           `${vpipPct.toFixed(1)}%`,
      "PFR%":            `${pfrPct.toFixed(1)}%`,
      "River Aggr Win%": `${riverWinPct.toFixed(1)}%`,
    });

    profileAnalytics[key] = {
      entries: stats.entries,
      wins: stats.wins,
      itmFinishes: stats.itmFinishes,
      totalPayout: parseFloat(stats.totalPayout.toFixed(2)),
      profitLoss: parseFloat(profitLoss.toFixed(2)),
      roi: parseFloat(roi.toFixed(2)),
      winPct: parseFloat(winPct.toFixed(2)),
      itmPct: parseFloat(itmPct.toFixed(2)),
      totalHands: stats.totalHands,
      vpip: parseFloat(vpipPct.toFixed(2)),
      pfr: parseFloat(pfrPct.toFixed(2)),
      riverRaises: stats.riverRaises,
      riverRaiseWins: stats.riverRaiseWins,
      riverAggrWinPct: parseFloat(riverWinPct.toFixed(2)),
    };
  }

  // ─── Print results ─────────────────────────────────────────────────────────

  console.log(`\n${bold("══════════════════════════════════════════════════")}`);
  console.log(`${bold("  BATTLE LAB RESULTS")}`);
  console.log(`${bold("══════════════════════════════════════════════════")}\n`);

  console.table(tableRows);

  const avgHandsPerTournament = profileTotalDurationMs.length > 0
    ? Math.round(
        Array.from(profileStats.values()).reduce((s, p) => s + p.totalHands, 0) /
        PROFILE_SLOTS.length /
        successfulTournaments,
      )
    : 0;

  console.log(`\n${bold("  Technical")}`);
  console.log(`  Tournaments:       ${successfulTournaments.toLocaleString()} succeeded, ${failed} failed`);
  console.log(`  Avg hands/tourney: ${avgHandsPerTournament.toLocaleString()}`);
  console.log(`  Avg tourney time:  ${avgTournamentMs.toLocaleString()}ms`);
  console.log(`  Total wall time:   ${(wallMs / 1000).toFixed(1)}s`);
  console.log(`  Throughput:        ${(successfulTournaments / (wallMs / 1000)).toFixed(1)} tournaments/sec\n`);

  // Integrity report
  if (engineBugs.length > 0) {
    console.log(`  ${yellow(`⚠  ${engineBugs.length} integrity violation(s) found — see logs/engine_bugs.json`)}`);
  } else {
    console.log(`  ${green("✓  Integrity: 0 violations (no negative pots, no split-pot errors)")}`);
  }

  console.log(`\n${bold("══════════════════════════════════════════════════")}\n`);

  // ─── Save outputs ──────────────────────────────────────────────────────────

  const outDir = path.join(__dirname, "..");
  const logsDir = path.join(outDir, "logs");

  // battle_lab_results.json
  const results = {
    meta: {
      totalTournaments:    TOTAL_TOURNAMENTS,
      successfulTournaments,
      failedTournaments:   failed,
      seatsPerTable:       SEATS_PER_TABLE,
      startingChips:       STARTING_CHIPS,
      payouts:             PAYOUTS,
      workerCount:         WORKER_COUNT,
      avgHandsPerTournament,
      avgTournamentMs,
      totalWallMs:         wallMs,
      throughputPerSec:    parseFloat((successfulTournaments / (wallMs / 1000)).toFixed(2)),
      timestamp:           new Date().toISOString(),
    },
    profiles: profileAnalytics,
    integrity: {
      violations:         engineBugs.length,
      violationsByType:   engineBugs.reduce<Record<string, number>>((acc, b) => {
        acc[b.type] = (acc[b.type] ?? 0) + 1;
        return acc;
      }, {}),
      detailFile: engineBugs.length > 0 ? "logs/engine_bugs.json" : null,
    },
  };

  const resultsPath = path.join(outDir, "battle_lab_results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`  Saved: ${bold("battle_lab_results.json")}`);

  // logs/engine_bugs.json (only when violations exist)
  if (engineBugs.length > 0) {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const bugsPath = path.join(logsDir, "engine_bugs.json");
    fs.writeFileSync(bugsPath, JSON.stringify(engineBugs, null, 2));
    console.log(`  Saved: ${bold("logs/engine_bugs.json")} (${engineBugs.length} bugs)`);
  }

  console.log();

  process.exit(failed > 0 || engineBugs.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(2);
});
