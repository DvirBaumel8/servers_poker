#!/usr/bin/env npx ts-node
/**
 * Tier 1 Personality Stress Test — 5,000 Headless Tournaments
 * ============================================================
 * Runs 5,000 full 9-max tournaments via the WorkerPool with 1 instance of
 * each Tier 1 personality. Produces:
 *
 *   Primary:     Combined ROI report for all 9 profiles
 *   Exploitation Cross-Exploitation Matrix (who knocks out whom)
 *   Variance:    ROI stability — first 1k vs mid 3k vs last 1k
 *   Performance: Peak/avg worker utilization, total wall time
 *   Integrity:   Negative-pot & split-pot violations → logs/engine_bugs.json
 *
 * Usage:
 *   npx ts-node scripts/stress-test-tier1.ts [--tournaments=N] [--workers=N]
 *
 * Output:
 *   console tables (ROI, Exploitation Matrix, Variance)
 *   stress_test_results.json
 *   logs/engine_bugs.json (only if integrity violations found)
 */

import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { WorkerPool } from "../src/workers/worker-pool";
import type {
  SimulationInput,
  SimulationOutput,
  SimBotEntry,
  SimBlindLevel,
} from "../src/workers/simulation.types";

// ─── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const parseArg = (key: string, def: number) => {
  const found = argv.find((a) => a.startsWith(`--${key}=`));
  return found ? parseInt(found.split("=")[1], 10) || def : def;
};

const TOTAL_TOURNAMENTS = parseArg("tournaments", 5_000);
const WORKER_COUNT = parseArg("workers", Math.min(os.cpus().length, 12));
const STARTING_CHIPS = 1_500;
const SEATS_PER_TABLE = 9;

// Variance windows
const VARIANCE_FIRST_END = 1_000;
const VARIANCE_LAST_START = TOTAL_TOURNAMENTS - 1_000;

// ─── ANSI colours ──────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};
const bold    = (s: string) => `${C.bold}${s}${C.reset}`;
const dim     = (s: string) => `${C.dim}${s}${C.reset}`;
const cyan    = (s: string) => `${C.cyan}${s}${C.reset}`;
const green   = (s: string) => `${C.green}${s}${C.reset}`;
const yellow  = (s: string) => `${C.yellow}${s}${C.reset}`;
const magenta = (s: string) => `${C.magenta}${s}${C.reset}`;

// ─── Payout structure (9-player, top 3 paid) ───────────────────────────────────

const BUY_IN = 1;
const PRIZE_POOL = SEATS_PER_TABLE * BUY_IN; // 9 units
const PAYOUTS: Record<number, number> = {
  1: PRIZE_POOL * 0.50, // 4.5 units
  2: PRIZE_POOL * 0.30, // 2.7 units
  3: PRIZE_POOL * 0.20, // 1.8 units
};

// ─── Blind levels ──────────────────────────────────────────────────────────────

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

// ─── Tier 1 profile definitions ────────────────────────────────────────────────

type ProfileKey =
  | "The Shark"
  | "The Rock"
  | "The Maniac"
  | "Calling Station"
  | "The Nit"
  | "Balanced Pro"
  | "Tricky"
  | "The Bully"
  | "Random";

const ALL_PROFILES: ProfileKey[] = [
  "The Shark",
  "The Rock",
  "The Maniac",
  "Calling Station",
  "The Nit",
  "Balanced Pro",
  "Tricky",
  "The Bully",
  "Random",
];

interface ProfileSlot {
  key: ProfileKey;
  slotId: string;
  buildStrategy: (tournamentIdx: number) => Record<string, unknown>;
}

function quickStrategy(personality: Record<string, number>) {
  return { version: 1, tier: "quick", personality };
}

