/**
 * Analysis Checks for Strategy Decisions
 *
 * Each check function receives a decision record and returns zero or more
 * flags. Checks are pure functions with no side effects — easy to test
 * and extend independently.
 */

import type { AnalysisFlag } from "../../entities/strategy-decision.entity";
import { STRATEGY_TUNABLES } from "./strategy-tunables";

interface DecisionRecord {
  action_type: string;
  action_amount: number | null;
  decision_source: string;
  hand_notation: string | null;
  street: string;
  game_context: {
    handStrength?: string;
    holeCardRank?: string;
    pairType?: string | null;
    hasFlushDraw?: boolean;
    hasStraightDraw?: boolean;
    communityCardCount?: number;
    boardTexture?: string | null;
    facingBet?: boolean;
    facingAllIn?: boolean;
    activePlayerCount?: number;
    myStackBB?: number;
    potSizeBB?: number;
    potOdds?: number;
    canCheck?: boolean;
    toCall?: number;
    street?: string;
    bigBlind?: number;
  };
  strategy_snapshot: {
    personality?: {
      aggression?: number;
      bluffFrequency?: number;
      riskTolerance?: number;
      tightness?: number;
    };
    rangeChart?: Record<string, string>;
  };
}

export type AnalysisCheck = (decision: DecisionRecord) => AnalysisFlag[];

const PREMIUM_HANDS = new Set(["AA", "KK", "QQ", "AKs", "AKo"]);

const STRONG_HANDS = new Set(["JJ", "TT", "AQs", "AQo", "AJs", "KQs"]);

const TRASH_HANDS = new Set([
  "72o",
  "73o",
  "82o",
  "83o",
  "92o",
  "32o",
  "42o",
  "43o",
]);

const STRONG_MADE_HANDS = new Set([
  "two_pair",
  "trips",
  "straight",
  "flush",
  "full_house",
  "quads",
  "straight_flush",
  "royal_flush",
]);

/**
 * Flags folding premium hands preflop when not facing a significant raise.
 */
export const checkFoldedPremium: AnalysisCheck = (d) => {
  if (d.street !== "preflop" || d.action_type !== "fold") return [];
  if (!d.hand_notation) return [];

  if (PREMIUM_HANDS.has(d.hand_notation)) {
    return [
      {
        checkId: "folded_premium",
        severity: "critical",
        title: "Folded premium hand preflop",
        description: `Folded ${d.hand_notation} preflop. Premium hands should almost never be folded before the flop.`,
        suggestion: `Add a preflop rule: "IF hand is premium THEN raise" or adjust range chart to mark ${d.hand_notation} as raise.`,
      },
    ];
  }

  if (STRONG_HANDS.has(d.hand_notation) && !d.game_context.facingAllIn) {
    return [
      {
        checkId: "folded_strong",
        severity: "high",
        title: "Folded strong hand preflop",
        description: `Folded ${d.hand_notation} preflop without facing an all-in. This hand is typically worth playing.`,
        suggestion: `Consider adding a rule or adjusting range chart to play ${d.hand_notation}.`,
      },
    ];
  }

  return [];
};

/**
 * Flags calling an all-in with trash hands.
 */
export const checkCalledAllInWithTrash: AnalysisCheck = (d) => {
  if (d.action_type !== "call" && d.action_type !== "all_in") return [];
  if (!d.game_context.facingAllIn) return [];
  if (!d.hand_notation) return [];

  if (TRASH_HANDS.has(d.hand_notation)) {
    return [
      {
        checkId: "called_allin_trash",
        severity: "critical",
        title: "Called all-in with trash hand",
        description: `Called an all-in with ${d.hand_notation}. This hand has very low equity and calling all-in is almost always -EV.`,
        suggestion:
          'Add a rule: "IF facing all-in AND hand is weak THEN fold."',
      },
    ];
  }

  return [];
};

/**
 * Flags being passive (check/call) with very strong made hands.
 */
export const checkPassiveWithStrong: AnalysisCheck = (d) => {
  if (d.action_type !== "check" && d.action_type !== "call") return [];
  if (d.street === "preflop") return [];

  const hs = d.game_context.handStrength;
  if (!hs || !STRONG_MADE_HANDS.has(hs)) return [];

  return [
    {
      checkId: "passive_strong_hand",
      severity: "medium",
      title: `Passive play with ${hs.replace(/_/g, " ")}`,
      description: `${d.action_type === "check" ? "Checked" : "Just called"} on ${d.street} holding ${hs.replace(/_/g, " ")}. Strong made hands usually benefit from raising to build the pot and protect against draws.`,
      suggestion: `Consider adding a rule: "IF hand strength >= two_pair THEN raise."`,
    },
  ];
};

