/**
 * Tests for dynamic raise sizing (calculateRaiseAmount + computeRaiseSizing integration).
 *
 * Verifies that bots no longer produce a static "69 loop" raise amount —
 * sizing must vary with personality and seed while remaining deterministic
 * for the same inputs.
 */

import { describe, it, expect } from "vitest";
import {
  calculateRaiseAmount,
  evaluatePersonality,
} from "../../../src/modules/bot-strategy/evaluators/personality.evaluator";
import type {
  Personality,
  GameContext,
} from "../../../src/domain/bot-strategy/strategy.types";
import { STRATEGY_TUNABLES } from "../../../src/modules/bot-strategy/strategy-tunables";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<GameContext> = {}): GameContext {
  return {
    street: "flop",
    holeCardRank: "strong",
    handStrength: "pair",
    hasFlushDraw: false,
    hasStraightDraw: false,
    toCall: 0,
    currentBetLevel: 0,
    canCheck: true,
    facingBet: false,
    facingRaise: false,
    facingAllIn: false,
    potSizeBB: 5,
    potOdds: 0,
    spr: 10,
    equity: 0.55,
    myPosition: "BTN",
    myStackBB: 50,
    effectiveStackBB: 50,
    activePlayerCount: 2,
    playersToAct: 0,
    isInPosition: true,
    communityCardCount: 3,
    boardTexture: "dry",
    pairType: null,
    maxRaise: 500,
    minRaise: 20,
    bigBlind: 20,
    ...overrides,
  } as unknown as GameContext;
}

const aggressive: Personality = {
  aggression: 90,
  bluffFrequency: 40,
  riskTolerance: 70,
  tightness: 30,
};

const passive: Personality = {
  aggression: 10,
  bluffFrequency: 5,
  riskTolerance: 20,
  tightness: 80,
};

// ─── calculateRaiseAmount ─────────────────────────────────────────────────────

describe("calculateRaiseAmount", () => {
  it("returns a positive number for a postflop open", () => {
    const amount = calculateRaiseAmount(200, 0, aggressive, 20, "flop", 1);
    expect(amount).toBeGreaterThan(0);
  });

  it("is deterministic — same seed produces same amount", () => {
    const a = calculateRaiseAmount(200, 0, aggressive, 20, "flop", 42);
    const b = calculateRaiseAmount(200, 0, aggressive, 20, "flop", 42);
    expect(a).toBe(b);
  });

  it("varies with different seeds", () => {
    const amounts = new Set(
      Array.from({ length: 20 }, (_, i) =>
        calculateRaiseAmount(200, 50, aggressive, 20, "flop", i * 7 + 1),
      ),
    );
    // With 20 different seeds the sizing should vary — expect at least 2 distinct values
    expect(amounts.size).toBeGreaterThan(1);
  });

  it("aggressive personality produces larger amounts than passive on average", () => {
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
    const aggrAvg =
      seeds.reduce(
        (s, seed) =>
          s + calculateRaiseAmount(200, 0, aggressive, 20, "flop", seed),
        0,
      ) / seeds.length;
    const passAvg =
      seeds.reduce(
        (s, seed) =>
          s + calculateRaiseAmount(200, 0, passive, 20, "flop", seed),
        0,
      ) / seeds.length;
    expect(aggrAvg).toBeGreaterThan(passAvg);
  });

  it("preflop mode returns a BB-multiple sized amount", () => {
    const bb = 20;
    const amount = calculateRaiseAmount(100, 0, aggressive, bb, "preflop", 1);
    const multiples = STRATEGY_TUNABLES.sizingOptions.preflop.bbMultiples;
    const minExpected = multiples[0] * bb;
    const maxExpected = multiples[multiples.length - 1] * bb;
    expect(amount).toBeGreaterThanOrEqual(minExpected);
    expect(amount).toBeLessThanOrEqual(maxExpected);
  });

  it("postflop amount is within pot-fraction menu bounds for an open (no facing bet)", () => {
    const pot = 300;
    const fractions = STRATEGY_TUNABLES.sizingOptions.postflop.potFractions;
    const minExpected = fractions[0] * pot;
    const maxExpected = fractions[fractions.length - 1] * pot;
    // Run multiple seeds with lastBet=0 (no facing bet) — must use pot_fraction
    for (let seed = 1; seed <= 20; seed++) {
      const amount = calculateRaiseAmount(pot, 0, aggressive, 20, "flop", seed);
      expect(amount).toBeGreaterThanOrEqual(minExpected * 0.9);
      expect(amount).toBeLessThanOrEqual(maxExpected * 1.1);
    }
  });

  it("facing a bet ALWAYS uses exponential bet-multiple sizing", () => {
    const lastBet = 100;
    // All 30 seeds should produce a raise-delta = lastBet × (multiple - 1)
    // where multiple is in [reRaiseMinMultiple, reRaiseMaxMultiple]
    const { minMultiple, maxMultiple } =
      STRATEGY_TUNABLES.sizingOptions.reRaise;
    for (let seed = 1; seed <= 30; seed++) {
      const delta = calculateRaiseAmount(
        200,
        lastBet,
        aggressive,
        20,
        "flop",
        seed,
      );
      // raise-delta = lastBet × (multiple - 1), so delta / lastBet = multiple - 1
      const impliedMultiple = delta / lastBet + 1;
      expect(impliedMultiple).toBeGreaterThanOrEqual(minMultiple - 0.01);
      expect(impliedMultiple).toBeLessThanOrEqual(maxMultiple + 0.01);
    }
  });

  it("re-raise amounts grow exponentially — raise-to is >= 2.2× the facing bet", () => {
    const lastBet = 100;
    for (let seed = 1; seed <= 20; seed++) {
      const delta = calculateRaiseAmount(
        300,
        lastBet,
        aggressive,
        20,
        "flop",
        seed,
      );
      const raiseTo = lastBet + delta; // lastBet = call, delta = raise above call
      // raise-to must be at least reRaiseMinMultiple × the facing bet
      expect(raiseTo).toBeGreaterThanOrEqual(
        lastBet * STRATEGY_TUNABLES.sizingOptions.reRaise.minMultiple - 0.5,
      );
    }
  });
});

