import { describe, it, expect } from "vitest";
import {
  checkFoldedPremium,
  checkCalledAllInWithTrash,
  checkPassiveWithStrong,
  checkOverAggressiveWeak,
  checkPersonalityInconsistency,
  checkMissedRangeChart,
  runAllChecks,
} from "../../../src/modules/bot-strategy/analysis-checks";

function makeDecision(overrides: Record<string, any> = {}) {
  return {
    action_type: "fold",
    action_amount: null,
    decision_source: "personality",
    hand_notation: null as string | null,
    street: "preflop",
    game_context: {
      handStrength: "high_card",
      holeCardRank: "weak",
      pairType: null,
      hasFlushDraw: false,
      hasStraightDraw: false,
      communityCardCount: 0,
      boardTexture: null,
      facingBet: false,
      facingAllIn: false,
      activePlayerCount: 4,
      myStackBB: 50,
      potSizeBB: 3,
      potOdds: 0,
      canCheck: false,
      toCall: 100,
      street: "preflop",
      bigBlind: 100,
      ...overrides.game_context,
    },
    strategy_snapshot: {
      personality: {
        aggression: 50,
        bluffFrequency: 20,
        riskTolerance: 50,
        tightness: 50,
      },
      ...overrides.strategy_snapshot,
    },
    ...overrides,
  };
}

