/**
 * PersonalityEvaluator: Weight-based action distribution from personality sliders.
 *
 * Core flow:
 *   1. Classify hand → pick base distribution { fold, call, raise }
 *   2. Sigmoid-map tightness → shift fold vs play weights
 *   3. Sigmoid-map aggression → shift call vs raise (gated by equity threshold)
 *   4. BluffFrequency → inject raise weight for weak hands
 *   5. RiskTolerance → reduce fold when facing bets
 *   6. Normalize to sum=1, roll seeded PRNG, pick action
 *
 * All base distributions and thresholds live in STRATEGY_TUNABLES.
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

// ─── Hand strength helpers ────────────────────────────────────────────────────

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

function normalizedStrength(ctx: GameContext): number {
  const idx = HAND_STRENGTH_ORDER.indexOf(ctx.handStrength);
  return idx / (HAND_STRENGTH_ORDER.length - 1);
}

function handCategory(ctx: GameContext): string {
  if (ctx.street === "preflop") return ctx.holeCardRank;
  if (ctx.hasFlushDraw || ctx.hasStraightDraw) return "draw";
  const s = normalizedStrength(ctx);
  if (s >= 0.7) return "premium";
  if (s >= 0.4) return "strong";
  if (s >= 0.15) return "playable";
  return "weak";
}

function getHandQualityScore(rank: string): number {
  switch (rank) {
    case "premium":
      return STRATEGY_TUNABLES.handQuality.premium;
    case "strong":
      return STRATEGY_TUNABLES.handQuality.strong;
    case "playable":
      return STRATEGY_TUNABLES.handQuality.playable;
    default:
      return STRATEGY_TUNABLES.handQuality.weak;
  }
}

// ─── Seeded PRNG ──────────────────────────────────────────────────────────────

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

// ─── Sigmoid ──────────────────────────────────────────────────────────────────

function sigmoid(
  value: number,
  k: number = STRATEGY_TUNABLES.distributions.sigmoidK,
): number {
  const x = (value - 50) / 50;
  return 1 / (1 + Math.exp(-k * x));
}

// ─── Weight computation ───────────────────────────────────────────────────────

interface ActionWeights {
  fold: number;
  call: number;
  raise: number;
}

function getBaseDistribution(category: string): ActionWeights {
  const base = STRATEGY_TUNABLES.distributions.base[category];
  return base ? { ...base } : { fold: 40, call: 40, raise: 20 };
}

function computeActionWeights(
  p: Personality,
  ctx: GameContext,
  category: string,
  positionAware: boolean,
): ActionWeights {
  const w = getBaseDistribution(category);
  const sigAgg = sigmoid(p.aggression);
  const sigTight = sigmoid(p.tightness);
  const sigBluff = sigmoid(p.bluffFrequency);
  const sigRisk = sigmoid(p.riskTolerance);

  const handQuality =
    ctx.equity > 0
      ? ctx.equity
      : ctx.street === "preflop"
        ? getHandQualityScore(ctx.holeCardRank)
        : normalizedStrength(ctx);

  // 1. Tightness → shift fold vs (call + raise)
  // posMultiplier: late position (BTN/CO) → lower multiplier → less tightness penalty → wider range.
  // Only applied for Quick/Strategy tiers (positionAware=true); Pro tier uses explicit per-position overrides.
  const posMultiplier =
    positionAware && ctx.myPosition
      ? (STRATEGY_TUNABLES.positionMultiplier[ctx.myPosition] ?? 1.0)
      : 1.0;
  const tightnessFactor = sigTight * (1 - handQuality) * posMultiplier;
  const foldShift = tightnessFactor * 40;
  w.fold += foldShift;
  const playTotal = w.call + w.raise;
  if (playTotal > 0) {
    w.call -= foldShift * (w.call / playTotal);
    w.raise -= foldShift * (w.raise / playTotal);
  }

  // 2. Aggression → shift call → raise (equity-gated)
  if (
    handQuality >= STRATEGY_TUNABLES.distributions.equityGateThreshold &&
    w.call > 0
  ) {
    const transfer = sigAgg * w.call * 0.7;
    w.raise += transfer;
    w.call -= transfer;
  }

  // 3. Bluff frequency → inject raise weight for weak/draw hands
  if (category === "weak" || category === "draw") {
    const bluffBoost = sigBluff * 15;
    w.raise += bluffBoost;
    w.fold -= bluffBoost * 0.7;
    w.call -= bluffBoost * 0.3;
  }

  // 4. Risk tolerance → reduce fold when facing bets
  if (ctx.facingBet || ctx.facingRaise) {
    const riskReduction = sigRisk * w.fold * 0.5;
    w.fold -= riskReduction;
    w.call += riskReduction * 0.7;
    w.raise += riskReduction * 0.3;

    if (ctx.facingAllIn) {
      const penalty = (1 - sigRisk) * 30;
      w.fold += penalty;
      w.raise -= penalty * 0.6;
      w.call -= penalty * 0.4;
    }
  }

  // 5. Negative-EV guard: fold more aggressively when the call is clearly losing money.
  // Triggered when equity is less than 50% of the break-even pot-odds threshold —
  // i.e., the bot would need at least 2× its actual equity to make the call profitable.
  // Overrides the risk-tolerance reduction so even aggressive bots avoid these spots.
  if (ctx.facingBet && ctx.potOdds > 0 && ctx.equity > 0) {
    const evRatio = ctx.equity / ctx.potOdds;
    if (evRatio < 0.5) {
      const evPenalty =
        (1 - evRatio) * STRATEGY_TUNABLES.distributions.negativeEvFoldBoost;
      w.fold += evPenalty;
      w.call = Math.max(0, w.call - evPenalty * 0.7);
      w.raise = Math.max(0, w.raise - evPenalty * 0.3);
    }
  }

  // Clamp negatives
  w.fold = Math.max(0, w.fold);
  w.call = Math.max(0, w.call);
  w.raise = Math.max(0, w.raise);
  return w;
}

function rollAction(
  w: ActionWeights,
  rng: SeededRandom,
): "fold" | "call" | "raise" {
  const total = w.fold + w.call + w.raise;
  if (total <= 0) return "fold";
  const nFold = w.fold / total;
  const nCall = w.call / total;
  const roll = rng.next();
  if (roll < nFold) return "fold";
  if (roll < nFold + nCall) return "call";
  return "raise";
}

// ─── Sizing ───────────────────────────────────────────────────────────────────

function computeRaiseSizing(
  p: Personality,
  ctx: GameContext,
): { mode: "pot_fraction" | "bb_multiple"; value: number } {
  if (ctx.street === "preflop") {
    const base = STRATEGY_TUNABLES.sizing.preflopBaseOpenBB;
    const bonus =
      (p.aggression / 100) * STRATEGY_TUNABLES.sizing.preflopAggressionBonus;
    return { mode: "bb_multiple", value: base + bonus };
  }
  const base = STRATEGY_TUNABLES.sizing.postflopBasePotFraction;
  const bonus =
    (p.aggression / 100) * STRATEGY_TUNABLES.sizing.postflopAggressionBonus;
  return { mode: "pot_fraction", value: base + bonus };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

const DEFAULT_PERSONALITY: Personality = {
  tightness: 50,
  aggression: 50,
  bluffFrequency: 20,
  riskTolerance: 50,
};

export function evaluatePersonality(
  personality: Personality | undefined | null,
  context: GameContext,
  handSeed: number,
  positionAware: boolean = false,
): PersonalityEvalResult {
  const p = personality ?? DEFAULT_PERSONALITY;
  const rng = new SeededRandom(handSeed);
  const category = handCategory(context);
  const w = computeActionWeights(p, context, category, positionAware);
  const action = rollAction(w, rng);

  const total = w.fold + w.call + w.raise;
  const pF = total > 0 ? ((w.fold / total) * 100).toFixed(0) : "0";
  const pC = total > 0 ? ((w.call / total) * 100).toFixed(0) : "0";
  const pR = total > 0 ? ((w.raise / total) * 100).toFixed(0) : "0";
  const dist = `F:${pF}% C:${pC}% R:${pR}%`;

  switch (action) {
    case "fold":
      if (context.canCheck) {
        return {
          action: { type: "check" },
          explanation: `Checking (${category}, ${dist})`,
        };
      }
      return {
        action: { type: "fold" },
        explanation: `Folding (${category}, ${dist})`,
      };

    case "call":
      if (context.toCall <= 0 && context.canCheck) {
        return {
          action: { type: "check" },
          explanation: `Checking (${category}, ${dist})`,
        };
      }
      return {
        action: { type: "call" },
        explanation: `Calling (${category}, ${dist})`,
      };

    case "raise": {
      if (context.maxRaise <= 0) {
        if (context.toCall > 0) {
          return {
            action: { type: "call" },
            explanation: `Calling (wanted raise, ${category}, ${dist})`,
          };
        }
        return {
          action: { type: "check" },
          explanation: `Checking (wanted raise, ${category}, ${dist})`,
        };
      }
      return {
        action: { type: "raise", sizing: computeRaiseSizing(p, context) },
        explanation: `Raising (${category}, ${dist})`,
      };
    }

    default:
      return { action: { type: "fold" }, explanation: "Fallback fold" };
  }
}
