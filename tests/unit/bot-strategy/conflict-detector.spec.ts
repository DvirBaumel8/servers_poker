import { describe, it, expect } from "vitest";
import { detectConflicts } from "../../../src/domain/bot-strategy/strategy-conflict.detector";
import type {
  BotStrategy,
  Rule,
  Personality,
} from "../../../src/domain/bot-strategy/strategy.types";

function personality(): Personality {
  return {
    aggression: 50,
    bluffFrequency: 30,
    riskTolerance: 60,
    tightness: 50,
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

function makeStrategy(rules: Record<string, Rule[]>): BotStrategy {
  return {
    version: 1,
    tier: "strategy",
    personality: personality(),
    rules: rules as any,
  };
}

describe("Conflict Detector", () => {
  it("should return no conflicts for empty rules", () => {
    const result = detectConflicts({
      version: 1,
      tier: "strategy",
      personality: personality(),
    });
    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  it("should return no conflicts for single rule per street", () => {
    const result = detectConflicts(
      makeStrategy({
        preflop: [
          makeRule({
            id: "r1",
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
          }),
        ],
      }),
    );
    expect(result.hasConflicts).toBe(false);
  });

  it("should detect identical conditions with different actions (contradiction)", () => {
    const conditions = [
      {
        category: "hand" as const,
        field: "holeCardRank",
        operator: "eq" as const,
        value: "premium",
      },
    ];
    const result = detectConflicts(
      makeStrategy({
        preflop: [
          makeRule({
            id: "r1",
            priority: 0,
            conditions,
            action: {
              type: "raise",
              sizing: { mode: "bb_multiple", value: 3 },
            },
          }),
          makeRule({
            id: "r2",
            priority: 1,
            conditions,
            action: { type: "fold" },
          }),
        ],
      }),
    );
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].severity).toBe("error");
    expect(result.conflicts[0].description).toContain("will never execute");
  });

  it("should detect identical conditions with same actions (redundant)", () => {
    const conditions = [
      {
        category: "opponent" as const,
        field: "facingBet",
        operator: "eq" as const,
        value: true,
      },
    ];
    const result = detectConflicts(
      makeStrategy({
        flop: [
          makeRule({
            id: "r1",
            priority: 0,
            conditions,
            action: { type: "call" },
          }),
          makeRule({
            id: "r2",
            priority: 1,
            conditions,
            action: { type: "call" },
          }),
        ],
      }),
    );
    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].severity).toBe("warning");
    expect(result.conflicts[0].description).toContain("redundant");
  });

  it("should detect shadowed rule (broader conditions in higher priority)", () => {
    const result = detectConflicts(
      makeStrategy({
        preflop: [
          makeRule({
            id: "r1",
            priority: 0,
            conditions: [],
            action: { type: "fold" },
          }),
          makeRule({
            id: "r2",
            priority: 1,
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
          }),
        ],
      }),
    );
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].severity).toBe("warning");
    expect(result.conflicts[0].description).toContain("shadows");
  });

  it("should not flag disjoint rules", () => {
    const result = detectConflicts(
      makeStrategy({
        preflop: [
          makeRule({
            id: "r1",
            priority: 0,
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
          }),
          makeRule({
            id: "r2",
            priority: 1,
            conditions: [
              {
                category: "stack",
                field: "myStackBB",
                operator: "lt",
                value: 10,
              },
            ],
            action: { type: "all_in" },
          }),
        ],
      }),
    );
    expect(result.conflicts).toHaveLength(0);
  });

  it("should skip disabled rules", () => {
    const conditions = [
      {
        category: "hand" as const,
        field: "holeCardRank",
        operator: "eq" as const,
        value: "premium",
      },
    ];
    const result = detectConflicts(
      makeStrategy({
        preflop: [
          makeRule({
            id: "r1",
            priority: 0,
            enabled: true,
            conditions,
            action: {
              type: "raise",
              sizing: { mode: "bb_multiple", value: 3 },
            },
          }),
          makeRule({
            id: "r2",
            priority: 1,
            enabled: false,
            conditions,
            action: { type: "fold" },
          }),
        ],
      }),
    );
    expect(result.conflicts).toHaveLength(0);
  });

  it("should detect conflicts across different streets independently", () => {
    const conditions = [
      {
        category: "opponent" as const,
        field: "facingBet",
        operator: "eq" as const,
        value: true,
      },
    ];
    const result = detectConflicts(
      makeStrategy({
        flop: [
          makeRule({
            id: "f1",
            priority: 0,
            conditions,
            action: { type: "call" },
          }),
          makeRule({
            id: "f2",
            priority: 1,
            conditions,
            action: { type: "fold" },
          }),
        ],
        turn: [
          makeRule({
            id: "t1",
            priority: 0,
            conditions,
            action: { type: "call" },
          }),
        ],
      }),
    );
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].street).toBe("flop");
  });

  it("should detect conflicts inside position overrides", () => {
    const conditions = [
      {
        category: "hand" as const,
        field: "holeCardRank",
        operator: "eq" as const,
        value: "premium",
      },
    ];
    const result = detectConflicts({
      version: 1,
      tier: "pro",
      personality: personality(),
      positionOverrides: {
        BTN: {
          rules: {
            preflop: [
              makeRule({
                id: "r1",
                priority: 0,
                conditions,
                action: {
                  type: "raise",
                  sizing: { mode: "bb_multiple", value: 3 },
                },
              }),
              makeRule({
                id: "r2",
                priority: 1,
                conditions,
                action: { type: "fold" },
              }),
            ],
          },
        },
      },
    });
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts[0].description).toContain("[BTN]");
  });

  it("should handle rule with subset conditions (partial overlap) correctly", () => {
    const result = detectConflicts(
      makeStrategy({
        flop: [
          makeRule({
            id: "r1",
            priority: 0,
            conditions: [
              {
                category: "hand",
                field: "handStrength",
                operator: "gte",
                value: "pair",
              },
            ],
            action: {
              type: "raise",
              sizing: { mode: "pot_fraction", value: 0.5 },
            },
          }),
          makeRule({
            id: "r2",
            priority: 1,
            conditions: [
              {
                category: "hand",
                field: "handStrength",
                operator: "gte",
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
        ],
      }),
    );
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].description).toContain("shadows");
  });
});
