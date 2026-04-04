import { describe, it, expect, beforeEach } from "vitest";
import {
  hydrateStrategy,
  getOrHydrateStrategy,
  clearHydrationCache,
  clearEvalCache,
  clearStreetMemos,
  evaluateHydrated,
  buildGameContext,
  type BotPayload,
} from "../../../src/modules/bot-strategy/strategy-engine.service";
import type {
  BotStrategy,
  Rule,
} from "../../../src/domain/bot-strategy/strategy.types";

function basePayload(overrides: Partial<BotPayload> = {}): BotPayload {
  return {
    gameId: "test-game",
    handNumber: 1,
    stage: "pre-flop",
    decisionSeed:
      overrides.decisionSeed ??
      "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    you: {
      name: "Bot",
      chips: 2000,
      holeCards: ["A♠", "K♥"],
      bet: 0,
      position: "BTN",
      ...overrides.you,
    },
    action: {
      canCheck: false,
      toCall: 100,
      minRaise: 200,
      maxRaise: 2000,
      ...overrides.action,
    },
    table: {
      pot: 150,
      currentBet: 100,
      communityCards: [],
      smallBlind: 50,
      bigBlind: 100,
      ante: 0,
      ...overrides.table,
    },
    players: overrides.players ?? [
      {
        name: "Bot",
        chips: 2000,
        bet: 0,
        folded: false,
        allIn: false,
        position: "BTN",
      },
      {
        name: "Opp",
        chips: 1500,
        bet: 100,
        folded: false,
        allIn: false,
        position: "BB",
      },
    ],
  };
}

const minPersonality = {
  aggression: 50,
  bluffFrequency: 20,
  riskTolerance: 50,
  tightness: 50,
};

const baseStrategy: BotStrategy = {
  version: 1,
  tier: "strategy",
  personality: minPersonality,
};

beforeEach(() => {
  clearHydrationCache();
  clearEvalCache();
  clearStreetMemos();
});

// ============================================================================
// hydrateStrategy — structure
// ============================================================================

