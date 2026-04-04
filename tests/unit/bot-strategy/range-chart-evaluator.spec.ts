import { describe, it, expect } from "vitest";
import {
  evaluateRangeChart,
  holeCardsToNotation,
  rangeActionToActionDef,
} from "../../../src/modules/bot-strategy/evaluators/range-chart.evaluator";
import type { RangeChart } from "../../../src/domain/bot-strategy/strategy.types";

function card(value: number, suit: string) {
  return { value, suit };
}

describe("RangeChartEvaluator", () => {
  describe("holeCardsToNotation", () => {
    it("should map pocket aces", () => {
      expect(holeCardsToNotation([card(14, "♠"), card(14, "♥")])).toBe("AA");
    });

    it("should map suited AK", () => {
      expect(holeCardsToNotation([card(14, "♠"), card(13, "♠")])).toBe("AKs");
    });

    it("should map offsuit AK", () => {
      expect(holeCardsToNotation([card(14, "♠"), card(13, "♥")])).toBe("AKo");
    });

    it("should put higher rank first regardless of order", () => {
      expect(holeCardsToNotation([card(13, "♠"), card(14, "♠")])).toBe("AKs");
    });

    it("should map 72o (worst hand)", () => {
      expect(holeCardsToNotation([card(7, "♠"), card(2, "♥")])).toBe("72o");
    });

    it("should map pocket twos", () => {
      expect(holeCardsToNotation([card(2, "♠"), card(2, "♥")])).toBe("22");
    });

    it("should map suited connectors", () => {
      expect(holeCardsToNotation([card(10, "♠"), card(9, "♠")])).toBe("T9s");
    });

    it("should return ?? for invalid input", () => {
      expect(holeCardsToNotation([card(14, "♠")])).toBe("??");
    });
  });

  describe("evaluateRangeChart", () => {
    const chart: RangeChart = {
      AA: "raise",
      AKs: "raise",
      AKo: "call",
      "72o": "fold",
      KQs: null,
    };

    it("should match raise action", () => {
      const result = evaluateRangeChart([card(14, "♠"), card(14, "♥")], chart);
      expect(result.matched).toBe(true);
      expect(result.action).toBe("raise");
      expect(result.handNotation).toBe("AA");
    });

    it("should match call action", () => {
      const result = evaluateRangeChart([card(14, "♠"), card(13, "♥")], chart);
      expect(result.matched).toBe(true);
      expect(result.action).toBe("call");
    });

    it("should match fold action", () => {
      const result = evaluateRangeChart([card(7, "♠"), card(2, "♥")], chart);
      expect(result.matched).toBe(true);
      expect(result.action).toBe("fold");
    });

    it("should not match null action (fallthrough)", () => {
      const result = evaluateRangeChart([card(13, "♠"), card(12, "♠")], chart);
      expect(result.matched).toBe(false);
      expect(result.action).toBeNull();
    });

    it("should not match hand not in chart", () => {
      const result = evaluateRangeChart([card(3, "♠"), card(2, "♥")], chart);
      expect(result.matched).toBe(false);
    });
  });

  describe("rangeActionToActionDef", () => {
    it("should convert raise to action with default sizing", () => {
      const result = rangeActionToActionDef("raise");
      expect(result).toEqual({
        type: "raise",
        sizing: { mode: "bb_multiple", value: 2.5 },
      });
    });

    it("should convert call", () => {
      expect(rangeActionToActionDef("call")).toEqual({ type: "call" });
    });

    it("should convert fold", () => {
      expect(rangeActionToActionDef("fold")).toEqual({ type: "fold" });
    });

    it("should return null for null", () => {
      expect(rangeActionToActionDef(null)).toBeNull();
    });
  });
});
