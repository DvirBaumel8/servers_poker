import { describe, it, expect } from "vitest";
import {
  bestHand,
  determineWinners,
  HAND_RANKS,
} from "../../src/handEvaluator";

interface Card {
  value: number;
  suit: string;
}

const RANK_VALUES: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

function card(rank: string, suit: string): Card {
  return { value: RANK_VALUES[rank], suit };
}

describe("Hand Evaluator", () => {
  describe.concurrent("bestHand", () => {
    describe.concurrent("Royal Flush", () => {
      it("should detect royal flush", () => {
        const holeCards = [card("A", "hearts"), card("K", "hearts")];
        const community = [
          card("Q", "hearts"),
          card("J", "hearts"),
          card("10", "hearts"),
          card("2", "clubs"),
          card("3", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.ROYAL_FLUSH);
        expect(result.name).toBe("ROYAL_FLUSH");
      });
    });

    describe.concurrent("Straight Flush", () => {
      it("should detect straight flush", () => {
        const holeCards = [card("9", "spades"), card("8", "spades")];
        const community = [
          card("7", "spades"),
          card("6", "spades"),
          card("5", "spades"),
          card("2", "clubs"),
          card("3", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.STRAIGHT_FLUSH);
        expect(result.name).toBe("STRAIGHT_FLUSH");
      });

      it("should detect wheel straight flush (A-5)", () => {
        const holeCards = [card("A", "hearts"), card("2", "hearts")];
        const community = [
          card("3", "hearts"),
          card("4", "hearts"),
          card("5", "hearts"),
          card("K", "clubs"),
          card("Q", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.STRAIGHT_FLUSH);
      });
    });

    describe.concurrent("Four of a Kind", () => {
      it("should detect four of a kind", () => {
        const holeCards = [card("A", "hearts"), card("A", "diamonds")];
        const community = [
          card("A", "clubs"),
          card("A", "spades"),
          card("K", "hearts"),
          card("2", "clubs"),
          card("3", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.FOUR_OF_A_KIND);
        expect(result.name).toBe("FOUR_OF_A_KIND");
      });

      it("should use highest kicker with quads", () => {
        const holeCards = [card("2", "hearts"), card("K", "diamonds")];
        const community = [
          card("2", "clubs"),
          card("2", "spades"),
          card("2", "diamonds"),
          card("A", "clubs"),
          card("3", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.FOUR_OF_A_KIND);
        expect(result.cards.some((c) => c.value === 14)).toBe(true);
      });
    });

    describe.concurrent("Full House", () => {
      it("should detect full house", () => {
        const holeCards = [card("K", "hearts"), card("K", "diamonds")];
        const community = [
          card("K", "clubs"),
          card("Q", "spades"),
          card("Q", "hearts"),
          card("2", "clubs"),
          card("3", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.FULL_HOUSE);
        expect(result.name).toBe("FULL_HOUSE");
      });

      it("should choose best full house when multiple possible", () => {
        const holeCards = [card("A", "hearts"), card("A", "diamonds")];
        const community = [
          card("K", "clubs"),
          card("K", "spades"),
          card("K", "hearts"),
          card("A", "clubs"),
          card("Q", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.FULL_HOUSE);
      });
    });

    describe.concurrent("Flush", () => {
      it("should detect flush", () => {
        const holeCards = [card("A", "hearts"), card("9", "hearts")];
        const community = [
          card("6", "hearts"),
          card("3", "hearts"),
          card("2", "hearts"),
          card("K", "clubs"),
          card("Q", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.FLUSH);
        expect(result.name).toBe("FLUSH");
        expect(result.cards.every((c) => c.suit === "hearts")).toBe(true);
      });

      it("should choose highest 5 cards for flush", () => {
        const holeCards = [card("A", "hearts"), card("K", "hearts")];
        const community = [
          card("Q", "hearts"),
          card("J", "hearts"),
          card("9", "hearts"),
          card("2", "hearts"),
          card("3", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.FLUSH);
        expect(result.cards[0].value).toBe(14);
        expect(result.cards[1].value).toBe(13);
      });
    });

    describe.concurrent("Straight", () => {
      it("should detect straight", () => {
        const holeCards = [card("10", "hearts"), card("9", "diamonds")];
        const community = [
          card("8", "clubs"),
          card("7", "spades"),
          card("6", "hearts"),
          card("2", "clubs"),
          card("A", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.STRAIGHT);
        expect(result.name).toBe("STRAIGHT");
      });

      it("should detect wheel straight (A-5)", () => {
        const holeCards = [card("A", "hearts"), card("2", "diamonds")];
        const community = [
          card("3", "clubs"),
          card("4", "spades"),
          card("5", "hearts"),
          card("K", "clubs"),
          card("Q", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.STRAIGHT);
      });

      it("should detect broadway straight (10-A)", () => {
        const holeCards = [card("A", "hearts"), card("K", "diamonds")];
        const community = [
          card("Q", "clubs"),
          card("J", "spades"),
          card("10", "hearts"),
          card("2", "clubs"),
          card("3", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.STRAIGHT);
      });
    });

    describe.concurrent("Three of a Kind", () => {
      it("should detect three of a kind", () => {
        const holeCards = [card("7", "hearts"), card("7", "diamonds")];
        const community = [
          card("7", "clubs"),
          card("K", "spades"),
          card("Q", "hearts"),
          card("2", "clubs"),
          card("3", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.THREE_OF_A_KIND);
        expect(result.name).toBe("THREE_OF_A_KIND");
      });
    });

    describe.concurrent("Two Pair", () => {
      it("should detect two pair", () => {
        const holeCards = [card("K", "hearts"), card("K", "diamonds")];
        const community = [
          card("Q", "clubs"),
          card("Q", "spades"),
          card("2", "hearts"),
          card("3", "clubs"),
          card("4", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.TWO_PAIR);
        expect(result.name).toBe("TWO_PAIR");
      });

      it("should choose best two pair when three pairs available", () => {
        const holeCards = [card("A", "hearts"), card("A", "diamonds")];
        const community = [
          card("K", "clubs"),
          card("K", "spades"),
          card("Q", "hearts"),
          card("Q", "clubs"),
          card("2", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.TWO_PAIR);
      });
    });

    describe.concurrent("One Pair", () => {
      it("should detect one pair", () => {
        const holeCards = [card("A", "hearts"), card("A", "diamonds")];
        const community = [
          card("K", "clubs"),
          card("Q", "spades"),
          card("J", "hearts"),
          card("2", "clubs"),
          card("3", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.ONE_PAIR);
        expect(result.name).toBe("ONE_PAIR");
      });
    });

    describe.concurrent("High Card", () => {
      it("should detect high card", () => {
        const holeCards = [card("A", "hearts"), card("K", "diamonds")];
        const community = [
          card("9", "clubs"),
          card("7", "spades"),
          card("5", "hearts"),
          card("3", "clubs"),
          card("2", "diamonds"),
        ];

        const result = bestHand(holeCards, community);
        expect(result.rank).toBe(HAND_RANKS.HIGH_CARD);
        expect(result.name).toBe("HIGH_CARD");
      });
    });
  });

  describe.concurrent("determineWinners", () => {
    it("should determine single winner correctly", () => {
      const players = [
        { id: "p1", holeCards: [card("A", "hearts"), card("A", "diamonds")] },
        { id: "p2", holeCards: [card("K", "hearts"), card("K", "diamonds")] },
      ];
      const community = [
        card("Q", "clubs"),
        card("J", "spades"),
        card("10", "hearts"),
        card("2", "clubs"),
        card("3", "diamonds"),
      ];

      const { winners } = determineWinners(players, community);

      expect(winners).toHaveLength(1);
      expect(winners[0].playerId).toBe("p1");
    });

    it("should handle split pot correctly", () => {
      const players = [
        { id: "p1", holeCards: [card("A", "hearts"), card("K", "diamonds")] },
        { id: "p2", holeCards: [card("A", "spades"), card("K", "clubs")] },
      ];
      const community = [
        card("Q", "hearts"),
        card("J", "spades"),
        card("10", "diamonds"),
        card("2", "clubs"),
        card("3", "diamonds"),
      ];

      const { winners } = determineWinners(players, community);

      expect(winners).toHaveLength(2);
    });

    it("should use kickers to break ties", () => {
      const players = [
        { id: "p1", holeCards: [card("A", "hearts"), card("K", "diamonds")] },
        { id: "p2", holeCards: [card("A", "spades"), card("Q", "clubs")] },
      ];
      const community = [
        card("A", "clubs"),
        card("9", "spades"),
        card("7", "diamonds"),
        card("5", "clubs"),
        card("3", "diamonds"),
      ];

      const { winners } = determineWinners(players, community);

      expect(winners).toHaveLength(1);
      expect(winners[0].playerId).toBe("p1");
    });
  });
});
