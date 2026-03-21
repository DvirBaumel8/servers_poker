import { describe, it, expect, beforeEach, vi } from "vitest";
import { BotActivityService } from "../../../src/services/bot-activity.service";

describe("BotActivityService", () => {
  let service: BotActivityService;
  let mockLiveGameManager: {
    getAllGames: ReturnType<typeof vi.fn>;
    getGame: ReturnType<typeof vi.fn>;
  };
  let mockBotRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let mockGameRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let mockGamePlayerRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let mockTournamentRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let mockTournamentEntryRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let mockTournamentSeatRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let mockTableRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };

  const mockBot = {
    id: "bot-123",
    name: "TestBot",
    endpoint: "http://localhost:4000/action",
    active: true,
    user_id: "user-123",
  };

  const mockLiveGame = {
    tableId: "table-123",
    gameDbId: "game-123",
    tournamentId: undefined,
    startedAt: new Date(),
    game: {
      status: "running" as const,
      handNumber: 10,
      players: [
        {
          id: "bot-123",
          name: "TestBot",
          chips: 1000,
          folded: false,
          allIn: false,
          disconnected: false,
        },
        {
          id: "bot-456",
          name: "OtherBot",
          chips: 500,
          folded: false,
          allIn: false,
          disconnected: false,
        },
      ],
    },
  };

  beforeEach(() => {
    mockLiveGameManager = {
      getAllGames: vi.fn().mockReturnValue([]),
      getGame: vi.fn().mockReturnValue(null),
    };

    mockBotRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
    };

    mockGameRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
    };

    mockGamePlayerRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
    };

    mockTournamentRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
    };

    mockTournamentEntryRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
    };

    mockTournamentSeatRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
    };

    mockTableRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
    };

    service = new BotActivityService(
      mockLiveGameManager as never,
      mockBotRepository as never,
      mockGameRepository as never,
      mockGamePlayerRepository as never,
      mockTournamentRepository as never,
      mockTournamentEntryRepository as never,
      mockTournamentSeatRepository as never,
      mockTableRepository as never,
    );
  });

  describe("getBotActivity", () => {
    it("should return null when bot is not found", async () => {
      mockBotRepository.findOne.mockResolvedValue(null);

      const result = await service.getBotActivity("nonexistent");

      expect(result).toBeNull();
    });

    it("should return activity with no games when bot is idle", async () => {
      mockBotRepository.findOne.mockResolvedValue(mockBot);
      mockLiveGameManager.getAllGames.mockReturnValue([]);
      mockTournamentEntryRepository.find.mockResolvedValue([]);

      const result = await service.getBotActivity("bot-123");

      expect(result).not.toBeNull();
      expect(result!.botId).toBe("bot-123");
      expect(result!.botName).toBe("TestBot");
      expect(result!.isActive).toBe(false);
      expect(result!.activeGames).toHaveLength(0);
      expect(result!.activeTournaments).toHaveLength(0);
    });

    it("should return active games for bot", async () => {
      mockBotRepository.findOne.mockResolvedValue(mockBot);
      mockLiveGameManager.getAllGames.mockReturnValue([mockLiveGame]);
      mockTournamentEntryRepository.find.mockResolvedValue([]);
      mockTableRepository.findOne.mockResolvedValue({ name: "Table 1" });

      const result = await service.getBotActivity("bot-123");

      expect(result).not.toBeNull();
      expect(result!.isActive).toBe(true);
      expect(result!.activeGames).toHaveLength(1);
      expect(result!.activeGames[0].tableId).toBe("table-123");
      expect(result!.activeGames[0].chips).toBe(1000);
      expect(result!.activeGames[0].handNumber).toBe(10);
      expect(result!.activeGames[0].status).toBe("running");
    });

    it("should return active tournaments for bot", async () => {
      mockBotRepository.findOne.mockResolvedValue(mockBot);
      mockLiveGameManager.getAllGames.mockReturnValue([]);
      mockTournamentEntryRepository.find.mockResolvedValue([
        {
          tournament_id: "tourn-123",
          bot_id: "bot-123",
          created_at: new Date(),
          tournament: {
            id: "tourn-123",
            name: "Test Tournament",
            status: "running",
          },
        },
      ]);
      mockTournamentSeatRepository.findOne.mockResolvedValue({
        bot_id: "bot-123",
        chips: 5000,
        busted: false,
        table_id: "table-456",
      });
      mockTournamentSeatRepository.find.mockResolvedValue([
        { bot_id: "bot-123", chips: 5000, busted: false },
        { bot_id: "bot-456", chips: 3000, busted: false },
      ]);

      const result = await service.getBotActivity("bot-123");

      expect(result).not.toBeNull();
      expect(result!.isActive).toBe(true);
      expect(result!.activeTournaments).toHaveLength(1);
      expect(result!.activeTournaments[0].tournamentId).toBe("tourn-123");
      expect(result!.activeTournaments[0].tournamentName).toBe(
        "Test Tournament",
      );
      expect(result!.activeTournaments[0].chips).toBe(5000);
      expect(result!.activeTournaments[0].position).toBe(1);
    });

    it("should not include finished tournaments", async () => {
      mockBotRepository.findOne.mockResolvedValue(mockBot);
      mockLiveGameManager.getAllGames.mockReturnValue([]);
      mockTournamentEntryRepository.find.mockResolvedValue([
        {
          tournament_id: "tourn-123",
          bot_id: "bot-123",
          created_at: new Date(),
          tournament: {
            id: "tourn-123",
            name: "Finished Tournament",
            status: "finished",
          },
        },
      ]);

      const result = await service.getBotActivity("bot-123");

      expect(result!.activeTournaments).toHaveLength(0);
      expect(result!.isActive).toBe(false);
    });
  });

  describe("getActiveBotsForUser", () => {
    it("should return activities for all user bots", async () => {
      const userBots = [
        { ...mockBot, id: "bot-1", name: "Bot1" },
        { ...mockBot, id: "bot-2", name: "Bot2" },
      ];
      mockBotRepository.find.mockResolvedValue(userBots);
      mockBotRepository.findOne
        .mockResolvedValueOnce(userBots[0])
        .mockResolvedValueOnce(userBots[1]);
      mockLiveGameManager.getAllGames.mockReturnValue([]);
      mockTournamentEntryRepository.find.mockResolvedValue([]);

      const result = await service.getActiveBotsForUser("user-123");

      expect(result).toHaveLength(2);
      expect(result[0].botId).toBe("bot-1");
      expect(result[1].botId).toBe("bot-2");
    });
  });

  describe("getAllActiveBots", () => {
    it("should return all bots in active games", async () => {
      mockLiveGameManager.getAllGames.mockReturnValue([mockLiveGame]);
      mockTournamentRepository.find.mockResolvedValue([]);
      mockBotRepository.findOne.mockImplementation(
        (query: { where: { id: string } }) => {
          const id = query.where.id;
          if (id === "bot-123")
            return Promise.resolve({
              ...mockBot,
              id: "bot-123",
              name: "TestBot",
            });
          if (id === "bot-456")
            return Promise.resolve({
              ...mockBot,
              id: "bot-456",
              name: "OtherBot",
            });
          return Promise.resolve(null);
        },
      );
      mockTournamentEntryRepository.find.mockResolvedValue([]);

      const result = await service.getAllActiveBots();

      expect(result.length).toBeGreaterThanOrEqual(1);
      const botIds = result.map((r) => r.botId);
      expect(botIds).toContain("bot-123");
    });

    it("should return bots in running tournaments", async () => {
      mockLiveGameManager.getAllGames.mockReturnValue([]);
      mockTournamentRepository.find.mockResolvedValue([
        { id: "tourn-123", name: "Test Tournament", status: "running" },
      ]);
      mockTournamentSeatRepository.find.mockResolvedValue([
        { bot_id: "bot-789", chips: 2000, busted: false },
      ]);
      mockBotRepository.findOne.mockResolvedValue({
        ...mockBot,
        id: "bot-789",
        name: "TournamentBot",
      });
      mockTournamentEntryRepository.find.mockResolvedValue([
        {
          tournament_id: "tourn-123",
          bot_id: "bot-789",
          created_at: new Date(),
          tournament: {
            id: "tourn-123",
            name: "Test Tournament",
            status: "running",
          },
        },
      ]);

      const result = await service.getAllActiveBots();

      const bot = result.find((b) => b.botId === "bot-789");
      expect(bot).toBeDefined();
      if (bot) {
        expect(bot.activeTournaments).toHaveLength(1);
      }
    });
  });
});
