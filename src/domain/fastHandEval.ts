/**
 * fastHandEval — Integer-based 5/7-card hand evaluator for Monte Carlo simulation.
 *
 * Cards are encoded as integers 0–51:  card = rank_idx * 4 + suit_idx
 *   rank_idx: 0=2, 1=3, 2=4, ... 8=T, 9=J, 10=Q, 11=K, 12=A
 *   suit_idx: 0=♠, 1=♥, 2=♦, 3=♣
 *
 * No object allocation, no string operations in the hot path.
 * Designed for use inside Monte Carlo loops (thousands of iterations per call).
 *
 * Hand score: a single number, higher = stronger hand.
 * Encoding: handCategory * SCORE_BASE^5 + tiebreaker1 * SCORE_BASE^4 + ...
 * This guarantees that any stronger category always outranks any weaker one.
 */

// ─── Card encoding ─────────────────────────────────────────────────────────────

const RANK_CHARS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
];
// Both Unicode glyphs and ASCII letter codes are accepted so cards from the
// strategy engine ("As", "Kh") and display-formatted cards ("A♠") both work.
const SUIT_CHARS: Record<string, number> = {
  "♠": 0,
  s: 0,
  "♥": 1,
  h: 1,
  "♦": 2,
  d: 2,
  "♣": 3,
  c: 3,
};

/**
 * Convert a card string like "A♠", "10♥", "Kd" to an integer 0–51.
 * Returns -1 for unrecognised cards.
 */
export function cardToInt(card: string): number {
  const chars = [...card]; // spread handles multi-byte unicode suits
  const suitChar = chars.pop() ?? "";
  const rankStr = chars.join("");

  // Normalise "10" → "T"
  const normRank = rankStr === "10" ? "T" : rankStr;
  const rankIdx = RANK_CHARS.indexOf(normRank);
  if (rankIdx < 0) return -1;

  const suitIdx = SUIT_CHARS[suitChar];
  if (suitIdx === undefined) return -1;

  return rankIdx * 4 + suitIdx;
}

/** Extract 0-based rank index (0=2 … 12=A) from a card integer. */
export function cardRank(card: number): number {
  return card >> 2;
}

/** Extract suit index (0–3) from a card integer. */
export function cardSuit(card: number): number {
  return card & 3;
}

// ─── Score constants ────────────────────────────────────────────────────────────

// Tiebreakers are 0–12, so base-13 per slot is enough.
// Hand categories 0–8 (high card … straight flush / royal flush).
// Score = category * 13^5 + tb1*13^4 + tb2*13^3 + tb3*13^2 + tb4*13 + tb5
const B = 13;
const B2 = B * B;
const B3 = B2 * B;
const B4 = B3 * B;
const B5 = B4 * B; // 13^5 = 371293
const CAT_MULT = B5 + 1; // one step above any tiebreaker combination

const CAT_HIGH_CARD = 0;
const CAT_ONE_PAIR = 1;
const CAT_TWO_PAIR = 2;
const CAT_TRIPS = 3;
const CAT_STRAIGHT = 4;
const CAT_FLUSH = 5;
const CAT_FULL_HOUSE = 6;
const CAT_QUADS = 7;
const CAT_STRAIGHT_FLUSH = 8; // includes royal flush

// ─── 5-card evaluator ──────────────────────────────────────────────────────────

/**
 * Evaluate 5 card integers and return a score.
 * Higher score = better hand, suitable for direct numeric comparison.
 *
 * Zero heap allocation: only local scalar variables.
 * Pattern detection directly from sorted ranks — no hash tables, no arrays.
 */