/**
 * Flags raising large amounts with weak hands when not bluffing.
 */
export const checkOverAggressiveWeak: AnalysisCheck = (d) => {
  if (d.action_type !== "raise" && d.action_type !== "all_in") return [];
  if (d.street === "preflop") return [];

  const hs = d.game_context.handStrength;
  if (!hs) return [];

  const isWeak =
    hs === "high_card" ||
    (hs === "pair" && d.game_context.pairType === "low_pair");

  if (!isWeak) return [];

  const bluffFreq = d.strategy_snapshot.personality?.bluffFrequency ?? 0;
  if (bluffFreq >= STRATEGY_TUNABLES.analysis.bluffFrequencyExemptThreshold)
    return [];

  const bb = d.game_context.bigBlind || 1;
  const raiseAmountBB = (d.action_amount || 0) / bb;
  if (raiseAmountBB < STRATEGY_TUNABLES.analysis.overAggressiveMinBB) return [];

  return [
    {
      checkId: "overaggressive_weak",
      severity: "medium",
      title: "Large raise with weak hand",
      description: `Raised ${raiseAmountBB.toFixed(0)} BB on ${d.street} holding only ${hs.replace(/_/g, " ")}. Bluff frequency is set to ${bluffFreq}%, which doesn't justify frequent large bluffs.`,
      suggestion:
        "Reduce aggression slider or add a rule to avoid large raises with weak hands post-flop.",
    },
  ];
};

/**
 * Flags inconsistency between personality settings and actual behavior.
 * If aggression is high (70+) but bot mostly checks/folds, or
 * if aggression is low (30-) but bot mostly raises.
 */
export const checkPersonalityInconsistency: AnalysisCheck = (d) => {
  if (d.decision_source !== "personality") return [];

  const aggression = d.strategy_snapshot.personality?.aggression;
  if (aggression === undefined) return [];

  if (
    aggression >= STRATEGY_TUNABLES.analysis.highAggressionThreshold &&
    (d.action_type === "fold" || d.action_type === "check")
  ) {
    if (d.game_context.canCheck && d.action_type === "check") return [];

    return [
      {
        checkId: "personality_inconsistent_passive",
        severity: "low",
        title: "High aggression but passive action",
        description: `Aggression is set to ${aggression} but the personality engine chose to ${d.action_type}. The personality evaluator's random seed may be producing unexpected results.`,
      },
    ];
  }

  if (
    aggression <= STRATEGY_TUNABLES.analysis.lowAggressionThreshold &&
    (d.action_type === "raise" || d.action_type === "all_in")
  ) {
    return [
      {
        checkId: "personality_inconsistent_aggressive",
        severity: "low",
        title: "Low aggression but aggressive action",
        description: `Aggression is set to ${aggression} but the personality engine chose to ${d.action_type}.`,
      },
    ];
  }

  return [];
};

/**
 * Flags when a hand exists in the range chart but the decision
 * came from personality (chart wasn't used).
 */
export const checkMissedRangeChart: AnalysisCheck = (d) => {
  if (d.street !== "preflop") return [];
  if (d.decision_source === "range_chart") return [];
  if (!d.hand_notation) return [];
  if (!d.strategy_snapshot.rangeChart) return [];

  const chartAction = d.strategy_snapshot.rangeChart[d.hand_notation];
  if (!chartAction) return [];

  if (chartAction !== d.action_type) {
    return [
      {
        checkId: "missed_range_chart",
        severity: "medium",
        title: "Range chart was bypassed",
        description: `Hand ${d.hand_notation} is mapped to "${chartAction}" in the range chart, but the engine used ${d.decision_source} and chose "${d.action_type}" instead.`,
        suggestion:
          "This may indicate a rule with higher priority overrode the range chart. Check rule ordering.",
      },
    ];
  }

  return [];
};

/**
 * All analysis checks in evaluation order.
 */
export const ALL_ANALYSIS_CHECKS: AnalysisCheck[] = [
  checkFoldedPremium,
  checkCalledAllInWithTrash,
  checkPassiveWithStrong,
  checkOverAggressiveWeak,
  checkPersonalityInconsistency,
  checkMissedRangeChart,
];

/**
 * Run all checks against a single decision record and return all flags.
 */
export function runAllChecks(decision: DecisionRecord): AnalysisFlag[] {
  const flags: AnalysisFlag[] = [];
  for (const check of ALL_ANALYSIS_CHECKS) {
    flags.push(...check(decision));
  }
  return flags;
}
