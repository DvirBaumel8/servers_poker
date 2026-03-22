import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { GamesService } from "../../../src/modules/games/games.service";

describe("GamesService", () => {
  let service: GamesService;
  let mockGameRepository: {
    findById: ReturnType<typeof vi.fn>;
    findByTableId: ReturnType<typeof vi.fn>;
    createGame: ReturnType<typeof vi.fn>;
    getHandHistory: ReturnType<typeof vi.fn>;
    getHandWithDetails: ReturnType<typeof vi.fn>;
    getLeaderboard: ReturnType<typeof vi.fn>;
  };
  let mockBotRepository: Record<string, never>;
  let mockHandSeedRepository: Record<string, never>;
  let mockCacheService: {
    getOrSet: ReturnType<typeof vi.fn>;
  };

  const mockGame = {
    id: "game-123",
    table_id: "table-456",
    tournament_id: null,
    total_hands: 50,
    started_at: new Date("2024-01-01"),
    finished_at: null,
  };

  const mockHand = {
    id: "hand-789",
    hand_number: 1,
    pot: 100,
    community_cards: ["As", "Kh", "Qd", "Jc", "Ts"],
    started_at: new Date("2024-01-01T10:00:00"),
    finished_at: new Date("2024-01-01T10:01:00"),
    players: [
      {
        bot_id: "bot-1",
        bot: { name: "Bot1" },
        position: 0,
        hole_cards: ["Ac", "Ad"],
        amount_bet: 50,
        amount_won: 100,
        folded: false,
        won: true,
        best_hand: { name: "Pair", cards: ["Ac", "Ad", "As", "Kh", "Qd"] },
      },
    ],
    actions: [
      {
        bot_id: "bot-1",
        action_type: "bet",
        amount: 50,
        stage: "preflop",
      },
    ],
  };

  beforeEach(() => {
    mockGameRepository = {
      findById: vi.fn(),
      findByTableId: vi.fn(),
      createGame: vi.fn(),
      getHandHistory: vi.fn(),
      getHandWithDetails: vi.fn(),
      getLeaderboard: vi.fn(),
    };
    mockBotRepository = {};
    mockHandSeedRepository = {};
    mockCacheService = {
      getOrSet: vi.fn().mockImplementation((_key, fn) => fn()),
    };
    service = new GamesService(
      mockGameRepository as never,
      mockBotRepository as never,
      mockHandSeedRepository as never,
      mockCacheService as never,
    );
  });

  describe("findById", () => {
    it("should return game when found", async () => {
      mockGameRepository.findById.mockResolvedValue(mockGame);

      const result = await service.findById("game-123");

      expect(result).toEqual(mockGame);
    });

    it("should return null when not found", async () => {
      mockGameRepository.findById.mockResolvedValue(null);

      const result = await service.findById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findByTableId", () => {
    it("should return games for table", async () => {
      mockGameRepository.findByTableId.mockResolvedValue([mockGame]);

      const result = await service.findByTableId("table-456");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("game-123");
    });
  });

  describe("createGame", () => {
    it("should create game for table", async () => {
      mockGameRepository.createGame.mockResolvedValue(mockGame);

      const result = await service.createGame("table-456");

      expect(result).toEqual(mockGame);
      expect(mockGameRepository.createGame).toHaveBeenCalledWith(
        "table-456",
        undefined,
      );
    });

    it("should create game for tournament", async () => {
      const tournamentGame = { ...mockGame, tournament_id: "tourney-1" };
      mockGameRepository.createGame.mockResolvedValue(tournamentGame);

      const result = await service.createGame("table-456", "tourney-1");

      expect(result.tournament_id).toBe("tourney-1");
    });
  });

  describe("getHandHistory", () => {
    it("should return hand history with default pagination", async () => {
      mockGameRepository.getHandHistory.mockResolvedValue([mockHand]);

      const result = await service.getHandHistory("game-123");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("hand-789");
      expect(mockGameRepository.getHandHistory).toHaveBeenCalledWith(
        "game-123",
        50,
        0,
      );
    });

    it("should return hand history with custom pagination", async () => {
      mockGameRepository.getHandHistory.mockResolvedValue([]);

      await service.getHandHistory("game-123", 10, 20);

      expect(mockGameRepository.getHandHistory).toHaveBeenCalledWith(
        "game-123",
        10,
        20,
      );
    });

    it("should transform hand to dto correctly", async () => {
      mockGameRepository.getHandHistory.mockResolvedValue([mockHand]);

      const result = await service.getHandHistory("game-123");

      expect(result[0]).toMatchObject({
        id: "hand-789",
        hand_number: 1,
        pot: 100,
        community_cards: ["As", "Kh", "Qd", "Jc", "Ts"],
      });
      expect(result[0].players[0].bot_name).toBe("Bot1");
      expect(result[0].actions[0].action_type).toBe("bet");
    });
  });

  describe("getHand", () => {
    it("should return hand dto when found", async () => {
      mockGameRepository.getHandWithDetails.mockResolvedValue(mockHand);

      const result = await service.getHand("hand-789");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("hand-789");
    });

    it("should return null when not found", async () => {
      mockGameRepository.getHandWithDetails.mockResolvedValue(null);

      const result = await service.getHand("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getTableHistory", () => {
    it("should return table history", async () => {
      mockGameRepository.findByTableId.mockResolvedValue([mockGame]);
      mockGameRepository.getHandHistory.mockResolvedValue([mockHand]);

      const result = await service.getTableHistory("table-456");

      expect(result.gameId).toBe("game-123");
      expect(result.tableId).toBe("table-456");
      expect(result.totalHands).toBe(50);
      expect(result.hands).toHaveLength(1);
    });

    it("should throw NotFoundException when no games found", async () => {
      mockGameRepository.findByTableId.mockResolvedValue([]);

      await expect(service.getTableHistory("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getLeaderboard", () => {
    it("should return leaderboard with default limit", async () => {
      const leaderboard = [
        { bot_id: "bot-1", bot_name: "Bot1", total_winnings: 1000 },
      ];
      mockGameRepository.getLeaderboard.mockResolvedValue(leaderboard);

      const result = await service.getLeaderboard();

      expect(result).toHaveLength(1);
      expect(result[0].bot_id).toBe("bot-1");
      expect(result[0].bot_name).toBe("Bot1");
      expect(result[0].total_winnings).toBe(1000);
      expect(mockGameRepository.getLeaderboard).toHaveBeenCalledWith(20, "all");
    });

    it("should return leaderboard with custom limit", async () => {
      mockGameRepository.getLeaderboard.mockResolvedValue([]);

      await service.getLeaderboard(10);

      expect(mockGameRepository.getLeaderboard).toHaveBeenCalledWith(10, "all");
    });
  });
});