export function eval5ints(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
): number {
  // ── Extract ranks and suits inline ──
  const ra = a >> 2,
    rb = b >> 2,
    rc = c >> 2,
    rd = d >> 2,
    re = e >> 2;
  const sa = a & 3;
  const isFlush =
    sa === (b & 3) && sa === (c & 3) && sa === (d & 3) && sa === (e & 3);

  // ── Sort 5 ranks descending (manual insertion sort, no Array alloc) ──
  // After sorting: r0 ≥ r1 ≥ r2 ≥ r3 ≥ r4
  let r0 = ra,
    r1 = rb,
    r2 = rc,
    r3 = rd,
    r4 = re;
  let tmp: number;
  if (r1 > r0) {
    tmp = r0;
    r0 = r1;
    r1 = tmp;
  }
  if (r2 > r1) {
    tmp = r1;
    r1 = r2;
    r2 = tmp;
    if (r1 > r0) {
      tmp = r0;
      r0 = r1;
      r1 = tmp;
    }
  }
  if (r3 > r2) {
    tmp = r2;
    r2 = r3;
    r3 = tmp;
    if (r2 > r1) {
      tmp = r1;
      r1 = r2;
      r2 = tmp;
      if (r1 > r0) {
        tmp = r0;
        r0 = r1;
        r1 = tmp;
      }
    }
  }
  if (r4 > r3) {
    tmp = r3;
    r3 = r4;
    r4 = tmp;
    if (r3 > r2) {
      tmp = r2;
      r2 = r3;
      r3 = tmp;
      if (r2 > r1) {
        tmp = r1;
        r1 = r2;
        r2 = tmp;
        if (r1 > r0) {
          tmp = r0;
          r0 = r1;
          r1 = tmp;
        }
      }
    }
  }

  // ── Straight check ──
  let isStraight = false;
  let straightHigh = r0;

  if (r0 - r4 === 4 && r0 !== r1 && r1 !== r2 && r2 !== r3 && r3 !== r4) {
    isStraight = true;
  }
  // Ace-low A-2-3-4-5: sorted desc [12,3,2,1,0]
  if (r0 === 12 && r1 === 3 && r2 === 2 && r3 === 1 && r4 === 0) {
    isStraight = true;
    straightHigh = 3; // 5-high
  }

  if (isFlush && isStraight)
    return CAT_STRAIGHT_FLUSH * CAT_MULT + straightHigh;

  // ── Group pattern detection from sorted ranks (no hash table) ──
  // With r0≥r1≥r2≥r3≥r4, duplicates always appear as consecutive equal values.

  // Quads: four consecutive equal ranks
  if (r0 === r1 && r1 === r2 && r2 === r3)
    return CAT_QUADS * CAT_MULT + r0 * B + r4;
  if (r1 === r2 && r2 === r3 && r3 === r4)
    return CAT_QUADS * CAT_MULT + r1 * B + r0;

  // Full house
  if (r0 === r1 && r1 === r2 && r3 === r4)
    return CAT_FULL_HOUSE * CAT_MULT + r0 * B + r3;
  if (r0 === r1 && r2 === r3 && r3 === r4)
    return CAT_FULL_HOUSE * CAT_MULT + r2 * B + r0;

  if (isFlush)
    return CAT_FLUSH * CAT_MULT + r0 * B4 + r1 * B3 + r2 * B2 + r3 * B + r4;
  if (isStraight) return CAT_STRAIGHT * CAT_MULT + straightHigh;

  // Trips (no pair elsewhere)
  if (r0 === r1 && r1 === r2)
    return CAT_TRIPS * CAT_MULT + r0 * B2 + r3 * B + r4;
  if (r1 === r2 && r2 === r3)
    return CAT_TRIPS * CAT_MULT + r1 * B2 + r0 * B + r4;
  if (r2 === r3 && r3 === r4)
    return CAT_TRIPS * CAT_MULT + r2 * B2 + r0 * B + r1;

  // Two pair
  if (r0 === r1 && r2 === r3)
    return CAT_TWO_PAIR * CAT_MULT + r0 * B2 + r2 * B + r4;
  if (r0 === r1 && r3 === r4)
    return CAT_TWO_PAIR * CAT_MULT + r0 * B2 + r3 * B + r2;
  if (r1 === r2 && r3 === r4)
    return CAT_TWO_PAIR * CAT_MULT + r1 * B2 + r3 * B + r0;

  // One pair
  if (r0 === r1)
    return CAT_ONE_PAIR * CAT_MULT + r0 * B3 + r2 * B2 + r3 * B + r4;
  if (r1 === r2)
    return CAT_ONE_PAIR * CAT_MULT + r1 * B3 + r0 * B2 + r3 * B + r4;
  if (r2 === r3)
    return CAT_ONE_PAIR * CAT_MULT + r2 * B3 + r0 * B2 + r1 * B + r4;
  if (r3 === r4)
    return CAT_ONE_PAIR * CAT_MULT + r3 * B3 + r0 * B2 + r1 * B + r2;

  // High card
  return CAT_HIGH_CARD * CAT_MULT + r0 * B4 + r1 * B3 + r2 * B2 + r3 * B + r4;
}

