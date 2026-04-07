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

  it("position override range chart inherits unset cells from global chart", () => {
    // Bug regression: user sets AKo=Raise on Global tab, then paints KK=Raise on BTN tab.
    // Before fix: BTN range chart was compiled in isolation → AKo cell = 0 (fold).
    // After fix: BTN chart merges global first → AKo inherits raise from global.
    const s: BotStrategy = {
      version: 1,
      tier: "pro",
      personality: minPersonality,
      rangeChart: { AKo: "raise" }, // global: AKo = raise
      positionOverrides: {
        BTN: { rangeChart: { KK: "raise" } }, // BTN: KK = raise, AKo NOT set
      },
    };
    const h = hydrateStrategy(s);
    // AKo index=91: should inherit raise(3) from global even though BTN override didn't paint it
    expect(h.positions.BTN!.rangeChart!.lut[91]).toBe(3); // raise (inherited from global)
    // KK index=1: should be raise(3) from BTN override
    expect(h.positions.BTN!.rangeChart!.lut[1]).toBe(3); // raise
    // Base chart unchanged
    expect(h.base.rangeChart!.lut[91]).toBe(3); // raise (global)
    expect(h.base.rangeChart!.lut[1]).toBe(0); // unset (global has no KK entry)
  });

  it("position override explicit value overrides global chart", () => {
    // Position-specific cell (AKo=call) overrides global (AKo=raise).
    const s: BotStrategy = {
      version: 1,
      tier: "pro",
      personality: minPersonality,
      rangeChart: { AKo: "raise" }, // global: AKo = raise
      positionOverrides: {
        BTN: { rangeChart: { AKo: "call" } }, // BTN explicitly overrides AKo to call
      },
    };
    const h = hydrateStrategy(s);
    // BTN-specific AKo should be call(2), not global raise(3)
    expect(h.positions.BTN!.rangeChart!.lut[91]).toBe(2); // call (BTN overrides global)
    expect(h.base.rangeChart!.lut[91]).toBe(3); // global still raise
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
    expect(result.source).toBe("Range Chart");
    expect(result.handNotation).toBe("AKo");
    expect(result.action.type).toBe("raise");
  });

  it("rule fires before range chart on preflop — Hard Rule has highest priority", () => {
    // Rule Supremacy: a rule with no conditions (always matches) must fire BEFORE the
    // range chart is consulted. Even an unset (null) range chart cell — which would
    // previously fold by default — cannot override an explicit Hard Rule.
    const s: BotStrategy = {
      ...baseStrategy,
      rangeChart: { AKo: null }, // unset cell → would fold if range chart ran first
      rules: {
        preflop: [
          {
            id: "r1",
            priority: 0,
            enabled: true,
            conditions: [], // no conditions → always matches
            action: { type: "call" },
          },
        ],
      },
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(h, basePayload());
    // Rule fires first → call, not the range-chart fold
    expect(result.source).toBe("Hard Rule");
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
    expect(result.source).toBe("Personality");
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

  it("falls back to global range when current position has no specific override (Pro tier)", () => {
    // BTN has a raise override, but we are playing from SB which has no override.
    // Engine must fall back to the global range chart → fold.
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
    const result = evaluateHydrated(
      h,
      basePayload({
        you: {
          name: "Bot",
          chips: 2000,
          holeCards: ["A♠", "K♥"],
          bet: 0,
          position: "SB",
        },
      }),
    );
    expect(result.source).toBe("Range Chart");
    expect(result.action.type).toBe("fold");
  });

  it("positional range chart: different positions yield different actions (Pro tier)", () => {
    // BTN → raise, BB → call, any other position (no override) → fold (global)
    // Each evaluation uses a unique decisionSeed (as happens in real games — every
    // action has a unique seed derived from hand+bot+actionSeq).
    const s: BotStrategy = {
      version: 1,
      tier: "pro",
      personality: minPersonality,
      rangeChart: { AKo: "fold" },
      positionOverrides: {
        BTN: { rangeChart: { AKo: "raise" } },
        BB: { rangeChart: { AKo: "call" } },
      },
    };
    const h = hydrateStrategy(s);

    const btnResult = evaluateHydrated(
      h,
      basePayload({
        decisionSeed:
          "aaaa1234567890abcdef1234567890abcdef1234567890abcdef1234567890aa",
        you: {
          name: "Bot",
          chips: 2000,
          holeCards: ["A♠", "K♥"],
          bet: 0,
          position: "BTN",
        },
      }),
    );
    expect(btnResult.action.type).toBe("raise");

    const bbResult = evaluateHydrated(
      h,
      basePayload({
        decisionSeed:
          "bbbb1234567890abcdef1234567890abcdef1234567890abcdef1234567890bb",
        you: {
          name: "Bot",
          chips: 2000,
          holeCards: ["A♠", "K♥"],
          bet: 0,
          position: "BB",
        },
      }),
    );
    expect(bbResult.action.type).toBe("call");

    const hjResult = evaluateHydrated(
      h,
      basePayload({
        decisionSeed:
          "cccc1234567890abcdef1234567890abcdef1234567890abcdef1234567890cc",
        you: {
          name: "Bot",
          chips: 2000,
          holeCards: ["A♠", "K♥"],
          bet: 0,
          position: "HJ",
        },
      }),
    );
    expect(hjResult.action.type).toBe("fold"); // no override → global
  });

  // ── Board-plays guard + position overrides (the bug that slipped through) ──

  it("Pro-tier UTG override never raises board-plays hand in multi-player pot", () => {
    // This is the exact scenario from the bug report: Pro-tier bot with an aggressive
    // UTG position override (high aggression/bluffFrequency) on a board where hole
    // cards contribute nothing. With 3+ players facing a bet, the engine must block
    // the raise even if the position override says to always raise from UTG.
    const s: BotStrategy = {
      version: 1,
      tier: "pro",
      personality: minPersonality,
      positionOverrides: {
        UTG: {
          personality: {
            aggression: 100,
            bluffFrequency: 80,
            riskTolerance: 100,
            tightness: 0,
          },
        },
      },
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(h, {
      ...basePayload({
        you: {
          name: "Bot",
          chips: 1000,
          holeCards: ["8♠", "6♠"],
          bet: 0,
          position: "UTG",
        },
        action: { canCheck: false, toCall: 50, minRaise: 100, maxRaise: 1000 },
        table: {
          pot: 200,
          currentBet: 50,
          communityCards: ["K♠", "A♥", "9♦", "9♣", "A♣"],
          smallBlind: 10,
          bigBlind: 20,
          ante: 0,
        },
      }),
      // 3 active players: bluff not justified (not heads-up, facing a bet)
      players: [
        {
          name: "Bot",
          chips: 1000,
          bet: 0,
          folded: false,
          allIn: false,
          position: "UTG",
        },
        {
          name: "Opp1",
          chips: 1000,
          bet: 50,
          folded: false,
          allIn: false,
          position: "CO",
        },
        {
          name: "Opp2",
          chips: 1000,
          bet: 50,
          folded: false,
          allIn: false,
          position: "BTN",
        },
      ],
      stage: "river",
    });
    // Must not raise — board plays, 3 players, facing bet
    expect(result.action.type).not.toBe("raise");
    expect(result.action.type).not.toBe("all_in");
  });

  it("board-plays guard fires with exactly 3 entries in players (regression: hero must be included)", () => {
    // Bug: the scenario lab was building payload.players with only opponents (N-1),
    // so a 3-player game passed only 2 entries and the guard thought it was heads-up.
    // The guard counts payload.players directly — payload.players must include the hero.
    // This test verifies the boundary: 3 entries (hero + 2 opponents) → not heads-up → guard fires.
    const s: BotStrategy = {
      version: 1,
      tier: "quick",
      personality: {
        aggression: 100,
        bluffFrequency: 100,
        riskTolerance: 100,
        tightness: 0,
      },
    };
    const h = hydrateStrategy(s);
    let raised = false;
    for (let i = 0; i < 20; i++) {
      clearEvalCache();
      const result = evaluateHydrated(h, {
        ...basePayload({
          you: {
            name: "Bot",
            chips: 1000,
            holeCards: ["8♠", "6♠"],
            bet: 0,
            position: "BTN",
          },
          action: {
            canCheck: false,
            toCall: 50,
            minRaise: 100,
            maxRaise: 1000,
          },
          table: {
            pot: 200,
            currentBet: 50,
            communityCards: ["K♠", "A♥", "9♦", "9♣", "A♣"],
            smallBlind: 10,
            bigBlind: 20,
            ante: 0,
          },
        }),
        // 3 entries including hero → activePlayers=3 → NOT heads-up → guard must fire
        players: [
          {
            name: "Bot",
            chips: 1000,
            bet: 0,
            folded: false,
            allIn: false,
            position: "BTN",
          },
          {
            name: "Opp1",
            chips: 1000,
            bet: 50,
            folded: false,
            allIn: false,
            position: "CO",
          },
          {
            name: "Opp2",
            chips: 1000,
            bet: 50,
            folded: false,
            allIn: false,
            position: "SB",
          },
        ],
        stage: "river",
        decisionSeed: (i + 1).toString(16).padStart(8, "0").padEnd(64, "0"),
      });
      if (result.action.type === "raise" || result.action.type === "all_in") {
        raised = true;
        break;
      }
    }
    // Guard must have fired — even max-bluff bot should not raise with 3 players on board-plays hand
    expect(raised).toBe(false);
  });

  it("Pro-tier position override CANNOT raise board-plays hand heads-up (split-pot guard blocks raise)", () => {
    // Board-plays hands can never win outright — raising adds no value.
    // The split-pot guard zeroes raise weight and the resolveAction convert blocks raise→call,
    // so even max-bluff Pro bots must call (never raise) on a board-plays river.
    const s: BotStrategy = {
      version: 1,
      tier: "pro",
      personality: minPersonality,
      positionOverrides: {
        BTN: {
          personality: {
            aggression: 100,
            bluffFrequency: 100,
            riskTolerance: 100,
            tightness: 0,
          },
        },
      },
    };
    const h = hydrateStrategy(s);
    let raised = false;
    for (let i = 0; i < 20; i++) {
      clearEvalCache();
      const result = evaluateHydrated(h, {
        ...basePayload({
          you: {
            name: "Bot",
            chips: 1000,
            holeCards: ["8♠", "6♠"],
            bet: 0,
            position: "BTN",
          },
          action: {
            canCheck: false,
            toCall: 50,
            minRaise: 100,
            maxRaise: 1000,
          },
          table: {
            pot: 200,
            currentBet: 50,
            communityCards: ["K♠", "A♥", "9♦", "9♣", "A♣"],
            smallBlind: 10,
            bigBlind: 20,
            ante: 0,
          },
        }),
        players: [
          {
            name: "Bot",
            chips: 1000,
            bet: 0,
            folded: false,
            allIn: false,
            position: "BTN",
          },
          {
            name: "Opp",
            chips: 1000,
            bet: 50,
            folded: false,
            allIn: false,
            position: "BB",
          },
        ],
        stage: "river",
        decisionSeed: (i + 1).toString(16).padStart(8, "0").padEnd(64, "0"),
      });
      if (result.action.type === "raise") {
        raised = true;
        break;
      }
    }
    // Split-pot guard must hold even for max-bluff Pro bot: never raise a board-plays hand
    expect(raised).toBe(false);
  });

  it("Pro-tier position override CANNOT raise board-plays hand on free bet (split-pot guard blocks raise)", () => {
    // Even when canCheck=true (toCall=0), a board-plays hand cannot benefit from a raise —
    // the split-pot guard zeroes raise weight regardless of position override or bluff frequency.
    // The bot must check (call with toCall=0), never raise.
    const s: BotStrategy = {
      version: 1,
      tier: "pro",
      personality: minPersonality,
      positionOverrides: {
        UTG: {
          personality: {
            aggression: 100,
            bluffFrequency: 100,
            riskTolerance: 100,
            tightness: 0,
          },
        },
      },
    };
    const h = hydrateStrategy(s);
    let raised = false;
    for (let i = 0; i < 20; i++) {
      clearEvalCache();
      const result = evaluateHydrated(h, {
        ...basePayload({
          you: {
            name: "Bot",
            chips: 1000,
            holeCards: ["8♠", "6♠"],
            bet: 0,
            position: "UTG",
          },
          // canCheck=true, toCall=0 — everyone checked, free probe bet opportunity
          action: { canCheck: true, toCall: 0, minRaise: 40, maxRaise: 1000 },
          table: {
            pot: 200,
            currentBet: 0,
            communityCards: ["K♠", "A♥", "9♦", "9♣", "A♣"],
            smallBlind: 10,
            bigBlind: 20,
            ante: 0,
          },
        }),
        // 4 players, but everyone checked — probe bet IS justified
        players: [
          {
            name: "Bot",
            chips: 1000,
            bet: 0,
            folded: false,
            allIn: false,
            position: "UTG",
          },
          {
            name: "Opp1",
            chips: 1000,
            bet: 0,
            folded: false,
            allIn: false,
            position: "CO",
          },
          {
            name: "Opp2",
            chips: 1000,
            bet: 0,
            folded: false,
            allIn: false,
            position: "BTN",
          },
          {
            name: "Opp3",
            chips: 1000,
            bet: 0,
            folded: false,
            allIn: false,
            position: "BB",
          },
        ],
        stage: "river",
        decisionSeed: (i + 1).toString(16).padStart(8, "0").padEnd(64, "0"),
      });
      if (result.action.type === "raise") {
        raised = true;
        break;
      }
    }
    // Split-pot guard must hold even on a free bet: never raise a board-plays hand
    expect(raised).toBe(false);
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
    expect(result.source).toBe("Range Chart");
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

  // ── Rule Supremacy: new behaviour introduced 2026-04-07 ──────────────────

  it("Hard Rule is 100% deterministic — same action across 20 different seeds", () => {
    // If a rule matches, the stochastic (seeded RNG) personality path must never run.
    // Verify by evaluating 20 times with different decisionSeed values; all must return
    // the same ruleId and action type.
    const s: BotStrategy = {
      ...baseStrategy,
      rules: {
        preflop: [
          {
            id: "raise-rule",
            priority: 1,
            enabled: true,
            conditions: [], // always matches
            action: { type: "raise" },
          },
        ],
      },
    };
    const h = hydrateStrategy(s);
    for (let i = 0; i < 20; i++) {
      clearEvalCache();
      const seed = (i + 1).toString(16).padStart(8, "0").padEnd(64, "0");
      const result = evaluateHydrated(h, basePayload({ decisionSeed: seed }));
      expect(result.source).toBe("Hard Rule");
      expect(result.ruleId).toBe("raise-rule");
      expect(result.action.type).toBe("raise");
    }
  });

  it("rule wins even when range chart explicitly covers the same hand (preflop)", () => {
    // Range chart says "call" for AKo; rule says "raise" (no conditions).
    // Rule must win regardless of what the range chart says.
    const s: BotStrategy = {
      ...baseStrategy,
      rangeChart: { AKo: "call" },
      rules: {
        preflop: [
          {
            id: "raise-rule",
            priority: 1,
            enabled: true,
            conditions: [],
            action: { type: "raise" },
          },
        ],
      },
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(h, basePayload());
    expect(result.source).toBe("Hard Rule");
    expect(result.ruleId).toBe("raise-rule");
    expect(result.action.type).toBe("raise");
  });

  it("range chart fires when no rule matches", () => {
    // If the rule doesn't match (condition requires royal_flush, hand is AKo),
    // the engine falls through to the range chart.
    const s: BotStrategy = {
      ...baseStrategy,
      rangeChart: { AKo: "call" },
      rules: {
        preflop: [
          {
            id: "never-matches",
            priority: 1,
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
    expect(result.source).toBe("Range Chart");
    expect(result.action.type).toBe("call");
  });

  it("isBoardPlays guard does NOT override a Hard Rule raise on the river", () => {
    // User set a Hard Rule to raise. The board-plays safety guard must NOT override
    // it — the user's explicit instruction takes 100% precedence.
    const s: BotStrategy = {
      ...baseStrategy,
      rules: {
        river: [
          {
            id: "always-raise",
            priority: 1,
            enabled: true,
            conditions: [], // always matches
            action: { type: "raise" },
          },
        ],
      },
    };
    const h = hydrateStrategy(s);
    // 8♠ 6♠ on K♠ A♥ 9♦ 9♣ A♣ — hero cards contribute nothing (board plays)
    const result = evaluateHydrated(h, {
      ...basePayload({
        you: {
          name: "Bot",
          chips: 1000,
          holeCards: ["8♠", "6♠"],
          bet: 0,
          position: "BTN",
        },
        action: { canCheck: false, toCall: 50, minRaise: 100, maxRaise: 1000 },
        table: {
          pot: 200,
          currentBet: 50,
          communityCards: ["K♠", "A♥", "9♦", "9♣", "A♣"],
          smallBlind: 10,
          bigBlind: 20,
          ante: 0,
        },
      }),
      // 3 active players facing a bet — would trigger guard for personality
      players: [
        {
          name: "Bot",
          chips: 1000,
          bet: 0,
          folded: false,
          allIn: false,
          position: "BTN",
        },
        {
          name: "Opp1",
          chips: 1000,
          bet: 50,
          folded: false,
          allIn: false,
          position: "CO",
        },
        {
          name: "Opp2",
          chips: 1000,
          bet: 50,
          folded: false,
          allIn: false,
          position: "SB",
        },
      ],
      stage: "river",
    });
    // Hard Rule must not be overridden — raise stands
    expect(result.ruleId).toBe("always-raise");
    expect(result.action.type).toBe("raise");
  });

  it("isBoardPlays guard DOES fire for personality-driven raises on the river", () => {
    // Without a Hard Rule, the personality (stochastic) path is used.
    // A board-plays hand with 3+ players should have its raise blocked by the guard.
    const s: BotStrategy = {
      version: 1,
      tier: "quick",
      personality: {
        aggression: 100,
        bluffFrequency: 100,
        riskTolerance: 100,
        tightness: 0,
      },
    };
    const h = hydrateStrategy(s);
    let raisedEver = false;
    for (let i = 0; i < 20; i++) {
      clearEvalCache();
      const seed = (i + 1).toString(16).padStart(8, "0").padEnd(64, "0");
      const result = evaluateHydrated(h, {
        ...basePayload({
          you: {
            name: "Bot",
            chips: 1000,
            holeCards: ["8♠", "6♠"],
            bet: 0,
            position: "BTN",
          },
          action: {
            canCheck: false,
            toCall: 50,
            minRaise: 100,
            maxRaise: 1000,
          },
          table: {
            pot: 200,
            currentBet: 50,
            communityCards: ["K♠", "A♥", "9♦", "9♣", "A♣"],
            smallBlind: 10,
            bigBlind: 20,
            ante: 0,
          },
          decisionSeed: seed,
        }),
        players: [
          {
            name: "Bot",
            chips: 1000,
            bet: 0,
            folded: false,
            allIn: false,
            position: "BTN",
          },
          {
            name: "Opp1",
            chips: 1000,
            bet: 50,
            folded: false,
            allIn: false,
            position: "CO",
          },
          {
            name: "Opp2",
            chips: 1000,
            bet: 50,
            folded: false,
            allIn: false,
            position: "SB",
          },
        ],
        stage: "river",
      });
      if (result.action.type === "raise" || result.action.type === "all_in") {
        raisedEver = true;
        break;
      }
    }
    // Guard must have fired on every attempt — personality raise blocked
    expect(raisedEver).toBe(false);
  });
});

// ── Legal Re-raise Enforcement (Bug 1 fix — 2026-04-07) ─────────────────────

describe("resolveAction — maxRaise < minRaise → all_in", () => {
  it("returns all_in when bot cannot afford the minimum legal raise delta (via Hard Rule)", () => {
    // Scenario: bot has 823 chips, toCall=490, so maxRaise = 823 - 490 = 333.
    // But minRaise (lastRaiseDelta) = 490. Can't afford a legal raise → must go all-in.
    const s: BotStrategy = {
      ...baseStrategy,
      rules: {
        preflop: [
          {
            id: "raise-rule",
            priority: 1,
            enabled: true,
            conditions: [], // always matches → triggers resolveAction("raise") path
            action: { type: "raise" },
          },
        ],
      },
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(
      h,
      basePayload({
        you: {
          name: "Bot",
          chips: 823,
          holeCards: ["A♠", "K♥"],
          bet: 0,
          position: "BTN",
        },
        action: {
          canCheck: false,
          toCall: 490,
          minRaise: 490, // lastRaiseDelta = 490
          maxRaise: 333, // bot only has 823 - 490 = 333 chips available after call
        },
        table: {
          pot: 980,
          currentBet: 490,
          communityCards: [],
          smallBlind: 50,
          bigBlind: 100,
          ante: 0,
        },
      }),
    );
    // Cannot afford a legal raise → must convert to all_in, NOT a raise of 490
    expect(result.action.type).toBe("all_in");
  });

  it("returns a legal raise when maxRaise >= minRaise", () => {
    // Healthy scenario: bot can afford the minimum delta
    const s: BotStrategy = {
      ...baseStrategy,
      rules: {
        preflop: [
          {
            id: "raise-rule",
            priority: 1,
            enabled: true,
            conditions: [],
            action: { type: "raise" },
          },
        ],
      },
    };
    const h = hydrateStrategy(s);
    const result = evaluateHydrated(
      h,
      basePayload({
        you: {
          name: "Bot",
          chips: 2000,
          holeCards: ["A♠", "K♥"],
          bet: 0,
          position: "BTN",
        },
        action: {
          canCheck: false,
          toCall: 200,
          minRaise: 200,
          maxRaise: 1800,
        },
        table: {
          pot: 400,
          currentBet: 200,
          communityCards: [],
          smallBlind: 50,
          bigBlind: 100,
          ante: 0,
        },
      }),
    );
    expect(result.action.type).toBe("raise");
    expect((result.action as any).amount).toBeGreaterThanOrEqual(200);
  });
});

// ── Safety Rail 3 — All-In Stack Commit (2026-04-07) ─────────────────────────

describe("resolveAction — all-in stack commit conversion", () => {
  const raiseRule: BotStrategy = {
    ...baseStrategy,
    rules: {
      preflop: [
        {
          id: "raise-rule",
          priority: 1,
          enabled: true,
          conditions: [],
          action: { type: "raise" },
        },
      ],
    },
  };

  it("converts to all-in when raise delta > 70% of post-call stack", () => {
    // A Hard Rule raise with no sizing spec defaults to minRaise.
    // When minRaise itself is > 70% of maxRaise, the all-in commit fires.
    // Example: minRaise=300, maxRaise=400 → 300/400=75% > 70% → all-in.
    const h = hydrateStrategy(raiseRule);
    const result = evaluateHydrated(
      h,
      basePayload({
        you: {
          name: "Bot",
          chips: 500,
          holeCards: ["A♠", "K♥"],
          bet: 0,
          position: "BTN",
        },
        action: {
          canCheck: false,
          toCall: 100,
          minRaise: 300, // even the minimum raise = 75% of post-call stack
          maxRaise: 400,
        },
        table: {
          pot: 400,
          currentBet: 100,
          communityCards: [],
          smallBlind: 50,
          bigBlind: 100,
          ante: 0,
        },
      }),
    );
    // minRaise=300 → clampedAmount=300 → 300/400=75% > 70% → all-in
    expect(result.action.type).toBe("all_in");
  });

  it("does NOT convert to all-in when raise is well below 70% of stack", () => {
    // Bot has 2000 chips, toCall=100, maxRaise=1900. BB=100.
    // bb_multiple: max 4.0×BB=400. 400/1900=21% — well below 70%.
    const h = hydrateStrategy(raiseRule);
    for (let i = 0; i < 20; i++) {
      const seed = (i + 1).toString(16).padStart(8, "0").padEnd(64, "0");
      const result = evaluateHydrated(
        h,
        basePayload({
          decisionSeed: seed,
          you: {
            name: "Bot",
            chips: 2000,
            holeCards: ["A♠", "K♥"],
            bet: 0,
            position: "BTN",
          },
          action: {
            canCheck: false,
            toCall: 100,
            minRaise: 100,
            maxRaise: 1900,
          },
          table: {
            pot: 200,
            currentBet: 100,
            communityCards: [],
            smallBlind: 50,
            bigBlind: 100,
            ante: 0,
          },
        }),
      );
      // Should stay as a raise, not converted to all-in
      expect(result.action.type).toBe("raise");
    }
  });
});

describe("buildGameContext — SPR computation", () => {
  it("computes spr = effectiveStack / pot", () => {
    const payload = basePayload({
      you: {
        name: "Bot",
        chips: 900,
        holeCards: ["As", "Kd"],
        bet: 0,
        position: "BTN",
      },
      table: {
        pot: 300,
        currentBet: 100,
        communityCards: [],
        smallBlind: 50,
        bigBlind: 100,
        ante: 0,
      },
      players: [
        {
          name: "Bot",
          chips: 900,
          bet: 0,
          folded: false,
          allIn: false,
          position: "BTN",
        },
        {
          name: "Villain",
          chips: 600,
          bet: 100,
          folded: false,
          allIn: false,
          position: "BB",
        },
      ],
    });
    const ctx = buildGameContext(payload);
    // effectiveStack = min(900, 600) = 600; spr = 600 / 300 = 2.0
    expect(ctx.spr).toBeCloseTo(2.0);
  });

  it("returns spr = 0 when pot is 0", () => {
    const payload = basePayload({
      table: {
        pot: 0,
        currentBet: 0,
        communityCards: [],
        smallBlind: 50,
        bigBlind: 100,
        ante: 0,
      },
      action: { canCheck: true, toCall: 0, minRaise: 200, maxRaise: 2000 },
    });
    const ctx = buildGameContext(payload);
    expect(ctx.spr).toBe(0);
  });

  it("uses effectiveStack (capped by opponent) not hero stack alone", () => {
    const payload = basePayload({
      you: {
        name: "Bot",
        chips: 5000,
        holeCards: ["As", "Kd"],
        bet: 0,
        position: "BTN",
      },
      table: {
        pot: 200,
        currentBet: 100,
        communityCards: [],
        smallBlind: 50,
        bigBlind: 100,
        ante: 0,
      },
      players: [
        {
          name: "Bot",
          chips: 5000,
          bet: 0,
          folded: false,
          allIn: false,
          position: "BTN",
        },
        {
          name: "Villain",
          chips: 400,
          bet: 100,
          folded: false,
          allIn: false,
          position: "BB",
        },
      ],
    });
    const ctx = buildGameContext(payload);
    // effectiveStack = min(5000, 400) = 400; spr = 400 / 200 = 2.0
    expect(ctx.spr).toBeCloseTo(2.0);
  });
});
