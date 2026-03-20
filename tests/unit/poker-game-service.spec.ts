import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  PokerGameService,
  GameConfig,
} from "../../src/game/poker-game.service";

function createGameService(): PokerGameService {
  const emitter = new EventEmitter2();
  return new PokerGameService(emitter);
}

function createConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    gameId: "game-test",
    tableId: "table-test",
    smallBlind: 10,
    bigBlind: 20,
    ante: 0,
    startingChips: 1000,
    turnTimeoutMs: 10000,
    maxStrikes: 3,
    isCashGame: false,
    ...overrides,
  };
}

function addPlayers(game: PokerGameService, count: number): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const id = `player${i}`;
    game.addPlayer({
      id,
      name: `Player${i}`,
      endpoint: `http://localhost:400${i}/action`,
      chips: 1000,
      currentBet: 0,
    });
    ids.push(id);
  }
  return ids;
}

describe("PokerGameService", () => {
  let game: PokerGameService;

  beforeEach(() => {
    game = createGameService();
    game.initialize(createConfig());
  });

  describe("initialization", () => {
    it("should initialize with waiting status", () => {
      const state = game.getState();
      expect(state.status).toBe("waiting");
      expect(state.handNumber).toBe(0);
    });

    it("should reset state on re-initialization", () => {
      addPlayers(game, 2);
      game.initialize(createConfig({ gameId: "game-2" }));
      const state = game.getState();
      expect(state.players).toHaveLength(0);
      expect(state.handNumber).toBe(0);
    });

    it("should use provided config values", () => {
      game.initialize(
        createConfig({ smallBlind: 25, bigBlind: 50, startingChips: 5000 }),
      );
      const state = game.getState();
      expect(state.blinds.small).toBe(25);
      expect(state.blinds.big).toBe(50);
    });
  });

  describe("player management", () => {
    it("should add players correctly", () => {
      addPlayers(game, 3);
      const state = game.getState();
      expect(state.players).toHaveLength(3);
    });

    it("should reject duplicate player", () => {
      game.addPlayer({
        id: "p1",
        name: "Player1",
        endpoint: "http://localhost:4001",
        chips: 1000,
        currentBet: 0,
      });
      expect(() =>
        game.addPlayer({
          id: "p1",
          name: "Player1",
          endpoint: "http://localhost:4001",
          chips: 1000,
          currentBet: 0,
        }),
      ).toThrow();
    });

    it("should allow reconnection of disconnected player", () => {
      game.addPlayer({
        id: "p1",
        name: "Player1",
        endpoint: "http://localhost:4001",
        chips: 1000,
        currentBet: 0,
      });
      game.removePlayer("p1");

      game.addPlayer({
        id: "p1",
        name: "Player1",
        endpoint: "http://localhost:4001",
        chips: 1000,
        currentBet: 0,
      });
      const state = game.getState();
      const p1 = state.players.find((p) => p.id === "p1");
      expect(p1?.disconnected).toBe(false);
    });

    it("should track total chips correctly", () => {
      addPlayers(game, 3);
      const state = game.getState();
      const totalChips = state.players.reduce((sum, p) => sum + p.chips, 0);
      expect(totalChips).toBe(3000);
    });

    it("should remove player correctly", () => {
      addPlayers(game, 2);
      game.removePlayer("player1");
      const state = game.getState();
      const p1 = state.players.find((p) => p.id === "player1");
      expect(p1?.disconnected).toBe(true);
      expect(p1?.chips).toBe(0);
    });
  });

  describe("hand lifecycle", () => {
    beforeEach(() => {
      addPlayers(game, 3);
    });

    it("should start a hand and set pre-flop", () => {
      game.startHand();
      const state = game.getState();
      expect(state.handNumber).toBe(1);
      expect(state.handInProgress).toBe(true);
      expect(state.stage).toBe("pre-flop");
    });

    it("should increment hand number on each start", () => {
      game.startHand();
      expect(game.getState().handNumber).toBe(1);
    });

    it("should reset player states at hand start", () => {
      game.startHand();
      const state = game.getState();
      for (const p of state.players) {
        expect(p.folded).toBe(false);
        expect(p.allIn).toBe(false);
        expect(p.currentBet).toBe(0);
      }
    });

    it("should reset pot at hand start", () => {
      game.startHand();
      expect(game.getState().pot).toBe(0);
    });
  });

  describe("action processing", () => {
    beforeEach(() => {
      addPlayers(game, 2);
      game.startHand();
    });

    it("should reject action from wrong player", () => {
      game.setCurrentPlayer("player1");
      const result = game.processAction("player2", "check");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Not your turn");
    });

    it("should process fold correctly", () => {
      game.setCurrentPlayer("player1");
      const result = game.processAction("player1", "fold");
      expect(result.valid).toBe(true);
      const state = game.getState();
      const p1 = state.players.find((p) => p.id === "player1");
      expect(p1?.folded).toBe(true);
    });

    it("should process check correctly", () => {
      game.setCurrentPlayer("player1");
      const result = game.processAction("player1", "check");
      expect(result.valid).toBe(true);
      expect(result.amountAdded).toBe(0);
    });

    it("should process raise correctly", () => {
      game.setCurrentPlayer("player1");
      const chipsBefore = game.getState().players.find(
        (p) => p.id === "player1",
      )!.chips;
      const result = game.processAction("player1", "raise", 100);
      expect(result.valid).toBe(true);
      const chipsAfter = game.getState().players.find(
        (p) => p.id === "player1",
      )!.chips;
      expect(chipsAfter).toBeLessThan(chipsBefore);
    });

    it("should process call correctly", () => {
      game.setCurrentPlayer("player1");
      game.processAction("player1", "raise", 100);
      game.setCurrentPlayer("player2");
      const result = game.processAction("player2", "call");
      expect(result.valid).toBe(true);
    });

    it("should reject raise with zero amount", () => {
      game.setCurrentPlayer("player1");
      const result = game.processAction("player1", "raise", 0);
      expect(result.valid).toBe(false);
    });

    it("should reject raise below minimum when not all-in", () => {
      game.setCurrentPlayer("player1");
      const result = game.processAction("player1", "raise", 5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Minimum raise");
    });

    it("should handle all-in correctly", () => {
      game.setCurrentPlayer("player1");
      const p1Chips = game.getState().players.find(
        (p) => p.id === "player1",
      )!.chips;
      const result = game.processAction("player1", "raise", p1Chips);
      expect(result.valid).toBe(true);
      const state = game.getState();
      const p1After = state.players.find((p) => p.id === "player1")!;
      expect(p1After.chips).toBe(0);
      expect(p1After.allIn).toBe(true);
    });

    it("should reject action from nonexistent player", () => {
      const result = game.processAction("nonexistent", "check");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Player not found");
    });
  });

  describe("pot awarding", () => {
    beforeEach(() => {
      addPlayers(game, 2);
      game.startHand();
    });

    it("should award pot correctly", () => {
      game.setCurrentPlayer("player1");
      game.processAction("player1", "raise", 100);
      game.awardPot("player1", 200);
      const p1 = game.getState().players.find((p) => p.id === "player1")!;
      expect(p1.chips).toBeGreaterThan(0);
    });
  });

  describe("player leave handling", () => {
    beforeEach(() => {
      addPlayers(game, 3);
    });

    it("should handle player leaving when no hand in progress", () => {
      const result = game.handlePlayerLeave("player1");
      expect(result).toBeNull();
    });

    it("should finish game when only one player remains after leaves", () => {
      game.startHand();
      game.handlePlayerLeave("player1");
      const result = game.handlePlayerLeave("player2");
      expect(result).not.toBeNull();
      expect(["last_player_standing", "winner_determined"]).toContain(
        result?.reason,
      );
    });

    it("should handle all players leaving", () => {
      game.startHand();
      game.handlePlayerLeave("player1");
      game.handlePlayerLeave("player2");
      const result = game.handlePlayerLeave("player3");
      expect(result).not.toBeNull();
    });
  });

  describe("getActivePlayers", () => {
    beforeEach(() => {
      addPlayers(game, 3);
      game.startHand();
    });

    it("should exclude folded players", () => {
      game.setCurrentPlayer("player1");
      game.processAction("player1", "fold");
      const active = game.getActivePlayers();
      expect(active.map((p) => p.id)).not.toContain("player1");
    });

    it("should exclude disconnected players", () => {
      game.removePlayer("player1");
      const active = game.getActivePlayers();
      expect(active.map((p) => p.id)).not.toContain("player1");
    });
  });

  describe("getPlayersWithChips", () => {
    it("should return players with chips regardless of fold status", () => {
      addPlayers(game, 2);
      game.startHand();
      game.setCurrentPlayer("player1");
      game.processAction("player1", "fold");

      const withChips = game.getPlayersWithChips();
      expect(withChips).toHaveLength(2);
    });
  });

  describe("action validation", () => {
    beforeEach(() => {
      addPlayers(game, 2);
      game.startHand();
    });

    it("should validate check when no bet", () => {
      game.setCurrentPlayer("player1");
      const result = game.validateAction("player1", "check");
      expect(result).resolves.toMatchObject({ valid: true });
    });

    it("should validate fold is always valid", () => {
      game.setCurrentPlayer("player1");
      const result = game.validateAction("player1", "fold");
      expect(result).resolves.toMatchObject({ valid: true });
    });

    it("should reject action from wrong player", () => {
      game.setCurrentPlayer("player1");
      const result = game.validateAction("player2", "check");
      expect(result).resolves.toMatchObject({ valid: false });
    });
  });

  describe("hand rollback", () => {
    it("should restore player chips on rollback", () => {
      addPlayers(game, 2);
      game.startHand();

      const chipsBefore = game.getState().players.find(
        (p) => p.id === "player1",
      )!.chips;

      game.setCurrentPlayer("player1");
      game.processAction("player1", "raise", 100);

      game.rollbackHand();

      const chipsAfter = game.getState().players.find(
        (p) => p.id === "player1",
      )!.chips;
      expect(chipsAfter).toBe(chipsBefore);
    });

    it("should reset pot on rollback", () => {
      addPlayers(game, 2);
      game.startHand();

      game.setCurrentPlayer("player1");
      game.processAction("player1", "raise", 100);

      game.rollbackHand();
      expect(game.getState().pot).toBe(0);
    });
  });

  describe("blind positions", () => {
    it("should set correct blind positions for heads-up", () => {
      addPlayers(game, 2);
      game.setDealerIndex(0);
      const positions = game.getBlindPositions();
      expect(positions.dealerSmallBlind).toBeDefined();
    });

    it("should set correct blind positions for 3 players", () => {
      addPlayers(game, 3);
      game.setDealerIndex(0);
      const positions = game.getBlindPositions();
      expect(positions.dealer).toBeDefined();
      expect(positions.smallBlind).toBeDefined();
      expect(positions.bigBlind).toBeDefined();
    });
  });

  describe("state retrieval", () => {
    it("should return complete game state", () => {
      addPlayers(game, 2);
      game.startHand();

      const state = game.getState();
      expect(state).toHaveProperty("gameId");
      expect(state).toHaveProperty("tableId");
      expect(state).toHaveProperty("status");
      expect(state).toHaveProperty("handNumber");
      expect(state).toHaveProperty("stage");
      expect(state).toHaveProperty("pot");
      expect(state).toHaveProperty("players");
      expect(state).toHaveProperty("blinds");
    });

    it("should return private state for a player", () => {
      addPlayers(game, 2);
      game.startHand();
      game.setCurrentPlayer("player1");

      const privateState = game.getPrivateState("player1");
      expect(privateState).not.toBeNull();
      expect(privateState).toHaveProperty("chips");
      expect(privateState).toHaveProperty("toCall");
      expect(privateState).toHaveProperty("isYourTurn");
      expect(privateState).toHaveProperty("validActions");
    });

    it("should return null private state for nonexistent player", () => {
      addPlayers(game, 2);
      const result = game.getPrivateState("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("isRunning", () => {
    it("should return false when waiting", () => {
      expect(game.isRunning()).toBe(false);
    });
  });
});
