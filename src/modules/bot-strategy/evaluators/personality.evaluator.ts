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
  /** Normalised fold/call/raise distribution used to pick the action [0,1 each] */
  weights?: { fold: number; call: number; raise: number };
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
  // River board-plays: hole cards contribute nothing to the best hand.
  // Hero can only tie (split pot) or lose — never win outright.
  // Classify separately so the aggression gate stays closed and coaching text is accurate.
  if (ctx.isBoardPlays && ctx.street === "river") return "board_plays";
  // Use real equity when available (always populated postflop via buildGameContext).
  // Fall back to normalised hand-rank index only when equity is absent (e.g. unit tests).
  const s = ctx.equity > 0 ? ctx.equity : normalizedStrength(ctx);
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
  const sigRisk = sigmoid(p.riskTolerance);

  // Board-plays hands cannot win outright — using the (high) split-pot equity as
  // handQuality would incorrectly pass the aggression gate (>= 0.4) and cause the
  // bot to raise instead of call. Cap it at 0 so the gate stays closed.
  const handQuality =
    category === "board_plays"
      ? 0
      : ctx.equity > 0
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
  // Linear mapping (not sigmoid) so low-frequency bluffers (Shark, Rock) still get
  // proportional boosts instead of being compressed to ~0 by the steep sigmoid.
  if (category === "weak" || category === "draw") {
    const bluffBoost = (p.bluffFrequency / 100) * 50;
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

  // 6. Nuts protection: cap fold weight when equity is very high.
  // A near-nuts hand (equity > nutsProtectionThreshold) should almost never be folded
  // regardless of how tight or risk-averse the personality DNA is.
  // Guard only fires when equity > 0 — preflop without community cards is skipped.
  if (
    ctx.equity > 0 &&
    ctx.equity > STRATEGY_TUNABLES.distributions.nutsProtectionThreshold
  ) {
    const total = w.fold + w.call + w.raise;
    const maxFold = total * STRATEGY_TUNABLES.distributions.nutsMaxFoldRatio;
    if (w.fold > maxFold) {
      const excess = w.fold - maxFold;
      w.fold = maxFold;
      w.raise += excess; // redistribute to raise — natural play with a strong hand
    }
  }

  // 7. Split-Pot Guard: when the board plays on the river (hero can only split or lose),
  // never fold — doing so gives up split-pot equity. Also zero raise weight: raising adds
  // no value when you cannot win outright (the only beneficiary is the pot you're
  // inflating that you'll share). Bluff-escape does not override this guard — even
  // high-bluff personalities must call rather than raise a board-plays river.
  if (ctx.isBoardPlays && ctx.street === "river") {
    w.call += w.fold + w.raise;
    w.fold = 0;
    w.raise = 0;
  }

  // Sanity guard: folding for free is a strictly dominated strategy.
  // When toCall === 0 (a check is available), force fold weight to 0 and move
  // it to call — semantically "just check" rather than folding away free equity.
  // Redistributing to call (not proportionally to raise) prevents the raise-majority
  // guard from firing as an artifact of the fold redistribution on passive hands.
  if (ctx.toCall === 0 && w.fold > 0) {
    w.call += w.fold;
    w.fold = 0;
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
  labMode = false,
  bluffFrequency = 0,
): "fold" | "call" | "raise" {
  const total = w.fold + w.call + w.raise;
  if (total <= 0) return "fold";

  // Lab mode: return the argmax (mode of the distribution) deterministically.
  // Tie-break: raise > call > fold — more aggressive action wins ties.
  if (labMode) {
    if (w.raise >= w.call && w.raise >= w.fold) return "raise";
    if (w.call >= w.fold) return "call";
    return "fold";
  }

  // Top-Heavy guard: when one action clearly dominates (> topHeavyThreshold), take
  // it deterministically. This applies to fold, call, and raise equally so that
  // a bot with 70% fold weight reliably folds — not just raise-biased decisions.
  //
  // Bluff escape: high-bluff personalities get a small chance to override the guard
  // and sample from the full distribution, enabling surprise plays without removing
  // predictability for non-bluff bots.
  //   escapeChance = (bluffFrequency / 100) * bluffEscapeScale  [max ~25% at bluff=100]
  const T = STRATEGY_TUNABLES.distributions.topHeavyThreshold;
  const dominant = Math.max(w.fold, w.call, w.raise) / total;
  if (dominant > T) {
    const escapeChance =
      bluffFrequency > 0
        ? (bluffFrequency / 100) *
          STRATEGY_TUNABLES.distributions.bluffEscapeScale
        : 0;
    const escaped = escapeChance > 0 && rng.next() < escapeChance;
    if (!escaped) {
      // Take the dominant action deterministically (tie-break: raise > call > fold)
      if (w.raise >= w.call && w.raise >= w.fold) return "raise";
      if (w.fold >= w.call) return "fold";
      return "call";
    }
  }

  // Close contest (or bluff escape triggered) — use seeded RNG for variety
  const nFold = w.fold / total;
  const nCall = w.call / total;
  const roll = rng.next();
  if (roll < nFold) return "fold";
  if (roll < nFold + nCall) return "call";
  return "raise";
}

// ─── Sizing ───────────────────────────────────────────────────────────────────

/**
 * Picks a raise sizing from the tunable menu using personality + seeded RNG.
 *
 * Decision tree (first match wins):
 *
 * 1. Facing a bet (any street, toCall > 0) — re-raise:
 *    ALWAYS uses previous_bet_multiple in [reRaise.minMultiple, reRaise.maxMultiple].
 *    Formula: raise-delta = currentBetLevel × (multiple − 1)
 *    → raise-to = currentBetLevel × multiple (e.g. 2.5× the facing bet)
 *    → guaranteed exponential pot growth, eliminates ping-pong loops.
 *
 * 2. Opening preflop (no facing bet):
 *    Selects a BB-multiple from the preflop menu, aggression-biased + RNG jitter.
 *
 * 3. Opening postflop (no facing bet) — c-bet / probe:
 *    Selects from the pot-fraction menu, aggression-biased + step jitter.
 *
 * The rng instance is shared with rollAction so each raise gets a unique,
 * deterministic sequence from the hand seed.
 */
function computeRaiseSizing(
  p: Personality,
  ctx: GameContext,
  rng: SeededRandom,
): {
  mode: "pot_fraction" | "bb_multiple" | "previous_bet_multiple";
  value: number;
} {
  const opts = STRATEGY_TUNABLES.sizingOptions;

  // ── 1. Re-raise: facing any bet → always exponential multiple ─────────────
  if (ctx.facingBet && ctx.toCall > 0) {
    const { minMultiple, maxMultiple } = opts.reRaise;
    const range = maxMultiple - minMultiple;
    // Aggression biases toward maxMultiple; RNG provides ±0.2-step jitter.
    const aggrBias = (p.aggression / 100) * range;
    const jitter = (rng.next() - 0.5) * 0.4; // ±0.2 of the full range
    const multiple = Math.max(
      minMultiple,
      Math.min(maxMultiple, minMultiple + aggrBias + jitter),
    );
    return { mode: "previous_bet_multiple", value: multiple };
  }

  // ── 2. Preflop open ────────────────────────────────────────────────────────
  if (ctx.street === "preflop") {
    const multiples = opts.preflop.bbMultiples;
    const aggrIdx = (p.aggression / 100) * (multiples.length - 1);
    const jitter = (rng.next() - 0.5) * 1.0; // ±0.5 step
    const idx = Math.max(
      0,
      Math.min(multiples.length - 1, Math.round(aggrIdx + jitter)),
    );
    return { mode: "bb_multiple", value: multiples[idx] };
  }

  // ── 3. Postflop open / c-bet ────────────────────────────────────────────────
  const fractions = opts.postflop.potFractions;
  const aggrIdx = (p.aggression / 100) * (fractions.length - 1);
  const stepUp = rng.next() < 0.3 ? 1 : 0;
  const idx = Math.max(
    0,
    Math.min(fractions.length - 1, Math.floor(aggrIdx) + stepUp),
  );
  return { mode: "pot_fraction", value: fractions[idx] };
}

/**
 * Public helper: compute a concrete raise amount in chips given pot size,
 * the facing bet, and a personality. Uses a fresh RNG from the provided seed.
 *
 * Useful for testing and for the chaos tournament runner.
 *
 * @param potSize       Current pot in chips
 * @param lastBet       Amount the player would need to call (0 when opening)
 * @param personality   Bot personality sliders
 * @param bigBlind      Big blind for BB-multiple mode (default 1)
 * @param street        "preflop" | "flop" | "turn" | "river" (default "flop")
 * @param seed          Optional deterministic seed (default random-ish)
 * @param prevBet       The bet level BEFORE lastBet (used to enforce the poker
 *                      minimum-raise rule: raise-delta ≥ lastBet − prevBet).
 *                      Defaults to 0 (treats lastBet as an open bet).
 * @param minRaiseAmount External minimum raise delta supplied by the game engine
 *                      (e.g. `lastRaiseDelta` from BettingRound). Overrides the
 *                      internally computed minimum when larger. Defaults to 0.
 * @returns Raise delta in chips for re-raises, total bet amount for lead bets.
 *          Always satisfies both the poker minimum-raise rule and the 25%-pot floor.
 */
export function calculateRaiseAmount(
  potSize: number,
  lastBet: number,
  personality: Personality,
  bigBlind = 1,
  street: "preflop" | "flop" | "turn" | "river" = "flop",
  seed = 42,
  prevBet = 0,
  minRaiseAmount = 0,
): number {
  const rng = new SeededRandom(seed);
  const fakeCtx = {
    street,
    facingBet: lastBet > 0,
    toCall: lastBet,
    currentBetLevel: lastBet, // facing bet level = lastBet for the public helper
    equity: 0.5,
  } as unknown as GameContext;
  const sizing = computeRaiseSizing(personality, fakeCtx, rng);

  let result: number;
  switch (sizing.mode) {
    case "bb_multiple":
      result = sizing.value * bigBlind;
      break;
    case "pot_fraction":
      result = potSize * sizing.value;
      break;
    case "previous_bet_multiple":
      // raise-delta = facingBet × (multiple - 1), so raise-to = facingBet × multiple
      result = lastBet > 0 ? lastBet * (sizing.value - 1) : potSize * 0.5;
      break;
    default:
      result = bigBlind * 2.5;
  }

  // ── Rules Layer ──────────────────────────────────────────────────────────────
  // Enforces two constraints regardless of which sizing formula was used:
  //   1. Minimum raise rule   — raise-delta ≥ max(lastBet − prevBet, 1 BB, externalMin)
  //   2. Pot-relative floor   — bet/raise-to ≥ max(25% pot, 1 BB)
  const potFloor = Math.max(
    STRATEGY_TUNABLES.sizing.minLeadBetPotFraction * potSize,
    STRATEGY_TUNABLES.sizing.minLeadBetBBMultiple * bigBlind,
  );

  if (lastBet > 0) {
    // ── Re-raise: enforce poker minimum-raise rule ───────────────────────────
    // The raise-delta must be at least the previous raise increment (lastBet − prevBet).
    // Example: if prevBet=200, lastBet=400 → increment was 200 → delta must be ≥ 200.
    const lastRaiseIncrement = Math.max(lastBet - prevBet, bigBlind);
    const legalMinDelta = Math.max(lastRaiseIncrement, minRaiseAmount);

    // Pot-relative floor: raise-to (= lastBet + delta) must be ≥ potFloor.
    // Converts to a minimum delta constraint: delta ≥ max(0, potFloor − lastBet).
    const potFloorDelta = Math.max(0, potFloor - lastBet);

    result = Math.max(result, legalMinDelta, potFloorDelta);
  } else {
    // ── Lead bet: floor to max(25% pot, 1 BB) ────────────────────────────────
    result = Math.max(result, potFloor);
  }

  return result;
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
  labMode: boolean = false,
): PersonalityEvalResult {
  const p = personality ?? DEFAULT_PERSONALITY;
  const rng = new SeededRandom(handSeed);
  const category = handCategory(context);
  const w = computeActionWeights(p, context, category, positionAware);
  const action = rollAction(w, rng, labMode, p.bluffFrequency);

  const total = w.fold + w.call + w.raise;
  const pF = total > 0 ? ((w.fold / total) * 100).toFixed(0) : "0";
  const pC = total > 0 ? ((w.call / total) * 100).toFixed(0) : "0";
  const pR = total > 0 ? ((w.raise / total) * 100).toFixed(0) : "0";
  const dist = `F:${pF}% C:${pC}% R:${pR}%`;

  // Normalised [0,1] distribution — surfaced to the tournament logger
  const weights =
    total > 0
      ? {
          fold: w.fold / total,
          call: w.call / total,
          raise: w.raise / total,
        }
      : { fold: 1, call: 0, raise: 0 };

  switch (action) {
    case "fold":
      if (context.canCheck) {
        return {
          action: { type: "check" },
          explanation: `Checking (${category}, ${dist})`,
          weights,
        };
      }
      return {
        action: { type: "fold" },
        explanation: `Folding (${category}, ${dist})`,
        weights,
      };

    case "call":
      if (context.toCall <= 0 && context.canCheck) {
        return {
          action: { type: "check" },
          explanation: `Checking (${category}, ${dist})`,
          weights,
        };
      }
      return {
        action: { type: "call" },
        explanation: `Calling (${category}, ${dist})`,
        weights,
      };

    case "raise": {
      if (context.maxRaise <= 0) {
        if (context.toCall > 0) {
          return {
            action: { type: "call" },
            explanation: `Calling (wanted raise, ${category}, ${dist})`,
            weights,
          };
        }
        return {
          action: { type: "check" },
          explanation: `Checking (wanted raise, ${category}, ${dist})`,
          weights,
        };
      }

      // ── Whale Logic: big stack + good equity → maximum pressure ─────────────
      // Triggered when myStack > stackRatio × effectiveStack (opponent is short)
      // AND equity > equityThreshold (we're a mathematical favourite).
      // Going all-in puts maximum ICM/chip pressure and ends ping-pong sequences.
      const whale = STRATEGY_TUNABLES.sizingOptions.whale;
      const myStack = context.myStackBB ?? 0;
      const effStack = context.effectiveStackBB ?? myStack;
      const isWhale =
        myStack > 0 &&
        effStack > 0 &&
        myStack > whale.stackRatio * effStack &&
        context.equity > whale.equityThreshold;

      if (isWhale) {
        return {
          action: { type: "all_in" },
          explanation: `All-in (whale: ${myStack.toFixed(0)}BB vs ${effStack.toFixed(0)}BB eff, eq ${(context.equity * 100).toFixed(0)}%, ${dist})`,
          weights,
        };
      }

      // rng has already been consumed once by rollAction; using it here gives
      // each raise a unique sizing that's still deterministic from the hand seed.
      return {
        action: { type: "raise", sizing: computeRaiseSizing(p, context, rng) },
        explanation: `Raising (${category}, ${dist})`,
        weights,
      };
    }

    default:
      return { action: { type: "fold" }, explanation: "Fallback fold" };
  }
}
