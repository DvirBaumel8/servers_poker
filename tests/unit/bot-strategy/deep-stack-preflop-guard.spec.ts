/**
 * Tests for the deep-stack preflop guard (anti-suicide patch):
 * 1. Preflop all-in is blocked with non-premium hands when stack > 60BB
 * 2. Premium hands (QQ+, AKs) are exempt and may shove freely
 * 3. Guard does not fire below the 60BB threshold (short stacks may shove)
 * 4. Guard fires across all evaluation paths (rules, range chart, personality)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateStrategy,
  clearEvalCache,
  clearHydrationCache,
  type BotPayload,
} from "../../../src/modules/bot-strategy/strategy-engine.service";
import type { BotStrategy } from "../../../src/domain/bot-strategy/strategy.types";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds a preflop payload with a deep stack (100BB = 10000 chips at BB=100). */
function preflopPayload(
  holeCards: string[],
  stackChips: number,
  overrides: Partial<BotPayload> = {},
): BotPayload {
  const bb = 100;
  return {
    gameId: "test-deep-stack-guard",
    handNumber: 1,
    stage: "preflop",
    you: {
      name: "HeroBot",
      chips: stackChips,
      holeCards,
      bet: 0,
      position: "BTN",
      ...overrides.you,
    },
    action: {
      canCheck: false,
      toCall: bb * 2, // facing the big blind open
      minRaise: bb * 2,
      maxRaise: stackChips, // can go all-in
      ...overrides.action,
    },
    table: {
      pot: bb * 3,
      currentBet: bb * 2,
      communityCards: [],
      smallBlind: bb / 2,
      bigBlind: bb,
      ante: 0,
      ...overrides.table,
    },
    players: overrides.players ?? [
      {
        name: "HeroBot",
        chips: stackChips,
        bet: 0,
        folded: false,
        allIn: false,
        position: "BTN",
      },
      {
        name: "Villain",
        chips: stackChips,
        bet: bb * 2,
        folded: false,
        allIn: false,
        position: "BB",
      },
    ],
    decisionSeed:
      overrides.decisionSeed ??
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    tournament: overrides.tournament,
  };
}

