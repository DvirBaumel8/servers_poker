/**
 * tournaments.config.ts
 * =====================
 * System-defined tournament configurations.
 * Operator adds/removes tournaments here and restarts the server.
 *
 * Blind levels advance every HANDS_PER_LEVEL hands across all active tables.
 * Late registration closes at the end of late_reg_ends_level.
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
  turn_timeout_ms: number;
  late_reg_ends_level: number;
  rebuys_allowed: boolean;
  scheduled_start_at?: number;
}

export interface Payout {
  position: number;
  percentage: number;
  amount: number;
}

export type PayoutStructure = number[];

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

/**
 * Payout structure — percentage of prize pool by finish position.
 * Keyed by number of entrants, values are arrays of percentages
 * for 1st, 2nd, 3rd, etc. (must sum to 100).
 *
 * General rule: ~15% of field gets paid.
 * Winner gets 25-50% depending on field size.
 */
const PAYOUT_STRUCTURES: Record<number, PayoutStructure> = {
  // 2-5 entrants: winner takes all
  2: [100],
  3: [100],
  4: [100],
  5: [100],

  // 6-9: top 2 paid
  6: [65, 35],
  7: [65, 35],
  8: [65, 35],
  9: [65, 35],

  // 10-18: top 3 paid
  10: [50, 30, 20],
  11: [50, 30, 20],
  12: [50, 30, 20],
  13: [50, 30, 20],
  14: [50, 30, 20],
  15: [50, 30, 20],
  16: [50, 30, 20],
  17: [50, 30, 20],
  18: [50, 30, 20],

  // 19-27: top 4 paid
  19: [40, 25, 20, 15],
  27: [40, 25, 20, 15],

  // 28-45: top 5 paid
  28: [35, 22, 18, 14, 11],
  45: [35, 22, 18, 14, 11],

  // 46-90: top 9 paid (~15-20% of field)
  46: [28, 18, 14, 11, 9, 7, 6, 4, 3],
  90: [28, 18, 14, 11, 9, 7, 6, 4, 3],

  // 91-180: top 18 paid
  91: [25, 15, 11, 9, 7, 6, 5, 4, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1],
  180: [25, 15, 11, 9, 7, 6, 5, 4, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1],
};

/**
 * Resolve the correct payout structure for a given number of entrants.
 * Finds the largest bracket key that doesn't exceed entrantCount.
 */
export function getPayoutStructure(entrantCount: number): PayoutStructure {
  const keys = Object.keys(PAYOUT_STRUCTURES)
    .map(Number)
    .sort((a, b) => a - b);
  let chosen = keys[0];
  for (const k of keys) {
    if (entrantCount >= k) chosen = k;
    else break;
  }
  return PAYOUT_STRUCTURES[chosen];
}

/**
 * Calculate actual payout amounts from prize pool and structure.
 * Returns array of { position, percentage, amount } sorted by position.
 * Handles rounding — remainder goes to 1st place.
 */
export function calculatePayouts(
  prizePool: number,
  entrantCount: number,
): Payout[] {
  const structure = getPayoutStructure(entrantCount);
  let remaining = prizePool;
  const payouts = structure.map((pct, i) => {
    const amount = Math.floor((prizePool * pct) / 100);
    remaining -= amount;
    return { position: i + 1, percentage: pct, amount };
  });
  payouts[0].amount += remaining;
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
    turn_timeout_ms: 10000,
    late_reg_ends_level: 4,
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
    turn_timeout_ms: 10000,
    late_reg_ends_level: 4,
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
    turn_timeout_ms: 8000,
    late_reg_ends_level: 3,
    rebuys_allowed: false,
  },
];
