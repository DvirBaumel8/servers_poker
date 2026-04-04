/**
 * Opponent profile definitions for sandbox simulations.
 *
 * Each profile provides 8 synthetic bot configurations (filling seats 2–9 at a
 * 9-max table alongside the user's bot in seat 1) for full-ring, realistic dynamics.
 */

import type { BotStrategy } from "../../domain/bot-strategy/strategy.types";

export interface OpponentBotConfig {
  id: string;
  name: string;
  strategy: BotStrategy;
}

function quickStrategy(personality: {
  aggression: number;
  bluffFrequency: number;
  riskTolerance: number;
  tightness: number;
}): BotStrategy {
  return {
    tier: "quick",
    personality,
  } as unknown as BotStrategy;
}

// ─── AGGRESSIVE_SHARKS ─────────────────────────────────────────────────────────
// High-frequency raisers: wide ranges, lots of 3-bets, frequent bluffs.

export const AGGRESSIVE_SHARKS_CONFIGS: OpponentBotConfig[] = [
  {
    id: "sim-shark-1",
    name: "Shark Alpha",
    strategy: quickStrategy({
      aggression: 88,
      bluffFrequency: 75,
      riskTolerance: 82,
      tightness: 28,
    }),
  },
  {
    id: "sim-shark-2",
    name: "Shark Beta",
    strategy: quickStrategy({
      aggression: 84,
      bluffFrequency: 70,
      riskTolerance: 78,
      tightness: 35,
    }),
  },
  {
    id: "sim-shark-3",
    name: "Shark Gamma",
    strategy: quickStrategy({
      aggression: 92,
      bluffFrequency: 80,
      riskTolerance: 86,
      tightness: 22,
    }),
  },
  {
    id: "sim-shark-4",
    name: "Shark Delta",
    strategy: quickStrategy({
      aggression: 79,
      bluffFrequency: 65,
      riskTolerance: 74,
      tightness: 40,
    }),
  },
  {
    id: "sim-shark-5",
    name: "Shark Epsilon",
    strategy: quickStrategy({
      aggression: 86,
      bluffFrequency: 72,
      riskTolerance: 80,
      tightness: 30,
    }),
  },
  {
    id: "sim-shark-6",
    name: "Shark Zeta",
    strategy: quickStrategy({
      aggression: 85,
      bluffFrequency: 72,
      riskTolerance: 83,
      tightness: 25,
    }),
  },
  {
    id: "sim-shark-7",
    name: "Shark Eta",
    strategy: quickStrategy({
      aggression: 90,
      bluffFrequency: 60,
      riskTolerance: 88,
      tightness: 32,
    }),
  },
  {
    id: "sim-shark-8",
    name: "Shark Theta",
    strategy: quickStrategy({
      aggression: 78,
      bluffFrequency: 75,
      riskTolerance: 76,
      tightness: 27,
    }),
  },
];

// ─── TIGHT_PASSIVE ─────────────────────────────────────────────────────────────
// Nits and calling stations: play few hands, rarely raise, easy to read.

export const TIGHT_PASSIVE_CONFIGS: OpponentBotConfig[] = [
  {
    id: "sim-tight-1",
    name: "Nit Alice",
    strategy: quickStrategy({
      aggression: 22,
      bluffFrequency: 12,
      riskTolerance: 32,
      tightness: 82,
    }),
  },
  {
    id: "sim-tight-2",
    name: "Nit Bob",
    strategy: quickStrategy({
      aggression: 18,
      bluffFrequency: 8,
      riskTolerance: 28,
      tightness: 88,
    }),
  },
  {
    id: "sim-tight-3",
    name: "Station Charlie",
    strategy: quickStrategy({
      aggression: 15,
      bluffFrequency: 5,
      riskTolerance: 45,
      tightness: 72,
    }),
  },
  {
    id: "sim-tight-4",
    name: "Nit Diana",
    strategy: quickStrategy({
      aggression: 25,
      bluffFrequency: 15,
      riskTolerance: 35,
      tightness: 78,
    }),
  },
  {
    id: "sim-tight-5",
    name: "Station Eve",
    strategy: quickStrategy({
      aggression: 20,
      bluffFrequency: 10,
      riskTolerance: 50,
      tightness: 68,
    }),
  },
  {
    id: "sim-tight-6",
    name: "Nit Frank",
    strategy: quickStrategy({
      aggression: 20,
      bluffFrequency: 9,
      riskTolerance: 30,
      tightness: 80,
    }),
  },
  {
    id: "sim-tight-7",
    name: "Station Grace",
    strategy: quickStrategy({
      aggression: 17,
      bluffFrequency: 7,
      riskTolerance: 55,
      tightness: 75,
    }),
  },
  {
    id: "sim-tight-8",
    name: "Nit Hank",
    strategy: quickStrategy({
      aggression: 22,
      bluffFrequency: 11,
      riskTolerance: 38,
      tightness: 85,
    }),
  },
];

// ─── CURRENT_META ──────────────────────────────────────────────────────────────
// Balanced, GTO-adjacent bots used as baseline competition.
// The SimulationsService will try to replace these with real top-ranked bots
// from the DB when available.