describe("Analysis Checks", () => {
  describe("checkFoldedPremium", () => {
    it("flags folding AA preflop", () => {
      const d = makeDecision({ hand_notation: "AA" });
      const flags = checkFoldedPremium(d);
      expect(flags).toHaveLength(1);
      expect(flags[0].checkId).toBe("folded_premium");
      expect(flags[0].severity).toBe("critical");
    });

    it("flags folding KK preflop", () => {
      const d = makeDecision({ hand_notation: "KK" });
      const flags = checkFoldedPremium(d);
      expect(flags).toHaveLength(1);
      expect(flags[0].checkId).toBe("folded_premium");
    });

    it("flags folding AKs preflop", () => {
      const d = makeDecision({ hand_notation: "AKs" });
      const flags = checkFoldedPremium(d);
      expect(flags).toHaveLength(1);
      expect(flags[0].checkId).toBe("folded_premium");
    });

    it("flags folding JJ preflop (strong, not premium)", () => {
      const d = makeDecision({ hand_notation: "JJ" });
      const flags = checkFoldedPremium(d);
      expect(flags).toHaveLength(1);
      expect(flags[0].checkId).toBe("folded_strong");
      expect(flags[0].severity).toBe("high");
    });

    it("does not flag folding JJ when facing all-in", () => {
      const d = makeDecision({
        hand_notation: "JJ",
        game_context: { facingAllIn: true },
      });
      const flags = checkFoldedPremium(d);
      expect(flags).toHaveLength(0);
    });

    it("does not flag folding weak hands", () => {
      const d = makeDecision({ hand_notation: "72o" });
      const flags = checkFoldedPremium(d);
      expect(flags).toHaveLength(0);
    });

    it("does not flag on post-flop streets", () => {
      const d = makeDecision({ hand_notation: "AA", street: "flop" });
      const flags = checkFoldedPremium(d);
      expect(flags).toHaveLength(0);
    });

    it("does not flag non-fold actions", () => {
      const d = makeDecision({
        hand_notation: "AA",
        action_type: "raise",
      });
      const flags = checkFoldedPremium(d);
      expect(flags).toHaveLength(0);
    });
  });

  describe("checkCalledAllInWithTrash", () => {
    it("flags calling all-in with 72o", () => {
      const d = makeDecision({
        action_type: "call",
        hand_notation: "72o",
        game_context: { facingAllIn: true },
      });
      const flags = checkCalledAllInWithTrash(d);
      expect(flags).toHaveLength(1);
      expect(flags[0].checkId).toBe("called_allin_trash");
      expect(flags[0].severity).toBe("critical");
    });

    it("flags going all-in with 32o when facing all-in", () => {
      const d = makeDecision({
        action_type: "all_in",
        hand_notation: "32o",
        game_context: { facingAllIn: true },
      });
      const flags = checkCalledAllInWithTrash(d);
      expect(flags).toHaveLength(1);
    });

    it("does not flag calling all-in with good hands", () => {
      const d = makeDecision({
        action_type: "call",
        hand_notation: "AA",
        game_context: { facingAllIn: true },
      });
      const flags = checkCalledAllInWithTrash(d);
      expect(flags).toHaveLength(0);
    });

    it("does not flag when not facing all-in", () => {
      const d = makeDecision({
        action_type: "call",
        hand_notation: "72o",
        game_context: { facingAllIn: false },
      });
      const flags = checkCalledAllInWithTrash(d);
      expect(flags).toHaveLength(0);
    });
  });

  describe("checkPassiveWithStrong", () => {
    it("flags checking with trips on flop", () => {
      const d = makeDecision({
        action_type: "check",
        street: "flop",
        game_context: { handStrength: "trips" },
      });
      const flags = checkPassiveWithStrong(d);
      expect(flags).toHaveLength(1);
      expect(flags[0].checkId).toBe("passive_strong_hand");
      expect(flags[0].severity).toBe("medium");
    });

    it("flags calling with full house on river", () => {
      const d = makeDecision({
        action_type: "call",
        street: "river",
        game_context: { handStrength: "full_house" },
      });
      const flags = checkPassiveWithStrong(d);
      expect(flags).toHaveLength(1);
    });

    it("does not flag raising with strong hands", () => {
      const d = makeDecision({
        action_type: "raise",
        street: "flop",
        game_context: { handStrength: "trips" },
      });
      const flags = checkPassiveWithStrong(d);
      expect(flags).toHaveLength(0);
    });

    it("does not flag checking with weak hands", () => {
      const d = makeDecision({
        action_type: "check",
        street: "flop",
        game_context: { handStrength: "high_card" },
      });
      const flags = checkPassiveWithStrong(d);
      expect(flags).toHaveLength(0);
    });

    it("does not flag preflop actions", () => {
      const d = makeDecision({
        action_type: "check",
        street: "preflop",
        game_context: { handStrength: "trips" },
      });
      const flags = checkPassiveWithStrong(d);
      expect(flags).toHaveLength(0);
    });
  });

  describe("checkOverAggressiveWeak", () => {
    it("flags large raise with high card on flop", () => {
      const d = makeDecision({
        action_type: "raise",
        action_amount: 1000,
        street: "flop",
        game_context: {
          handStrength: "high_card",
          bigBlind: 100,
        },
        strategy_snapshot: {
          personality: { bluffFrequency: 10 },
        },
      });
      const flags = checkOverAggressiveWeak(d);
      expect(flags).toHaveLength(1);
      expect(flags[0].checkId).toBe("overaggressive_weak");
    });

    it("does not flag if bluff frequency is high", () => {
      const d = makeDecision({
        action_type: "raise",
        action_amount: 1000,
        street: "flop",
        game_context: {
          handStrength: "high_card",
          bigBlind: 100,
        },
        strategy_snapshot: {
          personality: { bluffFrequency: 70 },
        },
      });
      const flags = checkOverAggressiveWeak(d);
      expect(flags).toHaveLength(0);
    });

    it("does not flag small raises", () => {
      const d = makeDecision({
        action_type: "raise",
        action_amount: 200,
        street: "flop",
        game_context: {
          handStrength: "high_card",
          bigBlind: 100,
        },
      });
      const flags = checkOverAggressiveWeak(d);
      expect(flags).toHaveLength(0);
    });

    it("does not flag preflop raises", () => {
      const d = makeDecision({
        action_type: "raise",
        action_amount: 1000,
        street: "preflop",
        game_context: { handStrength: "high_card", bigBlind: 100 },
      });
      const flags = checkOverAggressiveWeak(d);
      expect(flags).toHaveLength(0);
    });
  });

  describe("checkPersonalityInconsistency", () => {
    it("flags fold with high aggression", () => {
      const d = makeDecision({
        action_type: "fold",
        decision_source: "personality",
        strategy_snapshot: {
          personality: { aggression: 80 },
        },
      });
      const flags = checkPersonalityInconsistency(d);
      expect(flags).toHaveLength(1);
      expect(flags[0].checkId).toBe("personality_inconsistent_passive");
    });

    it("does not flag if decision was not from personality", () => {
      const d = makeDecision({
        action_type: "fold",
        decision_source: "rule",
        strategy_snapshot: {
          personality: { aggression: 80 },
        },
      });
      const flags = checkPersonalityInconsistency(d);
      expect(flags).toHaveLength(0);
    });

    it("flags raise with low aggression", () => {
      const d = makeDecision({
        action_type: "raise",
        decision_source: "personality",
        strategy_snapshot: {
          personality: { aggression: 20 },
        },
      });
      const flags = checkPersonalityInconsistency(d);
      expect(flags).toHaveLength(1);
      expect(flags[0].checkId).toBe("personality_inconsistent_aggressive");
    });

    it("does not flag check when canCheck is true", () => {
      const d = makeDecision({
        action_type: "check",
        decision_source: "personality",
        game_context: { canCheck: true },
        strategy_snapshot: {
          personality: { aggression: 80 },
        },
      });
      const flags = checkPersonalityInconsistency(d);
      expect(flags).toHaveLength(0);
    });
  });

  describe("checkMissedRangeChart", () => {
    it("flags when hand is in chart but personality was used", () => {
      const d = makeDecision({
        hand_notation: "AKs",
        decision_source: "personality",
        action_type: "fold",
        strategy_snapshot: {
          rangeChart: { AKs: "raise" },
        },
      });
      const flags = checkMissedRangeChart(d);
      expect(flags).toHaveLength(1);
      expect(flags[0].checkId).toBe("missed_range_chart");
    });

    it("does not flag when range chart action matches", () => {
      const d = makeDecision({
        hand_notation: "AKs",
        decision_source: "personality",
        action_type: "raise",
        strategy_snapshot: {
          rangeChart: { AKs: "raise" },
        },
      });
      const flags = checkMissedRangeChart(d);
      expect(flags).toHaveLength(0);
    });

    it("does not flag when hand is not in chart", () => {
      const d = makeDecision({
        hand_notation: "72o",
        decision_source: "personality",
        strategy_snapshot: {
          rangeChart: { AKs: "raise" },
        },
      });
      const flags = checkMissedRangeChart(d);
      expect(flags).toHaveLength(0);
    });

    it("does not flag post-flop decisions", () => {
      const d = makeDecision({
        hand_notation: "AKs",
        street: "flop",
        decision_source: "personality",
        strategy_snapshot: {
          rangeChart: { AKs: "raise" },
        },
      });
      const flags = checkMissedRangeChart(d);
      expect(flags).toHaveLength(0);
    });

    it("does not flag when range chart was actually used", () => {
      const d = makeDecision({
        hand_notation: "AKs",
        decision_source: "range_chart",
        strategy_snapshot: {
          rangeChart: { AKs: "raise" },
        },
      });
      const flags = checkMissedRangeChart(d);
      expect(flags).toHaveLength(0);
    });
  });

  describe("runAllChecks", () => {
    it("returns empty for a normal fold with weak hand", () => {
      const d = makeDecision({ hand_notation: "72o" });
      const flags = runAllChecks(d);
      expect(flags).toHaveLength(0);
    });

    it("returns multiple flags for a bad decision", () => {
      const d = makeDecision({
        action_type: "fold",
        hand_notation: "AA",
        decision_source: "personality",
        strategy_snapshot: {
          personality: { aggression: 80 },
          rangeChart: { AA: "raise" },
        },
      });
      const flags = runAllChecks(d);
      expect(flags.length).toBeGreaterThanOrEqual(2);
      const checkIds = flags.map((f) => f.checkId);
      expect(checkIds).toContain("folded_premium");
      expect(checkIds).toContain("missed_range_chart");
    });
  });
});
