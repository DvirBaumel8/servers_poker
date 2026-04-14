/**
 * Tests for the all-in equity guard:
 * 1. Engine-level guard overrides call/raise to fold when facing all-in with low equity
 * 2. Guard respects thresholds and does not trigger for non-all-in or high-equity spots
 * 3. Personality evaluator strengthened penalty produces high fold weight for low-equity all-ins
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateStrategy,
  clearEvalCache,
  clearHydrationCache,
  type BotPayload,
} from "../../../src/modules/bot-strategy/strategy-engine.service";
import type {
  BotStrategy,
  GameContext,
} from "../../../src/domain/bot-strategy/strategy.types";
import { evaluatePersonality } from "../../../src/modules/bot-strategy/evaluators/personality.evaluator";

// ── Helpers ──────────────────────────────────────────────────────────────────

function basePayload(overrides: Partial<BotPayload> = {}): BotPayload {
  return {
    gameId: overrides.gameId ?? "test-game-guard",
    handNumber: overrides.handNumber ?? 1,
    stage: overrides.stage ?? "flop",
    you: {
      name: "HeroBot",
      chips: 3000,
      holeCards: ["7♣", "2♦"], // 7-high trash
      bet: 0,
      position: "BTN",
      ...overrides.you,
    },
    action: {
      canCheck: false,
      toCall: 3000,
      minRaise: 6000,
      maxRaise: 3000,
      ...overrides.action,
    },
    table: {
      pot: 6200,
      currentBet: 3000,
      communityCards: ["K♠", "9♥", "4♦"],
      smallBlind: 50,
      bigBlind: 100,
      ante: 0,
      ...overrides.table,
    },
    players: overrides.players || [
      {
        name: "HeroBot",
        chips: 3000,
        bet: 0,
        folded: false,
        allIn: false,
        position: "BTN",
      },
      {
        name: "Villain",
        chips: 0,
        bet: 3000,
        folded: false,
        allIn: true, // opponent is all-in
        position: "BB",
      },
    ],
    decisionSeed:
      overrides.decisionSeed ??
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  };
}

/** Strategy with a hard rule that says "always call on the flop when facing a bet" */
function strategyWithCallRule(): BotStrategy {
  return {
    version: 1,
    tier: "strategy",
    personality: {
      aggression: 50,
      bluffFrequency: 30,
      riskTolerance: 50,
      tightness: 50,
    },
    rules: {
      flop: [
        {
          id: "always-call-flop",
          label: "Always Call on Flop",
          action: { type: "call" },
          priority: 1,
          enabled: true,
          conditions: [
            {
              category: "opponent",
              field: "facingBet",
              operator: "eq",
              value: true,
            },
          ],
        },
      ],
    },
  };
}

/** Strategy with a hard rule that says "always raise on the flop" */
function strategyWithRaiseRule(): BotStrategy {
  return {
    version: 1,
    tier: "strategy",
    personality: {
      aggression: 80,
      bluffFrequency: 30,
      riskTolerance: 60,
      tightness: 30,
    },
    rules: {
      flop: [
        {
          id: "always-raise-flop",
          label: "Always Raise on Flop",
          action: { type: "raise" },
          priority: 1,
          enabled: true,
          conditions: [
            {
              category: "opponent",
              field: "facingBet",
              operator: "eq",
              value: true,
            },
          ],
        },
      ],
    },
  };
}

function quickStrategy(overrides: Partial<BotStrategy> = {}): BotStrategy {
  return {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 50,
      bluffFrequency: 30,
      riskTolerance: 50,
      tightness: 50,
    },
    ...overrides,
  };
}

