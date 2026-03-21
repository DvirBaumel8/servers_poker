import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitter2, EventEmitterModule } from "@nestjs/event-emitter";
import { LiveGameManagerService } from "../../src/services/game/live-game-manager.service";
import { BotCallerService } from "../../src/services/bot/bot-caller.service";
import { BotResilienceService } from "../../src/services/bot/bot-resilience.service";
import { ProvablyFairService } from "../../src/services/provably-fair.service";
import { v4 as uuidv4 } from "uuid";

describe("Game Flow Integration Tests", () => {
  let liveGameManager: LiveGameManagerService;
  let eventEmitter: EventEmitter2;

  const mockBotCallerService = {
    callBot: vi.fn().mockResolvedValue({
      success: true,
      response: { type: "call" },
      latencyMs: 10,
      attempt: 1,
      retried: false,
    }),
    healthCheck: vi.fn().mockResolvedValue(true),
    getHealthStatus: vi.fn().mockReturnValue({ healthy: true }),
    getAllHealthStatuses: vi.fn().mockReturnValue([]),
    resetCircuitBreaker: vi.fn(),
    getAverageLatency: vi.fn().mockReturnValue(10),
    preGameHealthCheck: vi.fn().mockResolvedValue(new Map()),
    onModuleInit: vi.fn(),
    getAgentStats: vi.fn().mockReturnValue({ http: null, https: null }),
  };

  const mockBotResilienceService = {
    callBotWithFallback: vi
      .fn()
      .mockResolvedValue({ action: { type: "call" }, usedFallback: false }),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    getCircuitState: vi.fn().mockReturnValue("closed"),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
      ],
      providers: [
        LiveGameManagerService,
        ProvablyFairService,
        {
          provide: BotCallerService,
          useValue: mockBotCallerService,
        },
        {
          provide: BotResilienceService,
          useValue: mockBotResilienceService,
        },
      ],
    }).compile();

    liveGameManager = moduleFixture.get<LiveGameManagerService>(
      LiveGameManagerService,
    );
    eventEmitter = moduleFixture.get<EventEmitter2>(EventEmitter2);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.concurrent("Game Lifecycle", () => {
    it("should create a new game instance", () => {
      const tableId = `test-table-${uuidv4()}`;
      const gameDbId = `test-game-${uuidv4()}`;

      const game = liveGameManager.createGame({
        tableId,
        gameDbId,
        smallBlind: 10,
        bigBlind: 20,
        startingChips: 1000,
        turnTimeoutMs: 30000,
      });

      expect(game).toBeDefined();
      expect(liveGameManager.getGame(tableId)).toBeDefined();
    });

    it("should add players to game", () => {
      const tableId = `test-table-${uuidv4()}`;
      const gameDbId = `test-game-${uuidv4()}`;

      const game = liveGameManager.createGame({
        tableId,
        gameDbId,
        smallBlind: 10,
        bigBlind: 20,
        startingChips: 1000,
        turnTimeoutMs: 30000,
      });

      game.addPlayer({
        id: "bot-1",
        name: "Bot 1",
        chips: 1000,
        endpoint: "http://localhost:19401",
      });

      game.addPlayer({
        id: "bot-2",
        name: "Bot 2",
        chips: 1000,
        endpoint: "http://localhost:19402",
      });

      expect(game.players.length).toBe(2);
    });

    it("should return existing game if already exists", () => {
      const tableId = `test-table-${uuidv4()}`;
      const gameDbId = `test-game-${uuidv4()}`;

      const game1 = liveGameManager.createGame({
        tableId,
        gameDbId,
        smallBlind: 10,
        bigBlind: 20,
      });

      const game2 = liveGameManager.createGame({
        tableId,
        gameDbId: "different-id",
        smallBlind: 50,
        bigBlind: 100,
      });

      expect(game1).toBe(game2);
    });
  });

  describe.concurrent("Game State", () => {
    it("should return game state snapshot", () => {
      const tableId = `test-table-${uuidv4()}`;
      const gameDbId = `test-game-${uuidv4()}`;

      const game = liveGameManager.createGame({
        tableId,
        gameDbId,
        smallBlind: 10,
        bigBlind: 20,
        startingChips: 1000,
      });

      game.addPlayer({
        id: "bot-1",
        name: "Bot 1",
        endpoint: "http://localhost:19408",
      });

      const state = liveGameManager.getGameState(tableId);
      expect(state).toBeDefined();
      expect(state?.players).toBeDefined();
      expect(state?.players.length).toBe(1);
    });

    it("should track active game count", () => {
      const tableId1 = `test-table-${uuidv4()}`;
      const tableId2 = `test-table-${uuidv4()}`;

      liveGameManager.createGame({
        tableId: tableId1,
        gameDbId: `game-${uuidv4()}`,
      });

      liveGameManager.createGame({
        tableId: tableId2,
        gameDbId: `game-${uuidv4()}`,
      });

      const count = liveGameManager.getActiveGameCount();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    it("should return all games", () => {
      const allGames = liveGameManager.getAllGames();
      expect(Array.isArray(allGames)).toBe(true);
    });
  });

  describe.concurrent("Player Management", () => {
    it("should remove player from game", () => {
      const tableId = `test-table-${uuidv4()}`;
      const gameDbId = `test-game-${uuidv4()}`;

      const game = liveGameManager.createGame({
        tableId,
        gameDbId,
        smallBlind: 10,
        bigBlind: 20,
        startingChips: 1000,
      });

      game.addPlayer({
        id: "bot-1",
        name: "Bot 1",
        endpoint: "http://localhost:19409",
      });

      game.addPlayer({
        id: "bot-2",
        name: "Bot 2",
        endpoint: "http://localhost:19410",
      });

      game.removePlayer("bot-1");

      const disconnectedPlayer = game.players.find((p) => p.id === "bot-1");
      expect(disconnectedPlayer?.disconnected).toBe(true);
    });

    it("should register bot in game mapping", () => {
      const tableId = `test-table-${uuidv4()}`;
      const gameDbId = `test-game-${uuidv4()}`;

      liveGameManager.createGame({
        tableId,
        gameDbId,
      });

      liveGameManager.registerBotInGame(tableId, "bot-123", "TestBot");

      const liveGame = liveGameManager.getGame(tableId);
      expect(liveGame?.botIdMap["TestBot"]).toBe("bot-123");
    });
  });

  describe.concurrent("Game Removal", () => {
    it("should remove game properly", () => {
      const tableId = `test-table-${uuidv4()}`;
      const gameDbId = `test-game-${uuidv4()}`;

      liveGameManager.createGame({
        tableId,
        gameDbId,
        smallBlind: 10,
        bigBlind: 20,
      });

      expect(liveGameManager.getGame(tableId)).toBeDefined();

      liveGameManager.removeGame(tableId);

      expect(liveGameManager.getGame(tableId)).toBeUndefined();
    });

    it("should handle removing non-existent game gracefully", () => {
      liveGameManager.removeGame("non-existent-table-id");
      expect(true).toBe(true);
    });
  });

  describe.concurrent("Tournament Support", () => {
    it("should create game with tournament ID", () => {
      const tableId = `test-table-${uuidv4()}`;
      const gameDbId = `test-game-${uuidv4()}`;
      const tournamentId = `test-tournament-${uuidv4()}`;

      const game = liveGameManager.createGame({
        tableId,
        gameDbId,
        tournamentId,
        smallBlind: 25,
        bigBlind: 50,
        ante: 5,
      });

      expect(game.tournamentId).toBe(tournamentId);
      expect(game.ante).toBe(5);
    });
  });
});
