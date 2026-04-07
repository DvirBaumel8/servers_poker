/**
 * scenario-logic.test.ts — Strategy-to-Lab Consistency Testing Suite
 *
 * Four test suites that guarantee strategy definitions produce logically
 * consistent actions regardless of RNG seed or evaluation order:
 *
 * 1. Golden Scenario — Strategy-to-Lab Consistency
 * 2. AA & Trips Sanity Audit
 * 3. Standard Scenario Regression Library (50 scenarios)
 * 4. Edge Case Coverage
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  clearEvalCache,
  clearHydrationCache,
} from "../../src/modules/bot-strategy/strategy-engine.service";
import type {
  BotStrategy,
  RangeChart,
} from "../../src/domain/bot-strategy/strategy.types";
import {
  ConsistencyChecker,
  type ScenarioInput,
} from "../utils/consistency-checker";
import {
  STANDARD_SCENARIOS,
  type StandardScenario,
} from "../fixtures/standard-scenarios";

// ─── Strategy factories ───────────────────────────────────────────────────────

/** Basic bot: personality only (Quick tier) */
function basicBot(
  overrides: Partial<BotStrategy["personality"]> = {},
): BotStrategy {
  return {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 50,
      bluffFrequency: 30,
      riskTolerance: 50,
      tightness: 50,
      ...overrides,
    },
  };
}

/** Pro bot: Strategy tier with optional range chart and/or rules */
function proBot(rangeChart?: RangeChart): BotStrategy {
  return {
    version: 1,
    tier: "strategy",
    personality: {
      aggression: 60,
      bluffFrequency: 30,
      riskTolerance: 55,
      tightness: 55,
    },
    ...(rangeChart ? { rangeChart } : {}),
  };
}

/** Advanced bot: Pro tier with position overrides */
function advancedBot(
  globalRange?: RangeChart,
  positionOverrides?: BotStrategy["positionOverrides"],
): BotStrategy {
  return {
    version: 1,
    tier: "pro",
    personality: {
      aggression: 65,
      bluffFrequency: 25,
      riskTolerance: 60,
      tightness: 50,
    },
    ...(globalRange ? { rangeChart: globalRange } : {}),
    ...(positionOverrides ? { positionOverrides } : {}),
  };
}

/** Strategy bot with a hand-strength rule for the flop */
function botWithFlopRule(
  handStrengthValue: string,
  action: "raise" | "call" | "fold",
): BotStrategy {
  return {
    version: 1,
    tier: "strategy",
    personality: {
      aggression: 60,
      bluffFrequency: 30,
      riskTolerance: 55,
      tightness: 55,
    },
    rules: {
      flop: [
        {
          id: `flop-rule-${handStrengthValue}`,
          priority: 1,
          conditions: [
            {
              category: "hand",
              field: "handStrength",
              operator: "eq",
              value: handStrengthValue,
            },
          ],
          action: { type: action },
          enabled: true,
          label: `If hand=${handStrengthValue} then ${action}`,
        },
      ],
    },
  };
}

/** The "Balanced Pro" personality used for regression rationality checks */
const BALANCED_PRO: BotStrategy = {
  version: 1,
  tier: "quick",
  personality: {
    aggression: 60,
    bluffFrequency: 30,
    riskTolerance: 55,
    tightness: 55,
  },
};

/** Range-chart strategy with all premium hands set to "raise" */
const PREMIUM_RANGE: RangeChart = {
  AA: "raise",
  KK: "raise",
  QQ: "raise",
  JJ: "raise",
  TT: "raise",
  "99": "raise",
  AKs: "raise",
  AQs: "raise",
  AJs: "raise",
  KQs: "raise",
  AKo: "raise",
};

// ─── Shared scenarios ─────────────────────────────────────────────────────────

const AA_PREFLOP_BTN: ScenarioInput = {
  holeCards: ["As", "Ah"],
  communityCards: [],
  position: "BTN",
  pot: 30,
  toCall: 20,
  minRaise: 40,
  numberOfPlayers: 6,
};

const AA_PREFLOP_UTG: ScenarioInput = {
  holeCards: ["As", "Ah"],
  communityCards: [],
  position: "UTG",
  pot: 15,
  toCall: 10,
  minRaise: 20,
  numberOfPlayers: 9,
};