function makeCtx(overrides: Partial<GameContext> = {}): GameContext {
  return {
    handStrength: "high_card",
    pairType: null,
    hasFlushDraw: false,
    hasStraightDraw: false,
    holeCardRank: "weak",
    communityCardCount: 3,
    boardTexture: "dry",
    facingBet: true,
    facingRaise: false,
    facingAllIn: true,
    activePlayerCount: 2,
    playersToAct: 0,
    myPosition: "BTN",
    isInPosition: true,
    myStackBB: 30,
    effectiveStackBB: 30,
    spr: 1.0,
    potSizeBB: 62,
    potOdds: 0.33,
    equity: 0.26, // 7-high trash
    isBoardPlays: false,
    canCheck: false,
    toCall: 3000,
    currentBetLevel: 3000,
    minRaise: 6000,
    maxRaise: 3000,
    street: "flop",
    bigBlind: 100,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("All-In Equity Guard", () => {
  beforeEach(() => {
    clearEvalCache();
    clearHydrationCache();
  });

  describe("Engine-level guard", () => {
    it("overrides rule-matched call to fold when equity < threshold and facing all-in", () => {
      const strategy = strategyWithCallRule();
      const payload = basePayload(); // 7-high vs all-in opponent
      const result = evaluateStrategy(strategy, payload);

      // The rule would say "call", but the guard should override to "fold"
      expect(result.action.type).toBe("fold");
      expect(result.explanation).toContain("All-in equity guard");
    });

    it("overrides rule-matched raise to fold when equity < raise threshold", () => {
      const strategy = strategyWithRaiseRule();
      const payload = basePayload(); // 7-high vs all-in
      const result = evaluateStrategy(strategy, payload);

      expect(result.action.type).toBe("fold");
      expect(result.explanation).toContain("All-in equity guard");
    });

    it("does NOT trigger when equity >= call threshold", () => {
      const strategy = strategyWithCallRule();
      // Give hero strong hand with good equity
      const payload = basePayload({
        you: {
          name: "HeroBot",
          chips: 3000,
          holeCards: ["A♠", "K♠"],
          bet: 0,
          position: "BTN",
        },
        table: {
          pot: 6200,
          currentBet: 3000,
          communityCards: ["A♥", "9♥", "4♦"], // hero has top pair top kicker
          smallBlind: 50,
          bigBlind: 100,
          ante: 0,
        },
      });
      const result = evaluateStrategy(strategy, payload);

      // Top pair + top kicker should have equity well above 0.35
      // The guard should NOT override the rule's call
      expect(result.explanation).not.toContain("All-in equity guard");
    });

    it("does NOT trigger when not facing an all-in", () => {
      const strategy = strategyWithCallRule();
      const payload = basePayload({
        you: {
          name: "HeroBot",
          chips: 5000,
          holeCards: ["A♠", "K♥"], // decent hand so it doesn't fold naturally
          bet: 0,
          position: "BTN",
        },
        players: [
          {
            name: "HeroBot",
            chips: 5000,
            bet: 0,
            folded: false,
            allIn: false,
            position: "BTN",
          },
          {
            name: "Villain",
            chips: 3000,
            bet: 100,
            folded: false,
            allIn: false, // NOT all-in
            position: "BB",
          },
        ],
        action: {
          canCheck: false,
          toCall: 100,
          minRaise: 200,
          maxRaise: 5000,
        },
        table: {
          pot: 250,
          currentBet: 100,
          communityCards: ["K♠", "9♥", "4♦"],
          smallBlind: 50,
          bigBlind: 100,
          ante: 0,
        },
      });
      const result = evaluateStrategy(strategy, payload);

      // Rule says call, no all-in → guard should not fire
      expect(result.action.type).toBe("call");
      expect(result.explanation).not.toContain("All-in equity guard");
    });

    it("does NOT override fold actions", () => {
      // Quick strategy with very tight personality → likely folds 7-high
      const strategy = quickStrategy({
        personality: {
          aggression: 10,
          bluffFrequency: 0,
          riskTolerance: 10,
          tightness: 95,
        },
      });
      const payload = basePayload();
      const result = evaluateStrategy(strategy, payload);

      // Should fold naturally (tight personality + trash hand)
      expect(result.action.type).toBe("fold");
      // Guard should not interfere with a fold
      expect(result.explanation).not.toContain("All-in equity guard");
    });
  });

  describe("Large bet guard (>50% of stack)", () => {
    it("overrides call to fold when facing bet > 50% stack with low equity", () => {
      const strategy = strategyWithCallRule();
      // Villain bets 2000 into hero's 3000 stack (67% of stack), NOT all-in
      const payload = basePayload({
        you: {
          name: "HeroBot",
          chips: 3000,
          holeCards: ["7♣", "5♦"], // 7-high trash
          bet: 0,
          position: "BTN",
        },
        action: {
          canCheck: false,
          toCall: 2000, // > 50% of 3000
          minRaise: 4000,
          maxRaise: 3000,
        },
        players: [
          {
            name: "HeroBot",
            chips: 3000,
            bet: 0,
            folded: false,
            allIn: false,
            position: "BTN",
          },
          {
            name: "Villain",
            chips: 4000,
            bet: 2000,
            folded: false,
            allIn: false,
            position: "BB",
          },
        ],
        table: {
          pot: 2200,
          currentBet: 2000,
          communityCards: ["9♠", "6♥", "2♦"],
          smallBlind: 50,
          bigBlind: 100,
          ante: 0,
        },
      });
      const result = evaluateStrategy(strategy, payload);

      expect(result.action.type).toBe("fold");
      expect(result.explanation).toContain("All-in equity guard");
    });

    it("does NOT trigger when bet < 50% of stack", () => {
      const strategy = strategyWithCallRule();
      const payload = basePayload({
        you: {
          name: "HeroBot",
          chips: 5000,
          holeCards: ["A♠", "K♥"],
          bet: 0,
          position: "BTN",
        },
        action: {
          canCheck: false,
          toCall: 200, // 4% of 5000 — well under threshold
          minRaise: 400,
          maxRaise: 5000,
        },
        players: [
          {
            name: "HeroBot",
            chips: 5000,
            bet: 0,
            folded: false,
            allIn: false,
            position: "BTN",
          },
          {
            name: "Villain",
            chips: 4000,
            bet: 200,
            folded: false,
            allIn: false,
            position: "BB",
          },
        ],
        table: {
          pot: 350,
          currentBet: 200,
          communityCards: ["K♠", "9♥", "4♦"],
          smallBlind: 50,
          bigBlind: 100,
          ante: 0,
        },
      });
      const result = evaluateStrategy(strategy, payload);

      // Small bet + decent hand → rule's call should stand
      expect(result.action.type).toBe("call");
      expect(result.explanation).not.toContain("All-in equity guard");
    });
  });

  describe("Personality evaluator strengthened penalty", () => {
    it("produces fold for low-equity all-in spots", () => {
      const personality = {
        tightness: 50,
        aggression: 50,
        bluffFrequency: 20,
        riskTolerance: 50,
      };
      const ctx = makeCtx({ equity: 0.26, facingAllIn: true, facingBet: true });

      const result = evaluatePersonality(personality, ctx, 12345);

      // With 26% equity facing all-in, the bot should fold
      expect(result.action.type).toBe("fold");
    });

    it("does not fold when equity is above threshold", () => {
      const personality = {
        tightness: 40,
        aggression: 60,
        bluffFrequency: 20,
        riskTolerance: 60,
      };
      const ctx = makeCtx({
        equity: 0.55,
        facingAllIn: true,
        facingBet: true,
        handStrength: "pair",
        holeCardRank: "strong",
      });

      const result = evaluatePersonality(personality, ctx, 12345);

      // 55% equity vs all-in — should NOT fold with moderate-high risk tolerance
      expect(result.action.type).not.toBe("fold");
    });

    it("very low equity forces fold even with high risk tolerance", () => {
      const personality = {
        tightness: 20,
        aggression: 50,
        bluffFrequency: 10, // low bluff to avoid bluff escape
        riskTolerance: 80,
      };
      const ctx = makeCtx({ equity: 0.15, facingAllIn: true, facingBet: true });

      const result = evaluatePersonality(personality, ctx, 12345);

      // 15% equity — deeply negative. Even with high risk tolerance, should fold.
      expect(result.action.type).toBe("fold");
    });
  });
});