// ─── 7-card best-hand ──────────────────────────────────────────────────────────

/**
 * Given 7 card integers, return the highest 5-card hand score.
 * Tries all C(7,5) = 21 combinations. No heap allocation.
 */
export function bestOf7ints(cards: number[]): number {
  const c0 = cards[0],
    c1 = cards[1],
    c2 = cards[2],
    c3 = cards[3];
  const c4 = cards[4],
    c5 = cards[5],
    c6 = cards[6];
  let best = -1,
    s: number;
  // All 21 combos (drop two indices from 0–6):
  if ((s = eval5ints(c0, c1, c2, c3, c4)) > best) best = s; // drop 5,6
  if ((s = eval5ints(c0, c1, c2, c3, c5)) > best) best = s; // drop 4,6
  if ((s = eval5ints(c0, c1, c2, c3, c6)) > best) best = s; // drop 4,5
  if ((s = eval5ints(c0, c1, c2, c4, c5)) > best) best = s; // drop 3,6
  if ((s = eval5ints(c0, c1, c2, c4, c6)) > best) best = s; // drop 3,5
  if ((s = eval5ints(c0, c1, c2, c5, c6)) > best) best = s; // drop 3,4
  if ((s = eval5ints(c0, c1, c3, c4, c5)) > best) best = s; // drop 2,6
  if ((s = eval5ints(c0, c1, c3, c4, c6)) > best) best = s; // drop 2,5
  if ((s = eval5ints(c0, c1, c3, c5, c6)) > best) best = s; // drop 2,4
  if ((s = eval5ints(c0, c1, c4, c5, c6)) > best) best = s; // drop 2,3
  if ((s = eval5ints(c0, c2, c3, c4, c5)) > best) best = s; // drop 1,6
  if ((s = eval5ints(c0, c2, c3, c4, c6)) > best) best = s; // drop 1,5
  if ((s = eval5ints(c0, c2, c3, c5, c6)) > best) best = s; // drop 1,4
  if ((s = eval5ints(c0, c2, c4, c5, c6)) > best) best = s; // drop 1,3
  if ((s = eval5ints(c0, c3, c4, c5, c6)) > best) best = s; // drop 1,2
  if ((s = eval5ints(c1, c2, c3, c4, c5)) > best) best = s; // drop 0,6
  if ((s = eval5ints(c1, c2, c3, c4, c6)) > best) best = s; // drop 0,5
  if ((s = eval5ints(c1, c2, c3, c5, c6)) > best) best = s; // drop 0,4
  if ((s = eval5ints(c1, c2, c4, c5, c6)) > best) best = s; // drop 0,3
  if ((s = eval5ints(c1, c3, c4, c5, c6)) > best) best = s; // drop 0,2
  if ((s = eval5ints(c2, c3, c4, c5, c6)) > best) best = s; // drop 0,1
  return best;
}

/**
 * Compute the LUT index (0–168) for a pair of integer-encoded hole cards.
 * Mirrors the logic in range-chart.evaluator.ts::holeCardsToIndex() but
 * works directly on card integers — zero string allocation.
 *
 * Index layout:
 *   0–12:   pocket pairs (rank_idx 0=22 … 12=AA)
 *   13–90:  suited non-pairs (higher rank first)
 *   91–168: offsuit non-pairs (higher rank first)
 */
export function holecardRangeIndex(c1: number, c2: number): number {
  let r1 = c1 >> 2;
  let r2 = c2 >> 2;
  const s1 = c1 & 3;
  const s2 = c2 & 3;

  // Ensure higher rank first
  if (r2 > r1) {
    const tmp = r1;
    r1 = r2;
    r2 = tmp;
  }

  if (r1 === r2) {
    return r1; // pocket pair
  }

  const suited = s1 === s2;
  // blockOffset mirrors the formula in range-chart.evaluator.ts
  const blockOffset = r1 * 12 - ((r1 * (r1 - 1)) >> 1) + (r2 - r1 - 1);
  return suited ? 13 + blockOffset : 91 + blockOffset;
}
