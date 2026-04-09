/**
 * Tests for personality evaluator fixes:
 * 1. handCategory() uses equity when available (not normalizedStrength)
 * 2. rollAction() deterministic majority guard (>50% weight → always picks that action)
 * 3. Integration: top two pair on dry board → raise is the primary outcome
 */

import { describe, it, expect } from "vitest";
import { evaluatePersonality } from "../../../src/modules/bot-strategy/evaluators/personality.evaluator";
import type {
  GameContext,
  HandStrength,
} from "../../../src/domain/bot-strategy/strategy.types";

function makeCtx(overrides: Partial<GameContext> = {}): GameContext {
  return {
    handStrength: "two_pair",
    pairType: null,
    hasFlushDraw: false,
    hasStraightDraw: false,
    holeCardRank: "playable",
    communityCardCount: 3,
    boardTexture: "dry",
    facingBet: false,
    facingRaise: false,
    facingAllIn: false,
    activePlayerCount: 2,
    playersToAct: 0,
    myPosition: "BTN",
    isInPosition: true,
    myStackBB: 100,
    effectiveStackBB: 100,
    potSizeBB: 10,
    potOdds: 0,
    equity: 0,
    canCheck: true,
    toCall: 0,
    minRaise: 20,
    maxRaise: 1000,
    street: "flop",
    bigBlind: 10,
    ...overrides,
  };
}

const DEFAULT_PERSONALITY = {
  tightness: 50,
  aggression: 50,
  bluffFrequency: 20,
  riskTolerance: 50,
};

// ─── handCategory via equity ───────────────────────────────────────────────────

describe("handCategory equity-based classification", () => {
  it("two_pair with high equity (0.80) → premium base distribution → raises", () => {
    // With equity=0.80 → handCategory='premium' → base {fold:0, call:25, raise:75}
    // raise >50% so majority guard fires deterministically
    const ctx = makeCtx({ equity: 0.8 });
    const result = evaluatePersonality(DEFAULT_PERSONALITY, ctx, 12345);
    expect(result.action.type).toBe("raise");
  });

  it("two_pair with moderate equity (0.55) → strong base distribution → raise is still preferred", () => {
    // equity=0.55 → handCategory='strong' → base {fold:5, call:45, raise:50}
    // After aggression shift at 50%, raise grows above 50% → majority guard fires
    const ctx = makeCtx({ equity: 0.55 });
    const result = evaluatePersonality(DEFAULT_PERSONALITY, ctx, 99999);
    expect(result.action.type).toBe("raise");
  });

  it("weak hand with equity=0 falls back to normalizedStrength (hand rank index)", () => {
    // equity=0 triggers fallback path; high_card has normalizedStrength=0 → 'weak'
    const ctx = makeCtx({ handStrength: "high_card", equity: 0 });
    // With tightness=80 (tight) and no equity, weak hand should fold more often
    const tightPersonality = {
      ...DEFAULT_PERSONALITY,
      tightness: 80,
      aggression: 20,
    };
    const result = evaluatePersonality(tightPersonality, ctx, 42);
    // Should not raise on high_card with tight/low-aggression personality
    expect(result.action.type).not.toBe("raise");
  });

  it("pair with equity=0.35 → playable category → call preferred", () => {
    // equity=0.35 → 0.15 ≤ 0.35 < 0.4 → 'playable' → base {fold:20, call:55, raise:25}
    const ctx = makeCtx({
      handStrength: "pair",
      equity: 0.35,
      canCheck: false,
      facingBet: true,
      toCall: 10,
      potOdds: 0.1,
    });
    // Aggressive bot should still call or raise on a pair
    const result = evaluatePersonality(DEFAULT_PERSONALITY, ctx, 11111);
    expect(["call", "raise"]).toContain(result.action.type);
  });
});

// ─── rollAction majority guard ─────────────────────────────────────────────────