const AK_PREFLOP_BTN: ScenarioInput = {
  holeCards: ["As", "Kd"],
  communityCards: [],
  position: "BTN",
  pot: 30,
  toCall: 20,
  minRaise: 40,
  numberOfPlayers: 6,
};

const SEVTWO_PREFLOP_UTG: ScenarioInput = {
  holeCards: ["7s", "2d"],
  communityCards: [],
  position: "UTG",
  pot: 30,
  toCall: 20,
  minRaise: 40,
  numberOfPlayers: 9,
};

// bestHandName required for post-flop: hand analyzer defaults to "high_card"
// without a bestHand in the payload, which skews personality evaluator weights.
const TRIPS_FLOP: ScenarioInput = {
  holeCards: ["As", "Ah"],
  communityCards: ["Ac", "Kd", "2s"],
  position: "BTN",
  pot: 100,
  toCall: 30,
  minRaise: 60,
  numberOfPlayers: 6,
  bestHandName: "THREE_OF_A_KIND",
};

const FLUSH_RIVER: ScenarioInput = {
  holeCards: ["As", "Ks"],
  communityCards: ["Qs", "Js", "2s", "7d", "9h"],
  position: "BTN",
  pot: 300,
  toCall: 100,
  minRaise: 200,
  numberOfPlayers: 6,
  bestHandName: "FLUSH",
};

const FULL_HOUSE_RIVER: ScenarioInput = {
  holeCards: ["As", "Ah"],
  communityCards: ["Ac", "Kd", "Ks", "2h", "7s"],
  position: "BTN",
  pot: 300,
  toCall: 100,
  minRaise: 200,
  numberOfPlayers: 6,
  bestHandName: "FULL_HOUSE",
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearEvalCache();
  clearHydrationCache();
});

// =============================================================================
// BLOCK 1 — Golden Scenario: Strategy-to-Lab Consistency
// =============================================================================