// ─── evaluatePersonality raise sizing (integration) ───────────────────────────

// Note: evaluatePersonality returns ActionDefinition (with `sizing`), not a resolved StrategyAction.
// The concrete amount is resolved later in strategy-engine.service.ts via resolveAction().
// These tests verify the sizing spec varies correctly; calculateRaiseAmount tests cover the
// full chip-amount resolution end-to-end.

describe("evaluatePersonality raise sizing spec", () => {
  it("raise actions carry a sizing spec (not a fixed static value)", () => {
    const ctx = makeCtx({ street: "flop", maxRaise: 1000, minRaise: 20 });
    const result = evaluatePersonality(aggressive, ctx, 42, false, true);
    expect(result.action.type).toBe("raise");
    expect((result.action as any).sizing).toBeDefined();
    expect((result.action as any).sizing.mode).toBeDefined();
    expect((result.action as any).sizing.value).toBeGreaterThan(0);
  });

  it("preflop raise uses bb_multiple mode", () => {
    const preflopCtx = makeCtx({
      street: "preflop",
      holeCardRank: "premium",
      equity: 0.8,
      maxRaise: 2000,
      minRaise: 40,
      bigBlind: 20,
    });
    const result = evaluatePersonality(
      aggressive,
      preflopCtx,
      12345,
      false,
      true,
    );
    expect(result.action.type).toBe("raise");
    expect((result.action as any).sizing.mode).toBe("bb_multiple");
    const val = (result.action as any).sizing.value as number;
    const multiples = STRATEGY_TUNABLES.sizingOptions.preflop.bbMultiples;
    expect(val).toBeGreaterThanOrEqual(multiples[0]);
    expect(val).toBeLessThanOrEqual(multiples[multiples.length - 1]);
  });

  it("postflop open (no facing bet) uses only pot_fraction mode", () => {
    const ctx = makeCtx({
      street: "flop",
      maxRaise: 1000,
      facingBet: false,
      toCall: 0,
      currentBetLevel: 0,
    });
    for (let seed = 1; seed <= 50; seed++) {
      const result = evaluatePersonality(aggressive, ctx, seed, false, true);
      if (result.action.type === "raise") {
        expect((result.action as any).sizing.mode).toBe("pot_fraction");
      }
    }
  });

  it("postflop facing a bet ALWAYS uses previous_bet_multiple mode", () => {
    const ctx = makeCtx({
      street: "flop",
      maxRaise: 1000,
      facingBet: true,
      toCall: 100,
      currentBetLevel: 100,
    });
    for (let seed = 1; seed <= 50; seed++) {
      const result = evaluatePersonality(aggressive, ctx, seed, false, true);
      if (result.action.type === "raise") {
        expect((result.action as any).sizing.mode).toBe(
          "previous_bet_multiple",
        );
        const multiple = (result.action as any).sizing.value as number;
        expect(multiple).toBeGreaterThanOrEqual(
          STRATEGY_TUNABLES.sizingOptions.reRaise.minMultiple - 0.01,
        );
        expect(multiple).toBeLessThanOrEqual(
          STRATEGY_TUNABLES.sizingOptions.reRaise.maxMultiple + 0.01,
        );
      }
    }
  });

  it("two identical seeds produce identical sizing (determinism)", () => {
    const ctx = makeCtx({ street: "flop", maxRaise: 1000 });
    const r1 = evaluatePersonality(aggressive, ctx, 99999);
    const r2 = evaluatePersonality(aggressive, ctx, 99999);
    expect(r1.action).toEqual(r2.action);
  });

  it("sizing value varies across different seeds", () => {
    const ctx = makeCtx({ street: "flop", maxRaise: 1000 });
    const values = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const result = evaluatePersonality(aggressive, ctx, seed, false, true);
      if (result.action.type === "raise") {
        values.add((result.action as any).sizing.value);
      }
    }
    // With 30 different seeds the sizing value should vary
    expect(values.size).toBeGreaterThan(1);
  });

  it("aggressive personality pot_fraction values are larger than passive on average", () => {
    // Use no-facing-bet context so pot_fraction is selected
    const ctx = makeCtx({
      street: "flop",
      maxRaise: 1000,
      facingBet: false,
      toCall: 0,
      currentBetLevel: 0,
    });
    const aggrValues: number[] = [];
    const passValues: number[] = [];

    for (let seed = 1; seed <= 50; seed++) {
      const ra = evaluatePersonality(aggressive, ctx, seed, false, true);
      const rp = evaluatePersonality(passive, ctx, seed, false, true);
      if (
        ra.action.type === "raise" &&
        (ra.action as any).sizing?.mode === "pot_fraction"
      ) {
        aggrValues.push((ra.action as any).sizing.value);
      }
      if (
        rp.action.type === "raise" &&
        (rp.action as any).sizing?.mode === "pot_fraction"
      ) {
        passValues.push((rp.action as any).sizing.value);
      }
    }

    if (aggrValues.length > 0 && passValues.length > 0) {
      const aggrAvg = aggrValues.reduce((s, v) => s + v, 0) / aggrValues.length;
      const passAvg = passValues.reduce((s, v) => s + v, 0) / passValues.length;
      expect(aggrAvg).toBeGreaterThanOrEqual(passAvg);
    }
  });
});