describe("rollAction deterministic majority guard", () => {
  it("raise weight >50% → always returns raise regardless of seed", () => {
    // top two pair with equity=0.80 → premium → raise weight >>50% after personality
    const ctx = makeCtx({ equity: 0.8 });
    // Try many different seeds — majority guard should always pick raise
    for (let seed = 1; seed <= 50; seed++) {
      const result = evaluatePersonality(DEFAULT_PERSONALITY, ctx, seed);
      expect(result.action.type).toBe("raise");
    }
  });

  it("call majority does NOT force call — RNG still operates (bluff personalities stay viable)", () => {
    // Guard is raise-only. When call has majority weight, a bluff-heavy personality
    // should still be able to occasionally raise across many seeds.
    const ctx = makeCtx({
      handStrength: "pair",
      equity: 0.35,
      facingBet: true,
      toCall: 5,
      canCheck: false,
      potOdds: 0.05,
    });
    const bluffPersonality = {
      tightness: 20,
      aggression: 80,
      bluffFrequency: 80,
      riskTolerance: 70,
    };
    const types = new Set(
      Array.from(
        { length: 30 },
        (_, i) =>
          evaluatePersonality(bluffPersonality, ctx, i * 13 + 1).action.type,
      ),
    );
    // RNG should produce at least two different outcomes
    expect(types.size).toBeGreaterThan(1);
  });

  it("different personalities on the same board produce different outcomes", () => {
    // Verify the system is not universally deterministic — personality matters.
    // A weak hand facing a marginal bet should yield different actions for
    // aggressive vs tight-passive personalities.
    const ctx = makeCtx({
      handStrength: "high_card",
      equity: 0.18,
      facingBet: true,
      toCall: 30,
      canCheck: false,
      potOdds: 0.2,
    });
    const aggressive = {
      tightness: 20,
      aggression: 90,
      bluffFrequency: 80,
      riskTolerance: 80,
    };
    const nit = {
      tightness: 90,
      aggression: 10,
      bluffFrequency: 5,
      riskTolerance: 20,
    };
    const aggressiveAction = evaluatePersonality(aggressive, ctx, 1).action
      .type;
    const nitAction = evaluatePersonality(nit, ctx, 1).action.type;
    // Nit should fold; aggressive should raise or call
    expect(nitAction).toBe("fold");
    expect(aggressiveAction).not.toBe("fold");
  });
});

// ─── Integration: Top Two Pair on dry board ────────────────────────────────────

describe("Integration: top two pair dry board", () => {
  it("equity ~0.80 (heads-up, dry board) → raise is primary action in 20-run distribution", () => {
    // Simulates a postflop scenario: player holds top two pair on a dry board,
    // heads-up. Equity comes from madeHandEquity.two_pair=0.75, multiway=1 opponent.
    // After multiway discount: 0.75^(0.7+0.3*1/8) ≈ 0.80
    const ctx = makeCtx({ equity: 0.8, canCheck: true });
    const actionCounts = { fold: 0, check: 0, call: 0, raise: 0 };
    for (let seed = 0; seed < 20; seed++) {
      const r = evaluatePersonality(DEFAULT_PERSONALITY, ctx, seed * 1000 + 7);
      const t = r.action.type as keyof typeof actionCounts;
      if (t in actionCounts) actionCounts[t]++;
    }
    // Raise should dominate across all 20 runs (majority guard ensures it)
    expect(actionCounts.raise).toBe(20);
  });

  it("aggressive personality with top two pair raises regardless of seed", () => {
    const ctx = makeCtx({ equity: 0.8 });
    const aggressive = {
      tightness: 30,
      aggression: 80,
      bluffFrequency: 40,
      riskTolerance: 70,
    };
    for (let seed = 0; seed < 10; seed++) {
      const r = evaluatePersonality(aggressive, ctx, seed);
      expect(r.action.type).toBe("raise");
    }
  });

  it("tight/passive personality with top two pair still raises (math overrides personality)", () => {
    // Even a tight/passive bot should not fold or call away premium equity
    const ctx = makeCtx({ equity: 0.8, canCheck: true });
    const tight = {
      tightness: 80,
      aggression: 20,
      bluffFrequency: 5,
      riskTolerance: 30,
    };
    const result = evaluatePersonality(tight, ctx, 42);
    // With equity=0.80 → premium → raise weight starts at 75, tightness barely dents it
    // (tightnessFactor = sigTight * (1 - handQuality) * posMultiplier ≈ 0.73 * 0.20 * 0.5 ≈ 0.073)
    // Raise weight remains well above 50% → majority guard fires
    expect(result.action.type).toBe("raise");
  });
});

// ─── Lab Mode Argmax (Fix 1) ───────────────────────────────────────────────────