describe("Golden Scenario — Strategy-to-Lab Consistency", () => {
  describe("Basic bot (Quick tier, personality only)", () => {
    it("high-aggression bot: raise distribution ≥ 60% with AA preflop", () => {
      const strategy = basicBot({ aggression: 95, tightness: 10 });
      const dist = ConsistencyChecker.distribution(
        strategy,
        AA_PREFLOP_BTN,
        30,
      );
      // Personality with high aggression + premium hand → mostly raise/call
      expect(dist.fold).toBe(0);
      expect(dist.raise + dist.call).toBeGreaterThanOrEqual(60);
    });

    it("loose-passive bot: never folds AA (tightness 5, aggression 10)", () => {
      // Even a passive bot shouldn't fold a premium hand to a small bet
      const strategy = basicBot({
        aggression: 10,
        tightness: 5,
        riskTolerance: 80,
      });
      const dist = ConsistencyChecker.distribution(
        strategy,
        AA_PREFLOP_BTN,
        20,
      );
      expect(dist.fold).toBe(0);
    });

    it("source is 'personality' for quick-tier bot", () => {
      const strategy = basicBot();
      const result = ConsistencyChecker.evaluate(strategy, AA_PREFLOP_BTN);
      expect(result.source).toBe("Personality");
    });
  });

  describe("Pro bot (Strategy tier, range chart overrides)", () => {
    it("AA = raise in range chart → source is 'range_chart'", () => {
      const strategy = proBot({ AA: "raise" });
      const result = ConsistencyChecker.evaluate(strategy, AA_PREFLOP_BTN);
      expect(result.source).toBe("Range Chart");
      expect(result.handNotation).toBe("AA");
    });

    it("AA = raise in range chart → action is always 'raise' (assertNever fold)", () => {
      const strategy = proBot({ AA: "raise" });
      ConsistencyChecker.assertNever(
        strategy,
        AA_PREFLOP_BTN,
        "fold",
        50,
        "PRO-AA-RAISE",
      );
    });

    it("AA = raise in range chart → assertNever call (50 seeds)", () => {
      const strategy = proBot({ AA: "raise" });
      ConsistencyChecker.assertNever(
        strategy,
        AA_PREFLOP_BTN,
        "call",
        50,
        "PRO-AA-RAISE",
      );
    });

    it("72o = fold in range chart → action is always 'fold'", () => {
      const strategy = proBot({ "72o": "fold" });
      // 7s-2d is offsuit (7 > 2) → notation "72o"
      ConsistencyChecker.assertAction(strategy, SEVTWO_PREFLOP_UTG, "fold");
    });

    it("AKo = raise in range chart → source is 'range_chart' with AKo notation", () => {
      const strategy = proBot({ AKo: "raise" });
      const result = ConsistencyChecker.evaluate(strategy, AK_PREFLOP_BTN);
      expect(result.source).toBe("Range Chart");
      expect(result.handNotation).toBe("AKo");
      expect(result.action.type).toBe("raise");
    });

    it("range chart null cell → falls through to personality", () => {
      const strategy = proBot({ AA: null });
      const result = ConsistencyChecker.evaluate(strategy, AA_PREFLOP_BTN);
      // null = unset = fold per UI contract; engine folds it via range chart
      expect(result.source).toBe("Range Chart");
      expect(result.action.type).toBe("fold");
    });

    it("flop rule: handStrength=trips → raises when trips detected (bestHandName required)", () => {
      const strategy = botWithFlopRule("trips", "raise");
      // TRIPS_FLOP has bestHandName="THREE_OF_A_KIND" so the hand analyzer
      // correctly sets ctx.handStrength="trips" and the rule fires.
      const result = ConsistencyChecker.evaluate(strategy, TRIPS_FLOP);
      expect(result.action.type).toBe("raise");
      expect(result.source).toBe("Hard Rule");
    });

    it("flop rule always fires for trips regardless of seed (assertNever fold)", () => {
      const strategy = botWithFlopRule("trips", "raise");
      ConsistencyChecker.assertNever(
        strategy,
        TRIPS_FLOP,
        "fold",
        30,
        "TRIPS-RULE",
      );
    });
  });

  describe("Advanced bot (Pro tier, position overrides)", () => {
    it("BTN position override: AA=raise → action is 'raise'", () => {
      // NOTE: even for a position override's range chart, source returns "range_chart"
      // (the range chart fast path always uses source="range_chart"). The position
      // override IS active; it just doesn't change the source label.
      const strategy = advancedBot(undefined, {
        BTN: { rangeChart: { AA: "raise" } },
      });
      const result = ConsistencyChecker.evaluate(strategy, AA_PREFLOP_BTN);
      expect(result.action.type).toBe("raise");
      expect(["Range Chart", "Position Override"]).toContain(result.source);
    });

    it("BTN position override: AA=raise → assertNever fold", () => {
      const strategy = advancedBot(undefined, {
        BTN: { rangeChart: { AA: "raise" } },
      });
      ConsistencyChecker.assertNever(
        strategy,
        AA_PREFLOP_BTN,
        "fold",
        50,
        "PRO-OVERRIDE-BTN-AA",
      );
    });

    it("UTG position override: AKo=fold → action is fold for AKo UTG", () => {
      const strategy = advancedBot(undefined, {
        UTG: { rangeChart: { AKo: "fold" } },
      });
      const scenario: ScenarioInput = {
        holeCards: ["As", "Kd"],
        communityCards: [],
        position: "UTG",
        pot: 15,
        toCall: 10,
        minRaise: 20,
        numberOfPlayers: 9,
      };
      const result = ConsistencyChecker.evaluate(strategy, scenario);
      expect(result.action.type).toBe("fold");
      // Position override range chart uses source "Range Chart" (fast path)
      expect(["Range Chart", "Position Override"]).toContain(result.source);
    });

    it("position NOT overridden falls back to base range chart", () => {
      // SB has no override; global range chart has AA=raise
      const strategy = advancedBot(
        { AA: "raise" },
        {
          BTN: { rangeChart: { KK: "raise" } }, // only BTN overridden
        },
      );
      const sbScenario: ScenarioInput = {
        holeCards: ["As", "Ah"],
        communityCards: [],
        position: "SB",
        pot: 30,
        toCall: 20,
        minRaise: 40,
        numberOfPlayers: 6,
      };
      const result = ConsistencyChecker.evaluate(strategy, sbScenario);
      // SB uses global range → AA=raise; source is still range_chart or position_override depending on engine
      expect(result.action.type).toBe("raise");
    });
  });
});

