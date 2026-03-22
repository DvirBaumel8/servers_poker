/**
 * RangeChartEvaluator: Maps hole cards to the 13x13 range chart and looks up the action.
 *
 * The range chart uses standard poker hand notation:
 * - Pairs: "AA", "KK", ..., "22"
 * - Suited: higher rank first + "s" (e.g., "AKs")
 * - Offsuit: higher rank first + "o" (e.g., "AKo")
 */

import type {
  RangeChart,
  RangeAction,
  ActionDefinition,
} from "../../../domain/bot-strategy/strategy.types";
import { STRATEGY_TUNABLES } from "../strategy-tunables";

const VALUE_TO_RANK: Record<number, string> = {
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

export interface RangeChartResult {
  matched: boolean;
  handNotation: string;
  action: RangeAction;
}

/**
 * Convert hole cards to standard hand notation and look up in range chart.
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
  return {
    matched: action !== null,
    handNotation: notation,
    action,
  };
}

/**
 * Convert a range action ("raise", "call", "fold") to an ActionDefinition.
 * For "raise", uses a default 2.5x BB sizing.
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

export function holeCardsToNotation(
  holeCards: { value: number; suit: string }[],
): string {
  if (holeCards.length !== 2) return "??";

  const [c1, c2] =
    holeCards[0].value >= holeCards[1].value
      ? [holeCards[0], holeCards[1]]
      : [holeCards[1], holeCards[0]];

  const r1 = VALUE_TO_RANK[c1.value];
  const r2 = VALUE_TO_RANK[c2.value];

  if (!r1 || !r2) return "??";

  if (c1.value === c2.value) {
    return `${r1}${r2}`;
  }

  const suited = c1.suit === c2.suit;
  return `${r1}${r2}${suited ? "s" : "o"}`;
}
