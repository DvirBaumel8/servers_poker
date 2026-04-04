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
    } as Record<string, { fold: number; call: number; raise: number }>,

    /** Equity gate: aggression shift only applies above this hand strength threshold. */
    equityGateThreshold: 0.4,

    /** Sigmoid steepness for non-linear slider mapping (higher = sharper S-curve). */
    sigmoidK: 6,

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
    /** Default Monte Carlo iterations for Pro tier. */
    monteCarloIterations: 500,
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
      two_pair: 0.55,
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

  analysis: {
    bluffFrequencyExemptThreshold: 60,
    overAggressiveMinBB: 5,
    highAggressionThreshold: 70,
    lowAggressionThreshold: 30,
  },
};

export type StrategyTunables = typeof STRATEGY_TUNABLES;