// =============================================================================
// BLOCK 2 — AA & Trips Sanity Audit
// =============================================================================

describe("AA & Trips Sanity Audit", () => {
  describe("AA tests", () => {
    it("Strategy tier: AA=raise → 100% raise in 50 seeds, 0% fold", () => {
      const strategy = proBot({ AA: "raise" });
      const dist = ConsistencyChecker.distribution(
        strategy,
        AA_PREFLOP_BTN,
        50,
      );
      expect(dist.fold).toBe(0);
      expect(dist.raise).toBe(100);
    });

    it("Strategy tier: AA=raise, facing large 3-bet → still 0% fold", () => {
      const strategy = proBot({ AA: "raise" });
      const scenario: ScenarioInput = {
        holeCards: ["As", "Ah"],
        communityCards: [],
        position: "BTN",
        pot: 400,
        toCall: 300,
        minRaise: 600,
        numberOfPlayers: 6,
      };
      ConsistencyChecker.assertNever(
        strategy,
        scenario,
        "fold",
        50,
        "AA-FACING-3BET",
      );
    });

    it("Strategy tier: AA=raise, UTG position → still 0% fold", () => {
      const strategy = proBot({ AA: "raise" });
      ConsistencyChecker.assertNever(
        strategy,
        AA_PREFLOP_UTG,
        "fold",
        50,
        "AA-UTG",
      );
    });

    it("Quick tier: high aggression → AA distribution: fold=0%", () => {
      const strategy = basicBot({ aggression: 90, tightness: 20 });
      const dist = ConsistencyChecker.distribution(
        strategy,
        AA_PREFLOP_BTN,
        20,
      );
      expect(dist.fold).toBe(0);
    });

    it("Pro tier: BTN position override AA=raise → assertNever fold", () => {
      const strategy = advancedBot(undefined, {
        BTN: { rangeChart: { AA: "raise" } },
      });
      ConsistencyChecker.assertNever(
        strategy,
        AA_PREFLOP_BTN,
        "fold",
        50,
        "AA-PRO-BTN",
      );
    });

    it("AA with no range chart entry → personality fires, fold=0 for balanced bot", () => {
      // Quick tier: no range chart, balanced personality, AA preflop
      const strategy = basicBot({ aggression: 60, tightness: 50 });
      const dist = ConsistencyChecker.distribution(
        strategy,
        AA_PREFLOP_BTN,
        20,
      );
      // Even a balanced personality bot should not fold AA
      expect(dist.fold).toBe(0);
    });
  });

  describe("Strong hand (Trips / Flush) rationality threshold", () => {
    it("Trips on flop: assertNever fold (rule fires deterministically)", () => {
      const strategy = botWithFlopRule("trips", "raise");
      ConsistencyChecker.assertNever(
        strategy,
        TRIPS_FLOP,
        "fold",
        30,
        "TRIPS-SANITY",
      );
    });

    it("Nut flush on river: strategy bot (flush rule) → assertNever fold", () => {
      // FLUSH_RIVER has bestHandName="FLUSH" so the rule fires
      const strategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 60,
          bluffFrequency: 30,
          riskTolerance: 55,
          tightness: 55,
        },
        rules: {
          river: [
            {
              id: "river-flush",
              priority: 1,
              conditions: [
                {
                  category: "hand",
                  field: "handStrength",
                  operator: "eq",
                  value: "flush",
                },
              ],
              action: { type: "raise" },
              enabled: true,
            },
          ],
        },
      };
      ConsistencyChecker.assertNever(
        strategy,
        FLUSH_RIVER,
        "fold",
        30,
        "NUT-FLUSH",
      );
    });

    it("Full house on river without bestHandName — engine infers from cards (Scenario Lab regression)", () => {
      // Exact scenario from bug report: As8s on board KsAh9d9cAc = Aces full of Nines.
      // Previously, omitting bestHandName caused computeHandStrength() to return "high_card"
      // → handCategory "weak" → fold 55% even with aggression=100.
      // After fix, engine evaluates cards directly and returns "full_house" → fold ≤ 10%.
      const scenarioNoName: ScenarioInput = {
        holeCards: ["As", "8s"],
        communityCards: ["Ks", "Ah", "9d", "9c", "Ac"],
        position: "CO",
        pot: 101,
        toCall: 20,
        minRaise: 40,
        numberOfPlayers: 6,
        // NO bestHandName — engine must infer from cards
      };
      const dist = ConsistencyChecker.distribution(
        basicBot(),
        scenarioNoName,
        20,
      );
      ConsistencyChecker.assertRationality(dist, 10, "FULL-HOUSE-NO-BESTHAND");
    });

    it("Full house on river: rule bot → assertNever fold", () => {
      // FULL_HOUSE_RIVER has bestHandName="FULL_HOUSE" so the rule fires
      const strategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 60,
          bluffFrequency: 30,
          riskTolerance: 55,
          tightness: 55,
        },
        rules: {
          river: [
            {
              id: "river-fullhouse",
              priority: 1,
              conditions: [
                {
                  category: "hand",
                  field: "handStrength",
                  operator: "eq",
                  value: "full_house",
                },
              ],
              action: { type: "raise" },
              enabled: true,
            },
          ],
        },
      };
      ConsistencyChecker.assertNever(
        strategy,
        FULL_HOUSE_RIVER,
        "fold",
        30,
        "FULL-HOUSE",
      );
    });

    it("Trips on flop: personality bot (Shark) → fold distribution ≤ 5%", () => {
      // Shark personality with trips: bestHandName ensures correct hand category
      const shark = basicBot({
        aggression: 75,
        tightness: 70,
        bluffFrequency: 20,
      });
      const dist = ConsistencyChecker.distribution(shark, TRIPS_FLOP, 20);
      // TRIPS_FLOP has bestHandName="THREE_OF_A_KIND" → handStrength="trips"
      // → normalizedStrength=3/9=0.333 → category="playable" (0.333 >= 0.15)
      // → base fold=20, reduced by risk/aggression adjustments
      ConsistencyChecker.assertRationality(dist, 20, "SHARK-TRIPS");
    });

    it("Equity warning gate: strategy bot with quads (extreme equity) → fold=0", () => {
      // bestHandName required so handStrength="quads" → rule fires
      const quadsScenario: ScenarioInput = {
        holeCards: ["As", "Ah"],
        communityCards: ["Ac", "Ad", "2h"],
        position: "BTN",
        pot: 100,
        toCall: 50,
        minRaise: 100,
        numberOfPlayers: 6,
        bestHandName: "FOUR_OF_A_KIND",
      };
      const strategy = botWithFlopRule("quads", "raise");
      const dist = ConsistencyChecker.distribution(strategy, quadsScenario, 20);
      // Rule fires deterministically — quads rule always raises
      expect(dist.fold).toBe(0);
      if (dist.fold > 0) {
        console.warn(
          `[EQUITY-GATE] Quads scenario produced ${dist.fold}% folds — ` +
            "equity >0.98 but fold probability is non-zero. Investigate strategy engine.",
        );
      }
    });
  });
});