export const CURRENT_META_CONFIGS: OpponentBotConfig[] = [
  {
    id: "sim-meta-1",
    name: "Meta Pro 1",
    strategy: quickStrategy({
      aggression: 58,
      bluffFrequency: 42,
      riskTolerance: 55,
      tightness: 50,
    }),
  },
  {
    id: "sim-meta-2",
    name: "Meta Pro 2",
    strategy: quickStrategy({
      aggression: 62,
      bluffFrequency: 38,
      riskTolerance: 60,
      tightness: 46,
    }),
  },
  {
    id: "sim-meta-3",
    name: "Meta Pro 3",
    strategy: quickStrategy({
      aggression: 55,
      bluffFrequency: 45,
      riskTolerance: 52,
      tightness: 54,
    }),
  },
  {
    id: "sim-meta-4",
    name: "Meta Pro 4",
    strategy: quickStrategy({
      aggression: 65,
      bluffFrequency: 35,
      riskTolerance: 65,
      tightness: 42,
    }),
  },
  {
    id: "sim-meta-5",
    name: "Meta Pro 5",
    strategy: quickStrategy({
      aggression: 52,
      bluffFrequency: 48,
      riskTolerance: 58,
      tightness: 56,
    }),
  },
  {
    id: "sim-meta-6",
    name: "Meta Pro 6",
    strategy: quickStrategy({
      aggression: 58,
      bluffFrequency: 40,
      riskTolerance: 57,
      tightness: 46,
    }),
  },
  {
    id: "sim-meta-7",
    name: "Meta Pro 7",
    strategy: quickStrategy({
      aggression: 62,
      bluffFrequency: 36,
      riskTolerance: 62,
      tightness: 50,
    }),
  },
  {
    id: "sim-meta-8",
    name: "Meta Pro 8",
    strategy: quickStrategy({
      aggression: 55,
      bluffFrequency: 44,
      riskTolerance: 54,
      tightness: 53,
    }),
  },
];

export type OpponentProfile =
  | "AGGRESSIVE_SHARKS"
  | "TIGHT_PASSIVE"
  | "CURRENT_META";

export type PlayerType = "Shark" | "Nit" | "Meta";

/** Fractional seat weights per player type for each lineup. Must sum to 1. */
export const LINEUP_DISTRIBUTIONS: Record<
  OpponentProfile,
  Partial<Record<PlayerType, number>>
> = {
  AGGRESSIVE_SHARKS: { Shark: 0.75, Nit: 0.25 },
  TIGHT_PASSIVE: { Nit: 0.75, Shark: 0.25 },
  CURRENT_META: { Meta: 0.5, Shark: 0.25, Nit: 0.25 },
};

const BOT_POOL: Record<PlayerType, OpponentBotConfig[]> = {
  Shark: AGGRESSIVE_SHARKS_CONFIGS,
  Nit: TIGHT_PASSIVE_CONFIGS,
  Meta: CURRENT_META_CONFIGS,
};

/** Distribute totalSeats across player types using largest-remainder rounding. */
function distributeSeats(
  distribution: Partial<Record<PlayerType, number>>,
  totalSeats: number,
): Partial<Record<PlayerType, number>> {
  const entries = Object.entries(distribution) as [PlayerType, number][];
  const floors = entries.map(([type, weight]) => ({
    type,
    raw: weight * totalSeats,
    count: Math.floor(weight * totalSeats),
  }));
  const remainder = totalSeats - floors.reduce((sum, f) => sum + f.count, 0);
  floors.sort((a, b) => b.raw - b.count - (a.raw - a.count));
  for (let i = 0; i < remainder; i++) floors[i].count++;
  const result: Partial<Record<PlayerType, number>> = {};
  for (const { type, count } of floors) result[type] = count;
  return result;
}

/** Fisher-Yates shuffle (in-place, mutates array). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Build the opponent seat list from a profile's distribution.
 * Picks bots from each type's pool proportionally, then shuffles the result.
 */
export function resolveOpponentsFromDistribution(
  profile: OpponentProfile,
  tableSize: number,
): OpponentBotConfig[] {
  const totalSeats = tableSize - 1;
  const distribution =
    LINEUP_DISTRIBUTIONS[profile] ?? LINEUP_DISTRIBUTIONS["CURRENT_META"];
  const counts = distributeSeats(distribution, totalSeats);

  const opponents: OpponentBotConfig[] = [];
  for (const [typeKey, count] of Object.entries(counts) as [
    PlayerType,
    number,
  ][]) {
    opponents.push(...BOT_POOL[typeKey].slice(0, count));
  }

  return shuffle(opponents);
}

/** @deprecated Use resolveOpponentsFromDistribution instead. */
export const PROFILE_CONFIGS: Record<OpponentProfile, OpponentBotConfig[]> = {
  AGGRESSIVE_SHARKS: AGGRESSIVE_SHARKS_CONFIGS,
  TIGHT_PASSIVE: TIGHT_PASSIVE_CONFIGS,
  CURRENT_META: CURRENT_META_CONFIGS,
};