function randomPersonality(seed: number) {
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
    key: "The Rock",
    slotId: "rock_1",
    buildStrategy: () => quickStrategy({ aggression: 25, bluffFrequency: 5, riskTolerance: 20, tightness: 90 }),
  },
  {
    key: "The Maniac",
    slotId: "maniac_1",
    buildStrategy: () => quickStrategy({ aggression: 95, bluffFrequency: 70, riskTolerance: 90, tightness: 15 }),
  },
  {
    key: "Calling Station",
    slotId: "cs_1",
    buildStrategy: () => quickStrategy({ aggression: 15, bluffFrequency: 5, riskTolerance: 50, tightness: 30 }),
  },
  {
    key: "The Nit",
    slotId: "nit_1",
    buildStrategy: () => quickStrategy({ aggression: 10, bluffFrequency: 0, riskTolerance: 10, tightness: 95 }),
  },
  {
    key: "Balanced Pro",
    slotId: "pro_1",
    buildStrategy: () => quickStrategy({ aggression: 60, bluffFrequency: 30, riskTolerance: 55, tightness: 55 }),
  },
  {
    key: "Tricky",
    slotId: "tricky_1",
    buildStrategy: () => quickStrategy({ aggression: 50, bluffFrequency: 55, riskTolerance: 45, tightness: 50 }),
  },
  {
    key: "The Bully",
    slotId: "bully_1",
    buildStrategy: () => quickStrategy({ aggression: 85, bluffFrequency: 45, riskTolerance: 75, tightness: 40 }),
  },
  {
    key: "Random",
    slotId: "random_1",
    buildStrategy: (idx) => quickStrategy(randomPersonality(idx)),
  },
];

// ─── Analytics accumulators ────────────────────────────────────────────────────

interface ProfileStats {
  entries:        number;
  wins:           number;
  itmFinishes:    number;
  totalPayout:    number;
  totalHands:     number;
  vpipHands:      number;
  pfrHands:       number;
  riverRaises:    number;
  riverRaiseWins: number;
}

function emptyStats(): ProfileStats {
  return {
    entries: 0, wins: 0, itmFinishes: 0, totalPayout: 0,
    totalHands: 0, vpipHands: 0, pfrHands: 0,
    riverRaises: 0, riverRaiseWins: 0,
  };
}

// Main accumulator
const profileStats = new Map<ProfileKey, ProfileStats>();
// Variance window accumulators
const statsFirst1k  = new Map<ProfileKey, ProfileStats>();
const statsMid3k    = new Map<ProfileKey, ProfileStats>();
const statsLast1k   = new Map<ProfileKey, ProfileStats>();

for (const key of ALL_PROFILES) {
  profileStats.set(key, emptyStats());
  statsFirst1k.set(key, emptyStats());
  statsMid3k.set(key, emptyStats());
  statsLast1k.set(key, emptyStats());
}

// Kill matrix: killMatrix[killerProfile][eliminatedProfile] = count
const killMatrix = new Map<ProfileKey, Map<ProfileKey, number>>();
// Co-occurrence: coOccurrence[profA][profB] = tournaments where both appeared
const coOccurrence = new Map<ProfileKey, Map<ProfileKey, number>>();

for (const a of ALL_PROFILES) {
  killMatrix.set(a, new Map());
  coOccurrence.set(a, new Map());
  for (const b of ALL_PROFILES) {
    killMatrix.get(a)!.set(b, 0);
    coOccurrence.get(a)!.set(b, 0);
  }
}

// ─── Integrity guard ───────────────────────────────────────────────────────────

interface EngineBug {
  type: "negative_pot" | "split_pot_error";
  tournamentId: string;
  handId: string;
  details: Record<string, unknown>;
  handHistory: {
    communityCards: unknown[];
    players: Array<{ botId: string; startChips: number; endChips: number; amountBet: number; won: boolean; amountWon: number }>;
    actions: Array<{ botId: string; street: string; action: string; amount: number }>;
  };
}

const engineBugs: EngineBug[] = [];

