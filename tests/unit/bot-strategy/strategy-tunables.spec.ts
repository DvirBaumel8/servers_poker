import { describe, it, expect } from "vitest";
import { STRATEGY_TUNABLES } from "../../../src/modules/bot-strategy/strategy-tunables";

describe("STRATEGY_TUNABLES", () => {
  it("has all personality tunables", () => {
    const p = STRATEGY_TUNABLES.personality;
    expect(p.preflopBluffDivisor).toBeGreaterThan(0);
    expect(p.preflopBluffRaiseBB).toBeGreaterThan(0);
    expect(p.raiseWeightAggression).toBeGreaterThan(0);
    expect(p.raiseWeightHandQuality).toBeGreaterThan(0);
    expect(p.strongHandThreshold).toBeGreaterThan(0);
    expect(p.strongHandFacingActionAggressionWeight).toBeGreaterThan(0);
    expect(p.strongHandFacingActionStrengthWeight).toBeGreaterThan(0);
    expect(p.strongHandNoActionAggressionWeight).toBeGreaterThan(0);
    expect(p.strongHandNoActionStrengthWeight).toBeGreaterThan(0);
    expect(p.drawAggressionWeight).toBeGreaterThan(0);
    expect(p.drawBluffWeight).toBeGreaterThan(0);
    expect(p.drawCallRiskWeight).toBeGreaterThan(0);
    expect(p.drawCallBase).toBeGreaterThan(0);
    expect(p.weakAllInCallDivisor).toBeGreaterThan(0);
    expect(p.weakBluffRaiseDivisor).toBeGreaterThan(0);
    expect(p.weakBluffBetDivisor).toBeGreaterThan(0);
    expect(p.facingActionCallRiskWeight).toBeGreaterThan(0);
    expect(p.facingActionCallHandWeight).toBeGreaterThan(0);
    expect(p.facingAllInRiskWeight).toBeGreaterThan(0);
    expect(p.facingAllInHandWeight).toBeGreaterThan(0);
    expect(p.facingActionReraiseAggressionWeight).toBeGreaterThan(0);
    expect(p.facingActionReraiseHandWeight).toBeGreaterThan(0);
  });

  it("has all sizing tunables", () => {
    const s = STRATEGY_TUNABLES.sizing;
    expect(s.preflopBaseOpenBB).toBeGreaterThan(0);
    expect(s.preflopAggressionBonus).toBeGreaterThan(0);
    expect(s.postflopBasePotFraction).toBeGreaterThan(0);
    expect(s.postflopAggressionBonus).toBeGreaterThan(0);
    expect(s.rangeChartDefaultRaiseBB).toBeGreaterThan(0);
  });

  it("has all hand quality tunables", () => {
    const h = STRATEGY_TUNABLES.handQuality;
    expect(h.premium).toBeGreaterThan(h.strong);
    expect(h.strong).toBeGreaterThan(h.playable);
    expect(h.playable).toBeGreaterThan(h.weak);
    expect(h.weak).toBeGreaterThan(0);
  });

  it("has all analysis tunables", () => {
    const a = STRATEGY_TUNABLES.analysis;
    expect(a.bluffFrequencyExemptThreshold).toBeGreaterThan(0);
    expect(a.overAggressiveMinBB).toBeGreaterThan(0);
    expect(a.highAggressionThreshold).toBeGreaterThan(a.lowAggressionThreshold);
    expect(a.lowAggressionThreshold).toBeGreaterThan(0);
  });

  it("personality weights for raise sum to ~1.0", () => {
    const p = STRATEGY_TUNABLES.personality;
    expect(p.raiseWeightAggression + p.raiseWeightHandQuality).toBeCloseTo(1.0);
  });

  it("personality weights for strong hand facing action sum to ~1.0", () => {
    const p = STRATEGY_TUNABLES.personality;
    expect(
      p.strongHandFacingActionAggressionWeight +
        p.strongHandFacingActionStrengthWeight,
    ).toBeCloseTo(1.0);
  });
});
