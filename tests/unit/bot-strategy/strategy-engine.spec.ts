import { describe, it, expect } from "vitest";
import {
  evaluateStrategy,
  buildGameContext,
  type BotPayload,
} from "../../../src/modules/bot-strategy/strategy-engine.service";
import type { BotStrategy } from "../../../src/domain/bot-strategy/strategy.types";
import { PERSONALITY_PRESETS } from "../../../src/modules/bot-strategy/presets/personality-presets";

function basePayload(overrides: Partial<BotPayload> = {}): BotPayload {
  return {
    gameId: overrides.gameId ?? "test-game-1",
    handNumber: overrides.handNumber ?? 1,
    stage: overrides.stage ?? "pre-flop",
    you: {
      name: "TestBot",
      chips: 5000,
      holeCards: ["A♠", "K♥"],
      bet: 0,
      position: "BTN",
      ...overrides.you,
    },
    action: {
      canCheck: false,
      toCall: 100,
      minRaise: 200,
      maxRaise: 5000,
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
    players: overrides.players || [
      {
        name: "TestBot",
        chips: 5000,
        bet: 0,
        folded: false,
        allIn: false,
        position: "BTN",
      },
      {
        name: "Opponent1",
        chips: 4000,
        bet: 100,
        folded: false,
        allIn: false,
        position: "SB",
      },
      {
        name: "Opponent2",
        chips: 3000,
        bet: 100,
        folded: false,
        allIn: false,
        position: "BB",
      },
    ],
  };
}

function quickStrategy(overrides: Partial<BotStrategy> = {}): BotStrategy {
  return {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 50,
      bluffFrequency: 30,
      riskTolerance: 60,
      tightness: 50,
    },
    ...overrides,
  };
}

