import { describe, it, expect } from "vitest";
import {
  createDeck,
  shuffle,
  shuffleWithOrder,
  cardToString,
  RANK_VALUES,
} from "../../src/deck";

describe("Deck", () => {
  describe("createDeck", () => {
    it("should create a standard 52-card deck", () => {
      const deck = createDeck();
      expect(deck).toHaveLength(52);
    });

    it("should have 4 suits", () => {
      const deck = createDeck();
      const suits = new Set(deck.map((c) => c.suit));
      expect(suits.size).toBe(4);
      expect(suits).toContain("♠");
      expect(suits).toContain("♥");
      expect(suits).toContain("♦");
      expect(suits).toContain("♣");
    });

    it("should have 13 ranks per suit", () => {
      const deck = createDeck();
      for (const suit of ["♠", "♥", "♦", "♣"]) {
        const cardsOfSuit = deck.filter((c) => c.suit === suit);
        expect(cardsOfSuit).toHaveLength(13);
      }
    });

    it("should have correct values for all cards", () => {
      const deck = createDeck();
      for (const card of deck) {
        expect(card.value).toBe(RANK_VALUES[card.rank]);
        expect(card.value).toBeGreaterThanOrEqual(2);
        expect(card.value).toBeLessThanOrEqual(14);
      }
    });

    it("should have no duplicate cards", () => {
      const deck = createDeck();
      const cardStrings = deck.map((c) => `${c.rank}${c.suit}`);
      const uniqueCards = new Set(cardStrings);
      expect(uniqueCards.size).toBe(52);
    });

    it("should have Aces valued at 14", () => {
      const deck = createDeck();
      const aces = deck.filter((c) => c.rank === "A");
      expect(aces).toHaveLength(4);
      for (const ace of aces) {
        expect(ace.value).toBe(14);
      }
    });
  });

  describe("shuffle", () => {
    it("should return a deck of the same size", () => {
      const deck = createDeck();
      const shuffled = shuffle(deck);
      expect(shuffled).toHaveLength(52);
    });

    it("should not modify the original deck", () => {
      const deck = createDeck();
      const original = [...deck];
      shuffle(deck);
      expect(deck).toEqual(original);
    });

    it("should contain all original cards", () => {
      const deck = createDeck();
      const shuffled = shuffle(deck);
      const originalStrings = deck.map((c) => cardToString(c)).sort();
      const shuffledStrings = shuffled.map((c) => cardToString(c)).sort();
      expect(shuffledStrings).toEqual(originalStrings);
    });

    it("should produce different orderings on successive shuffles", () => {
      const deck = createDeck();
      const shuffles = Array.from({ length: 5 }, () =>
        shuffle(deck).map(cardToString).join(","),
      );
      const unique = new Set(shuffles);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe("shuffleWithOrder", () => {
    it("should shuffle according to provided order", () => {
      const deck = createDeck();
      const order = Array.from({ length: 52 }, (_, i) => 51 - i);
      const shuffled = shuffleWithOrder(deck, order);

      expect(shuffled[0]).toEqual(deck[51]);
      expect(shuffled[51]).toEqual(deck[0]);
    });

    it("should throw if order length does not match deck length", () => {
      const deck = createDeck();
      const shortOrder = [0, 1, 2];
      expect(() => shuffleWithOrder(deck, shortOrder)).toThrow(
        /must match deck length/,
      );
    });

    it("should produce identity shuffle with identity order", () => {
      const deck = createDeck();
      const identityOrder = Array.from({ length: 52 }, (_, i) => i);
      const result = shuffleWithOrder(deck, identityOrder);
      expect(result).toEqual(deck);
    });

    it("should not modify the original deck", () => {
      const deck = createDeck();
      const original = [...deck];
      const order = Array.from({ length: 52 }, (_, i) => 51 - i);
      shuffleWithOrder(deck, order);
      expect(deck).toEqual(original);
    });
  });

  describe("cardToString", () => {
    it("should format card correctly", () => {
      expect(cardToString({ rank: "A", suit: "♠", value: 14 })).toBe("A♠");
      expect(cardToString({ rank: "10", suit: "♥", value: 10 })).toBe("10♥");
      expect(cardToString({ rank: "K", suit: "♦", value: 13 })).toBe("K♦");
    });
  });

  describe("RANK_VALUES", () => {
    it("should have correct values for all ranks", () => {
      expect(RANK_VALUES["2"]).toBe(2);
      expect(RANK_VALUES["10"]).toBe(10);
      expect(RANK_VALUES["J"]).toBe(11);
      expect(RANK_VALUES["Q"]).toBe(12);
      expect(RANK_VALUES["K"]).toBe(13);
      expect(RANK_VALUES["A"]).toBe(14);
    });

    it("should have 13 entries", () => {
      expect(Object.keys(RANK_VALUES)).toHaveLength(13);
    });
  });
});
