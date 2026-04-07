import { describe, it, expect } from "vitest";
import {
  evaluateHydrated,
  hydrateStrategy,
  buildGameContext,
  type BotPayload,
} from "../../../src/modules/bot-strategy/strategy-engine.service";
import type {
  BotStrategy,
  GameContext,
} from "../../../src/domain/bot-strategy/strategy.types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_PERSONALITY_STRATEGY: BotStrategy = {
  version: 1,
  tier: "quick",
  personality: {
    aggression: 60,
    bluffFrequency: 30,
    riskTolerance: 50,
    tightness: 40,
  },
};

const RULE_STRATEGY: BotStrategy = {
  version: 1,
  tier: "strategy",
  personality: {
    aggression: 50,
    bluffFrequency: 20,
    riskTolerance: 50,
    tightness: 50,
  },
  rules: {
    preflop: [
      {
        id: "r1",
        priority: 1,
        enabled: true,
        label: "always call preflop",
        conditions: [
          {
            category: "opponent",
            field: "facingBet",
            operator: "eq",
            value: true,
          },
        ],
        action: { type: "call" },
      },
    ],
  },
};

const RANGE_STRATEGY: BotStrategy = {
  version: 1,
  tier: "strategy",
  personality: {
    aggression: 50,
    bluffFrequency: 20,
    riskTolerance: 50,
    tightness: 50,
  },
  rangeChart: { AA: "raise" },
};

function makePreflopPayload(holeCards: string[] = ["Ah", "As"]): BotPayload {
  return {
    gameId: "g-1",
    handNumber: 1,
    stage: "preflop",
    you: { name: "Bot", chips: 1000, holeCards, bet: 0, position: "BTN" },
    action: { canCheck: false, toCall: 20, minRaise: 40, maxRaise: 1000 },
    table: {
      pot: 30,
      currentBet: 20,
      communityCards: [],
      smallBlind: 10,
      bigBlind: 20,
      ante: 0,
    },
    players: [
      {
        name: "Opp",
        chips: 980,
        bet: 20,
        folded: false,
        allIn: false,
        position: "BB",
      },
    ],
    decisionSeed: "aabbccddeeff0011",
  };
}

function makePostflopPayload(): BotPayload {
  return {
    gameId: "g-1",
    handNumber: 1,
    stage: "flop",
    you: {
      name: "Bot",
      chips: 1000,
      holeCards: ["Ah", "Kh"],
      bet: 0,
      position: "BTN",
    },
    action: { canCheck: true, toCall: 0, minRaise: 40, maxRaise: 1000 },
    table: {
      pot: 40,
      currentBet: 0,
      communityCards: ["2h", "7c", "Ks"],
      smallBlind: 10,
      bigBlind: 20,
      ante: 0,
    },
    players: [
      {
        name: "Opp",
        chips: 960,
        bet: 0,
        folded: false,
        allIn: false,
        position: "BB",
      },
    ],
    decisionSeed: "aabbccddeeff0011",
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("StrategyMetrics in evaluateHydrated", () => {
  it("personality source returns metrics.strategyWeights with values summing to ~1", () => {
    const hydrated = hydrateStrategy(BASE_PERSONALITY_STRATEGY);
    const result = evaluateHydrated(hydrated, makePostflopPayload());

    expect(result.source).toBe("Personality");
    expect(result.metrics).toBeDefined();
    expect(result.metrics!.strategyWeights).toBeDefined();

    const w = result.metrics!.strategyWeights!;
    expect(w.fold + w.call + w.raise).toBeCloseTo(1, 5);
    expect(w.fold).toBeGreaterThanOrEqual(0);
    expect(w.call).toBeGreaterThanOrEqual(0);
    expect(w.raise).toBeGreaterThanOrEqual(0);
  });

  it("personality source returns metrics.equity >= 0", () => {
    const hydrated = hydrateStrategy(BASE_PERSONALITY_STRATEGY);
    const result = evaluateHydrated(hydrated, makePostflopPayload());

    expect(result.metrics!.equity).toBeGreaterThanOrEqual(0);
    expect(result.metrics!.equity).toBeLessThanOrEqual(1);
  });

  it("rule source returns metrics.strategyWeights = undefined (no distribution for rule path)", () => {
    const hydrated = hydrateStrategy(RULE_STRATEGY);
    const result = evaluateHydrated(hydrated, makePreflopPayload(["7d", "2c"]));

    expect(result.source).toBe("Hard Rule");
    expect(result.metrics).toBeDefined();
    expect(result.metrics!.strategyWeights).toBeUndefined();
  });

  it("rule source returns metrics.equity from buildGameContext", () => {
    const hydrated = hydrateStrategy(RULE_STRATEGY);
    const payload = makePreflopPayload(["7d", "2c"]);
    const result = evaluateHydrated(hydrated, payload);

    // Equity in context should match what buildGameContext computes
    const ctx: GameContext = buildGameContext(payload);
    expect(result.metrics!.equity).toBe(ctx.equity);
  });

  it("range_chart source returns metrics.equity = 0 (lazy path, no context built)", () => {
    const hydrated = hydrateStrategy(RANGE_STRATEGY);
    // AA should match the range chart directly (raise)
    const result = evaluateHydrated(hydrated, makePreflopPayload(["Ah", "As"]));

    expect(result.source).toBe("Range Chart");
    expect(result.metrics).toBeDefined();
    expect(result.metrics!.equity).toBe(0); // equity not computed on lazy path
    expect(result.metrics!.strategyWeights).toBeUndefined();
  });
});
