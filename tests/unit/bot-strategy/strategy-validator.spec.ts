import { describe, it, expect } from "vitest";
import { validateStrategy } from "../../../src/domain/bot-strategy/strategy.validator";
import type {
  BotStrategy,
  Personality,
} from "../../../src/domain/bot-strategy/strategy.types";

function validPersonality(overrides: Partial<Personality> = {}): Personality {
  return {
    aggression: 50,
    bluffFrequency: 30,
    riskTolerance: 60,
    tightness: 50,
    ...overrides,
  };
}

function quickStrategy(overrides: Partial<BotStrategy> = {}): BotStrategy {
  return {
    version: 1,
    tier: "quick",
    personality: validPersonality(),
    ...overrides,
  };
}

function strategyTier(overrides: Partial<BotStrategy> = {}): BotStrategy {
  return {
    version: 1,
    tier: "strategy",
    personality: validPersonality(),
    ...overrides,
  };
}

describe("Strategy Validator", () => {
  describe("top-level structure", () => {
    it("should accept a valid quick strategy", () => {
      const result = validateStrategy(quickStrategy());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject null", () => {
      const result = validateStrategy(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("non-null object");
    });

    it("should reject non-object", () => {
      const result = validateStrategy("hello");
      expect(result.valid).toBe(false);
    });

    it("should reject undefined", () => {
      const result = validateStrategy(undefined);
      expect(result.valid).toBe(false);
    });

    it("should reject wrong version", () => {
      const result = validateStrategy({ ...quickStrategy(), version: 2 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "version")).toBe(true);
    });

    it("should reject invalid tier", () => {
      const result = validateStrategy({ ...quickStrategy(), tier: "mega" });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "tier")).toBe(true);
    });

    it("should reject oversized JSON", () => {
      const huge = quickStrategy();
      (huge as any).bigData = "x".repeat(200_000);
      const result = validateStrategy(huge);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("maximum size");
    });
  });

  describe("personality validation", () => {
    it("should accept valid personality values", () => {
      const result = validateStrategy(quickStrategy());
      expect(result.valid).toBe(true);
    });

    it("should accept boundary values (0 and 100)", () => {
      const result = validateStrategy(
        quickStrategy({
          personality: validPersonality({
            aggression: 0,
            bluffFrequency: 100,
            riskTolerance: 0,
            tightness: 100,
          }),
        }),
      );
      expect(result.valid).toBe(true);
    });

    it("should reject missing personality", () => {
      const s = { version: 1, tier: "quick" };
      const result = validateStrategy(s);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "personality")).toBe(true);
    });

    it("should reject negative slider value", () => {
      const result = validateStrategy(
        quickStrategy({
          personality: validPersonality({ aggression: -5 }),
        }),
      );
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.path === "personality.aggression"),
      ).toBe(true);
    });

    it("should reject slider value above 100", () => {
      const result = validateStrategy(
        quickStrategy({
          personality: validPersonality({ tightness: 150 }),
        }),
      );
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.path === "personality.tightness"),
      ).toBe(true);
    });

    it("should reject non-number slider value", () => {
      const p = validPersonality();
      (p as any).aggression = "high";
      const result = validateStrategy(quickStrategy({ personality: p }));
      expect(result.valid).toBe(false);
    });

    it("should reject missing personality field", () => {
      const p = { aggression: 50, bluffFrequency: 30, riskTolerance: 60 };
      const result = validateStrategy(quickStrategy({ personality: p as any }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes("tightness"))).toBe(
        true,
      );
    });

    it("should reject NaN slider value", () => {
      const result = validateStrategy(
        quickStrategy({ personality: validPersonality({ aggression: NaN }) }),
      );
      expect(result.valid).toBe(false);
    });

    it("should reject Infinity slider value", () => {
      const result = validateStrategy(
        quickStrategy({
          personality: validPersonality({ riskTolerance: Infinity }),
        }),
      );
      expect(result.valid).toBe(false);
    });
  });

  describe("quick tier warnings", () => {
    it("should warn when quick tier has rules", () => {
      const result = validateStrategy(
        quickStrategy({
          rules: { preflop: [] },
        }),
      );
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.path === "rules")).toBe(true);
    });

    it("should warn when quick tier has range chart", () => {
      const result = validateStrategy(
        quickStrategy({
          rangeChart: { AA: "raise" },
        }),
      );
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.path === "rangeChart")).toBe(true);
    });

    it("should warn when quick tier has position overrides", () => {
      const result = validateStrategy(
        quickStrategy({
          positionOverrides: { BTN: { personality: { aggression: 80 } } },
        }),
      );
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.path === "positionOverrides")).toBe(
        true,
      );
    });
  });

  describe("rules validation", () => {
    it("should accept valid rules", () => {
      const result = validateStrategy(
        strategyTier({
          rules: {
            preflop: [
              {
                id: "r1",
                priority: 0,
                enabled: true,
                conditions: [
                  {
                    category: "hand",
                    field: "holeCardRank",
                    operator: "eq",
                    value: "premium",
                  },
                ],
                action: {
                  type: "raise",
                  sizing: { mode: "bb_multiple", value: 3 },
                },
              },
            ],
          },
        }),
      );
      expect(result.valid).toBe(true);
    });

    it("should reject invalid street name", () => {
      const result = validateStrategy(
        strategyTier({
          rules: { showdown: [] } as any,
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Invalid street");
    });

    it("should reject duplicate rule IDs within a street", () => {
      const rule = {
        id: "r1",
        priority: 0,
        enabled: true,
        conditions: [],
        action: { type: "fold" as const },
      };
      const result = validateStrategy(
        strategyTier({
          rules: { preflop: [rule, { ...rule, priority: 1 }] },
        }),
      );
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.message.includes("Duplicate rule ID")),
      ).toBe(true);
    });

    it("should reject rule without ID", () => {
      const result = validateStrategy(
        strategyTier({
          rules: {
            flop: [
              {
                id: "",
                priority: 0,
                enabled: true,
                conditions: [],
                action: { type: "fold" },
              } as any,
            ],
          },
        }),
      );
      expect(result.valid).toBe(false);
    });

    it("should reject negative priority", () => {
      const result = validateStrategy(
        strategyTier({
          rules: {
            preflop: [
              {
                id: "r1",
                priority: -1,
                enabled: true,
                conditions: [],
                action: { type: "fold" },
              } as any,
            ],
          },
        }),
      );
      expect(result.valid).toBe(false);
    });

    it("should warn on rule with no conditions", () => {
      const result = validateStrategy(
        strategyTier({
          rules: {
            preflop: [
              {
                id: "r1",
                priority: 0,
                enabled: true,
                conditions: [],
                action: { type: "fold" },
              },
            ],
          },
        }),
      );
      expect(result.valid).toBe(true);
      expect(
        result.warnings.some((w) => w.message.includes("always match")),
      ).toBe(true);
    });

    it("should skip validation of disabled rules conditions", () => {
      const result = validateStrategy(
        strategyTier({
          rules: {
            preflop: [
              {
                id: "r1",
                priority: 0,
                enabled: false,
                conditions: "not an array" as any,
                action: "not valid" as any,
              },
            ],
          },
        }),
      );
      expect(result.valid).toBe(true);
    });

    it("should reject too many rules per street", () => {
      const rules = Array.from({ length: 51 }, (_, i) => ({
        id: `r${i}`,
        priority: i,
        enabled: true,
        conditions: [],
        action: { type: "fold" as const },
      }));
      const result = validateStrategy(
        strategyTier({ rules: { preflop: rules } }),
      );
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.message.includes("Too many rules")),
      ).toBe(true);
    });
  });

  describe("condition validation", () => {
    function ruleWithCondition(condition: any, street = "preflop") {
      return strategyTier({
        rules: {
          [street]: [
            {
              id: "r1",
              priority: 0,
              enabled: true,
              conditions: [condition],
              action: { type: "fold" },
            },
          ],
        },
      });
    }

    it("should accept valid enum condition", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "hand",
          field: "handStrength",
          operator: "eq",
          value: "pair",
        }),
      );
      expect(result.valid).toBe(true);
    });

    it("should accept valid boolean condition", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "opponent",
          field: "facingBet",
          operator: "eq",
          value: true,
        }),
      );
      expect(result.valid).toBe(true);
    });

    it("should accept valid numeric condition", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "stack",
          field: "myStackBB",
          operator: "gt",
          value: 20,
        }),
      );
      expect(result.valid).toBe(true);
    });

    it("should accept 'in' operator with array value", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "hand",
          field: "handStrength",
          operator: "in",
          value: ["pair", "two_pair", "trips"],
        }),
      );
      expect(result.valid).toBe(true);
    });

    it("should accept 'between' operator with [min, max]", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "stack",
          field: "myStackBB",
          operator: "between",
          value: [10, 30],
        }),
      );
      expect(result.valid).toBe(true);
    });

    it("should reject unknown category", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "weather",
          field: "temperature",
          operator: "gt",
          value: 30,
        }),
      );
      expect(result.valid).toBe(false);
    });

    it("should reject unknown field", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "hand",
          field: "cardColor",
          operator: "eq",
          value: "red",
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Unknown condition field");
    });

    it("should reject invalid enum value", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "hand",
          field: "handStrength",
          operator: "eq",
          value: "super_flush",
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Invalid value");
    });

    it("should reject field used on wrong street", () => {
      const result = validateStrategy(
        ruleWithCondition(
          {
            category: "hand",
            field: "holeCardRank",
            operator: "eq",
            value: "premium",
          },
          "flop",
        ),
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("not available on flop");
    });

    it("should reject 'between' with non-array value", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "stack",
          field: "myStackBB",
          operator: "between",
          value: 20,
        }),
      );
      expect(result.valid).toBe(false);
    });

    it("should reject 'between' with min > max", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "stack",
          field: "myStackBB",
          operator: "between",
          value: [30, 10],
        }),
      );
      expect(result.valid).toBe(false);
    });

    it("should reject 'in' with non-array value", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "hand",
          field: "handStrength",
          operator: "in",
          value: "pair",
        }),
      );
      expect(result.valid).toBe(false);
    });

    it("should reject boolean field with non-boolean value", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "opponent",
          field: "facingBet",
          operator: "eq",
          value: "yes",
        }),
      );
      expect(result.valid).toBe(false);
    });

    it("should reject number field with string value", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "stack",
          field: "myStackBB",
          operator: "gt",
          value: "twenty",
        }),
      );
      expect(result.valid).toBe(false);
    });

    it("should reject missing value", () => {
      const result = validateStrategy(
        ruleWithCondition({
          category: "opponent",
          field: "facingBet",
          operator: "eq",
        }),
      );
      expect(result.valid).toBe(false);
    });
  });

  describe("action validation", () => {
    function ruleWithAction(action: any) {
      return strategyTier({
        rules: {
          preflop: [
            {
              id: "r1",
              priority: 0,
              enabled: true,
              conditions: [],
              action,
            },
          ],
        },
      });
    }

    it("should accept fold action", () => {
      const result = validateStrategy(ruleWithAction({ type: "fold" }));
      expect(result.valid).toBe(true);
    });

    it("should accept check action", () => {
      const result = validateStrategy(ruleWithAction({ type: "check" }));
      expect(result.valid).toBe(true);
    });

    it("should accept call action", () => {
      const result = validateStrategy(ruleWithAction({ type: "call" }));
      expect(result.valid).toBe(true);
    });

    it("should accept all_in action", () => {
      const result = validateStrategy(ruleWithAction({ type: "all_in" }));
      expect(result.valid).toBe(true);
    });

    it("should accept raise with valid sizing", () => {
      const result = validateStrategy(
        ruleWithAction({
          type: "raise",
          sizing: { mode: "pot_fraction", value: 0.75 },
        }),
      );
      expect(result.valid).toBe(true);
    });

    it("should accept raise with bb_multiple sizing", () => {
      const result = validateStrategy(
        ruleWithAction({
          type: "raise",
          sizing: { mode: "bb_multiple", value: 3 },
        }),
      );
      expect(result.valid).toBe(true);
    });

    it("should reject invalid action type", () => {
      const result = validateStrategy(ruleWithAction({ type: "bluff" }));
      expect(result.valid).toBe(false);
    });

    it("should reject raise without sizing", () => {
      const result = validateStrategy(ruleWithAction({ type: "raise" }));
      expect(result.valid).toBe(false);
    });

    it("should reject invalid sizing mode", () => {
      const result = validateStrategy(
        ruleWithAction({
          type: "raise",
          sizing: { mode: "random", value: 2 },
        }),
      );
      expect(result.valid).toBe(false);
    });

    it("should reject non-positive sizing value", () => {
      const result = validateStrategy(
        ruleWithAction({
          type: "raise",
          sizing: { mode: "bb_multiple", value: 0 },
        }),
      );
      expect(result.valid).toBe(false);
    });

    it("should reject infinite sizing value", () => {
      const result = validateStrategy(
        ruleWithAction({
          type: "raise",
          sizing: { mode: "bb_multiple", value: Infinity },
        }),
      );
      expect(result.valid).toBe(false);
    });
  });

  describe("range chart validation", () => {
    it("should accept valid range chart entries", () => {
      const result = validateStrategy(
        strategyTier({
          rangeChart: {
            AA: "raise",
            AKs: "raise",
            AKo: "call",
            "72o": "fold",
            KQs: null,
          },
        }),
      );
      expect(result.valid).toBe(true);
    });

    it("should reject invalid hand notation", () => {
      const result = validateStrategy(
        strategyTier({
          rangeChart: { ZZ: "raise" },
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Invalid hand notation");
    });

    it("should reject invalid range action", () => {
      const result = validateStrategy(
        strategyTier({
          rangeChart: { AA: "bluff" as any },
        }),
      );
      expect(result.valid).toBe(false);
    });
  });

  describe("position overrides validation", () => {
    it("should accept valid position override with personality", () => {
      const result = validateStrategy({
        version: 1,
        tier: "pro",
        personality: validPersonality(),
        positionOverrides: {
          BTN: { personality: { aggression: 80 } },
        },
      });
      expect(result.valid).toBe(true);
    });

    it("should accept position override with range chart", () => {
      const result = validateStrategy({
        version: 1,
        tier: "pro",
        personality: validPersonality(),
        positionOverrides: {
          UTG: { rangeChart: { AA: "raise", KK: "raise" } },
        },
      });
      expect(result.valid).toBe(true);
    });

    it("should reject invalid position name", () => {
      const result = validateStrategy({
        version: 1,
        tier: "pro",
        personality: validPersonality(),
        positionOverrides: {
          DEALER: { personality: { aggression: 80 } },
        } as any,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Invalid position");
    });

    it("should reject invalid personality value in override", () => {
      const result = validateStrategy({
        version: 1,
        tier: "pro",
        personality: validPersonality(),
        positionOverrides: {
          BTN: { personality: { aggression: 200 } },
        },
      });
      expect(result.valid).toBe(false);
    });

    it("should warn when non-pro tier has position overrides", () => {
      const result = validateStrategy(
        strategyTier({
          positionOverrides: {
            BTN: { personality: { aggression: 80 } },
          },
        }),
      );
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.message.includes("pro tier"))).toBe(
        true,
      );
    });
  });
});