function checkIntegrity(output: SimulationOutput): void {
  const handPlayersByHand = new Map<string, typeof output.handPlayers>();
  for (const hp of output.handPlayers) {
    if (!handPlayersByHand.has(hp.handId)) handPlayersByHand.set(hp.handId, []);
    handPlayersByHand.get(hp.handId)!.push(hp);
  }

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

    if (hand.pot < 0) {
      engineBugs.push({
        type: "negative_pot",
        tournamentId: output.tournamentId,
        handId: hand.handId,
        details: { pot: hand.pot, handNumber: hand.handNumber },
        handHistory: buildHistory(),
      });
    }

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

// ─── Process one tournament result ─────────────────────────────────────────────

function processTournamentResult(output: SimulationOutput, tournamentIdx: number): void {
  // Map botId → profileKey for this tournament
  const botToProfile = new Map<string, ProfileKey>();
  for (const slot of PROFILE_SLOTS) {
    botToProfile.set(`${slot.slotId}_t${tournamentIdx}`, slot.key);
  }

  // Determine which variance window(s) apply
  const inFirst = tournamentIdx < VARIANCE_FIRST_END;
  const inLast  = tournamentIdx >= VARIANCE_LAST_START;
  const inMid   = !inFirst && !inLast;

  function addStats(map: Map<ProfileKey, ProfileStats>, key: ProfileKey, delta: Partial<ProfileStats>): void {
    const s = map.get(key)!;
    for (const [k, v] of Object.entries(delta) as [keyof ProfileStats, number][]) {
      (s as Record<keyof ProfileStats, number>)[k] += v;
    }
  }

  // Bust hand detection (same as battle-lab)
  const handNumberByHandId = new Map<string, number>();
  for (const hand of output.hands) {
    handNumberByHandId.set(hand.handId, hand.handNumber);
  }
  const bustHandByBot = new Map<string, number>();
  for (const hp of output.handPlayers) {
    if (hp.startChips > 0 && hp.endChips === 0) {
      const hNum = handNumberByHandId.get(hp.handId) ?? 0;
      const prev = bustHandByBot.get(hp.botId) ?? 0;
      if (hNum > prev) bustHandByBot.set(hp.botId, hNum);
    }
  }

  // Find bust hand ID for each bot (for kill matrix)
  const bustHandIdByBot = new Map<string, string>();
  for (const hp of output.handPlayers) {
    if (hp.startChips > 0 && hp.endChips === 0) {
      const hNum = handNumberByHandId.get(hp.handId) ?? 0;
      if (hNum === (bustHandByBot.get(hp.botId) ?? -1)) {
        bustHandIdByBot.set(hp.botId, hp.handId);
      }
    }
  }

  // Winner lookup: handId → Set of winning botIds
  const winnersOfHand = new Map<string, Set<string>>();
  for (const hp of output.handPlayers) {
    if (hp.won) {
      if (!winnersOfHand.has(hp.handId)) winnersOfHand.set(hp.handId, new Set());
      winnersOfHand.get(hp.handId)!.add(hp.botId);
    }
  }

  // Finish positions
  const positions = new Map<string, number>();
  if (output.winnerId) positions.set(output.winnerId, 1);
  const bustedBotIds = [...bustHandByBot.keys()].filter((id) => id !== output.winnerId);
  bustedBotIds.sort((a, b) => (bustHandByBot.get(b)! - bustHandByBot.get(a)!));
  bustedBotIds.forEach((botId, idx) => positions.set(botId, idx + 2));

  // Primary stats
  for (const [botId, position] of positions) {
    const profileKey = botToProfile.get(botId);
    if (!profileKey) continue;
    const payout = PAYOUTS[position] ?? 0;

    const delta: Partial<ProfileStats> = {
      entries: 1,
      totalPayout: payout,
      wins: position === 1 ? 1 : 0,
      itmFinishes: position <= 3 ? 1 : 0,
    };
    addStats(profileStats, profileKey, delta);
    if (inFirst) addStats(statsFirst1k, profileKey, delta);
    if (inMid)   addStats(statsMid3k,  profileKey, delta);
    if (inLast)  addStats(statsLast1k,  profileKey, delta);
  }

  // Kill matrix: for each busted bot, find who won their bust hand
  for (const [eliminatedBotId, bustHandId] of bustHandIdByBot) {
    const eliminatedProfile = botToProfile.get(eliminatedBotId);
    if (!eliminatedProfile) continue;
    const handWinners = winnersOfHand.get(bustHandId);
    if (!handWinners) continue;
    for (const killerBotId of handWinners) {
      const killerProfile = botToProfile.get(killerBotId);
      if (!killerProfile || killerProfile === eliminatedProfile) continue;
      killMatrix.get(killerProfile)!.set(
        eliminatedProfile,
        (killMatrix.get(killerProfile)!.get(eliminatedProfile) ?? 0) + 1,
      );
    }
  }

  // Co-occurrence: every pair of profiles in the same tournament
  for (let i = 0; i < ALL_PROFILES.length; i++) {
    for (let j = 0; j < ALL_PROFILES.length; j++) {
      if (i === j) continue;
      const a = ALL_PROFILES[i];
      const b = ALL_PROFILES[j];
      coOccurrence.get(a)!.set(b, (coOccurrence.get(a)!.get(b) ?? 0) + 1);
    }
  }

  // Behavioral: VPIP, PFR, river bluff
  const handsWonByBot = new Map<string, Set<string>>();
  for (const hp of output.handPlayers) {
    if (hp.won) {
      if (!handsWonByBot.has(hp.botId)) handsWonByBot.set(hp.botId, new Set());
      handsWonByBot.get(hp.botId)!.add(hp.handId);
    }
  }
  const handsDealtPerBot = new Map<string, number>();
  for (const hp of output.handPlayers) {
    handsDealtPerBot.set(hp.botId, (handsDealtPerBot.get(hp.botId) ?? 0) + 1);
  }

  const vpipHands   = new Map<string, Set<string>>();
  const pfrHands    = new Map<string, Set<string>>();
  const riverRaises = new Map<string, string[]>();

  for (const action of output.actions) {
    const profileKey = botToProfile.get(action.botId);
    if (!profileKey) continue;

    if (action.street === "preflop") {
      if (["call", "raise", "bet"].includes(action.action)) {
        if (!vpipHands.has(action.botId)) vpipHands.set(action.botId, new Set());
        vpipHands.get(action.botId)!.add(action.handId);
      }
      if (["raise", "bet"].includes(action.action)) {
        if (!pfrHands.has(action.botId)) pfrHands.set(action.botId, new Set());
        pfrHands.get(action.botId)!.add(action.handId);
      }
    }
    if (action.street === "river" && ["raise", "bet"].includes(action.action)) {
      if (!riverRaises.has(action.botId)) riverRaises.set(action.botId, []);
      riverRaises.get(action.botId)!.push(action.handId);
    }
  }

  for (const [botId, profileKey] of botToProfile) {
    const wonSet  = handsWonByBot.get(botId) ?? new Set<string>();
    const rRaises = riverRaises.get(botId) ?? [];
    const delta: Partial<ProfileStats> = {
      totalHands:    handsDealtPerBot.get(botId) ?? 0,
      vpipHands:     vpipHands.get(botId)?.size ?? 0,
      pfrHands:      pfrHands.get(botId)?.size ?? 0,
      riverRaises:   rRaises.length,
      riverRaiseWins: rRaises.filter((hid) => wonSet.has(hid)).length,
    };
    addStats(profileStats, profileKey, delta);
    if (inFirst) addStats(statsFirst1k, profileKey, delta);
    if (inMid)   addStats(statsMid3k,  profileKey, delta);
    if (inLast)  addStats(statsLast1k,  profileKey, delta);
  }

  checkIntegrity(output);
}

// ─── Build SimulationInput ──────────────────────────────────────────────────────

function buildInput(tournamentIdx: number): SimulationInput {
  const tournamentId = `stress-${tournamentIdx.toString().padStart(5, "0")}`;
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

// ─── Derived metric helpers ─────────────────────────────────────────────────────

function calcROI(stats: ProfileStats): number {
  if (stats.entries === 0) return 0;
  return ((stats.totalPayout - stats.entries * BUY_IN) / (stats.entries * BUY_IN)) * 100;
}

function roiStr(roi: number): string {
  return `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`;
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const workerPath = __filename.endsWith(".ts")
    ? path.join(__dirname, "../src/workers/pool-tournament-worker.ts")
    : path.join(__dirname, "../src/workers/pool-tournament-worker.js");
  const execArgv = __filename.endsWith(".ts") ? ["-r", "ts-node/register"] : [];

  console.log(`\n${bold("╔═══════════════════════════════════════════════════════╗")}`);
  console.log(`${bold("║       🏆  TIER 1 STRESS TEST — 5,000 TOURNAMENTS  🏆     ║")}`);
  console.log(`${bold("╚═══════════════════════════════════════════════════════╝")}`);
  console.log(dim(`  ${TOTAL_TOURNAMENTS.toLocaleString()} tournaments · ${SEATS_PER_TABLE} seats · ${WORKER_COUNT} workers (max 12)`));
  console.log(dim(`  Profiles: Shark · Rock · Maniac · CallingStation · Nit · BalancedPro · Tricky · Bully · Random\n`));

  const pool = new WorkerPool(WORKER_COUNT, workerPath, execArgv);
  const wallStart = Date.now();

  let completed = 0;
  let failed = 0;
  const profileTotalDurationMs: number[] = [];

  // Worker utilization tracking
  let peakActiveWorkers = 0;
  let utilizationSampleCount = 0;
  let utilizationSum = 0;

  const metricsTimer = setInterval(() => {
    const m = pool.getMetrics();
    if (m.activeWorkers > peakActiveWorkers) peakActiveWorkers = m.activeWorkers;
    utilizationSum += m.activeWorkers;
    utilizationSampleCount++;
  }, 500);

  const promises = Array.from({ length: TOTAL_TOURNAMENTS }, (_, i) =>
    pool
      .dispatch(`stress-${i}`, buildInput(i))
      .then((output) => {
        profileTotalDurationMs.push(output.durationMs);
        processTournamentResult(output, i);
        completed++;
        if (completed % 250 === 0 || completed === TOTAL_TOURNAMENTS) {
          const pct = ((completed / TOTAL_TOURNAMENTS) * 100).toFixed(0);
          const elapsed = ((Date.now() - wallStart) / 1000).toFixed(1);
          const m = pool.getMetrics();
          process.stdout.write(
            `\r  ${cyan(`${pct}%`)}  (${completed.toLocaleString()}/${TOTAL_TOURNAMENTS.toLocaleString()})  workers: ${magenta(`${m.activeWorkers}/${WORKER_COUNT}`)}  ${dim(`${elapsed}s`)}  `,
          );
        }
      })
      .catch((err) => {
        failed++;
        process.stderr.write(`\n  [WORKER ERROR] tournament ${i}: ${err.message}\n`);
      }),
  );

  await Promise.allSettled(promises);
  clearInterval(metricsTimer);
  pool.shutdown();

  const wallMs = Date.now() - wallStart;
  const avgTournamentMs = profileTotalDurationMs.length > 0
    ? Math.round(profileTotalDurationMs.reduce((a, b) => a + b, 0) / profileTotalDurationMs.length)
    : 0;
  const avgActiveWorkers = utilizationSampleCount > 0
    ? (utilizationSum / utilizationSampleCount).toFixed(1)
    : "N/A";
  const peakUtilizationPct = ((peakActiveWorkers / WORKER_COUNT) * 100).toFixed(0);

  process.stdout.write("\n");

  const successfulTournaments = TOTAL_TOURNAMENTS - failed;

  // ─── Section 1: Combined ROI Report ──────────────────────────────────────────

  console.log(`\n${bold("══════════════════════════════════════════════════════════")}`);
  console.log(`${bold("  SECTION 1 — COMBINED ROI REPORT (All Tier 1 Profiles)")}`);
  console.log(`${bold("══════════════════════════════════════════════════════════")}\n`);

  interface RoiRow {
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

  const roiRows: RoiRow[] = [];
  const profileAnalytics: Record<string, object> = {};

  for (const key of ALL_PROFILES) {
    const stats = profileStats.get(key)!;
    const roi = calcROI(stats);
    const profitLoss  = stats.totalPayout - stats.entries * BUY_IN;
    const winPct      = stats.entries  > 0 ? (stats.wins / stats.entries) * 100 : 0;
    const itmPct      = stats.entries  > 0 ? (stats.itmFinishes / stats.entries) * 100 : 0;
    const vpipPct     = stats.totalHands > 0 ? (stats.vpipHands / stats.totalHands) * 100 : 0;
    const pfrPct      = stats.totalHands > 0 ? (stats.pfrHands / stats.totalHands) * 100 : 0;
    const riverWinPct = stats.riverRaises > 0 ? (stats.riverRaiseWins / stats.riverRaises) * 100 : 0;

    roiRows.push({
      Profile:           key,
      Entries:           stats.entries,
      "Win%":            `${winPct.toFixed(1)}%`,
      "ITM%":            `${itmPct.toFixed(1)}%`,
      ROI:               roiStr(roi),
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

  console.table(roiRows);

  // ─── Section 2: Cross-Exploitation Matrix ─────────────────────────────────────

  console.log(`\n${bold("══════════════════════════════════════════════════════════")}`);
  console.log(`${bold("  SECTION 2 — CROSS-EXPLOITATION MATRIX (Kill Counts)")}`);
  console.log(`${bold("  Rows = Killer Profile · Columns = Eliminated Profile")}`);
  console.log(`${bold("══════════════════════════════════════════════════════════")}\n`);

  // Short labels for compact table
  const shortLabel: Record<ProfileKey, string> = {
    "The Shark":      "Shark",
    "The Rock":       "Rock",
    "The Maniac":     "Maniac",
    "Calling Station":"CalStn",
    "The Nit":        "Nit",
    "Balanced Pro":   "BalPro",
    "Tricky":         "Tricky",
    "The Bully":      "Bully",
    "Random":         "Random",
  };

  // Kill count table
  const killRows: Record<string, unknown>[] = [];
  for (const killer of ALL_PROFILES) {
    const row: Record<string, unknown> = { "Killer \\ Eliminated": shortLabel[killer] };
    for (const eliminated of ALL_PROFILES) {
      if (killer === eliminated) {
        row[shortLabel[eliminated]] = "-";
      } else {
        row[shortLabel[eliminated]] = killMatrix.get(killer)!.get(eliminated) ?? 0;
      }
    }
    killRows.push(row);
  }
  console.table(killRows);

  // Exploit rate table (kills / co-occurrences × 100)
  console.log(`\n${bold("  Exploit Rate % (kills / co-occurrences × 100)")}\n`);
  const exploitRows: Record<string, unknown>[] = [];
  const exploitMatrixData: Record<string, Record<string, number>> = {};
  for (const killer of ALL_PROFILES) {
    const row: Record<string, unknown> = { "Killer \\ Eliminated": shortLabel[killer] };
    exploitMatrixData[killer] = {};
    for (const eliminated of ALL_PROFILES) {
      if (killer === eliminated) {
        row[shortLabel[eliminated]] = "-";
        exploitMatrixData[killer][eliminated] = 0;
      } else {
        const co = coOccurrence.get(killer)!.get(eliminated) ?? 1;
        const kills = killMatrix.get(killer)!.get(eliminated) ?? 0;
        const rate = parseFloat(((kills / co) * 100).toFixed(1));
        row[shortLabel[eliminated]] = `${rate.toFixed(1)}%`;
        exploitMatrixData[killer][eliminated] = rate;
      }
    }
    exploitRows.push(row);
  }
  console.table(exploitRows);

  // ─── Section 3: Variance Check ────────────────────────────────────────────────

  console.log(`\n${bold("══════════════════════════════════════════════════════════")}`);
  console.log(`${bold("  SECTION 3 — VARIANCE CHECK (ROI Stability)")}`);
  console.log(dim(`  First 1k = t0-999 · Mid 3k = t1000-3999 · Last 1k = t4000-4999`));
  console.log(`${bold("══════════════════════════════════════════════════════════")}\n`);

  interface VarianceRow {
    Profile:    string;
    "First 1k": string;
    "Mid 3k":   string;
    "Last 1k":  string;
    "Δ (f→l)":  string;
  }

  const varianceRows: VarianceRow[] = [];
  const varianceData: Record<string, object> = {};

  for (const key of ALL_PROFILES) {
    const roiF = calcROI(statsFirst1k.get(key)!);
    const roiM = calcROI(statsMid3k.get(key)!);
    const roiL = calcROI(statsLast1k.get(key)!);
    const delta = roiL - roiF;

    varianceRows.push({
      Profile:    key,
      "First 1k": roiStr(roiF),
      "Mid 3k":   roiStr(roiM),
      "Last 1k":  roiStr(roiL),
      "Δ (f→l)":  `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`,
    });

    varianceData[key] = {
      first1k: parseFloat(roiF.toFixed(2)),
      mid3k:   parseFloat(roiM.toFixed(2)),
      last1k:  parseFloat(roiL.toFixed(2)),
      delta:   parseFloat(delta.toFixed(2)),
    };
  }

  console.table(varianceRows);

  // ─── Section 4: Performance ───────────────────────────────────────────────────

  const avgHandsPerTournament = profileTotalDurationMs.length > 0
    ? Math.round(
        Array.from(profileStats.values()).reduce((s, p) => s + p.totalHands, 0) /
        PROFILE_SLOTS.length /
        successfulTournaments,
      )
    : 0;

  console.log(`\n${bold("══════════════════════════════════════════════════════════")}`);
  console.log(`${bold("  SECTION 4 — PERFORMANCE & INTEGRITY")}`);
  console.log(`${bold("══════════════════════════════════════════════════════════")}\n`);
  console.log(`  Tournaments:          ${successfulTournaments.toLocaleString()} succeeded, ${failed} failed`);
  console.log(`  Avg hands/tourney:    ${avgHandsPerTournament.toLocaleString()}`);
  console.log(`  Avg tourney time:     ${avgTournamentMs.toLocaleString()}ms`);
  console.log(`  Total wall time:      ${(wallMs / 1000).toFixed(1)}s`);
  console.log(`  Throughput:           ${(successfulTournaments / (wallMs / 1000)).toFixed(1)} tournaments/sec`);
  console.log(`  Workers configured:   ${WORKER_COUNT} (of 12 max)`);
  console.log(`  Peak active workers:  ${peakActiveWorkers} (${peakUtilizationPct}% utilization)`);
  console.log(`  Avg active workers:   ${avgActiveWorkers}`);

  if (engineBugs.length > 0) {
    console.log(`\n  ${yellow(`⚠  ${engineBugs.length} integrity violation(s) — see logs/engine_bugs.json`)}`);
  } else {
    console.log(`\n  ${green("✓  Integrity: 0 violations (no negative pots, no split-pot errors)")}`);
  }

  console.log(`\n${bold("══════════════════════════════════════════════════════════")}\n`);

  // ─── Save outputs ──────────────────────────────────────────────────────────────

  const outDir  = path.join(__dirname, "..");
  const logsDir = path.join(outDir, "logs");

  // Kill matrix serializable form
  const killMatrixData: Record<string, Record<string, number>> = {};
  for (const killer of ALL_PROFILES) {
    killMatrixData[killer] = {};
    for (const eliminated of ALL_PROFILES) {
      killMatrixData[killer][eliminated] = killMatrix.get(killer)!.get(eliminated) ?? 0;
    }
  }

  const results = {
    meta: {
      totalTournaments:     TOTAL_TOURNAMENTS,
      successfulTournaments,
      failedTournaments:    failed,
      seatsPerTable:        SEATS_PER_TABLE,
      startingChips:        STARTING_CHIPS,
      payouts:              PAYOUTS,
      workerCount:          WORKER_COUNT,
      peakActiveWorkers,
      peakUtilizationPct:   parseFloat(peakUtilizationPct),
      avgActiveWorkers:     parseFloat(String(avgActiveWorkers)),
      avgHandsPerTournament,
      avgTournamentMs,
      totalWallMs:          wallMs,
      throughputPerSec:     parseFloat((successfulTournaments / (wallMs / 1000)).toFixed(2)),
      timestamp:            new Date().toISOString(),
    },
    profiles: profileAnalytics,
    variance: varianceData,
    exploitationMatrix: {
      killCounts:   killMatrixData,
      exploitRates: exploitMatrixData,
    },
    integrity: {
      violations:        engineBugs.length,
      violationsByType:  engineBugs.reduce<Record<string, number>>((acc, b) => {
        acc[b.type] = (acc[b.type] ?? 0) + 1;
        return acc;
      }, {}),
      detailFile: engineBugs.length > 0 ? "logs/engine_bugs.json" : null,
    },
  };

  const resultsPath = path.join(outDir, "stress_test_results.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`  Saved: ${bold("stress_test_results.json")}`);

  if (engineBugs.length > 0) {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const bugsPath = path.join(logsDir, "engine_bugs.json");
    fs.writeFileSync(bugsPath, JSON.stringify(engineBugs, null, 2));
    console.log(`  Saved: ${bold("logs/engine_bugs.json")} (${engineBugs.length} bug(s))`);
  }

  console.log();

  process.exit(failed > 0 || engineBugs.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(2);
});
