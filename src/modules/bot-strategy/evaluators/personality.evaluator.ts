/**
 * PersonalityEvaluator: Translates personality sliders into probabilistic actions.
 *
 * This is the fallback evaluator — it fires when no rule or range chart matches.
 * Uses a seeded PRNG for deterministic-but-varied behavior across hands.
 *
 * Slider semantics:
 * - tightness (0-100): Preflop hand selection. Higher = fewer hands played.
 * - aggression (0-100): Bet/raise frequency. Higher = more aggressive.
 * - bluffFrequency (0-100): Bet with weak hands. Higher = more bluffs.
 * - riskTolerance (0-100): Willingness to risk stack. Higher = more calls/raises.
 */

import type {
  Personality,
  GameContext,
  ActionDefinition,
  HandStrength,
} from "../../../domain/bot-strategy/strategy.types";
import { STRATEGY_TUNABLES } from "../strategy-tunables";

export interface PersonalityEvalResult {
  action: ActionDefinition;
  explanation: string;
}

const HAND_STRENGTH_ORDER: HandStrength[] = [
  "high_card",
  "pair",
  "two_pair",
  "trips",
  "straight",
  "flush",
  "full_house",
  "quads",
  "straight_flush",
  "royal_flush",
];

/**
 * Simple seeded PRNG (same as SimulationEngine uses).
 * Deterministic for same seed — allows reproducible bot behavior.
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
}

export function evaluatePersonality(
  personality: Personality,
  context: GameContext,
  handSeed: number,
): PersonalityEvalResult {
  const rng = new SeededRandom(handSeed);

  if (context.street === "preflop") {
    return evaluatePreflop(personality, context, rng);
  }

  return evaluatePostflop(personality, context, rng);
}

function evaluatePreflop(
  p: Personality,
  ctx: GameContext,
  rng: SeededRandom,
): PersonalityEvalResult {
  const handQuality = getHandQualityScore(ctx.holeCardRank);

  // tightness determines minimum hand quality to play
  // tightness 0 = play everything, tightness 100 = only premium
  const playThreshold = p.tightness / 100;

  if (handQuality < playThreshold) {
    if (ctx.canCheck) {
      return {
        action: { type: "check" },
        explanation: "Hand below play threshold, checking",
      };
    }
    // Sometimes bluff even with bad hands
    if (
      rng.next() <
      p.bluffFrequency / STRATEGY_TUNABLES.personality.preflopBluffDivisor
    ) {
      return {
        action: {
          type: "raise",
          sizing: {
            mode: "bb_multiple",
            value: STRATEGY_TUNABLES.personality.preflopBluffRaiseBB,
          },
        },
        explanation: `Bluffing with weak hand (bluff frequency: ${p.bluffFrequency}%)`,
      };
    }
    return {
      action: { type: "fold" },
      explanation: "Hand below play threshold, folding",
    };
  }

  if (ctx.facingBet || ctx.facingRaise) {
    return handleFacingAction(p, ctx, rng, handQuality);
  }

  // Unopened pot — decide to raise or limp
  const raiseProb =
    (p.aggression / 100) * STRATEGY_TUNABLES.personality.raiseWeightAggression +
    handQuality * STRATEGY_TUNABLES.personality.raiseWeightHandQuality;
  if (rng.next() < raiseProb) {
    const sizing = computeRaiseSizing(p, ctx);
    return {
      action: { type: "raise", sizing },
      explanation: `Opening raise (aggression: ${p.aggression}%, hand quality: ${(handQuality * 100).toFixed(0)}%)`,
    };
  }

  if (ctx.canCheck) {
    return { action: { type: "check" }, explanation: "Limping behind" };
  }

  return { action: { type: "call" }, explanation: "Calling to see a flop" };
}

function evaluatePostflop(
  p: Personality,
  ctx: GameContext,
  rng: SeededRandom,
): PersonalityEvalResult {
  const strengthIndex = HAND_STRENGTH_ORDER.indexOf(ctx.handStrength);
  const normalizedStrength = strengthIndex / (HAND_STRENGTH_ORDER.length - 1);

  // Strong hand (pair+)
  if (normalizedStrength >= STRATEGY_TUNABLES.personality.strongHandThreshold) {
    return handleStrongHand(p, ctx, rng, normalizedStrength);
  }

  // Weak hand — consider draws
  if (ctx.hasFlushDraw || ctx.hasStraightDraw) {
    return handleDrawingHand(p, ctx, rng);
  }

  return handleWeakHand(p, ctx, rng);
}

function handleStrongHand(
  p: Personality,
  ctx: GameContext,
  rng: SeededRandom,
  strength: number,
): PersonalityEvalResult {
  if (ctx.facingBet || ctx.facingRaise) {
    // Facing action with strong hand
    const callRaiseThreshold =
      (p.aggression / 100) *
        STRATEGY_TUNABLES.personality.strongHandFacingActionAggressionWeight +
      strength *
        STRATEGY_TUNABLES.personality.strongHandFacingActionStrengthWeight;

    if (rng.next() < callRaiseThreshold && ctx.maxRaise > 0) {
      const sizing = computeRaiseSizing(p, ctx);
      return {
        action: { type: "raise", sizing },
        explanation: `Raising strong hand (strength: ${(strength * 100).toFixed(0)}%, aggression: ${p.aggression}%)`,
      };
    }
    return {
      action: { type: "call" },
      explanation: `Calling with strong hand (strength: ${(strength * 100).toFixed(0)}%)`,
    };
  }

  // Not facing action
  const betProb =
    (p.aggression / 100) *
      STRATEGY_TUNABLES.personality.strongHandNoActionAggressionWeight +
    strength * STRATEGY_TUNABLES.personality.strongHandNoActionStrengthWeight;
  if (rng.next() < betProb && ctx.maxRaise > 0) {
    const sizing = computeRaiseSizing(p, ctx);
    return {
      action: { type: "raise", sizing },
      explanation: `Betting strong hand for value (aggression: ${p.aggression}%)`,
    };
  }

  return {
    action: { type: "check" },
    explanation: "Trapping with strong hand",
  };
}

function handleDrawingHand(
  p: Personality,
  ctx: GameContext,
  rng: SeededRandom,
): PersonalityEvalResult {
  const drawAggression =
    (p.aggression / 100) * STRATEGY_TUNABLES.personality.drawAggressionWeight +
    (p.bluffFrequency / 100) * STRATEGY_TUNABLES.personality.drawBluffWeight;
  const drawType = ctx.hasFlushDraw ? "flush draw" : "straight draw";

  if (ctx.facingBet) {
    // Calling with a draw depends on pot odds and risk tolerance
    const callProb =
      (p.riskTolerance / 100) *
        STRATEGY_TUNABLES.personality.drawCallRiskWeight +
      STRATEGY_TUNABLES.personality.drawCallBase;
    if (rng.next() < callProb) {
      return {
        action: { type: "call" },
        explanation: `Calling with ${drawType} (risk tolerance: ${p.riskTolerance}%)`,
      };
    }
    // Semi-bluff raise with draw
    if (rng.next() < drawAggression && ctx.maxRaise > 0) {
      const sizing = computeRaiseSizing(p, ctx);
      return {
        action: { type: "raise", sizing },
        explanation: `Semi-bluff raising with ${drawType} (aggression: ${p.aggression}%)`,
      };
    }
    return {
      action: { type: "fold" },
      explanation: `Folding ${drawType}, odds not favorable`,
    };
  }

  // Not facing bet — bet as semi-bluff or check
  if (rng.next() < drawAggression && ctx.maxRaise > 0) {
    const sizing = computeRaiseSizing(p, ctx);
    return {
      action: { type: "raise", sizing },
      explanation: `Betting ${drawType} as semi-bluff`,
    };
  }

  return {
    action: { type: "check" },
    explanation: `Checking ${drawType}, hoping to improve`,
  };
}

function handleWeakHand(
  p: Personality,
  ctx: GameContext,
  rng: SeededRandom,
): PersonalityEvalResult {
  if (ctx.facingBet || ctx.facingRaise) {
    if (ctx.facingAllIn) {
      // Rarely call all-in with weak hand
      if (
        rng.next() <
        p.riskTolerance / STRATEGY_TUNABLES.personality.weakAllInCallDivisor
      ) {
        return {
          action: { type: "call" },
          explanation: "Hero-calling all-in with weak hand",
        };
      }
      return {
        action: { type: "fold" },
        explanation: "Folding to all-in with weak hand",
      };
    }

    // Bluff raise sometimes
    if (
      rng.next() <
        p.bluffFrequency /
          STRATEGY_TUNABLES.personality.weakBluffRaiseDivisor &&
      ctx.maxRaise > 0
    ) {
      const sizing = computeRaiseSizing(p, ctx);
      return {
        action: { type: "raise", sizing },
        explanation: `Bluff raising with weak hand (bluff frequency: ${p.bluffFrequency}%)`,
      };
    }

    return {
      action: { type: "fold" },
      explanation: "Folding weak hand to bet",
    };
  }

  // No bet facing — check or bluff
  if (
    rng.next() <
      p.bluffFrequency / STRATEGY_TUNABLES.personality.weakBluffBetDivisor &&
    ctx.maxRaise > 0
  ) {
    const sizing = computeRaiseSizing(p, ctx);
    return {
      action: { type: "raise", sizing },
      explanation: `Betting as bluff (bluff frequency: ${p.bluffFrequency}%)`,
    };
  }

  return { action: { type: "check" }, explanation: "Checking weak hand" };
}

function handleFacingAction(
  p: Personality,
  ctx: GameContext,
  rng: SeededRandom,
  handQuality: number,
): PersonalityEvalResult {
  const callThreshold =
    (p.riskTolerance / 100) *
      STRATEGY_TUNABLES.personality.facingActionCallRiskWeight +
    handQuality * STRATEGY_TUNABLES.personality.facingActionCallHandWeight;

  if (ctx.facingAllIn) {
    // All-in decision: need high risk tolerance and good hand
    const allinCallProb =
      (p.riskTolerance / 100) *
        STRATEGY_TUNABLES.personality.facingAllInRiskWeight +
      handQuality * STRATEGY_TUNABLES.personality.facingAllInHandWeight;
    if (rng.next() < allinCallProb) {
      return {
        action: { type: "call" },
        explanation: `Calling all-in (risk tolerance: ${p.riskTolerance}%, hand quality: ${(handQuality * 100).toFixed(0)}%)`,
      };
    }
    return { action: { type: "fold" }, explanation: "Folding to all-in" };
  }

  // 3-bet/raise back
  const reraiseProb =
    (p.aggression / 100) *
      STRATEGY_TUNABLES.personality.facingActionReraiseAggressionWeight +
    handQuality * STRATEGY_TUNABLES.personality.facingActionReraiseHandWeight;
  if (rng.next() < reraiseProb && ctx.maxRaise > 0) {
    const sizing = computeRaiseSizing(p, ctx);
    return {
      action: { type: "raise", sizing },
      explanation: `Re-raising (aggression: ${p.aggression}%, hand quality: ${(handQuality * 100).toFixed(0)}%)`,
    };
  }

  if (rng.next() < callThreshold) {
    return {
      action: { type: "call" },
      explanation: `Calling (risk tolerance: ${p.riskTolerance}%)`,
    };
  }

  return { action: { type: "fold" }, explanation: "Folding to aggression" };
}

function computeRaiseSizing(
  p: Personality,
  ctx: GameContext,
): {
  mode: "pot_fraction" | "bb_multiple";
  value: number;
} {
  if (ctx.street === "preflop") {
    // Preflop: use BB multiples. More aggressive = bigger opens.
    const baseOpen = STRATEGY_TUNABLES.sizing.preflopBaseOpenBB;
    const aggressionBonus =
      (p.aggression / 100) * STRATEGY_TUNABLES.sizing.preflopAggressionBonus;
    return { mode: "bb_multiple", value: baseOpen + aggressionBonus };
  }

  // Postflop: use pot fractions. More aggressive = bigger bets.
  const baseFraction = STRATEGY_TUNABLES.sizing.postflopBasePotFraction;
  const aggressionBonus =
    (p.aggression / 100) * STRATEGY_TUNABLES.sizing.postflopAggressionBonus;
  return { mode: "pot_fraction", value: baseFraction + aggressionBonus };
}

function getHandQualityScore(rank: string): number {
  switch (rank) {
    case "premium":
      return STRATEGY_TUNABLES.handQuality.premium;
    case "strong":
      return STRATEGY_TUNABLES.handQuality.strong;
    case "playable":
      return STRATEGY_TUNABLES.handQuality.playable;
    case "weak":
      return STRATEGY_TUNABLES.handQuality.weak;
    default:
      return STRATEGY_TUNABLES.handQuality.weak;
  }
}
