/**
 * tournaments.config.ts
 * =====================
 * System-defined tournament configurations.
 * Operator adds/removes tournaments here and restarts the server.
 *
 * Blind levels advance every HANDS_PER_LEVEL hands across all active tables.
 */

export interface BlindLevel {
  level: number;
  small_blind: number;
  big_blind: number;
  ante: number;
}

export interface TournamentConfig {
  id: string;
  name: string;
  type: "rolling" | "scheduled";
  buy_in: number;
  starting_chips: number;
  min_players: number;
  max_players: number;
  players_per_table: number;
  rebuys_allowed: boolean;
  scheduled_start_at?: number;
}

export interface Payout {
  position: number;
  percentage: number;
  amount: bigint;
}

export const HANDS_PER_LEVEL = 10;

/**
 * Standard blind progression.
 * Starting stack is 5000 chips = 100 big blinds at level 1.
 * Antes kick in at level 3 (~25% of big blind).
 * Each level roughly 1.5–2x the previous to maintain pressure.
 */
export const BLIND_LEVELS: BlindLevel[] = [
  { level: 1, small_blind: 25, big_blind: 50, ante: 10 },
  { level: 2, small_blind: 50, big_blind: 100, ante: 15 },
  { level: 3, small_blind: 75, big_blind: 150, ante: 25 },
  { level: 4, small_blind: 100, big_blind: 200, ante: 25 },
  { level: 5, small_blind: 150, big_blind: 300, ante: 50 },
  { level: 6, small_blind: 200, big_blind: 400, ante: 50 },
  { level: 7, small_blind: 300, big_blind: 600, ante: 75 },
  { level: 8, small_blind: 400, big_blind: 800, ante: 100 },
  { level: 9, small_blind: 600, big_blind: 1200, ante: 150 },
  { level: 10, small_blind: 800, big_blind: 1600, ante: 200 },
  { level: 11, small_blind: 1000, big_blind: 2000, ante: 300 },
  { level: 12, small_blind: 1500, big_blind: 3000, ante: 400 },
  { level: 13, small_blind: 2000, big_blind: 4000, ante: 500 },
  { level: 14, small_blind: 3000, big_blind: 6000, ante: 750 },
  { level: 15, small_blind: 5000, big_blind: 10000, ante: 1000 },
];

// 15% of field gets paid; top 3 slots follow the [30, 20, 15] curve,
// rest split equally. Remainder from bigint division goes to 1st place.
const ITM_PERCENTAGE = 0.15;
const PAYOUT_CURVE = [30, 20, 15];

/**
 * Calculate payout amounts for a tournament.
 * Pays the top 15% of the field (minimum 1). Uses a steep curve for the
 * top positions and splits the remaining pool equally among lower ITM spots.
 * Handles BigInt rounding — remainder always goes to 1st place.
 */
export function calculatePrizes(
  prizePool: bigint,
  playerCount: number,
): Payout[] {
  const itmCount = Math.max(1, Math.floor(playerCount * ITM_PERCENTAGE));

  let percentages: number[];
  if (itmCount === 1) {
    percentages = [100];
  } else if (itmCount === 2) {
    percentages = [65, 35];
  } else {
    const topSlots = Math.min(PAYOUT_CURVE.length, itmCount);
    const topPercentages = PAYOUT_CURVE.slice(0, topSlots);
    const topSum = topPercentages.reduce((a, b) => a + b, 0);
    const remainingSlots = itmCount - topSlots;
    // Cap each remaining slot at the last curve value so lower positions
    // can never pay more than 3rd place (avoids 4th > 1st for small ITM counts).
    const lastCurveValue = PAYOUT_CURVE[PAYOUT_CURVE.length - 1];
    const remainingPerShare =
      remainingSlots > 0
        ? Math.min(Math.floor((100 - topSum) / remainingSlots), lastCurveValue)
        : 0;
    const leftover =
      remainingSlots > 0
        ? 100 - topSum - remainingPerShare * remainingSlots
        : 100 - topSum;
    percentages = [...topPercentages];
    for (let i = 0; i < remainingSlots; i++) {
      percentages.push(remainingPerShare);
    }
    percentages[0] += leftover;
  }

  let remaining = prizePool;
  const payouts: Payout[] = percentages.map((pct, i) => {
    const amount = (prizePool * BigInt(pct)) / 100n;
    remaining -= amount;
    return { position: i + 1, percentage: pct, amount };
  });
  if (remaining > 0n) payouts[0].amount += remaining;
  return payouts;
}

/**
 * Get the blind level config for a given level number.
 * Returns the last level if beyond the defined structure.
 */
export function getBlindLevel(level: number): BlindLevel {
  const idx = Math.min(level - 1, BLIND_LEVELS.length - 1);
  return BLIND_LEVELS[idx];
}

// ── Tournament definitions ────────────────────────────────────

export const TOURNAMENT_CONFIGS: TournamentConfig[] = [
  {
    id: "tourn_micro",
    name: "Micro Bot Cup",
    type: "rolling",
    buy_in: 100,
    starting_chips: 5000,
    min_players: 2,
    max_players: 18,
    players_per_table: 9,
    rebuys_allowed: true,
  },
  {
    id: "tourn_standard",
    name: "Standard Championship",
    type: "rolling",
    buy_in: 500,
    starting_chips: 5000,
    min_players: 9,
    max_players: 90,
    players_per_table: 9,
    rebuys_allowed: true,
  },
  {
    id: "tourn_highroller",
    name: "High Roller Invitational",
    type: "rolling",
    buy_in: 2000,
    starting_chips: 5000,
    min_players: 6,
    max_players: 45,
    players_per_table: 9,
    rebuys_allowed: false,
  },
];