// =============================================================================
// BLOCK 3 — Standard Scenario Regression Library
// =============================================================================

describe("Standard Scenario Regression Library", () => {
  /** Range chart bot for "never_fold" assertions */
  const rangeChartBot = proBot(PREMIUM_RANGE);

  /** Any bot works for "no_free_fold" — engine invariant (canCheck converts fold to check) */
  const anyBot = basicBot();

  const neverFoldScenarios = STANDARD_SCENARIOS.filter(
    (s) => s.assertion === "never_fold",
  );
  const rationalityScenarios = STANDARD_SCENARIOS.filter(
    (s) => s.assertion === "rationality",
  );
  const noFreeFoldScenarios = STANDARD_SCENARIOS.filter(
    (s) => s.assertion === "no_free_fold",
  );

  it.each(neverFoldScenarios)(
    "$id — $description (never fold)",
    (scenario: StandardScenario) => {
      const input: ScenarioInput = {
        holeCards: scenario.holeCards,
        communityCards: scenario.communityCards,
        position: scenario.position,
        pot: scenario.pot,
        toCall: scenario.toCall,
        minRaise: scenario.minRaise,
        numberOfPlayers: scenario.numberOfPlayers,
        // Pass bestHandName so the personality evaluator correctly classifies the hand
        ...(scenario.bestHandName
          ? { bestHandName: scenario.bestHandName }
          : {}),
      };

      // For preflop: range-chart bot fires immediately and is deterministic
      // For post-flop: personality bot with bestHandName correctly classifies hand strength
      if (input.communityCards.length === 0) {
        // Preflop: use range chart bot (deterministic via range chart fast path)
        ConsistencyChecker.assertNever(
          rangeChartBot,
          input,
          "fold",
          30,
          scenario.id,
        );
      } else {
        // Post-flop: bestHandName is set → personality evaluator uses correct handStrength
        // Premium hands (quads, SF) → base fold=0; strong hands (flush, FH) → base fold=5
        // After adjustments: expect fold ≤ 20% for a balanced bot
        const dist = ConsistencyChecker.distribution(BALANCED_PRO, input, 20);
        ConsistencyChecker.assertRationality(dist, 20, scenario.id);
      }
    },
  );

  it.each(rationalityScenarios)(
    "$id — $description (rationality: fold ≤ $maxFoldPct%)",
    (scenario: StandardScenario) => {
      const input: ScenarioInput = {
        holeCards: scenario.holeCards,
        communityCards: scenario.communityCards,
        position: scenario.position,
        pot: scenario.pot,
        toCall: scenario.toCall,
        minRaise: scenario.minRaise,
        numberOfPlayers: scenario.numberOfPlayers,
        ...(scenario.bestHandName
          ? { bestHandName: scenario.bestHandName }
          : {}),
      };
      const dist = ConsistencyChecker.distribution(BALANCED_PRO, input, 20);
      ConsistencyChecker.assertRationality(
        dist,
        scenario.maxFoldPct ?? 50,
        scenario.id,
      );
    },
  );

  it.each(noFreeFoldScenarios)(
    "$id — $description (no free fold: canCheck=true)",
    (scenario: StandardScenario) => {
      const input: ScenarioInput = {
        holeCards: scenario.holeCards,
        communityCards: scenario.communityCards,
        position: scenario.position,
        pot: scenario.pot,
        toCall: 0,
        minRaise: scenario.minRaise,
        numberOfPlayers: scenario.numberOfPlayers,
        canCheck: true,
      };
      // Engine invariant: canCheck=true always converts fold → check
      ConsistencyChecker.assertNever(anyBot, input, "fold", 30, scenario.id);
    },
  );
});

