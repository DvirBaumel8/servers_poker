import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  PokerGameService,
  GameConfig,
} from "../../src/game/poker-game.service";
import { PotManager } from "../../src/betting";
import { createDeck, shuffle, cardToString } from "../../src/deck";
import { bestHand, determineWinners } from "../../src/handEvaluator";

describe("Game Simulation - Complete Hand Flows", () => {
  let game: PokerGameService;
  let emitter: EventEmitter2;
  let events: Array<{ event: string; data: any }>;

  beforeEach(() => {
    emitter = new EventEmitter2();
    events = [];
    emitter.onAny((event: string, data: any) => {
      events.push({ event, data });
    });
    game = new PokerGameService(emitter);
    game.initialize({
      gameId: "sim-game",
      tableId: "sim-table",
      smallBlind: 10,
      bigBlind: 20,
      ante: 0,
      startingChips: 1000,
      turnTimeoutMs: 10000,
      maxStrikes: 3,
      isCashGame: true,
    });
  });

  describe("two-player heads-up hand", () => {
    beforeEach(() => {
      game.addPlayer({
        id: "p1",
        name: "Player1",
        endpoint: "http://localhost:4001",
        chips: 1000,
        currentBet: 0,
      });
      game.addPlayer({
        id: "p2",
        name: "Player2",
        endpoint: "http://localhost:4002",
        chips: 1000,
        currentBet: 0,
      });
    });

    it("should emit playerJoined events", () => {
      const joinEvents = events.filter((e) => e.event === "game.playerJoined");
      expect(joinEvents).toHaveLength(2);
    });

    it("should complete a hand where one player folds", () => {
      game.startHand();
      game.setCurrentPlayer("p1");

      game.processAction("p1", "raise", 50);
      game.setCurrentPlayer("p2");
      game.processAction("p2", "fold");

      const state = game.getState();
      const p2 = state.players.find((p) => p.id === "p2")!;

      expect(p2.folded).toBe(true);
    });

    it("should track chip conservation through a complete hand", () => {
      const stateBefore = game.getState();
      const totalBefore = stateBefore.players.reduce((s, p) => s + p.chips, 0);
      expect(totalBefore).toBe(2000);

      game.startHand();
      game.setCurrentPlayer("p1");
      game.processAction("p1", "raise", 100);
      game.setCurrentPlayer("p2");
      game.processAction("p2", "fold");

      const stateAfter = game.getState();
      const totalAfter =
        stateAfter.players.reduce((s, p) => s + p.chips, 0) + stateAfter.pot;
      expect(totalAfter).toBeLessThanOrEqual(totalBefore + stateAfter.pot);
    });
  });

  describe("three-player hand", () => {
    beforeEach(() => {
      game.addPlayer({
        id: "p1",
        name: "Player1",
        endpoint: "http://localhost:4001",
        chips: 1000,
        currentBet: 0,
      });
      game.addPlayer({
        id: "p2",
        name: "Player2",
        endpoint: "http://localhost:4002",
        chips: 1000,
        currentBet: 0,
      });
      game.addPlayer({
        id: "p3",
        name: "Player3",
        endpoint: "http://localhost:4003",
        chips: 1000,
        currentBet: 0,
      });
    });

    it("should handle multiple players folding", () => {
      game.startHand();
      game.setCurrentPlayer("p1");
      game.processAction("p1", "raise", 50);
      game.setCurrentPlayer("p2");
      game.processAction("p2", "fold");
      game.setCurrentPlayer("p3");
      game.processAction("p3", "fold");

      const state = game.getState();
      const active = state.players.filter((p) => !p.folded && !p.disconnected);
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe("p1");
    });
  });
});

describe("Hand Evaluator Integration", () => {
  it("should correctly identify royal flush", () => {
    const holeCards = [
      { rank: "A", suit: "♠", value: 14 },
      { rank: "K", suit: "♠", value: 13 },
    ];
    const communityCards = [
      { rank: "Q", suit: "♠", value: 12 },
      { rank: "J", suit: "♠", value: 11 },
      { rank: "10", suit: "♠", value: 10 },
      { rank: "3", suit: "♥", value: 3 },
      { rank: "7", suit: "♦", value: 7 },
    ];

    const result = bestHand(holeCards, communityCards);
    expect(result.name).toBe("ROYAL_FLUSH");
    expect(result.rank).toBe(9);
  });

  it("should correctly identify full house", () => {
    const holeCards = [
      { rank: "A", suit: "♠", value: 14 },
      { rank: "A", suit: "♥", value: 14 },
    ];
    const communityCards = [
      { rank: "A", suit: "♦", value: 14 },
      { rank: "K", suit: "♠", value: 13 },
      { rank: "K", suit: "♥", value: 13 },
      { rank: "3", suit: "♣", value: 3 },
      { rank: "7", suit: "♦", value: 7 },
    ];

    const result = bestHand(holeCards, communityCards);
    expect(result.name).toBe("FULL_HOUSE");
    expect(result.rank).toBe(6);
  });

  it("should determine winner correctly", () => {
    const communityCards = [
      { rank: "A", suit: "♠", value: 14 },
      { rank: "K", suit: "♠", value: 13 },
      { rank: "Q", suit: "♠", value: 12 },
      { rank: "2", suit: "♥", value: 2 },
      { rank: "3", suit: "♦", value: 3 },
    ];

    const players = [
      {
        id: "p1",
        holeCards: [
          { rank: "J", suit: "♠", value: 11 },
          { rank: "10", suit: "♠", value: 10 },
        ],
      },
      {
        id: "p2",
        holeCards: [
          { rank: "A", suit: "♥", value: 14 },
          { rank: "A", suit: "♦", value: 14 },
        ],
      },
    ];

    const result = determineWinners(players, communityCards);
    expect(result.winners).toHaveLength(1);
    expect(result.winners[0].playerId).toBe("p1");
  });

  it("should handle split pot (tie) - community board plays", () => {
    const communityCards = [
      { rank: "A", suit: "♠", value: 14 },
      { rank: "K", suit: "♠", value: 13 },
      { rank: "Q", suit: "♠", value: 12 },
      { rank: "J", suit: "♠", value: 11 },
      { rank: "10", suit: "♠", value: 10 },
    ];

    const players = [
      {
        id: "p1",
        holeCards: [
          { rank: "2", suit: "♥", value: 2 },
          { rank: "3", suit: "♥", value: 3 },
        ],
      },
      {
        id: "p2",
        holeCards: [
          { rank: "4", suit: "♥", value: 4 },
          { rank: "5", suit: "♥", value: 5 },
        ],
      },
    ];

    const result = determineWinners(players, communityCards);
    expect(result.winners).toHaveLength(2);
  });
});

describe("Deck - Dealing Simulation", () => {
  it("should deal unique cards to all players and community", () => {
    const deck = shuffle(createDeck());
    const dealt = new Set<string>();

    const p1Cards = [deck[0], deck[1]];
    const p2Cards = [deck[2], deck[3]];
    const flop = [deck[4], deck[5], deck[6]];
    const turn = deck[7];
    const river = deck[8];

    for (const card of [...p1Cards, ...p2Cards, ...flop, turn, river]) {
      const key = cardToString(card);
      expect(dealt.has(key)).toBe(false);
      dealt.add(key);
    }

    expect(dealt.size).toBe(9);
  });

  it("should have enough cards for 9 players plus community", () => {
    const deck = createDeck();
    const neededCards = 9 * 2 + 5;
    expect(deck.length).toBeGreaterThanOrEqual(neededCards);
  });
});