describe("hydrateStrategy", () => {
  it("produces correct tier on hydrated strategy", () => {
    const h = hydrateStrategy(baseStrategy);
    expect(h.tier).toBe("strategy");
  });

  it("freezes the personality object", () => {
    const h = hydrateStrategy(baseStrategy);
    expect(Object.isFrozen(h.base.personality)).toBe(true);
  });

  it("produces empty rule arrays when no rules provided", () => {
    const h = hydrateStrategy(baseStrategy);
    expect(h.base.rules.preflop).toHaveLength(0);
    expect(h.base.rules.flop).toHaveLength(0);
    expect(h.base.rules.turn).toHaveLength(0);
    expect(h.base.rules.river).toHaveLength(0);
  });

  it("returns null rangeChart when no chart provided", () => {
    const h = hydrateStrategy(baseStrategy);
    expect(h.base.rangeChart).toBeNull();
  });

  it("compiles range chart to a Uint8Array LUT", () => {
    const s: BotStrategy = {
      ...baseStrategy,
      rangeChart: { AKo: "raise", AKs: "call", "22": "fold" },
    };
    const h = hydrateStrategy(s);
    expect(h.base.rangeChart).not.toBeNull();
    expect(h.base.rangeChart!.lut).toBeInstanceOf(Uint8Array);
    expect(h.base.rangeChart!.lut.length).toBe(169);
    // Verify encoded actions: 1=fold, 2=call, 3=raise
    // AKo index=91, AKs index=13, 22 index=12
    expect(h.base.rangeChart!.lut[91]).toBe(3); // raise
    expect(h.base.rangeChart!.lut[13]).toBe(2); // call
    expect(h.base.rangeChart!.lut[12]).toBe(1); // fold (22)
  });

  it("sorts rules by priority ascending", () => {
    const rules: Rule[] = [
      {
        id: "r3",
        priority: 30,
        enabled: true,
        conditions: [],
        action: { type: "fold" },
      },
      {
        id: "r1",
        priority: 10,
        enabled: true,
        conditions: [],
        action: { type: "fold" },
      },
      {
        id: "r2",
        priority: 20,
        enabled: true,
        conditions: [],
        action: { type: "fold" },
      },
    ];
    const h = hydrateStrategy({ ...baseStrategy, rules: { preflop: rules } });
    const ids = h.base.rules.preflop.map((r) => r.id);
    expect(ids).toEqual(["r1", "r2", "r3"]);
  });

  it("filters out disabled rules", () => {
    const rules: Rule[] = [
      {
        id: "enabled",
        priority: 1,
        enabled: true,
        conditions: [],
        action: { type: "fold" },
      },
      {
        id: "disabled",
        priority: 2,
        enabled: false,
        conditions: [],
        action: { type: "fold" },
      },
    ];
    const h = hydrateStrategy({ ...baseStrategy, rules: { preflop: rules } });
    expect(h.base.rules.preflop).toHaveLength(1);
    expect(h.base.rules.preflop[0].id).toBe("enabled");
  });

  it("freezes rule arrays", () => {
    const rules: Rule[] = [
      {
        id: "r1",
        priority: 1,
        enabled: true,
        conditions: [],
        action: { type: "fold" },
      },
    ];
    const h = hydrateStrategy({ ...baseStrategy, rules: { preflop: rules } });
    expect(Object.isFrozen(h.base.rules.preflop)).toBe(true);
  });

  it("pre-merges position override personality", () => {
    const s: BotStrategy = {
      version: 1,
      tier: "pro",
      personality: {
        aggression: 30,
        bluffFrequency: 10,
        riskTolerance: 30,
        tightness: 70,
      },
      positionOverrides: {
        BTN: { personality: { aggression: 80 } },
      },
    };
    const h = hydrateStrategy(s);
    const btnPersonality = h.positions.BTN!.personality;
    // Override merges aggression but keeps rest from base
    expect(btnPersonality.aggression).toBe(80);
    expect(btnPersonality.bluffFrequency).toBe(10);
    expect(btnPersonality.riskTolerance).toBe(30);
    expect(btnPersonality.tightness).toBe(70);
  });

  it("position override inherits base rangeChart when not overriding", () => {
    const s: BotStrategy = {
      version: 1,
      tier: "pro",
      personality: minPersonality,
      rangeChart: { AKo: "raise" },
      positionOverrides: {
        BTN: { personality: { aggression: 80 } },
      },
    };
    const h = hydrateStrategy(s);
    // BTN override didn't specify a rangeChart, should inherit base
    expect(h.positions.BTN!.rangeChart).toBe(h.base.rangeChart);
  });

  it("position override with its own rangeChart uses override chart", () => {
    const s: BotStrategy = {
      version: 1,
      tier: "pro",
      personality: minPersonality,
      rangeChart: { AKo: "fold" },
      positionOverrides: {
        BTN: { rangeChart: { AKo: "raise" } },
      },
    };
    const h = hydrateStrategy(s);
    // AKo index=91: override should be raise(3), base should be fold(1)
    expect(h.positions.BTN!.rangeChart!.lut[91]).toBe(3); // raise
    expect(h.base.rangeChart!.lut[91]).toBe(1); // fold
  });

  it("positions map is empty for non-pro tier", () => {
    const h = hydrateStrategy(baseStrategy); // tier: "strategy"
    expect(Object.keys(h.positions)).toHaveLength(0);
  });
});

// ============================================================================
// getOrHydrateStrategy — cache behaviour
// ============================================================================

