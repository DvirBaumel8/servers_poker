import { describe, it, expect } from "vitest";
import {
  cardToInt,
  eval5ints,
  bestOf7ints,
  holecardRangeIndex,
  cardRank,
  cardSuit,
} from "../../src/domain/fastHandEval";

// ─── cardToInt ───────────────────────────────────────────────────────────────

describe("cardToInt", () => {
  it("parses A♠ as rank 12 suit 0 → 48", () => {
    expect(cardToInt("A♠")).toBe(12 * 4 + 0);
  });
  it("parses 2♣ as rank 0 suit 3 → 3", () => {
    expect(cardToInt("2♣")).toBe(0 * 4 + 3);
  });
  it("parses 10♥ as rank 8 suit 1 → 33", () => {
    expect(cardToInt("10♥")).toBe(8 * 4 + 1);
  });
  it("parses K♦ correctly", () => {
    const k = cardToInt("K♦");
    expect(cardRank(k)).toBe(11);
    expect(cardSuit(k)).toBe(2);
  });
  it("returns -1 for unknown cards", () => {
    expect(cardToInt("X♠")).toBe(-1);
  });
});

// ─── eval5ints hand rankings ─────────────────────────────────────────────────

function cards(...strs: string[]): number[] {
  return strs.map(cardToInt);
}

function e5(...strs: string[]): number {
  const c = cards(...strs);
  return eval5ints(c[0], c[1], c[2], c[3], c[4]);
}

describe("eval5ints — hand category ordering", () => {
  const royalFlush = e5("A♠", "K♠", "Q♠", "J♠", "10♠");
  const straightFlush = e5("9♥", "8♥", "7♥", "6♥", "5♥");
  const quads = e5("A♠", "A♥", "A♦", "A♣", "K♠");
  const fullHouse = e5("K♠", "K♥", "K♦", "Q♠", "Q♥");
  const flush = e5("A♠", "J♠", "8♠", "5♠", "3♠");
  const straight = e5("9♠", "8♥", "7♦", "6♣", "5♠");
  const trips = e5("Q♠", "Q♥", "Q♦", "9♠", "7♥");
  const twoPair = e5("J♠", "J♥", "8♦", "8♣", "A♠");
  const onePair = e5("A♠", "A♥", "K♦", "Q♣", "J♠");
  const highCard = e5("A♠", "K♥", "Q♦", "J♣", "9♠");

  it("royal flush > straight flush", () =>
    expect(royalFlush).toBeGreaterThan(straightFlush));
  it("straight flush > quads", () =>
    expect(straightFlush).toBeGreaterThan(quads));
  it("quads > full house", () => expect(quads).toBeGreaterThan(fullHouse));
  it("full house > flush", () => expect(fullHouse).toBeGreaterThan(flush));
  it("flush > straight", () => expect(flush).toBeGreaterThan(straight));
  it("straight > trips", () => expect(straight).toBeGreaterThan(trips));
  it("trips > two pair", () => expect(trips).toBeGreaterThan(twoPair));
  it("two pair > one pair", () => expect(twoPair).toBeGreaterThan(onePair));
  it("one pair > high card", () => expect(onePair).toBeGreaterThan(highCard));
});

describe("eval5ints — tiebreakers", () => {
  it("higher pair wins", () => {
    const aces = e5("A♠", "A♥", "K♦", "Q♣", "J♠");
    const kings = e5("K♠", "K♥", "A♦", "Q♣", "J♠");
    expect(aces).toBeGreaterThan(kings);
  });

  it("same hand rank + tiebreaker → equal score (tie)", () => {
    const hand1 = e5("A♠", "K♥", "Q♦", "J♣", "9♠");
    const hand2 = e5("A♥", "K♠", "Q♣", "J♦", "9♥");
    expect(hand1).toBe(hand2);
  });

  it("higher kicker wins one-pair tie", () => {
    const withAceKicker = e5("K♠", "K♥", "A♦", "Q♣", "J♠");
    const withQueenKicker = e5("K♠", "K♥", "Q♦", "J♣", "9♠");
    expect(withAceKicker).toBeGreaterThan(withQueenKicker);
  });
});