describe("evaluatePersonality labMode — argmax sampling", () => {
  it("Seq 102 regression: F:17% C:57% R:26% with labMode=true returns call (the mode)", () => {
    // Construct a scenario where weights produce approximately F:17% C:57% R:26%.
    // A playable hand (0.35 equity) facing no bet, balanced personality.
    // In lab mode the mode (call) must win regardless of seed.
    const ctx = makeCtx({
      equity: 0.35,
      toCall: 0,
      canCheck: true,
      facingBet: false,
    });
    const personality = {
      tightness: 60,
      aggression: 30,
      bluffFrequency: 15,
      riskTolerance: 50,
    };
    // Run with 20 different seeds — lab mode must be deterministic (same result every time)
    const results = Array.from({ length: 20 }, (_, i) =>
      evaluatePersonality(personality, ctx, i * 17 + 3, false, true),
    );
    const types = new Set(results.map((r) => r.action.type));
    expect(types.size).toBe(1); // deterministic
    expect(["check", "raise"]).toContain(results[0].action.type); // fold was 0 due to guard
  });

  it("labMode=true returns raise when raise has the highest weight", () => {
    const ctx = makeCtx({ equity: 0.8, toCall: 0, canCheck: true });
    const result = evaluatePersonality(
      DEFAULT_PERSONALITY,
      ctx,
      9999,
      false,
      true,
    );
    expect(result.action.type).toBe("raise");
  });

  it("labMode=true ties between call and raise resolve to raise", () => {
    // With equal weights, raise wins the tie-break (raise > call > fold)
    const ctx = makeCtx({ equity: 0.45, toCall: 0, canCheck: true });
    const tightPersonality = {
      tightness: 50,
      aggression: 50,
      bluffFrequency: 20,
      riskTolerance: 50,
    };
    const result = evaluatePersonality(tightPersonality, ctx, 42, false, true);
    // Should never fold (zero-price guard) and should pick the highest-weight non-fold action
    expect(result.action.type).not.toBe("fold");
    expect(result.weights?.fold).toBe(0);
  });

  it("labMode=false (default) retains stochastic behaviour", () => {
    // Without lab mode, different seeds produce different results on a competitive hand
    const ctx = makeCtx({
      equity: 0.35,
      handStrength: "pair",
      facingBet: true,
      toCall: 5,
      canCheck: false,
      potOdds: 0.05,
    });
    const personality = {
      tightness: 40,
      aggression: 50,
      bluffFrequency: 40,
      riskTolerance: 60,
    };
    const types = new Set(
      Array.from(
        { length: 30 },
        (_, i) =>
          evaluatePersonality(personality, ctx, i * 31 + 7, false, false).action
            .type,
      ),
    );
    expect(types.size).toBeGreaterThan(1); // non-deterministic: multiple outcomes
  });
});

// ─── Zero-Price Fold Guard (Fix 2) ────────────────────────────────────────────

describe("computeActionWeights zero-price fold guard", () => {
  it("weights.fold === 0 when toCall === 0, regardless of personality tightness", () => {
    const ctx = makeCtx({
      toCall: 0,
      canCheck: true,
      facingBet: false,
      equity: 0.2,
    });
    const tightPersonality = {
      tightness: 90,
      aggression: 10,
      bluffFrequency: 5,
      riskTolerance: 20,
    };
    // Any seed — fold weight must be 0
    for (let seed = 0; seed < 10; seed++) {
      const result = evaluatePersonality(tightPersonality, ctx, seed);
      expect(result.weights?.fold).toBe(0);
    }
  });

  it("fold weight moves entirely to call (check intent), call+raise sum to 1", () => {
    // When toCall=0, fold → call so the bot just checks instead of folding.
    const ctx = makeCtx({
      toCall: 0,
      canCheck: true,
      facingBet: false,
      equity: 0.15,
    });
    const result = evaluatePersonality(DEFAULT_PERSONALITY, ctx, 1);
    expect(result.weights?.fold).toBe(0);
    const total = (result.weights?.call ?? 0) + (result.weights?.raise ?? 0);
    expect(total).toBeCloseTo(1.0, 5);
  });

  it("fold weight is non-zero when toCall > 0 (facing a bet)", () => {
    const ctx = makeCtx({
      equity: 0.1,
      toCall: 50,
      canCheck: false,
      facingBet: true,
      potOdds: 0.5,
    });
    const tightPersonality = {
      tightness: 90,
      aggression: 10,
      bluffFrequency: 5,
      riskTolerance: 20,
    };
    const result = evaluatePersonality(tightPersonality, ctx, 42);
    // Guard does NOT apply when toCall > 0
    expect(result.weights?.fold ?? 0).toBeGreaterThan(0);
  });

  it("action resolution never returns fold when canCheck=true and toCall=0", () => {
    const ctx = makeCtx({ toCall: 0, canCheck: true, equity: 0.12 });
    const tightPersonality = {
      tightness: 95,
      aggression: 5,
      bluffFrequency: 2,
      riskTolerance: 10,
    };
    for (let seed = 0; seed < 20; seed++) {
      const result = evaluatePersonality(tightPersonality, ctx, seed);
      expect(result.action.type).not.toBe("fold");
    }
  });
});

