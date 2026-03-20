import { describe, it, expect } from "vitest";
import {
  bestHand,
  determineWinners,
  compareHands,
  HAND_RANKS,
} from "../../src/handEvaluator";

function card(rank: string, suit: string) {
  const values: Record<string, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
    "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
  };
  return { rank, suit, value: values[rank] };
}

describe("Hand Evaluator - Advanced Edge Cases", () => {
  describe("straight edge cases", () => {
    it("should detect A-2-3-4-5 low straight (wheel)", () => {
      const hole = [card("A", "♠"), card("2", "♥")];
      const community = [
        card("3", "♦"), card("4", "♣"), card("5", "♠"),
        card("9", "♥"), card("K", "♦"),
      ];
      const result = bestHand(hole, community);
      expect(result.name).toBe("STRAIGHT");
    });

    it("should detect 10-J-Q-K-A high straight", () => {
      const hole = [card("A", "♠"), card("K", "♥")];
      const community = [
        card("Q", "♦"), card("J", "♣"), card("10", "♠"),
        card("2", "♥"), card("3", "♦"),
      ];
      const result = bestHand(hole, community);
      expect(result.name).toBe("STRAIGHT");
    });

    it("should not detect wrap-around straight (Q-K-A-2-3)", () => {
      const hole = [card("Q", "♠"), card("K", "♥")];
      const community = [
        card("A", "♦"), card("2", "♣"), card("3", "♠"),
        card("8", "♥"), card("9", "♦"),
      ];
      const result = bestHand(hole, community);
      expect(result.name).not.toBe("STRAIGHT");
    });
  });

  describe("flush edge cases", () => {
    it("should pick the best 5 cards from 6+ suited cards", () => {
      const hole = [card("A", "♠"), card("K", "♠")];
      const community = [
        card("Q", "♠"), card("J", "♠"), card("10", "♠"),
        card("9", "♠"), card("2", "♥"),
      ];
      const result = bestHand(hole, community);
      expect(result.name).toBe("ROYAL_FLUSH");
    });

    it("should detect flush with 5 suited cards", () => {
      const hole = [card("2", "♠"), card("5", "♠")];
      const community = [
        card("7", "♠"), card("9", "♠"), card("J", "♠"),
        card("K", "♥"), card("A", "♥"),
      ];
      const result = bestHand(hole, community);
      expect(result.name).toBe("FLUSH");
    });
  });

  describe("full house vs three of a kind", () => {
    it("should detect full house over trips", () => {
      const hole = [card("A", "♠"), card("A", "♥")];
      const community = [
        card("A", "♦"), card("K", "♠"), card("K", "♥"),
        card("2", "♣"), card("3", "♦"),
      ];
      const result = bestHand(hole, community);
      expect(result.name).toBe("FULL_HOUSE");
    });

    it("should detect trips when no pair on board", () => {
      const hole = [card("A", "♠"), card("A", "♥")];
      const community = [
        card("A", "♦"), card("K", "♠"), card("Q", "♥"),
        card("2", "♣"), card("3", "♦"),
      ];
      const result = bestHand(hole, community);
      expect(result.name).toBe("THREE_OF_A_KIND");
    });
  });

  describe("two pair edge cases", () => {
    it("should detect two pair on board + one in hand", () => {
      const hole = [card("A", "♠"), card("7", "♥")];
      const community = [
        card("A", "♦"), card("K", "♠"), card("K", "♥"),
        card("2", "♣"), card("3", "♦"),
      ];
      const result = bestHand(hole, community);
      expect(result.name).toBe("TWO_PAIR");
    });
  });

  describe("winner determination", () => {
    it("should resolve higher flush over lower flush", () => {
      const community = [
        card("2", "♠"), card("5", "♠"), card("8", "♠"),
        card("J", "♥"), card("3", "♦"),
      ];
      const players = [
        { id: "p1", holeCards: [card("A", "♠"), card("K", "♠")] },
        { id: "p2", holeCards: [card("Q", "♠"), card("10", "♠")] },
      ];
      const result = determineWinners(players, community);
      expect(result.winners).toHaveLength(1);
      expect(result.winners[0].playerId).toBe("p1");
    });

    it("should resolve higher pair kicker", () => {
      const community = [
        card("A", "♠"), card("A", "♥"), card("5", "♦"),
        card("8", "♣"), card("2", "♠"),
      ];
      const players = [
        { id: "p1", holeCards: [card("K", "♠"), card("3", "♥")] },
        { id: "p2", holeCards: [card("Q", "♠"), card("3", "♦")] },
      ];
      const result = determineWinners(players, community);
      expect(result.winners).toHaveLength(1);
      expect(result.winners[0].playerId).toBe("p1");
    });

    it("should handle 3-way tie correctly", () => {
      const community = [
        card("A", "♠"), card("K", "♠"), card("Q", "♠"),
        card("J", "♠"), card("10", "♠"),
      ];
      const players = [
        { id: "p1", holeCards: [card("2", "♥"), card("3", "♥")] },
        { id: "p2", holeCards: [card("4", "♥"), card("5", "♥")] },
        { id: "p3", holeCards: [card("6", "♥"), card("7", "♥")] },
      ];
      const result = determineWinners(players, community);
      expect(result.winners).toHaveLength(3);
    });

    it("should correctly rank full house over flush", () => {
      const community = [
        card("A", "♠"), card("A", "♥"), card("K", "♠"),
        card("Q", "♠"), card("J", "♠"),
      ];
      const players = [
        { id: "fullhouse", holeCards: [card("A", "♦"), card("K", "♥")] },
        { id: "flush", holeCards: [card("9", "♠"), card("2", "♦")] },
      ];
      const result = determineWinners(players, community);
      expect(result.winners).toHaveLength(1);
      expect(result.winners[0].playerId).toBe("fullhouse");
    });
  });

  describe("compareHands", () => {
    it("should rank higher hands above lower hands", () => {
      const flush = { rank: HAND_RANKS.FLUSH, tiebreakers: [14, 13, 12, 11, 9], name: "FLUSH" };
      const straight = { rank: HAND_RANKS.STRAIGHT, tiebreakers: [14], name: "STRAIGHT" };
      expect(compareHands(flush, straight)).toBeGreaterThan(0);
    });

    it("should resolve ties by tiebreakers", () => {
      const highPair = { rank: HAND_RANKS.ONE_PAIR, tiebreakers: [14, 13, 12, 11], name: "ONE_PAIR" };
      const lowPair = { rank: HAND_RANKS.ONE_PAIR, tiebreakers: [13, 14, 12, 11], name: "ONE_PAIR" };
      expect(compareHands(highPair, lowPair)).toBeGreaterThan(0);
    });

    it("should return 0 for identical hands", () => {
      const hand = { rank: HAND_RANKS.ONE_PAIR, tiebreakers: [14, 13, 12, 11], name: "ONE_PAIR" };
      expect(compareHands(hand, hand)).toBe(0);
    });
  });
});
