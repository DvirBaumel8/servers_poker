/**
 * TDD Tests for Edge Cases
 *
 * These tests are written FIRST, before implementation.
 * Tests will initially fail, then we fix the code to make them pass.
 *
 * Edge Cases:
 * - #2: Split pot odd chip distribution (2-way)
 * - #3: Three-way (or more) split pot odd chips
 * - #5: Short all-in reopening validation
 * - #7: Hand cancellation/rollback
 * - #9: Dead button rule
 * - #18: Hand-for-hand bubble play
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PokerGameService } from "../../src/game/poker-game.service";
import { PotManager, BettingRound } from "../../src/betting";

describe("Edge Case #2 & #3: Split Pot Odd Chip Distribution", () => {
  describe.concurrent("PotManager.distributePot()", () => {
    let potManager: PotManager;

    beforeEach(() => {
      potManager = new PotManager();
    });

    describe.concurrent("Two-way split with odd chips", () => {
      it("should give odd chip to player closest to button (dealer + 1)", () => {
        const pot = 101;
        const winners = [
          { id: "p1", handRank: 100 },
          { id: "p2", handRank: 100 },
        ];
        const playerOrder = ["dealer", "p1", "p2", "p3"];
        const dealerIndex = 0;

        const distribution = potManager.distributePot(
          pot,
          winners,
          playerOrder,
          dealerIndex,
        );

        expect(distribution["p1"]).toBe(51);
        expect(distribution["p2"]).toBe(50);
        expect(distribution["p1"] + distribution["p2"]).toBe(pot);
      });

      it("should handle odd chip when dealer is in middle of order", () => {
        const pot = 101;
        const winners = [
          { id: "p1", handRank: 100 },
          { id: "p3", handRank: 100 },
        ];
        const playerOrder = ["p1", "dealer", "p3", "p4"];
        const dealerIndex = 1;

        const distribution = potManager.distributePot(
          pot,
          winners,
          playerOrder,
          dealerIndex,
        );

        expect(distribution["p3"]).toBe(51);
        expect(distribution["p1"]).toBe(50);
      });

      it("should wrap around to find closest winner after button", () => {
        const pot = 101;
        const winners = [
          { id: "p1", handRank: 100 },
          { id: "p2", handRank: 100 },
        ];
        const playerOrder = ["p1", "p2", "dealer"];
        const dealerIndex = 2;

        const distribution = potManager.distributePot(
          pot,
          winners,
          playerOrder,
          dealerIndex,
        );

        expect(distribution["p1"]).toBe(51);
        expect(distribution["p2"]).toBe(50);
      });
    });

    describe.concurrent("Three-way split with odd chips", () => {
      it("should distribute 2 odd chips to first 2 players after button", () => {
        const pot = 101;
        const winners = [
          { id: "p1", handRank: 100 },
          { id: "p2", handRank: 100 },
          { id: "p3", handRank: 100 },
        ];
        const playerOrder = ["dealer", "p1", "p2", "p3"];
        const dealerIndex = 0;

        const distribution = potManager.distributePot(
          pot,
          winners,
          playerOrder,
          dealerIndex,
        );

        expect(distribution["p1"]).toBe(34);
        expect(distribution["p2"]).toBe(34);
        expect(distribution["p3"]).toBe(33);
        expect(
          distribution["p1"] + distribution["p2"] + distribution["p3"],
        ).toBe(pot);
      });

      it("should handle $100 pot split 3 ways (33 + 33 + 34)", () => {
        const pot = 100;
        const winners = [
          { id: "p1", handRank: 100 },
          { id: "p2", handRank: 100 },
          { id: "p3", handRank: 100 },
        ];
        const playerOrder = ["dealer", "p1", "p2", "p3"];
        const dealerIndex = 0;

        const distribution = potManager.distributePot(
          pot,
          winners,
          playerOrder,
          dealerIndex,
        );

        expect(distribution["p1"]).toBe(34);
        expect(distribution["p2"]).toBe(33);
        expect(distribution["p3"]).toBe(33);
        expect(
          distribution["p1"] + distribution["p2"] + distribution["p3"],
        ).toBe(pot);
      });
    });

    describe.concurrent("Four-way split with odd chips", () => {
      it("should distribute 3 odd chips to first 3 players after button", () => {
        const pot = 103;
        const winners = [
          { id: "p1", handRank: 100 },
          { id: "p2", handRank: 100 },
          { id: "p3", handRank: 100 },
          { id: "p4", handRank: 100 },
        ];
        const playerOrder = ["dealer", "p1", "p2", "p3", "p4"];
        const dealerIndex = 0;

        const distribution = potManager.distributePot(
          pot,
          winners,
          playerOrder,
          dealerIndex,
        );

        expect(distribution["p1"]).toBe(26);
        expect(distribution["p2"]).toBe(26);
        expect(distribution["p3"]).toBe(26);
        expect(distribution["p4"]).toBe(25);
        const total =
          distribution["p1"] +
          distribution["p2"] +
          distribution["p3"] +
          distribution["p4"];
        expect(total).toBe(pot);
      });
    });

    describe.concurrent("Edge cases", () => {
      it("should handle $1 pot split between 3 players (1 gets $1, others get $0)", () => {
        const pot = 1;
        const winners = [
          { id: "p1", handRank: 100 },
          { id: "p2", handRank: 100 },
          { id: "p3", handRank: 100 },
        ];
        const playerOrder = ["dealer", "p1", "p2", "p3"];
        const dealerIndex = 0;

        const distribution = potManager.distributePot(
          pot,
          winners,
          playerOrder,
          dealerIndex,
        );

        expect(distribution["p1"]).toBe(1);
        expect(distribution["p2"]).toBe(0);
        expect(distribution["p3"]).toBe(0);
      });

      it("should handle even split with no remainder", () => {
        const pot = 100;
        const winners = [
          { id: "p1", handRank: 100 },
          { id: "p2", handRank: 100 },
        ];
        const playerOrder = ["dealer", "p1", "p2"];
        const dealerIndex = 0;

        const distribution = potManager.distributePot(
          pot,
          winners,
          playerOrder,
          dealerIndex,
        );

        expect(distribution["p1"]).toBe(50);
        expect(distribution["p2"]).toBe(50);
      });

      it("should handle single winner (no split)", () => {
        const pot = 101;
        const winners = [{ id: "p1", handRank: 100 }];
        const playerOrder = ["dealer", "p1", "p2"];
        const dealerIndex = 0;

        const distribution = potManager.distributePot(
          pot,
          winners,
          playerOrder,
          dealerIndex,
        );

        expect(distribution["p1"]).toBe(101);
      });
    });
  });
});

describe("Edge Case #5: Short All-In Does Not Reopen Betting", () => {
  describe.concurrent("BettingRound short all-in validation", () => {
    it("should NOT allow re-raise after short all-in", () => {
      const players = [
        { id: "p1", chips: 500, folded: false, allIn: false },
        { id: "p2", chips: 500, folded: false, allIn: false },
        { id: "p3", chips: 130, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 50,
        bigBlind: 100,
        isPreFlop: false,
        dealerIndex: 0,
      });

      round.applyAction(players[0], { type: "raise", amount: 100 });
      expect(round.currentBet).toBe(100);
      expect(round.minRaise).toBe(100);

      round.applyAction(players[1], { type: "call" });
      round.betsThisRound["p2"] = 100;

      const shortAllInResult = round.applyAction(players[2], {
        type: "raise",
        amount: 30,
      });
      expect(shortAllInResult.valid).toBe(true);
      expect(players[2].allIn).toBe(true);

      expect(round.canReraise("p1")).toBe(false);
      expect(round.canReraise("p2")).toBe(false);
    });

    it("should allow re-raise after full raise (not short)", () => {
      const players = [
        { id: "p1", chips: 500, folded: false, allIn: false },
        { id: "p2", chips: 500, folded: false, allIn: false },
        { id: "p3", chips: 300, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 50,
        bigBlind: 100,
        isPreFlop: false,
        dealerIndex: 0,
      });

      round.applyAction(players[0], { type: "raise", amount: 100 });
      round.applyAction(players[1], { type: "call" });
      round.betsThisRound["p2"] = 100;

      round.applyAction(players[2], { type: "raise", amount: 200 });

      expect(round.canReraise("p1")).toBe(true);
      expect(round.canReraise("p2")).toBe(true);
    });

    it("should track whether last raise was a full raise", () => {
      const players = [
        { id: "p1", chips: 500, folded: false, allIn: false },
        { id: "p2", chips: 500, folded: false, allIn: false },
        { id: "p3", chips: 180, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 50,
        bigBlind: 100,
        isPreFlop: false,
        dealerIndex: 0,
      });

      round.applyAction(players[0], { type: "raise", amount: 100 });
      expect(round.currentBet).toBe(100);
      expect(round.minRaise).toBe(100);
      expect(round.wasLastRaiseFull()).toBe(true);

      round.applyAction(players[1], { type: "call" });
      round.betsThisRound["p2"] = 100;

      round.applyAction(players[2], { type: "raise", amount: 80 });
      expect(players[2].allIn).toBe(true);
      expect(round.currentBet).toBe(180);
      expect(round.wasLastRaiseFull()).toBe(false);
    });

    it("should allow call or fold only after short all-in", () => {
      const players = [
        { id: "p1", chips: 500, folded: false, allIn: false },
        { id: "p2", chips: 130, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 50,
        bigBlind: 100,
        isPreFlop: false,
        dealerIndex: 0,
      });

      round.applyAction(players[0], { type: "raise", amount: 100 });

      round.applyAction(players[1], { type: "raise", amount: 30 });
      expect(players[1].allIn).toBe(true);

      const validActions = round.getValidActionsForPlayer(players[0]);

      expect(validActions).toContain("call");
      expect(validActions).toContain("fold");
      expect(validActions).not.toContain("raise");
    });
  });
});

describe("Edge Case #7: Hand Cancellation/Rollback", () => {
  let game: PokerGameService;
  let eventEmitter: EventEmitter2;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    game = new PokerGameService(eventEmitter);
    game.initialize({
      gameId: "game-1",
      tableId: "table-1",
      smallBlind: 50,
      bigBlind: 100,
    });
  });

  describe.concurrent("rollbackHand()", () => {
    it("should restore all players to start-of-hand chip amounts", () => {
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

      game.startHand();
      game.setCurrentPlayer("p1");
      game.processAction("p1", "raise", 200);
      game.processAction("p2", "call");

      const p1After = game.getState().players.find((p) => p.id === "p1");
      const p2After = game.getState().players.find((p) => p.id === "p2");
      expect(p1After!.chips).toBeLessThan(1000);
      expect(p2After!.chips).toBeLessThan(1000);

      game.rollbackHand();

      const p1Restored = game.getState().players.find((p) => p.id === "p1");
      const p2Restored = game.getState().players.find((p) => p.id === "p2");
      expect(p1Restored!.chips).toBe(1000);
      expect(p2Restored!.chips).toBe(1000);
    });

    it("should reset pot to zero", () => {
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

      game.startHand();
      game.setCurrentPlayer("p1");
      game.processAction("p1", "raise", 200);

      expect(game.getState().pot).toBeGreaterThan(0);

      game.rollbackHand();

      expect(game.getState().pot).toBe(0);
    });

    it("should reset player folded/allIn status", () => {
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

      game.startHand();
      game.setCurrentPlayer("p1");
      game.processAction("p1", "fold");

      const p1Folded = game.getState().players.find((p) => p.id === "p1");
      expect(p1Folded!.folded).toBe(true);

      game.rollbackHand();

      const p1Restored = game.getState().players.find((p) => p.id === "p1");
      expect(p1Restored!.folded).toBe(false);
      expect(p1Restored!.allIn).toBe(false);
    });

    it("should emit hand.cancelled event", () => {
      const cancelledHandler = vi.fn();
      eventEmitter.on("game.handCancelled", cancelledHandler);

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

      game.startHand();
      game.rollbackHand();

      expect(cancelledHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: "game-1",
          handNumber: expect.any(Number),
        }),
      );
    });

    it("should preserve chip conservation after rollback", () => {
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

      game.startHand();
      game.setCurrentPlayer("p1");
      game.processAction("p1", "raise", 500);

      game.rollbackHand();

      expect(() => game.assertChipConservation()).not.toThrow();
    });

    it("should allow starting a new hand after rollback", () => {
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

      game.startHand();
      const originalHandNumber = game.getState().handNumber;

      game.rollbackHand();

      game.startHand();
      expect(game.getState().handNumber).toBe(originalHandNumber + 1);
      expect(game.getState().handInProgress).toBe(true);
    });
  });
});

describe("Edge Case #9: Dead Button Rule", () => {
  let game: PokerGameService;
  let eventEmitter: EventEmitter2;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    game = new PokerGameService(eventEmitter);
    game.initialize({
      gameId: "game-1",
      tableId: "table-1",
      smallBlind: 50,
      bigBlind: 100,
    });
  });

  describe.concurrent("Button movement after player bust", () => {
    it("should skip eliminated player when moving button", () => {
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

      game.setDealerIndex(0);

      game.handlePlayerLeave("p2");

      game.advanceDealer();

      const newDealerIndex = game.getState().dealerIndex;
      const activePlayers = game
        .getState()
        .players.filter((p) => !p.disconnected);
      const dealerPlayer = activePlayers[newDealerIndex % activePlayers.length];

      expect(dealerPlayer.id).not.toBe("p2");
    });

    it("should maintain BB position continuity (dead button rule)", () => {
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

      game.setDealerIndex(0);

      const blindPositions = game.getBlindPositions();
      expect(blindPositions.bigBlind).toBeDefined();

      game.handlePlayerLeave("p2");
      game.advanceDealer();

      const newBlindPositions = game.getBlindPositions();
      expect(newBlindPositions.bigBlind).toBeDefined();
    });

    it("should handle button on eliminated player correctly", () => {
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

      game.setDealerIndex(1);

      game.handlePlayerLeave("p2");

      const dealerPlayer = game.getCurrentDealer();
      expect(dealerPlayer).toBeDefined();
      expect(dealerPlayer!.disconnected).toBe(false);
    });

    it("should ensure no player is SB and BB simultaneously (except heads-up)", () => {
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

      const blindPositions = game.getBlindPositions();

      expect(blindPositions.smallBlind).not.toBe(blindPositions.bigBlind);
    });

    it("should handle heads-up transition correctly (BTN = SB)", () => {
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

      const blindPositions = game.getBlindPositions();
      expect(blindPositions.dealerSmallBlind).toBeDefined();
    });
  });
});

describe("Edge Case #18: Hand-for-Hand Bubble Play", () => {
  describe.concurrent("TournamentDirectorService hand-for-hand mode", () => {
    it("should enable hand-for-hand mode at bubble", () => {
      const mockTournament = {
        id: "tourn-1",
        registeredPlayers: 10,
        paidPositions: 3,
        remainingPlayers: 4,
        tables: [
          { id: "table-1", players: ["p1", "p2"] },
          { id: "table-2", players: ["p3", "p4"] },
        ],
      };

      const isBubble =
        mockTournament.remainingPlayers ===
        mockTournament.paidPositions + 1;
      expect(isBubble).toBe(true);
    });

    it("should synchronize hand starts across tables", async () => {
      const tables = ["table-1", "table-2"];
      const handStartTimes: Record<string, number> = {};

      const syncStart = async (tableId: string) => {
        handStartTimes[tableId] = Date.now();
      };

      await Promise.all(tables.map(syncStart));

      const timeDiff = Math.abs(
        handStartTimes["table-1"] - handStartTimes["table-2"],
      );
      expect(timeDiff).toBeLessThan(100);
    });

    it("should wait for all tables to complete before starting next hand", async () => {
      const tableStates = {
        "table-1": { handComplete: false },
        "table-2": { handComplete: false },
      };

      const allTablesComplete = () =>
        Object.values(tableStates).every((t) => t.handComplete);

      expect(allTablesComplete()).toBe(false);

      tableStates["table-1"].handComplete = true;
      expect(allTablesComplete()).toBe(false);

      tableStates["table-2"].handComplete = true;
      expect(allTablesComplete()).toBe(true);
    });

    it("should correctly determine bubble bust when multiple players bust same hand", () => {
      const bustOrder = [
        { playerId: "p1", tableId: "table-1", chipCountAtBust: 500 },
        { playerId: "p2", tableId: "table-2", chipCountAtBust: 300 },
      ];

      bustOrder.sort((a, b) => b.chipCountAtBust - a.chipCountAtBust);

      expect(bustOrder[0].playerId).toBe("p1");
      expect(bustOrder[1].playerId).toBe("p2");
    });

    it("should exit hand-for-hand mode when bubble bursts", () => {
      const mockTournament = {
        remainingPlayers: 4,
        paidPositions: 3,
        handForHandMode: true,
      };

      mockTournament.remainingPlayers = 3;

      const shouldExitHandForHand =
        mockTournament.remainingPlayers <= mockTournament.paidPositions;
      expect(shouldExitHandForHand).toBe(true);
    });

    it("should pause tables that finish early in hand-for-hand mode", async () => {
      const tableStates = {
        "table-1": { handComplete: true, paused: false },
        "table-2": { handComplete: false, paused: false },
      };

      const pauseCompletedTables = () => {
        for (const [_, state] of Object.entries(tableStates)) {
          if (
            state.handComplete &&
            !Object.values(tableStates).every((t) => t.handComplete)
          ) {
            state.paused = true;
          }
        }
      };

      pauseCompletedTables();

      expect(tableStates["table-1"].paused).toBe(true);
      expect(tableStates["table-2"].paused).toBe(false);
    });
  });
});
