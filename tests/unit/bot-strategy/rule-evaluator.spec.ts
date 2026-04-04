import { describe, it, expect } from "vitest";
import { evaluateRules } from "../../../src/modules/bot-strategy/evaluators/rule.evaluator";
import type {
  Rule,
  GameContext,
} from "../../../src/domain/bot-strategy/strategy.types";

function baseContext(overrides: Partial<GameContext> = {}): GameContext {
  return {
    handStrength: "pair",
    pairType: "top_pair",
    hasFlushDraw: false,
    hasStraightDraw: false,
    holeCardRank: "strong",
    communityCardCount: 3,
    boardTexture: "dry",
    facingBet: false,
    facingRaise: false,
    facingAllIn: false,
    activePlayerCount: 3,
    playersToAct: 1,
    myPosition: "BTN",
    isInPosition: true,
    myStackBB: 50,
    effectiveStackBB: 40,
    potSizeBB: 5,
    potOdds: 0,
    canCheck: true,
    toCall: 0,
    minRaise: 200,
    maxRaise: 5000,
    street: "flop",
    bigBlind: 100,
    ...overrides,
  };
}

function makeRule(overrides: Partial<Rule> & { id: string }): Rule {
  return {
    priority: 0,
    enabled: true,
    conditions: [],
    action: { type: "fold" },
    ...overrides,
  };
}

describe("RuleEvaluator", () => {
  it("should match rule with no conditions (always matches)", () => {
    const result = evaluateRules(
      [makeRule({ id: "r1", action: { type: "call" } })],
      baseContext(),
    );
    expect(result.matched).toBe(true);
    expect(result.action?.type).toBe("call");
    expect(result.ruleId).toBe("r1");
  });

  it("should match rule with eq condition", () => {
    const result = evaluateRules(
      [
        makeRule({
          id: "r1",
          conditions: [
            {
              category: "hand",
              field: "handStrength",
              operator: "eq",
              value: "pair",
            },
          ],
          action: {
            type: "raise",
            sizing: { mode: "pot_fraction", value: 0.5 },
          },
        }),
      ],
      baseContext({ handStrength: "pair" }),
    );
    expect(result.matched).toBe(true);
    expect(result.action?.type).toBe("raise");
  });

  it("should not match rule when condition fails", () => {
    const result = evaluateRules(
      [
        makeRule({
          id: "r1",
          conditions: [
            {
              category: "hand",
              field: "handStrength",
              operator: "eq",
              value: "flush",
            },
          ],
          action: { type: "all_in" },
        }),
      ],
      baseContext({ handStrength: "pair" }),
    );
    expect(result.matched).toBe(false);
  });

  it("should apply AND logic (all conditions must match)", () => {
    const rules = [
      makeRule({
        id: "r1",
        conditions: [
          {
            category: "hand",
            field: "handStrength",
            operator: "eq",
            value: "pair",
          },
          {
            category: "opponent",
            field: "facingBet",
            operator: "eq",
            value: true,
          },
        ],
        action: { type: "call" },
      }),
    ];

    // Only handStrength matches, facingBet does not
    const result1 = evaluateRules(
      rules,
      baseContext({ handStrength: "pair", facingBet: false }),
    );
    expect(result1.matched).toBe(false);

    // Both match
    const result2 = evaluateRules(
      rules,
      baseContext({ handStrength: "pair", facingBet: true }),
    );
    expect(result2.matched).toBe(true);
  });

  it("should evaluate rules in priority order (first match wins)", () => {
    const result = evaluateRules(
      [
        makeRule({ id: "r2", priority: 2, action: { type: "fold" } }),
        makeRule({ id: "r1", priority: 1, action: { type: "call" } }),
        makeRule({
          id: "r0",
          priority: 0,
          action: { type: "raise", sizing: { mode: "bb_multiple", value: 3 } },
        }),
      ],
      baseContext(),
    );
    expect(result.ruleId).toBe("r0");
    expect(result.action?.type).toBe("raise");
  });

  it("should skip disabled rules", () => {
    const result = evaluateRules(
      [
        makeRule({
          id: "r1",
          priority: 0,
          enabled: false,
          action: { type: "all_in" },
        }),
        makeRule({
          id: "r2",
          priority: 1,
          enabled: true,
          action: { type: "call" },
        }),
      ],
      baseContext(),
    );
    expect(result.ruleId).toBe("r2");
  });

  it("should handle gt operator", () => {
    const rules = [
      makeRule({
        id: "r1",
        conditions: [
          { category: "stack", field: "myStackBB", operator: "gt", value: 40 },
        ],
        action: { type: "raise", sizing: { mode: "bb_multiple", value: 3 } },
      }),
    ];

    expect(evaluateRules(rules, baseContext({ myStackBB: 50 })).matched).toBe(
      true,
    );
    expect(evaluateRules(rules, baseContext({ myStackBB: 40 })).matched).toBe(
      false,
    );
    expect(evaluateRules(rules, baseContext({ myStackBB: 30 })).matched).toBe(
      false,
    );
  });

  it("should handle 'in' operator", () => {
    const rules = [
      makeRule({
        id: "r1",
        conditions: [
          {
            category: "hand",
            field: "handStrength",
            operator: "in",
            value: ["pair", "two_pair", "trips"],
          },
        ],
        action: {
          type: "raise",
          sizing: { mode: "pot_fraction", value: 0.75 },
        },
      }),
    ];

    expect(
      evaluateRules(rules, baseContext({ handStrength: "pair" })).matched,
    ).toBe(true);
    expect(
      evaluateRules(rules, baseContext({ handStrength: "trips" })).matched,
    ).toBe(true);
    expect(
      evaluateRules(rules, baseContext({ handStrength: "high_card" })).matched,
    ).toBe(false);
  });

  it("should handle 'between' operator", () => {
    const rules = [
      makeRule({
        id: "r1",
        conditions: [
          {
            category: "stack",
            field: "myStackBB",
            operator: "between",
            value: [10, 30],
          },
        ],
        action: { type: "all_in" },
      }),
    ];

    expect(evaluateRules(rules, baseContext({ myStackBB: 20 })).matched).toBe(
      true,
    );
    expect(evaluateRules(rules, baseContext({ myStackBB: 10 })).matched).toBe(
      true,
    );
    expect(evaluateRules(rules, baseContext({ myStackBB: 30 })).matched).toBe(
      true,
    );
    expect(evaluateRules(rules, baseContext({ myStackBB: 5 })).matched).toBe(
      false,
    );
    expect(evaluateRules(rules, baseContext({ myStackBB: 50 })).matched).toBe(
      false,
    );
  });

  it("should handle boolean condition", () => {
    const rules = [
      makeRule({
        id: "r1",
        conditions: [
          {
            category: "opponent",
            field: "facingAllIn",
            operator: "eq",
            value: true,
          },
        ],
        action: { type: "fold" },
      }),
    ];

    expect(
      evaluateRules(rules, baseContext({ facingAllIn: true })).matched,
    ).toBe(true);
    expect(
      evaluateRules(rules, baseContext({ facingAllIn: false })).matched,
    ).toBe(false);
  });

  it("should return no match for empty rules array", () => {
    const result = evaluateRules([], baseContext());
    expect(result.matched).toBe(false);
  });
});