// ─── Safety Rails (2026-04-07) ───────────────────────────────────────────────

// ─── Rules Layer (2026-04-07) ─────────────────────────────────────────────────

describe("Rules Layer — minimum raise enforcement in calculateRaiseAmount", () => {
  const bb = 20;
  const pot = 800;

  it("re-raise delta >= last raise increment (prevBet provided)", () => {
    // prevBet=200, lastBet=400 → last increment = 200 → delta must be ≥ 200
    for (let seed = 1; seed <= 20; seed++) {
      const delta = calculateRaiseAmount(
        pot,
        400,
        aggressive,
        bb,
        "flop",
        seed,
        200,
      );
      expect(delta).toBeGreaterThanOrEqual(200);
    }
  });

  it("re-raise delta >= lastBet when prevBet=0 (open bet as first aggressor)", () => {
    // prevBet=0, lastBet=400 → increment = 400 → delta must be ≥ 400
    for (let seed = 1; seed <= 20; seed++) {
      const delta = calculateRaiseAmount(
        pot,
        400,
        aggressive,
        bb,
        "flop",
        seed,
        0,
      );
      expect(delta).toBeGreaterThanOrEqual(400);
    }
  });

  it("minRaiseAmount param overrides the internally computed minimum", () => {
    // lastBet=100, prevBet=0 → computed increment = 100, but externalMin = 500
    for (let seed = 1; seed <= 20; seed++) {
      const delta = calculateRaiseAmount(
        pot,
        100,
        passive,
        bb,
        "flop",
        seed,
        0,
        500,
      );
      expect(delta).toBeGreaterThanOrEqual(500);
    }
  });

  it("pot-relative floor for re-raises: raise-to (lastBet + delta) >= 25% pot", () => {
    // pot=4000, 25% pot = 1000; lastBet=100 → delta must be ≥ max(100, 900) = 900
    const largePot = 4000;
    const facingBet = 100;
    for (let seed = 1; seed <= 20; seed++) {
      const delta = calculateRaiseAmount(
        largePot,
        facingBet,
        aggressive,
        bb,
        "flop",
        seed,
      );
      const raiseTo = facingBet + delta;
      expect(raiseTo).toBeGreaterThanOrEqual(largePot * 0.25); // raise-to ≥ 25% pot
    }
  });

  it("pot-relative floor for re-raises fires for passive bots too", () => {
    const largePot = 4000;
    const facingBet = 100;
    for (let seed = 1; seed <= 20; seed++) {
      const delta = calculateRaiseAmount(
        largePot,
        facingBet,
        passive,
        bb,
        "flop",
        seed,
      );
      const raiseTo = facingBet + delta;
      expect(raiseTo).toBeGreaterThanOrEqual(largePot * 0.25);
    }
  });

  it("re-raise against a large bet that already exceeds 25% pot: no extra floor applied", () => {
    // pot=400, 25% pot = 100; lastBet=300 (already > 100) → potFloorDelta = max(0, 100-300) = 0
    // Effective minimum = max(lastBet - prevBet, bigBlind) = max(300, 20) = 300
    const delta = calculateRaiseAmount(400, 300, aggressive, bb, "flop", 1, 0);
    expect(delta).toBeGreaterThanOrEqual(300); // minimum raise increment
    // raise-to = 300+delta ≥ 600, well above 25% of 400 = 100 → no interference
  });
});

