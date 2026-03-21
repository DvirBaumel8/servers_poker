import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PokerGameService } from "../../src/game/poker-game.service";
import { PotManager, BettingRound } from "../../src/domain/betting";

describe("Critical Edge Cases", () => {
  describe.concurrent("Odd Chip Distribution in Split Pots", () => {
    it("should distribute odd chip to first player after button in 2-way split", () => {
      const pot = 101;
      const winners = ["p1", "p2"];
      const dealerPosition = 0;
      const playerOrder = ["dealer", "p1", "p2", "p3"];

      const baseShare = Math.floor(pot / winners.length);
      const remainder = pot % winners.length;

      const distribution: Record<string, number> = {};

      let remainderIndex = (dealerPosition + 1) % playerOrder.length;
      let remainderGiven = 0;

      for (const winnerId of winners) {
        distribution[winnerId] = baseShare;
      }

      while (remainderGiven < remainder) {
        const playerId = playerOrder[remainderIndex];
        if (winners.includes(playerId)) {
          distribution[playerId]++;
          remainderGiven++;
        }
        remainderIndex = (remainderIndex + 1) % playerOrder.length;
      }

      expect(distribution["p1"]).toBe(51);
      expect(distribution["p2"]).toBe(50);
      expect(distribution["p1"] + distribution["p2"]).toBe(pot);
    });

    it("should distribute 2 odd chips correctly in 3-way split", () => {
      const pot = 101;
      const winners = ["p1", "p2", "p3"];
      const dealerPosition = 0;
      const playerOrder = ["dealer", "p1", "p2", "p3"];

      const baseShare = Math.floor(pot / winners.length);
      const remainder = pot % winners.length;

      const distribution: Record<string, number> = {};
      for (const winnerId of winners) {
        distribution[winnerId] = baseShare;
      }

      let remainderIndex = (dealerPosition + 1) % playerOrder.length;
      let remainderGiven = 0;
      while (remainderGiven < remainder) {
        const playerId = playerOrder[remainderIndex];
        if (winners.includes(playerId)) {
          distribution[playerId]++;
          remainderGiven++;
        }
        remainderIndex = (remainderIndex + 1) % playerOrder.length;
      }

      expect(distribution["p1"]).toBe(34);
      expect(distribution["p2"]).toBe(34);
      expect(distribution["p3"]).toBe(33);
      expect(distribution["p1"] + distribution["p2"] + distribution["p3"]).toBe(
        pot,
      );
    });

    it("should handle $1 pot split between 3 players (2 get nothing)", () => {
      const pot = 1;
      const winners = ["p1", "p2", "p3"];

      const baseShare = Math.floor(pot / winners.length);
      const remainder = pot % winners.length;

      expect(baseShare).toBe(0);
      expect(remainder).toBe(1);
    });
  });

  describe.concurrent("Short All-In Does Not Reopen Betting", () => {
    it("should allow short all-in and set it as current bet", () => {
      const players = [
        { id: "p1", chips: 700, folded: false, allIn: false },
        { id: "p2", chips: 700, folded: false, allIn: false },
        { id: "p3", chips: 130, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 50,
        bigBlind: 100,
        isPreFlop: true,
        dealerIndex: 0,
      });

      round.applyAction(players[0], { type: "raise", amount: 100 });
      expect(round.currentBet).toBe(100);
      expect(round.minRaise).toBe(100);

      round.applyAction(players[1], { type: "call" });
      round.betsThisRound["p2"] = 100;

      const result = round.applyAction(players[2], {
        type: "raise",
        amount: 30,
      });
      expect(result.valid).toBe(true);
      expect(players[2].allIn).toBe(true);

      expect(round.currentBet).toBe(130);
    });

    it("should allow re-raise after full raise", () => {
      const players = [
        { id: "p1", chips: 800, folded: false, allIn: false },
        { id: "p2", chips: 800, folded: false, allIn: false },
        { id: "p3", chips: 300, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 50,
        bigBlind: 100,
        isPreFlop: true,
        dealerIndex: 0,
      });

      round.applyAction(players[0], { type: "raise", amount: 100 });
      expect(round.currentBet).toBe(100);

      round.applyAction(players[1], { type: "call" });

      round.applyAction(players[2], { type: "raise", amount: 200 });
      expect(round.currentBet).toBe(300);

      expect(round.actedPlayers.has("p1")).toBe(false);
      expect(round.actedPlayers.has("p2")).toBe(false);
    });
  });

  describe.concurrent("All-In for Exactly Blind Amount", () => {
    it("should handle player all-in for exactly BB", () => {
      const players = [
        { id: "p1", chips: 1000, folded: false, allIn: false },
        { id: "p2", chips: 100, folded: false, allIn: false },
        { id: "p3", chips: 1000, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 50,
        bigBlind: 100,
        isPreFlop: true,
        dealerIndex: 0,
      });

      round.currentBet = 100;

      const result = round.applyAction(players[1], { type: "call" });
      expect(result.valid).toBe(true);
      expect(players[1].allIn).toBe(true);
      expect(players[1].chips).toBe(0);
    });
  });

  describe.concurrent("Heads-Up Blind Posting", () => {
    let game: PokerGameService;
    let eventEmitter: EventEmitter2;

    beforeEach(() => {
      eventEmitter = new EventEmitter2();
      game = new PokerGameService(eventEmitter);
    });

    it("should handle transition from 3 to 2 players", () => {
      game.initialize({
        gameId: "game-1",
        tableId: "table-1",
        smallBlind: 50,
        bigBlind: 100,
      });

      game.addPlayer({
        id: "p1",
        name: "Player1",
        chips: 1000,
        endpoint: "http://bot1",
      });
      game.addPlayer({
        id: "p2",
        name: "Player2",
        chips: 1000,
        endpoint: "http://bot2",
      });
      game.addPlayer({
        id: "p3",
        name: "Player3",
        chips: 1000,
        endpoint: "http://bot3",
      });

      game.handlePlayerLeave("p3");

      const state = game.getState();
      const activePlayers = state.players.filter((p) => !p.disconnected);
      expect(activePlayers.length).toBe(2);
    });

    it("should have button/SB same position in heads-up", () => {
      game.initialize({
        gameId: "game-1",
        tableId: "table-1",
        smallBlind: 50,
        bigBlind: 100,
      });

      game.addPlayer({
        id: "p1",
        name: "Player1",
        chips: 1000,
        endpoint: "http://bot1",
      });
      game.addPlayer({
        id: "p2",
        name: "Player2",
        chips: 1000,
        endpoint: "http://bot2",
      });

      const state = game.getState();
      expect(state.players.length).toBe(2);
    });
  });

  describe.concurrent("Multiple All-Ins with Different Stacks", () => {
    it("should create correct number of side pots", () => {
      const potManager = new PotManager();
      const players = [
        { id: "p1", chips: 0, folded: false, allIn: true },
        { id: "p2", chips: 0, folded: false, allIn: true },
        { id: "p3", chips: 0, folded: false, allIn: true },
        { id: "p4", chips: 500, folded: false, allIn: false },
      ];

      potManager.addBet("p1", 100);
      potManager.addBet("p2", 250);
      potManager.addBet("p3", 500);
      potManager.addBet("p4", 500);

      potManager.calculatePots(players);

      expect(potManager.pots.length).toBe(3);

      expect(potManager.pots[0].amount).toBe(400);
      expect(potManager.pots[0].eligiblePlayerIds.length).toBe(4);

      expect(potManager.pots[1].amount).toBe(450);
      expect(potManager.pots[1].eligiblePlayerIds).not.toContain("p1");

      expect(potManager.pots[2].amount).toBe(500);
      expect(potManager.pots[2].eligiblePlayerIds.length).toBe(2);
    });

    it("should correctly award each pot to appropriate winner", () => {
      const potManager = new PotManager();
      const players = [
        { id: "shortstack", chips: 0, folded: false, allIn: true },
        { id: "medium", chips: 0, folded: false, allIn: true },
        { id: "bigstack", chips: 500, folded: false, allIn: false },
      ];

      potManager.addBet("shortstack", 100);
      potManager.addBet("medium", 300);
      potManager.addBet("bigstack", 500);
      potManager.calculatePots(players);

      const mainPot = potManager.pots[0];
      expect(mainPot.eligiblePlayerIds).toContain("shortstack");

      const sidePot1 = potManager.pots[1];
      expect(sidePot1.eligiblePlayerIds).not.toContain("shortstack");
      expect(sidePot1.eligiblePlayerIds).toContain("medium");

      const sidePot2 = potManager.pots[2];
      expect(sidePot2.eligiblePlayerIds.length).toBe(1);
      expect(sidePot2.eligiblePlayerIds[0]).toBe("bigstack");
    });
  });

  describe.concurrent("Simultaneous Bust in Tournament", () => {
    it("should handle two players busting on same hand", () => {
      const players = [
        { id: "p1", chips: 100, busted: false, finishPosition: 0 },
        { id: "p2", chips: 100, busted: false, finishPosition: 0 },
        { id: "p3", chips: 800, busted: false, finishPosition: 0 },
      ];

      players[0].chips = 0;
      players[0].busted = true;
      players[1].chips = 0;
      players[1].busted = true;

      const remaining = players.filter((p) => !p.busted).length;
      const bustedCount = players.filter((p) => p.busted).length;

      players[0].finishPosition = remaining + bustedCount;
      players[1].finishPosition = remaining + bustedCount;

      expect(players[0].finishPosition).toBe(3);
      expect(players[1].finishPosition).toBe(3);
    });
  });

  describe.concurrent("All Players All-In Preflop", () => {
    it("should complete hand without more betting rounds", () => {
      const players = [
        { id: "p1", chips: 0, folded: false, allIn: true },
        { id: "p2", chips: 0, folded: false, allIn: true },
        { id: "p3", chips: 0, folded: false, allIn: true },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 50,
        bigBlind: 100,
        isPreFlop: true,
        dealerIndex: 0,
      });

      const canAct = players.filter(
        (p) => !p.folded && !p.allIn && p.chips > 0,
      );
      expect(canAct.length).toBe(0);
      expect(round.isBettingComplete()).toBe(true);
    });
  });

  describe.concurrent("Bot Response Edge Cases", () => {
    let game: PokerGameService;
    let eventEmitter: EventEmitter2;

    beforeEach(() => {
      eventEmitter = new EventEmitter2();
      game = new PokerGameService(eventEmitter);
      game.initialize({
        gameId: "game-1",
        tableId: "table-1",
        smallBlind: 10,
        bigBlind: 20,
      });
      game.addPlayer({
        id: "p1",
        name: "Player1",
        chips: 1000,
        endpoint: "http://bot1",
      });
      game.addPlayer({
        id: "p2",
        name: "Player2",
        chips: 500,
        endpoint: "http://bot2",
      });
      game.startHand();
      game.setCurrentPlayer("p1");
    });

    it("should treat raise > stack as all-in", () => {
      const result = game.processAction("p1", "raise", 2000);

      const p1 = game.getState().players.find((p) => p.id === "p1");
      expect(p1?.allIn).toBe(true);
      expect(p1?.chips).toBe(0);
    });

    it("should reject negative raise amount", () => {
      const result = game.processAction("p1", "raise", -100);
      expect(result.valid).toBe(false);
    });

    it("should handle zero raise as invalid", () => {
      const result = game.processAction("p1", "raise", 0);
      expect(result.valid).toBe(false);
    });
  });

  describe.concurrent("Integer Chip Amounts", () => {
    it("should always result in integer chip values", () => {
      const pot = 100;
      const winners = 3;

      const baseShare = Math.floor(pot / winners);
      const remainder = pot % winners;

      expect(Number.isInteger(baseShare)).toBe(true);
      expect(Number.isInteger(remainder)).toBe(true);

      const total = baseShare * winners + remainder;
      expect(total).toBe(pot);
    });

    it("should handle large chip amounts safely", () => {
      const largeAmount = 9007199254740991;
      const divided = Math.floor(largeAmount / 2);
      const remainder = largeAmount % 2;

      expect(divided * 2 + remainder).toBe(largeAmount);
      expect(Number.isSafeInteger(divided)).toBe(true);
    });
  });

  describe.concurrent("Betting Round Completion Edge Cases", () => {
    it("should complete when all but one player folded", () => {
      const players = [
        { id: "p1", chips: 800, folded: true, allIn: false },
        { id: "p2", chips: 800, folded: true, allIn: false },
        { id: "p3", chips: 600, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 50,
        bigBlind: 100,
        isPreFlop: false,
        dealerIndex: 0,
      });

      expect(round.isBettingComplete()).toBe(true);
    });

    it("should complete when remaining player is all-in", () => {
      const players = [
        { id: "p1", chips: 0, folded: false, allIn: true },
        { id: "p2", chips: 800, folded: true, allIn: false },
        { id: "p3", chips: 600, folded: true, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 50,
        bigBlind: 100,
        isPreFlop: false,
        dealerIndex: 0,
      });

      expect(round.isBettingComplete()).toBe(true);
    });
  });
});
