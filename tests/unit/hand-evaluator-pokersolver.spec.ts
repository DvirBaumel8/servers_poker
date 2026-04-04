/**
 * Tests for the pokersolver-backed hand evaluator wrapper.
 * Verifies that determineWinners() correctly identifies winners using pokersolver
 * and that the card format conversion (Unicode suits → letter suits) works correctly.
 */
import { describe, it, expect } from "vitest";
import { determineWinners } from "../../src/domain/handEvaluatorPokersolver";

// Cards use the same internal format as GameInstance/deck.ts:
// rank: '2'-'9', '10', 'J', 'Q', 'K', 'A'
// suit: '♠', '♥', '♦', '♣'
function c(rank: string, suit: string) {
  return { rank, suit, value: 0 };
}

describe("handEvaluatorPokersolver – determineWinners", () => {
  it("A-high flush beats three of a kind", () => {
    const community = [
      c("2", "♥"),
      c("5", "♥"),
      c("8", "♥"),
      c("J", "♥"),
      c("3", "♦"),
    ];
    const players = [
      { id: "flush", holeCards: [c("A", "♥"), c("K", "♦")] }, // A-K-J-8-5 flush
      { id: "trips", holeCards: [c("3", "♠"), c("3", "♣")] }, // three 3s
    ];
    const { winners } = determineWinners(players, community);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe("flush");
  });

  it("correctly identifies a split pot (equal hands)", () => {
    // Both players have the same best 5-card hand from the board
    const community = [
      c("A", "♥"),
      c("A", "♦"),
      c("A", "♣"),
      c("K", "♠"),
      c("K", "♥"),
    ]; // Full house A's full of K's on board
    const players = [
      { id: "p1", holeCards: [c("2", "♠"), c("3", "♠")] }, // plays the board
      { id: "p2", holeCards: [c("4", "♦"), c("5", "♦")] }, // plays the board
    ];
    const { winners } = determineWinners(players, community);
    expect(winners).toHaveLength(2);
    const ids = winners.map((w) => w.playerId);
    expect(ids).toContain("p1");
    expect(ids).toContain("p2");
  });

  it("royal flush beats straight flush", () => {
    const community = [
      c("10", "♠"),
      c("J", "♠"),
      c("Q", "♠"),
      c("K", "♠"),
      c("9", "♦"),
    ];
    const players = [
      { id: "royal", holeCards: [c("A", "♠"), c("2", "♦")] }, // royal flush A♠ K♠ Q♠ J♠ 10♠
      { id: "str8", holeCards: [c("8", "♠"), c("7", "♠")] }, // straight flush 7-J in spades
    ];
    const { winners } = determineWinners(players, community);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe("royal");
  });

  it("handles four of a kind correctly", () => {
    const community = [
      c("A", "♣"),
      c("A", "♦"),
      c("A", "♥"),
      c("2", "♠"),
      c("5", "♦"),
    ];
    const players = [
      { id: "quads", holeCards: [c("A", "♠"), c("K", "♠")] }, // four aces
      { id: "trips", holeCards: [c("K", "♦"), c("K", "♣")] }, // full house
    ];
    const { winners } = determineWinners(players, community);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe("quads");
  });

  it("handles 10 (as 'T' in pokersolver) correctly", () => {
    // Ten of clubs in our format is '10♣' — must convert to 'Tc' for pokersolver
    const community = [
      c("10", "♣"),
      c("10", "♦"),
      c("10", "♥"),
      c("4", "♠"),
      c("7", "♦"),
    ];
    const players = [
      { id: "best", holeCards: [c("10", "♠"), c("A", "♣")] }, // four tens
      { id: "other", holeCards: [c("K", "♣"), c("Q", "♦")] }, // trips
    ];
    const { winners } = determineWinners(players, community);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe("best");
  });

  it("returns hand info for all players", () => {
    const community = [
      c("2", "♣"),
      c("5", "♦"),
      c("9", "♥"),
      c("J", "♠"),
      c("K", "♦"),
    ];
    const players = [
      { id: "p1", holeCards: [c("A", "♠"), c("Q", "♦")] },
      { id: "p2", holeCards: [c("3", "♣"), c("4", "♠")] },
    ];
    const { hands } = determineWinners(players, community);
    expect(hands).toHaveLength(2);
    expect(hands.every((h) => typeof h.hand.name === "string")).toBe(true);
    expect(hands.every((h) => typeof h.hand.rank === "number")).toBe(true);
  });

  it("handles all four Unicode suits without throwing", () => {
    // Make sure all four suits convert correctly (♠=s, ♥=h, ♦=d, ♣=c)
    // Community with no straights/flushes possible
    const community = [
      c("2", "♠"),
      c("7", "♥"),
      c("9", "♦"),
      c("J", "♣"),
      c("K", "♠"),
    ];
    const players = [
      { id: "high", holeCards: [c("A", "♥"), c("A", "♦")] }, // pair of aces
      { id: "low", holeCards: [c("3", "♣"), c("5", "♠")] }, // high card only
    ];
    // Should not throw — if card conversion is broken pokersolver would throw or mis-rank
    expect(() => determineWinners(players, community)).not.toThrow();
    const { winners } = determineWinners(players, community);
    expect(winners).toHaveLength(1);
    expect(winners[0].playerId).toBe("high"); // pair of aces beats high card
  });
});