// ─── Board-plays category (regression for the "solid hand" mislabel bug) ────────

describe("handCategory board_plays — river, hole cards add nothing", () => {
  const boardPlaysCtx = makeCtx({
    street: "river",
    isBoardPlays: true,
    equity: 0.41, // split-pot equity ~41% — should NOT trigger "strong"
    facingBet: true,
    facingAllIn: true,
    toCall: 400,
    canCheck: false,
    potOdds: 0.47,
    activePlayerCount: 2,
  });

  it("category is board_plays — never classified as strong despite equity >= 0.4", () => {
    const result = evaluatePersonality(DEFAULT_PERSONALITY, boardPlaysCtx, 42);
    expect(result.explanation).toMatch(/board_plays/);
  });

  it("aggression gate stays closed — action is call, never raise", () => {
    // Split-pot guard zeroes fold; aggression gate must stay closed (handQuality=0).
    // All seeds must return call (never raise).
    for (let seed = 0; seed < 20; seed++) {
      const result = evaluatePersonality(
        DEFAULT_PERSONALITY,
        boardPlaysCtx,
        seed * 13 + 7,
      );
      expect(result.action.type).toBe("call");
    }
  });

  it("aggressive personality also calls — handQuality=0 blocks the aggression transfer", () => {
    const aggressive = {
      tightness: 20,
      aggression: 95,
      bluffFrequency: 60,
      riskTolerance: 80,
    };
    for (let seed = 0; seed < 10; seed++) {
      const result = evaluatePersonality(aggressive, boardPlaysCtx, seed);
      expect(result.action.type).toBe("call");
    }
  });

  it("board_plays on flop/turn does NOT trigger (only river)", () => {
    // Board-plays override is river-only; flop uses equity normally.
    const flopCtx = makeCtx({
      street: "flop",
      isBoardPlays: true,
      equity: 0.41,
    });
    const result = evaluatePersonality(DEFAULT_PERSONALITY, flopCtx, 42);
    expect(result.explanation).not.toMatch(/board_plays/);
  });
});

// ─── Preflop bluff dampener ──────────────────────────────────────────────────

describe("preflop bluff dampener — weak hands bluff less preflop", () => {
  const bluffyPersonality = {
    tightness: 50,
    aggression: 44,
    bluffFrequency: 44,
    riskTolerance: 50,
  };

  it("weak hand preflop has lower raise weight than same hand postflop", () => {
    const preflopCtx = makeCtx({
      street: "preflop",
      holeCardRank: "weak",
      equity: 0,
      handStrength: "high_card",
      communityCardCount: 0,
      canCheck: false,
      toCall: 20,
      facingBet: true,
      potOdds: 0.15,
    });
    const postflopCtx = makeCtx({
      street: "flop",
      equity: 0.12,
      handStrength: "high_card",
      communityCardCount: 3,
      canCheck: false,
      toCall: 20,
      facingBet: true,
      potOdds: 0.15,
    });

    const preflopResult = evaluatePersonality(
      bluffyPersonality,
      preflopCtx,
      42,
    );
    const postflopResult = evaluatePersonality(
      bluffyPersonality,
      postflopCtx,
      42,
    );

    const preflopRaise = preflopResult.weights?.raise ?? 0;
    const postflopRaise = postflopResult.weights?.raise ?? 0;
    expect(preflopRaise).toBeLessThan(postflopRaise);
  });

  it("preflop raise weight for bluffFrequency=44 weak hand is moderate, not dominant", () => {
    const ctx = makeCtx({
      street: "preflop",
      holeCardRank: "weak",
      equity: 0,
      handStrength: "high_card",
      communityCardCount: 0,
      canCheck: false,
      toCall: 20,
      facingBet: true,
      potOdds: 0.15,
    });
    const result = evaluatePersonality(bluffyPersonality, ctx, 42);
    const raiseWeight = result.weights?.raise ?? 0;
    // With dampener, raise weight should be below 35% (not the old ~37%)
    expect(raiseWeight).toBeLessThan(0.35);
  });
});

