import { describe, it, expect } from "vitest";
import {
  analyzeHand,
  classifyHoleCards,
  parseCardString,
} from "../../../src/modules/bot-strategy/evaluators/hand-analyzer";

describe("HandAnalyzer", () => {
  describe("parseCardString", () => {
    it("should parse single-character rank cards", () => {
      const card = parseCardString("A♠");
      expect(card.rank).toBe("A");
      expect(card.suit).toBe("♠");
      expect(card.value).toBe(14);
    });

    it("should parse 10", () => {
      const card = parseCardString("10♥");
      expect(card.rank).toBe("10");
      expect(card.value).toBe(10);
    });

    it("should parse low cards", () => {
      const card = parseCardString("2♣");
      expect(card.value).toBe(2);
    });
  });

  describe("classifyHoleCards", () => {
    function cards(r1: string, s1: string, r2: string, s2: string) {
      return [parseCardString(`${r1}${s1}`), parseCardString(`${r2}${s2}`)];
    }

    it("should classify AA as premium", () => {
      expect(classifyHoleCards(cards("A", "♠", "A", "♥"))).toBe("premium");
    });

    it("should classify KK as premium", () => {
      expect(classifyHoleCards(cards("K", "♠", "K", "♥"))).toBe("premium");
    });

    it("should classify QQ as premium", () => {
      expect(classifyHoleCards(cards("Q", "♠", "Q", "♥"))).toBe("premium");
    });

    it("should classify AKs as premium", () => {
      expect(classifyHoleCards(cards("A", "♠", "K", "♠"))).toBe("premium");
    });

    it("should classify AKo as strong", () => {
      expect(classifyHoleCards(cards("A", "♠", "K", "♥"))).toBe("strong");
    });

    it("should classify JJ as strong", () => {
      expect(classifyHoleCards(cards("J", "♠", "J", "♥"))).toBe("strong");
    });

    it("should classify TT as strong", () => {
      expect(classifyHoleCards(cards("10", "♠", "10", "♥"))).toBe("strong");
    });

    it("should classify 88 as playable", () => {
      expect(classifyHoleCards(cards("8", "♠", "8", "♥"))).toBe("playable");
    });

    it("should classify 22 as playable", () => {
      expect(classifyHoleCards(cards("2", "♠", "2", "♥"))).toBe("playable");
    });

    it("should classify 72o as weak", () => {
      expect(classifyHoleCards(cards("7", "♠", "2", "♥"))).toBe("weak");
    });

    it("should classify T9s as playable (suited connector)", () => {
      expect(classifyHoleCards(cards("10", "♠", "9", "♠"))).toBe("playable");
    });

    it("should classify AQs as strong", () => {
      expect(classifyHoleCards(cards("A", "♠", "Q", "♠"))).toBe("strong");
    });

    it("should handle cards in either order", () => {
      expect(classifyHoleCards(cards("K", "♠", "A", "♠"))).toBe("premium");
    });
  });

  describe("analyzeHand", () => {
    it("should detect pocket pair preflop", () => {
      const result = analyzeHand(["A♠", "A♥"], []);
      expect(result.handStrength).toBe("pair");
      expect(result.pairType).toBe("pocket_pair");
    });

    it("should detect high card preflop", () => {
      const result = analyzeHand(["A♠", "K♥"], []);
      expect(result.handStrength).toBe("high_card");
      expect(result.pairType).toBeNull();
    });

    it("should use bestHandName when provided", () => {
      const result = analyzeHand(["A♠", "K♥"], ["A♦", "7♣", "2♠"], "ONE_PAIR");
      expect(result.handStrength).toBe("pair");
    });

    it("should detect top pair", () => {
      const result = analyzeHand(["A♠", "K♥"], ["A♦", "7♣", "2♠"], "ONE_PAIR");
      expect(result.pairType).toBe("top_pair");
    });

    it("should detect overpair", () => {
      const result = analyzeHand(["A♠", "A♥"], ["K♦", "7♣", "2♠"], "ONE_PAIR");
      expect(result.pairType).toBe("overpair");
    });

    it("should detect flush draw", () => {
      const result = analyzeHand(["A♠", "K♠"], ["Q♠", "J♠", "2♥"]);
      expect(result.hasFlushDraw).toBe(true);
    });

    it("should not detect flush draw with only 2 suited", () => {
      const result = analyzeHand(["A♠", "K♠"], ["Q♥", "J♦", "2♣"]);
      expect(result.hasFlushDraw).toBe(false);
    });

    it("should detect straight draw", () => {
      const result = analyzeHand(["J♠", "10♥"], ["9♦", "8♣", "2♠"]);
      expect(result.hasStraightDraw).toBe(true);
    });

    it("should classify hole card rank", () => {
      const result = analyzeHand(["A♠", "A♥"], []);
      expect(result.holeCardRank).toBe("premium");
    });
  });
});
