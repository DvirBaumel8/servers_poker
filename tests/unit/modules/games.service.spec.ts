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
    mockCacheService = {
      getOrSet: vi.fn().mockImplementation((_key, fn) => fn()),
    };
    service = new GamesService(
      mockGameRepository as never,
      {} as never,
      {} as never,
      mockCacheService as never,
    );
  });

  describe("getHandHistory", () => {
    it("should use default pagination (limit=50, offset=0)", async () => {
      mockGameRepository.getHandHistory.mockResolvedValue([mockHand]);

      await service.getHandHistory("game-123");

      expect(mockGameRepository.getHandHistory).toHaveBeenCalledWith(
        "game-123",
        50,
        0,
      );
    });

    it("should transform hand to dto — maps bot.name to bot_name", async () => {
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

  describe("getTableHistory", () => {
    it("should aggregate game and hands into response shape", async () => {
      mockGameRepository.findByTableId.mockResolvedValue([mockGame]);
      mockGameRepository.getHandHistory.mockResolvedValue([mockHand]);

      const result = await service.getTableHistory("table-456");

      expect(result.gameId).toBe("game-123");
      expect(result.tableId).toBe("table-456");
      expect(result.totalHands).toBe(50);
      expect(result.hands).toHaveLength(1);
    });

    it("should throw NotFoundException when no games found for table", async () => {
      mockGameRepository.findByTableId.mockResolvedValue([]);

      await expect(service.getTableHistory("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getLeaderboard", () => {
    it("should use default limit=20 and period='all'", async () => {
      mockGameRepository.getLeaderboard.mockResolvedValue([]);

      await service.getLeaderboard();

      expect(mockGameRepository.getLeaderboard).toHaveBeenCalledWith(20, "all");
    });
  });
});