describe("eval5ints — edge cases", () => {
  it("ace-low straight (A-2-3-4-5) is a straight, not high card", () => {
    const aceLow = e5("A♠", "2♥", "3♦", "4♣", "5♠");
    const highCard = e5("A♠", "K♥", "Q♦", "J♣", "9♠");
    expect(aceLow).toBeGreaterThan(highCard); // straight > high card
  });

  it("ace-low straight loses to 6-high straight", () => {
    const aceLow = e5("A♠", "2♥", "3♦", "4♣", "5♠"); // high=5
    const sixHigh = e5("2♠", "3♥", "4♦", "5♣", "6♠"); // high=6
    expect(sixHigh).toBeGreaterThan(aceLow);
  });

  it("broadway (A-K-Q-J-T) straight is correctly ranked as straight (not flush)", () => {
    // Mixed suits → straight only
    const broadway = e5("A♠", "K♥", "Q♦", "J♣", "10♠");
    const flush = e5("A♠", "J♠", "8♠", "5♠", "3♠");
    expect(flush).toBeGreaterThan(broadway); // flush > straight
  });
});

// ─── bestOf7ints ──────────────────────────────────────────────────────────────

describe("bestOf7ints", () => {
  it("finds a flush from 7 cards where only 5 are suited", () => {
    // 5 spades + 2 off-suit cards of different ranks
    const c = cards("A♠", "K♠", "Q♠", "J♠", "9♠", "2♥", "3♦");
    const flushScore = e5("A♠", "K♠", "Q♠", "J♠", "9♠");
    expect(bestOf7ints(c)).toBe(flushScore);
  });

  it("picks the best possible hand from 7 cards", () => {
    // Board: K♠ K♥ A♠ A♦ Q♠  Hero: K♦ K♣ → four kings
    const c = cards("K♦", "K♣", "K♠", "K♥", "A♠", "A♦", "Q♠");
    const quadsScore = e5("K♦", "K♣", "K♠", "K♥", "A♠");
    expect(bestOf7ints(c)).toBe(quadsScore);
  });

  it("prefers full house over two-pair when both possible", () => {
    // 3×K + 2×A + 2×Q  →  best is KKK AA (full house) not KK AA QQ (impossible, only 2 queens here)
    // Actually: K♠ K♥ K♦ A♠ A♥ Q♠ Q♥ → best 5: KKK AA
    const c = cards("K♠", "K♥", "K♦", "A♠", "A♥", "Q♠", "Q♥");
    const fhScore = e5("K♠", "K♥", "K♦", "A♠", "A♥");
    expect(bestOf7ints(c)).toBe(fhScore);
  });
});

// ─── holecardRangeIndex ───────────────────────────────────────────────────────

describe("holecardRangeIndex", () => {
  it("pocket aces → index 12 (highest pair)", () => {
    const c1 = cardToInt("A♠");
    const c2 = cardToInt("A♥");
    expect(holecardRangeIndex(c1, c2)).toBe(12);
  });

  it("pocket twos → index 0 (lowest pair)", () => {
    const c1 = cardToInt("2♠");
    const c2 = cardToInt("2♥");
    expect(holecardRangeIndex(c1, c2)).toBe(0);
  });

  it("suited connectors → index in [13, 90]", () => {
    const c1 = cardToInt("A♠");
    const c2 = cardToInt("K♠");
    const idx = holecardRangeIndex(c1, c2);
    expect(idx).toBeGreaterThanOrEqual(13);
    expect(idx).toBeLessThanOrEqual(90);
  });

  it("offsuit hand → index in [91, 168]", () => {
    const c1 = cardToInt("A♠");
    const c2 = cardToInt("K♥");
    const idx = holecardRangeIndex(c1, c2);
    expect(idx).toBeGreaterThanOrEqual(91);
    expect(idx).toBeLessThanOrEqual(168);
  });

  it("order of cards does not affect result", () => {
    const c1 = cardToInt("A♠");
    const c2 = cardToInt("K♥");
    expect(holecardRangeIndex(c1, c2)).toBe(holecardRangeIndex(c2, c1));
  });
});