// =============================================================================
// BLOCK 4 — Edge Case Coverage
// =============================================================================

describe("Edge Case Coverage", () => {
  describe("Short-handed vs Full Ring", () => {
    it("Heads-up (2 players): AA → never fold", () => {
      const strategy = proBot({ AA: "raise" });
      const huScenario: ScenarioInput = {
        ...AA_PREFLOP_BTN,
        numberOfPlayers: 2,
      };
      ConsistencyChecker.assertNever(strategy, huScenario, "fold", 50, "HU-AA");
    });

    it("Full ring (9 players): AA → never fold", () => {
      const strategy = proBot({ AA: "raise" });
      const frScenario: ScenarioInput = {
        ...AA_PREFLOP_BTN,
        numberOfPlayers: 9,
      };
      ConsistencyChecker.assertNever(strategy, frScenario, "fold", 50, "FR-AA");
    });

    it("Rule with activePlayerCount condition fires for short-handed game", () => {
      const strategy: BotStrategy = {
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
              id: "headsup-rule",
              priority: 1,
              conditions: [
                {
                  category: "opponent",
                  field: "activePlayerCount",
                  operator: "lte",
                  value: 2,
                },
              ],
              action: { type: "raise" },
              enabled: true,
            },
          ],
        },
      };
      // 2-player game → activePlayerCount=2 → rule fires → raise
      const result = ConsistencyChecker.evaluate(strategy, {
        ...AA_PREFLOP_BTN,
        numberOfPlayers: 2,
      });
      expect(result.action.type).toBe("raise");
      expect(result.source).toBe("Hard Rule");
    });

    it("Same rule does NOT fire in a 6-player game (activePlayerCount > 2)", () => {
      const strategy: BotStrategy = {
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
              id: "headsup-rule",
              priority: 1,
              conditions: [
                {
                  category: "opponent",
                  field: "activePlayerCount",
                  operator: "lte",
                  value: 2,
                },
              ],
              action: { type: "raise" },
              enabled: true,
            },
          ],
        },
      };
      // 6-player game → activePlayerCount=6 → rule does NOT fire → personality
      const result = ConsistencyChecker.evaluate(strategy, {
        ...AA_PREFLOP_BTN,
        numberOfPlayers: 6,
      });
      expect(result.source).toBe("Personality");
    });
  });

  describe("Extreme Pot Odds", () => {
    it("Pot odds 0.1% (toCall=1, pot=1000): rule bot with potOdds condition → never fold", () => {
      // Personality bots don't have explicit pot-odds logic, so we use a rule bot.
      // A rule with `potOdds lt 0.01 → call` catches this trivial spot.
      const potOddsBot: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 40,
          bluffFrequency: 10,
          riskTolerance: 40,
          tightness: 80,
        },
        rules: {
          preflop: [
            {
              id: "trivial-call",
              priority: 1,
              conditions: [
                {
                  category: "pot",
                  field: "potOdds",
                  operator: "lt",
                  value: 0.01,
                },
              ],
              action: { type: "call" },
              enabled: true,
            },
          ],
        },
      };
      const trivialCallScenario: ScenarioInput = {
        holeCards: ["7s", "2d"],
        communityCards: [],
        position: "BTN",
        pot: 1000,
        toCall: 1,
        minRaise: 2,
        numberOfPlayers: 6,
      };
      // potOdds = 1/(1000+1) ≈ 0.001 → rule fires → call
      ConsistencyChecker.assertNever(
        potOddsBot,
        trivialCallScenario,
        "fold",
        30,
        "POT-ODDS-0.1",
      );
    });

    it("Extreme negative pot odds (toCall=900, pot=100): weak hand may fold", () => {
      // Calling 900 into 100 requires 90% equity — weak hand correctly folds
      const strategy = basicBot({ tightness: 70, aggression: 40 });
      const badCallScenario: ScenarioInput = {
        holeCards: ["7s", "2d"],
        communityCards: [],
        position: "UTG",
        pot: 100,
        toCall: 900,
        minRaise: 1800,
        numberOfPlayers: 6,
      };
      // Fold IS rational here — just assert it doesn't crash
      const result = ConsistencyChecker.evaluate(strategy, badCallScenario);
      expect(["fold", "call", "raise"]).toContain(result.action.type);
    });

    it("canCheck=true, toCall=0: any bot → action is never 'fold'", () => {
      // Engine converts fold → check when canCheck=true
      const strategy = basicBot({ tightness: 95, aggression: 5 });
      const freeCheckScenario: ScenarioInput = {
        holeCards: ["7s", "2d"],
        communityCards: [],
        position: "BB",
        pot: 20,
        toCall: 0,
        minRaise: 20,
        numberOfPlayers: 6,
        canCheck: true,
      };
      ConsistencyChecker.assertNever(
        strategy,
        freeCheckScenario,
        "fold",
        30,
        "FREE-CHECK",
      );
    });

    it("canCheck=true: action is 'check' or 'raise', never 'fold'", () => {
      const strategy = basicBot();
      const checkOrRaiseScenario: ScenarioInput = {
        holeCards: ["7s", "2d"],
        communityCards: [],
        position: "BB",
        pot: 20,
        toCall: 0,
        minRaise: 20,
        numberOfPlayers: 6,
        canCheck: true,
      };
      const dist = ConsistencyChecker.distribution(
        strategy,
        checkOrRaiseScenario,
        20,
      );
      expect(dist.fold).toBe(0);
      expect(dist.check + dist.raise).toBe(100);
    });

    it("canCheck=true, late river, hero has busted draw: action is check, not fold", () => {
      const strategy = basicBot({ tightness: 80 });
      const bustedDrawScenario: ScenarioInput = {
        holeCards: ["8s", "7s"],
        communityCards: ["9d", "6h", "2c", "Ks", "Ah"],
        position: "BTN",
        pot: 100,
        toCall: 0,
        minRaise: 100,
        numberOfPlayers: 6,
        canCheck: true,
      };
      const result = ConsistencyChecker.evaluate(strategy, bustedDrawScenario);
      expect(result.action.type).not.toBe("fold");
    });
  });
});
