/**
 * Strategy Tunables — centralized configuration for all strategy engine parameters.
 *
 * Every numeric threshold, weight, and multiplier used by evaluators and analysis
 * checks lives here. The autonomous Strategy Tuner modifies only this file when
 * proposing parameter adjustments.
 */

export const STRATEGY_TUNABLES = {
  personality: {
    preflopBluffDivisor: 200,
    preflopBluffRaiseBB: 2.5,

    raiseWeightAggression: 0.6,
    raiseWeightHandQuality: 0.4,

    strongHandThreshold: 0.2,

    strongHandFacingActionAggressionWeight: 0.5,
    strongHandFacingActionStrengthWeight: 0.5,
    strongHandNoActionAggressionWeight: 0.5,
    strongHandNoActionStrengthWeight: 0.5,

    drawAggressionWeight: 0.4,
    drawBluffWeight: 0.3,
    drawCallRiskWeight: 0.5,
    drawCallBase: 0.3,

    weakAllInCallDivisor: 500,
    weakBluffRaiseDivisor: 200,
    weakBluffBetDivisor: 150,

    facingActionCallRiskWeight: 0.4,
    facingActionCallHandWeight: 0.6,
    facingAllInRiskWeight: 0.3,
    facingAllInHandWeight: 0.5,
    facingActionReraiseAggressionWeight: 0.3,
    facingActionReraiseHandWeight: 0.3,
  },

  sizing: {
    preflopBaseOpenBB: 2.0,
    preflopAggressionBonus: 1.5,
    postflopBasePotFraction: 0.33,
    postflopAggressionBonus: 0.5,
    rangeChartDefaultRaiseBB: 2.5,
    /** Safety Rail 1 — Min Bet Floor.
     * A lead bet (no facing bet) must be at least max(1 BB, 25% pot).
     * Prevents the pot_fraction formula from producing micro-bets on small pots. */
    minLeadBetBBMultiple: 1.0,
    minLeadBetPotFraction: 0.25,
    /** Safety Rail 3 — All-In Stack Commit.
     * If a raise delta exceeds this fraction of the post-call remaining stack,
     * convert to all-in rather than leaving a tiny residual.
     * Post-call remaining stack = maxRaise (chips available after calling). */
    allInStackCommitRatio: 0.7,
  },

  /**
   * Dynamic raise sizing options.
   * Replaces the static single-value computation with a menu of realistic
   * bet sizes. Personality + seeded RNG select from these options so bots
   * vary their sizing rather than always betting the same amount.
   */
  sizingOptions: {
    preflop: {
      /** BB multiples available for open-raises (no facing bet). */
      bbMultiples: [2.0, 2.5, 3.0, 3.5, 4.0],
    },
    postflop: {
      /** Pot fractions for c-bets and value bets when opening (no facing bet). */
      potFractions: [0.33, 0.5, 0.67, 0.75],
    },
    /**
     * Re-raise sizing — applies whenever facing a bet (any street).
     * A raise against a facing bet always uses the facing-bet-multiple formula:
     *   raise-to = currentBetLevel × multiple
     *   raise-delta = currentBetLevel × (multiple - 1)   [what goes to the engine]
     *
     * This guarantees exponential pot growth and eliminates the ping-pong loop.
     * Range [reRaiseMinMultiple, reRaiseMaxMultiple] is mapped by aggression + RNG jitter.
     */
    reRaise: {
      minMultiple: 2.2,
      maxMultiple: 3.0,
    },
    /**
     * Whale logic — triggers when a bot has a significant chip lead AND good equity.
     * Causes the bot to go all-in (or bet very large) to apply maximum pressure.
     */
    whale: {
      /** Stack-ratio threshold: myStack must be > X × effectiveStack to trigger. */
      stackRatio: 5.0,
      /** Minimum equity (0–1) required alongside the stack advantage. */
      equityThreshold: 0.5,
    },
  },

  handQuality: {
    premium: 0.95,
    strong: 0.75,
    playable: 0.5,
    weak: 0.2,
  },

  /**
   * Positional awareness multipliers for Quick/Strategy tier preflop tightness.
   * Lower multiplier = looser range (play more hands).
   * BTN (last to act) gets the loosest range; UTG (first) gets the tightest.
   * Linear scale: UTG=1.0, MP=0.85, CO=0.65, BTN=0.5.
   * SB/BB use 0.9 (forced money in, but act early postflop).
   */
  positionMultiplier: {
    BTN: 0.5,
    "BTN/SB": 0.5,
    CO: 0.65,
    HJ: 0.75,
    MP: 0.85,
    "MP+1": 0.85,
    "UTG+1": 0.95,
    UTG: 1.0,
    SB: 0.9,
    BB: 0.9,
  } as Record<string, number>,

  /**
   * Weight-based action distribution system.
   * Base distributions define starting weights for { fold, call, raise } by hand category.
   * Sliders shift weights via sigmoid-mapped multipliers.
   */
  distributions: {
    /** Base action weights by hand strength category (must sum to 100 each). */
    base: {
      premium: { fold: 0, call: 25, raise: 75 },
      strong: { fold: 5, call: 45, raise: 50 },
      playable: { fold: 20, call: 55, raise: 25 },
      weak: { fold: 55, call: 30, raise: 15 },
      draw: { fold: 25, call: 50, raise: 25 },
      // Board-plays: hole cards add nothing on the river. Split-pot guard zeroes fold
      // and moves weight to call; raising is blocked via handQuality=0 (aggression gate).
      board_plays: { fold: 55, call: 30, raise: 15 },
    } as Record<string, { fold: number; call: number; raise: number }>,

    /** Equity gate: aggression shift only applies above this hand strength threshold. */
    equityGateThreshold: 0.4,

    /** Preflop dampener for bluff frequency boost (0–1). Halves bluff raise injection
     *  preflop since 3-betting light is a much higher-commitment play than postflop bluffs. */
    preflopBluffDampener: 0.5,

    /** Sigmoid steepness for non-linear slider mapping (higher = sharper S-curve). */
    sigmoidK: 6,

    /**
     * Top-Heavy guard threshold (0–1).
     * When the dominant action's normalised weight exceeds this value, that action
     * is taken deterministically instead of going through the seeded RNG lottery.
     * Applies to fold, call, and raise equally (unlike the old raise-only 50% guard).
     */
    topHeavyThreshold: 0.6,

    /**
     * Bluff escape scale (0–1).
     * At bluffFrequency=100, the probability of bypassing the top-heavy guard is
     * bluffEscapeScale. At bluffFrequency=0, the escape probability is 0.
     * Formula: escapeChance = (bluffFrequency / 100) * bluffEscapeScale.
     * Default 0.25 → max 25% chance of a surprise play even for max-bluff bots.
     */
    bluffEscapeScale: 0.25,

    /** Safety Rail 2 — Nuts Protection (Suicidal Fold Guard).
     * When equity exceeds this threshold, fold weight is capped at nutsMaxFoldRatio
     * of total weight. A bot should almost never fold a near-nuts hand regardless of
     * how tight its DNA is. Only fires when equity > 0 (i.e. postflop with real data). */
    nutsProtectionThreshold: 0.7,
    /** Maximum fraction of total weight that can be assigned to fold when the nuts
     * guard fires. Default 0.05 = at most 5% fold weight on a 70%+ equity hand. */
    nutsMaxFoldRatio: 0.05,

    /**
     * Maximum weight units added to fold when the call is deeply negative-EV.
     * Applied when equity / potOdds < 0.5 (equity < half the break-even threshold).
     * Overrides risk-tolerance so even aggressive bots avoid clearly losing calls.
     * Formula: penalty = (1 - evRatio) * negativeEvFoldBoost
     */
    negativeEvFoldBoost: 75,
  },

  /**
   * Equity estimation configuration.
   * Used by the EquityService for win probability calculation and EV decisions.
   */
  equity: {
    /** Safety buffer: equity must exceed potOdds by this margin for a profitable call. */
    safetyBuffer: 0.05,
    /** Default Monte Carlo iterations. Minimum 5000 for accurate equity display. */
    monteCarloIterations: 5000,
    /** Multi-way equity discount: equity^(base + scale * opponents/8). */
    multiWayDiscountBase: 0.7,
    multiWayDiscountScale: 0.3,
    /** Preflop equity estimates by hole card category (vs 1 opponent). */
    preflopEquity: {
      premium: 0.75,
      strong: 0.6,
      playable: 0.45,
      weak: 0.3,
    } as Record<string, number>,
    /** Made hand equity estimates (vs 1 random opponent on a given board). */
    madeHandEquity: {
      high_card: 0.15,
      pair: 0.35,
      two_pair: 0.75,
      trips: 0.7,
      straight: 0.8,
      flush: 0.85,
      full_house: 0.92,
      quads: 0.98,
      straight_flush: 0.99,
      royal_flush: 1.0,
    } as Record<string, number>,
    /** Outs constants for the Rule of 2 and 4 heuristic. */
    outs: {
      flushDraw: 9,
      openEndedStraightDraw: 8,
      gutshot: 4,
      overCards: 3,
      comboDrawOverlap: 2,
    },
  },

  /**
   * All-in equity guard — hard override that fires AFTER any decision source
   * (rules, range chart, personality) when the bot is facing an all-in.
   * If equity is below the threshold, the action is overridden to fold.
   */
  allInGuard: {
    /** Minimum equity to call an all-in. Below this → auto-fold. */
    callEquityThreshold: 0.35,
    /** Minimum equity to raise/all-in vs an all-in. Below this → auto-fold. */
    raiseEquityThreshold: 0.45,
    /** Bet-to-stack ratio that triggers the guard even without a literal all-in.
     *  0.5 = any bet > 50% of hero's stack activates equity-based override. */
    largeBetStackRatio: 0.5,
  },

  /**
   * Tournament stage dampener — reduces aggression and bluff frequency
   * in early tournament stages (deep stacks, low blinds) so bots don't
   * go all-in on hand 1. Stage is derived from blind growth ratio.
   */
  tournamentStage: {
    /** Minimum aggression multiplier at the earliest stage (blindRatio=1).
     *  Effective aggression = base × lerp(minAggressionDampener, 1.0, stage). */
    minAggressionDampener: 0.6,
    /** Minimum bluff frequency multiplier at the earliest stage. */
    minBluffDampener: 0.5,
  },

  analysis: {
    bluffFrequencyExemptThreshold: 60,
    overAggressiveMinBB: 5,
    highAggressionThreshold: 70,
    lowAggressionThreshold: 30,
  },
};

export type StrategyTunables = typeof STRATEGY_TUNABLES;