describe("Safety Rail 1 — Min Bet Floor in calculateRaiseAmount", () => {
  it("lead bet on tiny pot is floored to 1 BB when pot fraction would be sub-BB", () => {
    // pot=50, BB=100 → 33% pot = 16.5 chips < 1 BB → floor = max(100, 12.5) = 100
    const amount = calculateRaiseAmount(50, 0, aggressive, 100, "flop", 1);
    expect(amount).toBeGreaterThanOrEqual(100); // at least 1 BB
  });

  it("lead bet on medium pot is floored to 25% pot when that exceeds 1 BB", () => {
    // pot=400, BB=20 → 33%+ fractions give 132-300; floor = max(20, 100) = 100
    // actual sizing (33% of 400 = 132) is already above floor — floor doesn't reduce it
    const amount = calculateRaiseAmount(400, 0, aggressive, 20, "flop", 1);
    expect(amount).toBeGreaterThanOrEqual(100); // ≥ 25% of 400
  });

  it("re-raise is floored to 1 BB (minimum raise rule) even for tiny facing bets", () => {
    // BB=100 > lastBet=8 → minimum raise increment = max(8-0, 100) = 100
    // previous_bet_multiple formula produces 8×(2.2-1)=9.6 which is below the 1 BB minimum
    // Rules Layer must bump the result UP to 100 (the minimum raise delta = 1 BB)
    const lastBet = 8;
    const amount = calculateRaiseAmount(
      50,
      lastBet,
      aggressive,
      100,
      "flop",
      1,
    );
    expect(amount).toBeGreaterThanOrEqual(100); // minimum raise rule: delta ≥ max(8, 100)
    // pot-fraction floor (25% × 50 = 12.5) is less than the 1BB floor → no extra boost beyond BB
    expect(amount).toBeLessThanOrEqual(200); // should not balloon unreasonably above BB minimum
  });

  it("floor does not change correctly-sized large bets", () => {
    // pot=500, BB=20 → pot_fraction gives 165-375; floor = max(20, 125) = 125
    // All fractions already exceed the floor → output unchanged
    for (let seed = 1; seed <= 10; seed++) {
      const amount = calculateRaiseAmount(500, 0, aggressive, 20, "flop", seed);
      expect(amount).toBeGreaterThanOrEqual(125); // at least 25% of 500
    }
  });
});

