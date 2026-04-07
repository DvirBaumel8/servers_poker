/**
 * RangeChartEvaluator: Maps hole cards to the 13x13 range chart via a dense Uint8Array LUT.
 *
 * The 169 unique hand types are indexed numerically for O(1) array access
 * with zero string allocation on the hot path.
 *
 * Index layout (169 entries):
 *   0-12:   Pairs    (AA=0, KK=1, ..., 22=12)
 *   13-90:  Suited   (AKs=13, AQs=14, ..., 32s=90)
 *   91-168: Offsuit  (AKo=91, AQo=92, ..., 32o=168)
 *
 * Action encoding: 0=null(fallthrough), 1=fold, 2=call, 3=raise
 */

import type {
  RangeChart,
  RangeAction,
  ActionDefinition,
  HydratedRangeChart,
} from "../../../domain/bot-strategy/strategy.types";
import { STRATEGY_TUNABLES } from "../strategy-tunables";

// ── Rank mapping ───────────────────────────────────────────────────────────────
// Card value (2-14) → rank index (0-12) where A=0, K=1, ..., 2=12
const VALUE_TO_RANK_INDEX: number[] = new Array(15).fill(-1);
VALUE_TO_RANK_INDEX[14] = 0; // A
VALUE_TO_RANK_INDEX[13] = 1; // K
VALUE_TO_RANK_INDEX[12] = 2; // Q
VALUE_TO_RANK_INDEX[11] = 3; // J
VALUE_TO_RANK_INDEX[10] = 4; // T
VALUE_TO_RANK_INDEX[9] = 5;
VALUE_TO_RANK_INDEX[8] = 6;
VALUE_TO_RANK_INDEX[7] = 7;
VALUE_TO_RANK_INDEX[6] = 8;
VALUE_TO_RANK_INDEX[5] = 9;
VALUE_TO_RANK_INDEX[4] = 10;
VALUE_TO_RANK_INDEX[3] = 11;
VALUE_TO_RANK_INDEX[2] = 12;

const RANK_CHARS = "AKQJT98765432";

const VALUE_TO_RANK_CHAR: Record<number, string> = {
  14: "A",
  13: "K",
  12: "Q",
  11: "J",
  10: "T",
  9: "9",
  8: "8",
  7: "7",
  6: "6",
  5: "5",
  4: "4",
  3: "3",
  2: "2",
};

// ── Notation ↔ Index mapping (built once at module load) ───────────────────────
/** Map from "AKs" notation → LUT index */
const NOTATION_TO_INDEX: Record<string, number> = {};
/** Map from LUT index → "AKs" notation (for result reporting) */
const INDEX_TO_NOTATION: string[] = new Array(169);

let idx = 0;

// Pairs: 0-12
for (let r = 0; r < 13; r++) {
  const notation = `${RANK_CHARS[r]}${RANK_CHARS[r]}`;
  NOTATION_TO_INDEX[notation] = idx;
  INDEX_TO_NOTATION[idx] = notation;
  idx++;
}

// Suited: 13-90 (higher rank first)
for (let r1 = 0; r1 < 13; r1++) {
  for (let r2 = r1 + 1; r2 < 13; r2++) {
    const notation = `${RANK_CHARS[r1]}${RANK_CHARS[r2]}s`;
    NOTATION_TO_INDEX[notation] = idx;
    INDEX_TO_NOTATION[idx] = notation;
    idx++;
  }
}

// Offsuit: 91-168 (higher rank first)
for (let r1 = 0; r1 < 13; r1++) {
  for (let r2 = r1 + 1; r2 < 13; r2++) {
    const notation = `${RANK_CHARS[r1]}${RANK_CHARS[r2]}o`;
    NOTATION_TO_INDEX[notation] = idx;
    INDEX_TO_NOTATION[idx] = notation;
    idx++;
  }
}

// ── Action encoding ────────────────────────────────────────────────────────────
const ACTION_ENCODE: Record<string, number> = {
  null: 0,
  fold: 1,
  call: 2,
  raise: 3,
};

const ACTION_DECODE: RangeAction[] = [null, "fold", "call", "raise"];

// ── Public API ─────────────────────────────────────────────────────────────────

export interface RangeChartResult {
  matched: boolean;
  handNotation: string;
  action: RangeAction;
}

/**
 * Compile a raw RangeChart (Record<string, RangeAction>) into a dense Uint8Array LUT.
 * Called once during strategy hydration.
 */