describe("StrategyEngine", () => {
  describe("buildGameContext", () => {
    it("should compute basic fields from payload", () => {
      const ctx = buildGameContext(basePayload());
      expect(ctx.street).toBe("preflop");
      expect(ctx.myPosition).toBe("BTN");
      expect(ctx.facingBet).toBe(true);
      expect(ctx.potSizeBB).toBe(1.5);
      expect(ctx.myStackBB).toBe(50);
      expect(ctx.activePlayerCount).toBe(3);
      expect(ctx.bigBlind).toBe(100);
    });

    it("should compute canCheck correctly", () => {
      const ctx = buildGameContext(
        basePayload({
          action: { canCheck: true, toCall: 0, minRaise: 100, maxRaise: 5000 },
        }),
      );
      expect(ctx.canCheck).toBe(true);
      expect(ctx.facingBet).toBe(false);
    });

    it("should detect facing all-in", () => {
      const ctx = buildGameContext(
        basePayload({
          players: [
            {
              name: "TestBot",
              chips: 5000,
              bet: 0,
              folded: false,
              allIn: false,
              position: "BTN",
            },
            {
              name: "AllInBot",
              chips: 0,
              bet: 3000,
              folded: false,
              allIn: true,
              position: "SB",
            },
          ],
        }),
      );
      expect(ctx.facingAllIn).toBe(true);
    });

    it("should compute effective stack", () => {
      const ctx = buildGameContext(
        basePayload({
          players: [
            {
              name: "TestBot",
              chips: 5000,
              bet: 0,
              folded: false,
              allIn: false,
              position: "BTN",
            },
            {
              name: "ShortStack",
              chips: 1000,
              bet: 100,
              folded: false,
              allIn: false,
              position: "SB",
            },
          ],
        }),
      );
      expect(ctx.effectiveStackBB).toBe(10); // min(5000, 1000) / 100
    });

    it("should normalize pre-flop stage", () => {
      const ctx = buildGameContext(basePayload({ stage: "pre-flop" }));
      expect(ctx.street).toBe("preflop");
    });

    it("should handle flop stage", () => {
      const ctx = buildGameContext(
        basePayload({
          stage: "flop",
          table: {
            pot: 300,
            currentBet: 0,
            communityCards: ["A♠", "K♥", "7♦"],
            smallBlind: 50,
            bigBlind: 100,
            ante: 0,
          },
        }),
      );
      expect(ctx.street).toBe("flop");
      expect(ctx.communityCardCount).toBe(3);
    });
  });

  describe("evaluateStrategy", () => {
    it("should always return a valid action", () => {
      const result = evaluateStrategy(quickStrategy(), basePayload());
      expect(result.action).toBeDefined();
      expect(["fold", "check", "call", "raise", "all_in"]).toContain(
        result.action.type,
      );
    });

    it("should use personality as fallback source for quick tier", () => {
      const result = evaluateStrategy(quickStrategy(), basePayload());
      expect(result.source).toBe("personality");
      expect(result.explanation).toBeTruthy();
    });

    it("should use range chart when available for preflop", () => {
      const strategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 50,
          bluffFrequency: 30,
          riskTolerance: 60,
          tightness: 50,
        },
        rangeChart: { AKo: "raise" },
      };
      const result = evaluateStrategy(strategy, basePayload());
      expect(result.source).toBe("range_chart");
      expect(result.handNotation).toBe("AKo");
    });

    it("should fall through from range chart null to rules", () => {
      const strategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 50,
          bluffFrequency: 30,
          riskTolerance: 60,
          tightness: 50,
        },
        rangeChart: { AKo: null },
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
                  value: "strong",
                },
              ],
              action: { type: "call" },
            },
          ],
        },
      };
      const result = evaluateStrategy(strategy, basePayload());
      expect(result.source).toBe("rule");
      expect(result.ruleId).toBe("r1");
    });

    it("should use rules for postflop", () => {
      const strategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 50,
          bluffFrequency: 30,
          riskTolerance: 60,
          tightness: 50,
        },
        rules: {
          flop: [
            {
              id: "f1",
              priority: 0,
              enabled: true,
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
            },
          ],
        },
      };
      const payload = basePayload({
        stage: "flop",
        you: {
          name: "TestBot",
          chips: 5000,
          holeCards: ["A♠", "K♥"],
          bet: 0,
          position: "BTN",
          bestHand: { name: "ONE_PAIR" },
        },
        table: {
          pot: 300,
          currentBet: 0,
          communityCards: ["A♦", "7♣", "2♠"],
          smallBlind: 50,
          bigBlind: 100,
          ante: 0,
        },
        action: { canCheck: true, toCall: 0, minRaise: 100, maxRaise: 5000 },
      });
      const result = evaluateStrategy(strategy, payload);
      expect(result.source).toBe("rule");
      expect(result.action.type).toBe("raise");
    });

    it("should apply position overrides for pro tier", () => {
      const strategy: BotStrategy = {
        version: 1,
        tier: "pro",
        personality: {
          aggression: 30,
          bluffFrequency: 10,
          riskTolerance: 30,
          tightness: 80,
        },
        rangeChart: { AKo: "fold" },
        positionOverrides: {
          BTN: {
            rangeChart: { AKo: "raise" },
          },
        },
      };
      const result = evaluateStrategy(strategy, basePayload());
      expect(result.source).toBe("range_chart");
      expect(result.action.type).toBe("raise");
    });

    it("should never return check when facing a bet with fold action", () => {
      const strategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 0,
          bluffFrequency: 0,
          riskTolerance: 0,
          tightness: 100,
        },
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
      };
      const payload = basePayload({
        action: { canCheck: false, toCall: 100, minRaise: 200, maxRaise: 5000 },
      });
      const result = evaluateStrategy(strategy, payload);
      expect(result.action.type).toBe("fold");
    });

    it("should convert fold to check when can check", () => {
      const strategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 0,
          bluffFrequency: 0,
          riskTolerance: 0,
          tightness: 100,
        },
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
      };
      const payload = basePayload({
        action: { canCheck: true, toCall: 0, minRaise: 100, maxRaise: 5000 },
      });
      const result = evaluateStrategy(strategy, payload);
      expect(result.action.type).toBe("check");
    });

    it("should clamp raise amount to minRaise/maxRaise", () => {
      const strategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 50,
          bluffFrequency: 30,
          riskTolerance: 60,
          tightness: 50,
        },
        rules: {
          preflop: [
            {
              id: "r1",
              priority: 0,
              enabled: true,
              conditions: [],
              action: { type: "raise", sizing: { mode: "fixed", value: 1 } },
            },
          ],
        },
      };
      const payload = basePayload({
        action: { canCheck: false, toCall: 100, minRaise: 200, maxRaise: 5000 },
      });
      const result = evaluateStrategy(strategy, payload);
      expect(result.action.type).toBe("raise");
      expect(result.action.amount).toBeGreaterThanOrEqual(200);
    });

    it("should produce deterministic results for same game+hand", () => {
      const strategy = quickStrategy();
      const payload = basePayload();
      const r1 = evaluateStrategy(strategy, payload);
      const r2 = evaluateStrategy(strategy, payload);
      expect(r1.action.type).toBe(r2.action.type);
      expect(r1.action.amount).toBe(r2.action.amount);
    });
  });

  describe("all presets produce valid actions", () => {
    for (const preset of PERSONALITY_PRESETS) {
      it(`preset "${preset.name}" should produce valid action for preflop`, () => {
        const strategy: BotStrategy = {
          version: 1,
          tier: "quick",
          personality: preset.personality,
        };
        const result = evaluateStrategy(strategy, basePayload());
        expect(result.action).toBeDefined();
        expect(["fold", "check", "call", "raise", "all_in"]).toContain(
          result.action.type,
        );
      });

      it(`preset "${preset.name}" should produce valid action for postflop`, () => {
        const strategy: BotStrategy = {
          version: 1,
          tier: "quick",
          personality: preset.personality,
        };
        const payload = basePayload({
          stage: "flop",
          you: {
            name: "TestBot",
            chips: 5000,
            holeCards: ["A♠", "K♥"],
            bet: 0,
            position: "BTN",
            bestHand: { name: "ONE_PAIR" },
          },
          table: {
            pot: 300,
            currentBet: 0,
            communityCards: ["A♦", "7♣", "2♠"],
            smallBlind: 50,
            bigBlind: 100,
            ante: 0,
          },
          action: { canCheck: true, toCall: 0, minRaise: 100, maxRaise: 5000 },
        });
        const result = evaluateStrategy(strategy, payload);
        expect(result.action).toBeDefined();
        expect(["fold", "check", "call", "raise", "all_in"]).toContain(
          result.action.type,
        );
      });
    }
  });

  describe("edge cases", () => {
    it("should handle zero maxRaise (cannot raise)", () => {
      const strategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 100,
          bluffFrequency: 100,
          riskTolerance: 100,
          tightness: 0,
        },
        rules: {
          preflop: [
            {
              id: "r1",
              priority: 0,
              enabled: true,
              conditions: [],
              action: {
                type: "raise",
                sizing: { mode: "bb_multiple", value: 3 },
              },
            },
          ],
        },
      };
      const payload = basePayload({
        action: { canCheck: false, toCall: 100, minRaise: 0, maxRaise: 0 },
      });
      const result = evaluateStrategy(strategy, payload);
      // Should fall back to call since can't raise
      expect(["call", "check"]).toContain(result.action.type);
    });

    it("should handle all players folded except one", () => {
      const payload = basePayload({
        players: [
          {
            name: "TestBot",
            chips: 5000,
            bet: 0,
            folded: false,
            allIn: false,
            position: "BTN",
          },
          {
            name: "Opponent1",
            chips: 4000,
            bet: 0,
            folded: true,
            allIn: false,
            position: "SB",
          },
        ],
      });
      const result = evaluateStrategy(quickStrategy(), payload);
      expect(result.action).toBeDefined();
    });
  });
});
