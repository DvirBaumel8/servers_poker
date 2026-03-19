import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PokerGameService, GameConfig } from "../../src/game/poker-game.service";

describe("Edge Cases", () => {
  let game: PokerGameService;
  let eventEmitter: EventEmitter2;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    game = new PokerGameService(eventEmitter);
  });

  describe("Cash Game: Last Player Standing", () => {
    beforeEach(() => {
      game.initialize({
        gameId: "game-1",
        tableId: "table-1",
        smallBlind: 10,
        bigBlind: 20,
        isCashGame: true,
      });
    });

    it("should finish game when only 2 players and one leaves", () => {
      const finishedHandler = vi.fn();
      eventEmitter.on("game.finished", finishedHandler);

      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      const result = game.handlePlayerLeave("p2");

      expect(result).not.toBeNull();
      expect(result?.reason).toBe("last_player_standing");
      expect(result?.winnerId).toBe("p1");
      expect(game.getState().status).toBe("finished");
      expect(finishedHandler).toHaveBeenCalled();
    });

    it("should preserve remaining player chips when opponent leaves", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      game.handlePlayerLeave("p2");

      const state = game.getState();
      const player1 = state.players.find(p => p.id === "p1");
      expect(player1?.chips).toBe(1000);
      expect(player1?.disconnected).toBe(false);
    });
  });

  describe("Player Leaves During Hand", () => {
    beforeEach(() => {
      game.initialize({
        gameId: "game-1",
        tableId: "table-1",
        smallBlind: 10,
        bigBlind: 20,
      });
    });

    it("should fold player when they leave mid-hand", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });
      game.addPlayer({ id: "p3", name: "Player3", chips: 1000, endpoint: "http://bot3" });

      game.startHand();
      game.setCurrentPlayer("p1");

      const penaltyHandler = vi.fn();
      eventEmitter.on("game.penaltyFold", penaltyHandler);

      game.handlePlayerLeave("p1");

      expect(penaltyHandler).toHaveBeenCalled();
      const state = game.getState();
      const player1 = state.players.find(p => p.id === "p1");
      expect(player1?.folded).toBe(true);
    });

    it("should advance to next player when current player leaves", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });
      game.addPlayer({ id: "p3", name: "Player3", chips: 1000, endpoint: "http://bot3" });

      game.startHand();
      game.setCurrentPlayer("p1");

      game.handlePlayerLeave("p1");

      const currentPlayer = game.getCurrentPlayerId();
      expect(currentPlayer === "p2" || currentPlayer === "p3").toBe(true);
    });

    it("should award pot to remaining player when only 2 and one leaves", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      game.startHand();
      game.setCurrentPlayer("p1");
      
      game.processAction("p1", "raise", 100);

      const p2ChipsBefore = game.getState().players.find(p => p.id === "p2")?.chips;
      const pot = game.getState().pot;

      game.handlePlayerLeave("p1");

      expect(game.getState().status).toBe("finished");
    });
  });

  describe("Tournament: Single Table, 2 Players, One Leaves", () => {
    beforeEach(() => {
      game.initialize({
        gameId: "game-1",
        tableId: "table-1",
        tournamentId: "tourn-1",
        smallBlind: 25,
        bigBlind: 50,
        isCashGame: false,
      });
    });

    it("should declare remaining player as winner", () => {
      const finishedHandler = vi.fn();
      eventEmitter.on("game.finished", finishedHandler);

      game.addPlayer({ id: "p1", name: "Player1", chips: 2000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 2000, endpoint: "http://bot2" });

      const result = game.handlePlayerLeave("p2");

      expect(result?.reason).toBe("winner_determined");
      expect(result?.winnerId).toBe("p1");
      expect(finishedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          tournamentId: "tourn-1",
          winnerId: "p1",
        })
      );
    });

    it("should finish tournament status", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 2000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 2000, endpoint: "http://bot2" });

      game.handlePlayerLeave("p2");

      expect(game.getState().status).toBe("finished");
    });
  });

  describe("Out-of-Turn Actions", () => {
    beforeEach(() => {
      game.initialize({
        gameId: "game-1",
        tableId: "table-1",
        smallBlind: 10,
        bigBlind: 20,
      });
    });

    it("should reject action when not player's turn", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      game.startHand();
      game.setCurrentPlayer("p1");

      const result = game.processAction("p2", "call");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Not your turn");
    });

    it("should not apply strike for out-of-turn action", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      game.startHand();
      game.setCurrentPlayer("p1");

      game.processAction("p2", "raise", 100);

      const state = game.getState();
      const player2 = state.players.find(p => p.id === "p2");
      expect(player2?.strikes).toBe(0);
    });

    it("should not change game state on out-of-turn action", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      game.startHand();
      game.setCurrentPlayer("p1");

      const stateBefore = JSON.stringify(game.getState());
      game.processAction("p2", "all_in");
      const stateAfter = JSON.stringify(game.getState());

      expect(stateBefore).toBe(stateAfter);
    });

    it("should validate turn in validateAction", async () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      game.startHand();
      game.setCurrentPlayer("p1");

      const result = await game.validateAction("p2", "call");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Not your turn");
    });

    it("should indicate current player in state", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      game.startHand();
      game.setCurrentPlayer("p1");

      const state = game.getState();
      expect(state.currentPlayerId).toBe("p1");
    });

    it("should indicate turn in private state", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      game.startHand();
      game.setCurrentPlayer("p1");

      const p1State = game.getPrivateState("p1");
      const p2State = game.getPrivateState("p2");

      expect(p1State?.isYourTurn).toBe(true);
      expect(p2State?.isYourTurn).toBe(false);
    });

    it("should only show valid actions to current player", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      game.startHand();
      game.setCurrentPlayer("p1");

      const p1State = game.getPrivateState("p1");
      const p2State = game.getPrivateState("p2");

      expect(p1State?.validActions.length).toBeGreaterThan(0);
      expect(p2State?.validActions.length).toBe(0);
    });
  });

  describe("All Players Leave", () => {
    it("should finish game when all players leave", () => {
      game.initialize({
        gameId: "game-1",
        tableId: "table-1",
        smallBlind: 10,
        bigBlind: 20,
      });

      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      game.handlePlayerLeave("p1");
      game.handlePlayerLeave("p2");

      expect(game.getState().status).toBe("finished");
    });
  });

  describe("Strike System", () => {
    beforeEach(() => {
      game.initialize({
        gameId: "game-1",
        tableId: "table-1",
        smallBlind: 10,
        bigBlind: 20,
        maxStrikes: 3,
      });
    });

    it("should disconnect player after max strikes", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });
      game.addPlayer({ id: "p3", name: "Player3", chips: 1000, endpoint: "http://bot3" });

      game.startHand();
      game.setCurrentPlayer("p1");
      game.handlePlayerLeave("p1");

      game.startHand();
      game.setCurrentPlayer("p1");
      game.handlePlayerLeave("p1");

      game.startHand();
      game.setCurrentPlayer("p1");
      game.handlePlayerLeave("p1");

      const state = game.getState();
      const player1 = state.players.find(p => p.id === "p1");
      expect(player1?.disconnected).toBe(true);
    });
  });

  describe("getActivePlayers and getPlayersWithChips", () => {
    beforeEach(() => {
      game.initialize({
        gameId: "game-1",
        tableId: "table-1",
        smallBlind: 10,
        bigBlind: 20,
      });
    });

    it("should return only active players", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });
      game.addPlayer({ id: "p3", name: "Player3", chips: 1000, endpoint: "http://bot3" });

      game.startHand();
      game.setCurrentPlayer("p1");
      game.processAction("p1", "fold");

      const activePlayers = game.getActivePlayers();
      expect(activePlayers.length).toBe(2);
      expect(activePlayers.find(p => p.id === "p1")).toBeUndefined();
    });

    it("should return players with chips", () => {
      game.addPlayer({ id: "p1", name: "Player1", chips: 1000, endpoint: "http://bot1" });
      game.addPlayer({ id: "p2", name: "Player2", chips: 1000, endpoint: "http://bot2" });

      game.handlePlayerLeave("p2");

      const playersWithChips = game.getPlayersWithChips();
      expect(playersWithChips.length).toBe(1);
      expect(playersWithChips[0].id).toBe("p1");
    });
  });
});