export function compileRangeChartLUT(chart: RangeChart): Uint8Array {
  const lut = new Uint8Array(169); // all zeros = fallthrough
  for (const [notation, action] of Object.entries(chart)) {
    const i = NOTATION_TO_INDEX[notation];
    if (i !== undefined) {
      lut[i] = ACTION_ENCODE[action ?? "null"] ?? 0;
    }
  }
  return lut;
}

/**
 * Convert two hole cards to a LUT index. Zero string allocation.
 * Cards must have { value: number, suit: string }.
 */
export function holeCardsToIndex(
  holeCards: { value: number; suit: string }[],
): number {
  if (holeCards.length !== 2) return -1;

  let v1 = holeCards[0].value;
  let v2 = holeCards[1].value;
  let s1 = holeCards[0].suit;
  let s2 = holeCards[1].suit;

  // Ensure higher rank first
  if (v2 > v1) {
    const tv = v1;
    v1 = v2;
    v2 = tv;
    const ts = s1;
    s1 = s2;
    s2 = ts;
  }

  const r1 = VALUE_TO_RANK_INDEX[v1];
  const r2 = VALUE_TO_RANK_INDEX[v2];
  if (r1 < 0 || r2 < 0) return -1;

  if (r1 === r2) {
    // Pair
    return r1;
  }

  const suited = s1 === s2;
  // In the suited/offsuit blocks, combos are enumerated as:
  // for r1 0..12, for r2 (r1+1)..12
  // The offset within the block: sum(12-i, i=0..r1-1) + (r2 - r1 - 1)
  // = r1*12 - r1*(r1-1)/2 + (r2 - r1 - 1)
  const blockOffset = r1 * 12 - ((r1 * (r1 - 1)) >> 1) + (r2 - r1 - 1);

  return suited ? 13 + blockOffset : 91 + blockOffset;
}

/**
 * Fast-path range chart evaluation using the Uint8Array LUT.
 * O(1) with zero string allocation.
 */
export function evaluateCompiledRangeChart(
  holeCards: { value: number; suit: string }[],
  chart: HydratedRangeChart,
): RangeChartResult {
  const i = holeCardsToIndex(holeCards);
  if (i < 0) {
    return { matched: false, handNotation: "??", action: null };
  }

  const encoded = chart.lut[i];
  const notation = INDEX_TO_NOTATION[i];

  if (encoded === 0) {
    // Cell is unset — the UI contract says "unset defaults to Fold".
    // Return matched:true with action:null so the engine honours the fold
    // instead of falling through to rules (which could override the chart).
    return { matched: true, handNotation: notation, action: null };
  }

  return {
    matched: true,
    handNotation: notation,
    action: ACTION_DECODE[encoded],
  };
}

/**
 * Legacy: string-based range chart lookup (non-hydrated path).
 */
export function evaluateRangeChart(
  holeCards: { value: number; suit: string }[],
  rangeChart: RangeChart,
): RangeChartResult {
  const notation = holeCardsToNotation(holeCards);
  if (!(notation in rangeChart)) {
    return { matched: false, handNotation: notation, action: null };
  }
  const action = rangeChart[notation];
  return { matched: action !== null, handNotation: notation, action };
}

/**
 * Convert a range action ("raise", "call", "fold") to an ActionDefinition.
 */
export function rangeActionToActionDef(
  action: RangeAction,
): ActionDefinition | null {
  switch (action) {
    case "raise":
      return {
        type: "raise",
        sizing: {
          mode: "bb_multiple",
          value: STRATEGY_TUNABLES.sizing.rangeChartDefaultRaiseBB,
        },
      };
    case "call":
      return { type: "call" };
    case "fold":
      return { type: "fold" };
    case null:
      return null;
  }
}

/**
 * Convert hole cards to standard notation string (for legacy/debugging).
 */
export function holeCardsToNotation(
  holeCards: { value: number; suit: string }[],
): string {
  if (holeCards.length !== 2) return "??";

  const [c1, c2] =
    holeCards[0].value >= holeCards[1].value
      ? [holeCards[0], holeCards[1]]
      : [holeCards[1], holeCards[0]];

  const r1 = VALUE_TO_RANK_CHAR[c1.value];
  const r2 = VALUE_TO_RANK_CHAR[c2.value];
  if (!r1 || !r2) return "??";

  if (c1.value === c2.value) return `${r1}${r2}`;
  return `${r1}${r2}${c1.suit === c2.suit ? "s" : "o"}`;
}