describe("getOrHydrateStrategy", () => {
  it("returns same object reference on cache hit", () => {
    const h1 = getOrHydrateStrategy(baseStrategy);
    const h2 = getOrHydrateStrategy(baseStrategy);
    expect(h1).toBe(h2);
  });

  it("returns different object for different strategies", () => {
    const s2: BotStrategy = {
      ...baseStrategy,
      personality: { ...minPersonality, aggression: 99 },
    };
    const h1 = getOrHydrateStrategy(baseStrategy);
    const h2 = getOrHydrateStrategy(s2);
    expect(h1).not.toBe(h2);
  });

  it("clearHydrationCache causes re-hydration on next call", () => {
    const h1 = getOrHydrateStrategy(baseStrategy);
    clearHydrationCache();
    const h2 = getOrHydrateStrategy(baseStrategy);
    // Different object instance, but structurally equivalent
    expect(h1).not.toBe(h2);
    expect(h2.tier).toBe(h1.tier);
  });
});

// ============================================================================
// evaluateHydrated — hot path
// ============================================================================

describe("evaluateHydrated", () => {
  it("uses range chart for preflop (source = range_chart)", () => {
    const s: BotStrategy = {
      ...baseStrategy,
      rangeChart: { AKo: "raise" },
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(h, basePayload());
    expect(result.source).toBe("range_chart");
    expect(result.handNotation).toBe("AKo");
    expect(result.action.type).toBe("raise");
  });

  it("falls through range chart null to rules", () => {
    const s: BotStrategy = {
      ...baseStrategy,
      rangeChart: { AKo: null },
      rules: {
        preflop: [
          {
            id: "r1",
            priority: 0,
            enabled: true,
            conditions: [],
            action: { type: "call" },
          },
        ],
      },
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(h, basePayload());
    expect(result.source).toBe("rule");
    expect(result.ruleId).toBe("r1");
    expect(result.action.type).toBe("call");
  });

  it("falls through to personality when no rules match", () => {
    const s: BotStrategy = {
      ...baseStrategy,
      rules: {
        preflop: [
          {
            id: "r1",
            priority: 0,
            enabled: true,
            conditions: [
              {
                category: "hand",
                field: "handStrength",
                operator: "eq",
                value: "royal_flush",
              },
            ],
            action: { type: "fold" },
          },
        ],
      },
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(h, basePayload());
    expect(result.source).toBe("personality");
  });

  it("applies position override for pro tier", () => {
    const s: BotStrategy = {
      version: 1,
      tier: "pro",
      personality: minPersonality,
      rangeChart: { AKo: "fold" },
      positionOverrides: {
        BTN: { rangeChart: { AKo: "raise" } },
      },
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(h, basePayload()); // position = BTN
    expect(result.action.type).toBe("raise");
  });

  it("does NOT apply position override for non-pro tier", () => {
    const s: BotStrategy = {
      version: 1,
      tier: "strategy",
      personality: minPersonality,
      rangeChart: { AKo: "fold" },
      // positionOverrides only honored at tier=pro, but strategy tier ignores them
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(h, basePayload());
    // Uses base range chart → fold
    expect(result.source).toBe("range_chart");
    expect(result.action.type).toBe("fold");
  });

  it("evaluates rules in priority order (lower priority wins)", () => {
    const s: BotStrategy = {
      ...baseStrategy,
      rules: {
        preflop: [
          {
            id: "high-prio",
            priority: 1,
            enabled: true,
            conditions: [],
            action: { type: "raise" },
          },
          {
            id: "low-prio",
            priority: 99,
            enabled: true,
            conditions: [],
            action: { type: "fold" },
          },
        ],
      },
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(
      h,
      basePayload({
        action: { canCheck: false, toCall: 100, minRaise: 200, maxRaise: 2000 },
      }),
    );
    expect(result.ruleId).toBe("high-prio");
  });

  it("skips disabled rules even if they would match", () => {
    const s: BotStrategy = {
      ...baseStrategy,
      rules: {
        preflop: [
          {
            id: "disabled-match",
            priority: 1,
            enabled: false,
            conditions: [],
            action: { type: "raise" },
          },
          {
            id: "enabled-fallback",
            priority: 2,
            enabled: true,
            conditions: [],
            action: { type: "call" },
          },
        ],
      },
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(h, basePayload());
    expect(result.ruleId).toBe("enabled-fallback");
    expect(result.action.type).toBe("call");
  });
});