/** Strategy with a hard rule that forces all-in preflop. */
function alwaysAllInPreflopStrategy(): BotStrategy {
  return {
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
          id: "always-shove-preflop",
          label: "Always Shove Preflop",
          action: { type: "all_in" },
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Deep-Stack Preflop Guard", () => {
  beforeEach(() => {
    clearEvalCache();
    clearHydrationCache();
  });

  describe("Rule path — always-shove rule", () => {
    it("blocks all-in with non-premium AJo when 100BB deep", () => {
      const strategy = alwaysAllInPreflopStrategy();
      // AJo = offsuit ace-jack → classifyHoleCards → "playable"
      const payload = preflopPayload(["A♠", "J♦"], 10_000); // 100BB

      const result = evaluateStrategy(strategy, payload);

      expect(result.action.type).not.toBe("all_in");
      expect(result.action.type).toBe("call"); // facing a bet → downgrade to call
      expect(result.explanation).toContain("Deep stack preflop guard");
    });

    it("blocks all-in with non-premium AQo when 100BB deep", () => {
      const strategy = alwaysAllInPreflopStrategy();
      // AQo = "strong", not "premium"
      const payload = preflopPayload(["A♣", "Q♦"], 10_000);

      const result = evaluateStrategy(strategy, payload);

      expect(result.action.type).not.toBe("all_in");
      expect(result.explanation).toContain("Deep stack preflop guard");
    });

    it("ALLOWS all-in with QQ (premium pair) when 100BB deep", () => {
      const strategy = alwaysAllInPreflopStrategy();
      // QQ = pair with value >= 12 → "premium"
      const payload = preflopPayload(["Q♠", "Q♥"], 10_000);

      const result = evaluateStrategy(strategy, payload);

      // QQ is premium — guard should not fire
      expect(result.action.type).toBe("all_in");
      expect(result.explanation).not.toContain("Deep stack preflop guard");
    });

    it("ALLOWS all-in with KK when 100BB deep", () => {
      const strategy = alwaysAllInPreflopStrategy();
      const payload = preflopPayload(["K♠", "K♥"], 10_000);

      const result = evaluateStrategy(strategy, payload);

      expect(result.action.type).toBe("all_in");
      expect(result.explanation).not.toContain("Deep stack preflop guard");
    });

    it("ALLOWS all-in with AA when 100BB deep", () => {
      const strategy = alwaysAllInPreflopStrategy();
      const payload = preflopPayload(["A♠", "A♥"], 10_000);

      const result = evaluateStrategy(strategy, payload);

      expect(result.action.type).toBe("all_in");
      expect(result.explanation).not.toContain("Deep stack preflop guard");
    });

    it("ALLOWS all-in with AKs (suited) when 100BB deep", () => {
      const strategy = alwaysAllInPreflopStrategy();
      // AKs → "premium"
      const payload = preflopPayload(["A♠", "K♠"], 10_000);

      const result = evaluateStrategy(strategy, payload);

      expect(result.action.type).toBe("all_in");
      expect(result.explanation).not.toContain("Deep stack preflop guard");
    });

    it("does NOT block all-in with AJo when 30BB deep (short stack)", () => {
      const strategy = alwaysAllInPreflopStrategy();
      // 30BB = 3000 chips at BB=100 → under the 60BB threshold → guard disabled
      const payload = preflopPayload(["A♠", "J♦"], 3_000);

      const result = evaluateStrategy(strategy, payload);

      expect(result.action.type).toBe("all_in");
      expect(result.explanation).not.toContain("Deep stack preflop guard");
    });

    it("does NOT block all-in with AJo at exactly 60BB (boundary — guard off)", () => {
      const strategy = alwaysAllInPreflopStrategy();
      // 60BB = 6000 chips; threshold is strictly > 60, so 60BB should NOT trigger
      const payload = preflopPayload(["A♠", "J♦"], 6_000);

      const result = evaluateStrategy(strategy, payload);

      expect(result.action.type).toBe("all_in");
      expect(result.explanation).not.toContain("Deep stack preflop guard");
    });

    it("does NOT fire on postflop streets", () => {
      // Guard is preflop-only: even with 100BB and a strong hand on the flop, shove is allowed
      const flopStrategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 50,
          bluffFrequency: 20,
          riskTolerance: 50,
          tightness: 50,
        },
        rules: {
          flop: [
            {
              id: "always-shove-flop",
              label: "Always Shove Flop",
              action: { type: "all_in" },
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
      // Use AA on a dry board so equity is high enough that the equity guard doesn't fire
      const payload = preflopPayload(["A♠", "A♥"], 10_000, {
        stage: "flop",
        table: {
          pot: 300,
          currentBet: 100,
          communityCards: ["2♣", "7♥", "9♠"],
          smallBlind: 50,
          bigBlind: 100,
          ante: 0,
        },
        action: {
          canCheck: false,
          toCall: 100,
          minRaise: 200,
          maxRaise: 10_000,
        },
      });

      const result = evaluateStrategy(flopStrategy, payload);

      // Postflop → deep stack preflop guard must NOT fire regardless of action type
      expect(result.explanation).not.toContain("Deep stack preflop guard");
    });

    it("downgrades to check when no bet to face and guard fires", () => {
      // Use a rule with no facingBet condition so it fires even when toCall=0
      const unconditionalShoveStrategy: BotStrategy = {
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
              id: "always-shove-unconditional",
              label: "Always Shove Preflop (No Condition)",
              action: { type: "all_in" },
              priority: 1,
              enabled: true,
              conditions: [], // fires unconditionally
            },
          ],
        },
      };

      // Hero is in the BB, no one has raised — toCall=0, canCheck=true
      const checkPayload = preflopPayload(["A♠", "J♦"], 10_000, {
        action: {
          canCheck: true,
          toCall: 0,
          minRaise: 200,
          maxRaise: 10_000,
        },
        table: {
          pot: 150,
          currentBet: 0,
          communityCards: [],
          smallBlind: 50,
          bigBlind: 100,
          ante: 0,
        },
      });

      const result = evaluateStrategy(unconditionalShoveStrategy, checkPayload);

      // Guard fires: shove blocked → downgrade to check (toCall=0)
      expect(result.action.type).toBe("check");
      expect(result.explanation).toContain("Deep stack preflop guard");
    });
  });

  describe("AKo (strong, not premium) — guard fires", () => {
    it("blocks AKo shove at 100BB", () => {
      const strategy = alwaysAllInPreflopStrategy();
      // AKo = "strong" (not suited, so not "premium")
      const payload = preflopPayload(["A♠", "K♦"], 10_000);

      const result = evaluateStrategy(strategy, payload);

      expect(result.action.type).not.toBe("all_in");
      expect(result.explanation).toContain("Deep stack preflop guard");
    });
  });
});