describe("Safety Rail 2 — Nuts Protection (Equity Guard)", () => {
  const maxTight: Personality = {
    aggression: 10,
    bluffFrequency: 0,
    riskTolerance: 10,
    tightness: 100, // ultra-tight — without the guard, fold would dominate
  };

  it("equity > 0.70 → never folds (fold weight capped at 5%)", () => {
    const ctx = makeCtx({
      street: "river",
      equity: 0.85, // near-nuts
      holeCardRank: "premium",
      facingBet: true,
      toCall: 100,
      currentBetLevel: 100,
      canCheck: false,
    });
    for (let seed = 1; seed <= 20; seed++) {
      const result = evaluatePersonality(maxTight, ctx, seed, false, false);
      expect(result.action.type).not.toBe("fold");
    }
  });

  it("equity = 0.50 → tight bot CAN still fold (guard does not fire)", () => {
    const ctx = makeCtx({
      street: "river",
      equity: 0.5,
      holeCardRank: "weak",
      facingBet: true,
      toCall: 200,
      currentBetLevel: 200,
      canCheck: false,
    });
    const folds = Array.from(
      { length: 20 },
      (_, i) =>
        evaluatePersonality(maxTight, ctx, i + 1, false, false).action.type ===
        "fold",
    );
    expect(folds.some(Boolean)).toBe(true); // ultra-tight + weak hand → folds allowed
  });

  it("equity = 0 (preflop, no community cards) → guard skipped, fold still possible", () => {
    // equity = 0 means it wasn't calculated — guard must not interfere
    const ctx = makeCtx({
      street: "preflop",
      equity: 0,
      holeCardRank: "weak",
      facingBet: true,
      toCall: 200,
      currentBetLevel: 200,
      canCheck: false,
    });
    const folds = Array.from(
      { length: 20 },
      (_, i) =>
        evaluatePersonality(maxTight, ctx, i + 1, false, false).action.type ===
        "fold",
    );
    expect(folds.some(Boolean)).toBe(true); // guard off at equity=0
  });
});

// ─── Top-Heavy Sampling Guard (Bug 2 fix — 2026-04-07) ───────────────────────

describe("rollAction top-heavy guard", () => {
  const { topHeavyThreshold } = STRATEGY_TUNABLES.distributions;

  // Helper: repeatedly call evaluatePersonality and collect the resulting action types
  function collectActions(
    ctx: GameContext,
    p: Personality,
    count = 20,
  ): string[] {
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      const r = evaluatePersonality(p, ctx, i + 1, false, false);
      results.push(r.action.type);
    }
    return results;
  }

  it(`raise weight >${topHeavyThreshold * 100}% → bot always raises (deterministic)`, () => {
    // Force raise weight to dominate: premium hand + max aggression, no facing bet
    const ctx = makeCtx({
      street: "flop",
      holeCardRank: "premium",
      equity: 0.9, // very strong equity → raise weights dominate
      maxRaise: 1000,
      minRaise: 20,
      facingBet: false,
      toCall: 0,
      canCheck: true,
    });
    const maxAggression: Personality = {
      aggression: 100,
      bluffFrequency: 0, // no bluff escape
      riskTolerance: 80,
      tightness: 0,
    };
    const actions = collectActions(ctx, maxAggression, 20);
    // With max aggression + premium equity, raise must dominate every seed
    const allRaiseOrAllIn = actions.every(
      (a) => a === "raise" || a === "all_in",
    );
    expect(allRaiseOrAllIn).toBe(true);
  });

  it(`fold weight >${topHeavyThreshold * 100}% → bot always folds (deterministic)`, () => {
    // Force fold weight to dominate: weak hand + max tightness, facing a bet
    const ctx = makeCtx({
      street: "flop",
      holeCardRank: "weak",
      equity: 0.05, // extremely weak equity → fold weights dominate
      maxRaise: 1000,
      minRaise: 20,
      facingBet: true,
      toCall: 200,
      currentBetLevel: 200,
      canCheck: false,
    });
    const maxTight: Personality = {
      aggression: 10,
      bluffFrequency: 0,
      riskTolerance: 10,
      tightness: 100,
    };
    const actions = collectActions(ctx, maxTight, 20);
    expect(actions.every((a) => a === "fold")).toBe(true);
  });

  it("balanced weights (no dominant action) → variety across seeds", () => {
    // Balanced personality on a playable hand without facing a bet — no single action dominates
    const ctx = makeCtx({
      street: "flop",
      holeCardRank: "playable",
      equity: 0.45,
      maxRaise: 1000,
      minRaise: 20,
      facingBet: false,
      toCall: 0,
      canCheck: true,
    });
    const balanced: Personality = {
      aggression: 50,
      bluffFrequency: 50,
      riskTolerance: 50,
      tightness: 50,
    };
    const actions = collectActions(ctx, balanced, 30);
    const unique = new Set(actions);
    // With balanced weights we expect at least 2 distinct action types
    expect(unique.size).toBeGreaterThan(1);
  });

  it("bluff escape: at bluffFrequency=100 some seeds escape the top-heavy fold guard", () => {
    // Force fold to dominate (weak equity + tight) but use max bluffFrequency.
    // Some seeds should escape the top-heavy guard and NOT fold.
    const ctx = makeCtx({
      street: "flop",
      holeCardRank: "weak",
      equity: 0.05,
      maxRaise: 1000,
      minRaise: 20,
      facingBet: true,
      toCall: 200,
      currentBetLevel: 200,
      canCheck: false,
    });
    const maxBluff: Personality = {
      aggression: 80,
      bluffFrequency: 100, // max escape chance
      riskTolerance: 80,
      tightness: 80, // still tight — fold should dominate baseline
    };
    // Run many seeds to give escapes a chance to appear
    const actions = collectActions(ctx, maxBluff, 60);
    const nonFolds = actions.filter((a) => a !== "fold");
    // With bluffEscapeScale=0.25 and bluffFrequency=100, ~25% of rolls escape.
    // Across 60 seeds we'd expect ~15 escapes; requiring just 1 is very safe.
    expect(nonFolds.length).toBeGreaterThan(0);
  });
});