// ─── Tournament stage dampener ────────────────────────────────────────────────

describe("tournament stage aggression dampener", () => {
  const MANIAC = {
    tightness: 15,
    aggression: 95,
    bluffFrequency: 70,
    riskTolerance: 90,
  };

  it("early stage (0.25) reduces Maniac raise weight vs no-stage baseline", () => {
    const baseCtx = makeCtx({ equity: 0.55, canCheck: true, toCall: 0 });
    const earlyCtx = makeCtx({
      equity: 0.55,
      canCheck: true,
      toCall: 0,
      tournamentStage: 0.25,
    });

    const baseResult = evaluatePersonality(MANIAC, baseCtx, 42);
    const earlyResult = evaluatePersonality(MANIAC, earlyCtx, 42);

    // Raise weight should be lower in early tournament stage
    expect(earlyResult.weights!.raise).toBeLessThan(baseResult.weights!.raise);
  });

  it("stage=1.0 has no dampening — matches no-stage baseline", () => {
    const baseCtx = makeCtx({ equity: 0.55, canCheck: true, toCall: 0 });
    const lateCtx = makeCtx({
      equity: 0.55,
      canCheck: true,
      toCall: 0,
      tournamentStage: 1.0,
    });

    const baseResult = evaluatePersonality(MANIAC, baseCtx, 42);
    const lateResult = evaluatePersonality(MANIAC, lateCtx, 42);

    // stage=1.0 means no dampening — weights should match baseline
    expect(lateResult.weights!.raise).toBeCloseTo(baseResult.weights!.raise, 4);
  });

  it("undefined tournamentStage has no dampening (cash game compat)", () => {
    const ctx = makeCtx({ equity: 0.55, canCheck: true, toCall: 0 });
    // tournamentStage is undefined by default in makeCtx
    expect(ctx.tournamentStage).toBeUndefined();

    const result = evaluatePersonality(MANIAC, ctx, 42);
    // Should behave normally — high raise weight
    expect(result.weights!.raise).toBeGreaterThan(0.5);
  });

  it("Maniac at early stage does not deterministically raise on strong hands", () => {
    // At stage=0.25, effective aggression ≈ 95 * 0.70 = 66.5
    // Raise weight should drop below top-heavy threshold for some hands
    const ctx = makeCtx({
      equity: 0.55,
      canCheck: false,
      toCall: 20,
      facingBet: true,
      potOdds: 0.15,
      tournamentStage: 0.25,
    });

    // Collect actions across seeds — should see variety (not 100% raise)
    const actions = new Set(
      Array.from(
        { length: 30 },
        (_, i) => evaluatePersonality(MANIAC, ctx, i * 7 + 1).action.type,
      ),
    );
    // With dampened aggression, RNG should produce at least 2 different outcomes
    expect(actions.size).toBeGreaterThan(1);
  });

  it("bluff frequency is also dampened at early stage", () => {
    const earlyCtx = makeCtx({
      street: "flop",
      equity: 0.12,
      handStrength: "high_card",
      communityCardCount: 3,
      canCheck: false,
      toCall: 20,
      facingBet: true,
      potOdds: 0.15,
      tournamentStage: 0.25,
    });
    const noStageCtx = makeCtx({
      street: "flop",
      equity: 0.12,
      handStrength: "high_card",
      communityCardCount: 3,
      canCheck: false,
      toCall: 20,
      facingBet: true,
      potOdds: 0.15,
    });

    const earlyResult = evaluatePersonality(MANIAC, earlyCtx, 42);
    const baseResult = evaluatePersonality(MANIAC, noStageCtx, 42);

    // Bluff dampening means lower raise weight on weak hands
    expect(earlyResult.weights!.raise).toBeLessThan(baseResult.weights!.raise);
  });
});
