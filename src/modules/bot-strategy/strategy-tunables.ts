/**
 * Strategy Tunables — centralized configuration for all strategy engine parameters.
 *
 * Every numeric threshold, weight, and multiplier used by evaluators and analysis
 * checks lives here. The autonomous Strategy Tuner modifies only this file when
 * proposing parameter adjustments.
 */

export const STRATEGY_TUNABLES = {
  personality: {
    preflopBluffDivisor: 170,
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

  analysis: {
    bluffFrequencyExemptThreshold: 60,
    overAggressiveMinBB: 5,
    highAggressionThreshold: 70,
    lowAggressionThreshold: 30,
  },
};

export type StrategyTunables = typeof STRATEGY_TUNABLES;