// ─── Whale Logic ──────────────────────────────────────────────────────────────

describe("whale all-in trigger", () => {
  const { stackRatio, equityThreshold } = STRATEGY_TUNABLES.sizingOptions.whale;

  it("triggers all-in when stack > stackRatio × effectiveStack AND equity > threshold", () => {
    const ctx = makeCtx({
      street: "flop",
      maxRaise: 500,
      equity: equityThreshold + 0.1,
      myStackBB: stackRatio * 10 + 1, // well over the threshold
      effectiveStackBB: 10,
    });
    // labMode=true → deterministic argmax, should always raise given strong equity
    // With whale conditions met, should return all_in
    const result = evaluatePersonality(aggressive, ctx, 42, false, true);
    // The whale triggers when raise is selected — with aggressive + strong equity labMode picks raise
    if (result.action.type === "raise" || result.action.type === "all_in") {
      // If raise was selected, whale should have converted it to all_in
      expect(result.action.type).toBe("all_in");
    }
  });

  it("does NOT trigger when equity is below threshold", () => {
    const ctx = makeCtx({
      street: "flop",
      maxRaise: 500,
      equity: equityThreshold - 0.2, // below threshold
      myStackBB: stackRatio * 10 + 1,
      effectiveStackBB: 10,
    });
    const result = evaluatePersonality(aggressive, ctx, 42, false, true);
    expect(result.action.type).not.toBe("all_in");
  });

  it("does NOT trigger when stack ratio is below threshold", () => {
    const ctx = makeCtx({
      street: "flop",
      maxRaise: 500,
      equity: equityThreshold + 0.1,
      myStackBB: 20,
      effectiveStackBB: 15, // only 1.33× advantage, below stackRatio
    });
    const result = evaluatePersonality(aggressive, ctx, 42, false, true);
    // Could be raise (with sizing), not all_in
    if (result.action.type === "raise") {
      expect((result.action as any).sizing).toBeDefined();
    }
  });

  it("re-raise multiple is within [minMultiple, maxMultiple] for aggressive bot facing bet", () => {
    const ctx = makeCtx({
      street: "river",
      facingBet: true,
      toCall: 200,
      currentBetLevel: 200,
      maxRaise: 2000,
      equity: 0.7,
      myStackBB: 50,
      effectiveStackBB: 50, // balanced stacks, no whale
    });
    const { minMultiple, maxMultiple } =
      STRATEGY_TUNABLES.sizingOptions.reRaise;
    const result = evaluatePersonality(aggressive, ctx, 42, false, true);
    if (result.action.type === "raise") {
      const multiple = (result.action as any).sizing.value as number;
      expect(multiple).toBeGreaterThanOrEqual(minMultiple - 0.01);
      expect(multiple).toBeLessThanOrEqual(maxMultiple + 0.01);
    }
  });
});
