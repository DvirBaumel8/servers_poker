import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { TournamentsService } from "../../../src/modules/tournaments/tournaments.service";

describe("TournamentsService", () => {
  let service: TournamentsService;
  let mockTournamentRepository: {
    findById: ReturnType<typeof vi.fn>;
    findByIdOrThrow: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    findByStatus: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    getEntries: ReturnType<typeof vi.fn>;
    getResults: ReturnType<typeof vi.fn>;
    getSeatsOrderedByChips: ReturnType<typeof vi.fn>;
    createEntry: ReturnType<typeof vi.fn>;
    findEntryByBotId: ReturnType<typeof vi.fn>;
    deleteEntry: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    startBlindLevel: ReturnType<typeof vi.fn>;
    getEntryCounts: ReturnType<typeof vi.fn>;
  };
  let mockBotRepository: {
    findById: ReturnType<typeof vi.fn>;
    findByIdOrThrow: ReturnType<typeof vi.fn>;
    findByIds: ReturnType<typeof vi.fn>;
  };
  let mockAnalyticsRepository: Record<string, never>;
  let mockEventEmitter: {
    emit: ReturnType<typeof vi.fn>;
  };

  const mockTournament = {
    id: "tourney-123",
    name: "Test Tournament",
    type: "freezeout",
    status: "registering",
    buy_in: 100,
    starting_chips: 10000,
    min_players: 2,
    max_players: 100,
    players_per_table: 9,
    turn_timeout_ms: 10000,
    rebuys_allowed: false,
    scheduled_start_at: null,
    started_at: null,
    finished_at: null,
    created_at: new Date("2024-01-01"),
  };

  const mockBot = {
    id: "bot-123",
    name: "TestBot",
    user_id: "user-123",
    active: true,
  };

  beforeEach(() => {
    mockTournamentRepository = {
      findById: vi.fn(),
      findByIdOrThrow: vi.fn(),
      findAll: vi.fn(),
      findByStatus: vi.fn(),
      create: vi.fn(),
      getEntries: vi.fn(),
      getResults: vi.fn(),
      getSeatsOrderedByChips: vi.fn(),
      createEntry: vi.fn(),
      findEntryByBotId: vi.fn(),
      deleteEntry: vi.fn(),
      updateStatus: vi.fn(),
      startBlindLevel: vi.fn(),
      getEntryCounts: vi.fn().mockResolvedValue(new Map()),
    };

    mockBotRepository = {
      findById: vi.fn(),
      findByIdOrThrow: vi.fn(),
      findByIds: vi.fn(),
    };

    mockAnalyticsRepository = {};

    mockEventEmitter = {
      emit: vi.fn(),
    };

    const mockCacheService = {
      getOrSet: vi.fn().mockImplementation((_key, fn) => fn()),
    };

    service = new TournamentsService(
      mockTournamentRepository as never,
      mockBotRepository as never,
      mockAnalyticsRepository as never,
      mockEventEmitter as never,
      mockCacheService as never,
    );
  });

  describe("create", () => {
    it("should create tournament successfully", async () => {
      mockTournamentRepository.create.mockResolvedValue(mockTournament);

      const result = await service.create({
        name: "Test Tournament",
        type: "freezeout",
        buy_in: 100,
        starting_chips: 10000,
        min_players: 2,
        max_players: 100,
      });

      expect(result.name).toBe("Test Tournament");
      expect(mockTournamentRepository.create).toHaveBeenCalled();
    });

    it("should create tournament with blind levels", async () => {
      mockTournamentRepository.create.mockResolvedValue(mockTournament);
      mockTournamentRepository.startBlindLevel.mockResolvedValue({});

      await service.create({
        name: "Test",
        type: "freezeout",
        buy_in: 100,
        starting_chips: 10000,
        min_players: 2,
        max_players: 100,
        blind_levels: [
          { level: 1, small_blind: 25, big_blind: 50 },
          { level: 2, small_blind: 50, big_blind: 100, ante: 10 },
        ],
      });

      expect(mockTournamentRepository.startBlindLevel).toHaveBeenCalledTimes(2);
    });
  });

  describe("findById", () => {
    it("should return tournament response dto when found", async () => {
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
      mockTournamentRepository.getEntries.mockResolvedValue([]);

      const result = await service.findById("tourney-123");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("Test Tournament");
    });

    it("should return null when not found", async () => {
      mockTournamentRepository.findById.mockResolvedValue(null);

      const result = await service.findById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findAll", () => {
    it("should return all tournaments", async () => {
      mockTournamentRepository.findAll.mockResolvedValue([mockTournament]);
      mockTournamentRepository.getEntries.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
    });

    it("should filter by status", async () => {
      mockTournamentRepository.findByStatus.mockResolvedValue([mockTournament]);
      mockTournamentRepository.getEntries.mockResolvedValue([]);

      const result = await service.findAll("registering");

      expect(mockTournamentRepository.findByStatus).toHaveBeenCalledWith(
        "registering",
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("register", () => {
    it("should register bot successfully", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue(
        mockTournament,
      );
      mockBotRepository.findByIdOrThrow.mockResolvedValue(mockBot);
      mockTournamentRepository.getEntries.mockResolvedValue([]);
      mockTournamentRepository.createEntry.mockResolvedValue({});

      await service.register("tourney-123", "bot-123", "user-123");

      expect(mockTournamentRepository.createEntry).toHaveBeenCalled();
    });

    it("should throw NotFoundException when tournament not found", async () => {
      mockTournamentRepository.findByIdOrThrow.mockRejectedValue(
        new NotFoundException("Tournament nonexistent not found"),
      );

      await expect(
        service.register("nonexistent", "bot-123", "user-123"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException when tournament not accepting registrations", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue({
        ...mockTournament,
        status: "running",
      });

      await expect(
        service.register("tourney-123", "bot-123", "user-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException when bot not found", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue(
        mockTournament,
      );
      mockBotRepository.findByIdOrThrow.mockRejectedValue(
        new NotFoundException("Bot nonexistent not found"),
      );

      await expect(
        service.register("tourney-123", "nonexistent", "user-123"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user does not own bot", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue(
        mockTournament,
      );
      mockBotRepository.findByIdOrThrow.mockResolvedValue({
        ...mockBot,
        user_id: "other-user",
      });

      await expect(
        service.register("tourney-123", "bot-123", "user-123"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw BadRequestException when bot is not active", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue(
        mockTournament,
      );
      mockBotRepository.findByIdOrThrow.mockResolvedValue({
        ...mockBot,
        active: false,
      });

      await expect(
        service.register("tourney-123", "bot-123", "user-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when tournament is full", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue({
        ...mockTournament,
        max_players: 1,
      });
      mockBotRepository.findByIdOrThrow.mockResolvedValue(mockBot);
      mockTournamentRepository.getEntries.mockResolvedValue([
        { bot_id: "other" },
      ]);

      await expect(
        service.register("tourney-123", "bot-123", "user-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when bot already registered", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue(
        mockTournament,
      );
      mockBotRepository.findByIdOrThrow.mockResolvedValue(mockBot);
      mockTournamentRepository.getEntries.mockResolvedValue([
        { bot_id: "bot-123" },
      ]);

      await expect(
        service.register("tourney-123", "bot-123", "user-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when same user already has bot registered", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue(
        mockTournament,
      );
      mockBotRepository.findByIdOrThrow.mockResolvedValue(mockBot);
      mockTournamentRepository.getEntries.mockResolvedValue([
        { bot_id: "other-bot" },
      ]);
      mockBotRepository.findByIds.mockResolvedValue([
        { id: "other-bot", user_id: "user-123", name: "OtherBot" },
      ]);

      await expect(
        service.register("tourney-123", "bot-123", "user-123"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("unregister", () => {
    it("should unregister bot successfully", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue(
        mockTournament,
      );
      mockTournamentRepository.findEntryByBotId.mockResolvedValue({
        id: "entry-1",
      });
      mockTournamentRepository.deleteEntry.mockResolvedValue({});

      await service.unregister("tourney-123", "bot-123");

      expect(mockTournamentRepository.deleteEntry).toHaveBeenCalledWith(
        "entry-1",
      );
    });

    it("should throw BadRequestException when tournament started", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue({
        ...mockTournament,
        status: "running",
      });

      await expect(
        service.unregister("tourney-123", "bot-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when bot not registered", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue(
        mockTournament,
      );
      mockTournamentRepository.findEntryByBotId.mockResolvedValue(null);

      await expect(
        service.unregister("tourney-123", "bot-123"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("start", () => {
    it("should start tournament successfully", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue(
        mockTournament,
      );
      mockTournamentRepository.getEntries.mockResolvedValue([
        { bot_id: "bot-1" },
        { bot_id: "bot-2" },
      ]);
      mockTournamentRepository.updateStatus.mockResolvedValue({});

      await service.start("tourney-123");

      expect(mockTournamentRepository.updateStatus).toHaveBeenCalledWith(
        "tourney-123",
        "running",
      );
    });

    it("should throw BadRequestException when not enough players", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue(
        mockTournament,
      );
      mockTournamentRepository.getEntries.mockResolvedValue([]);

      await expect(service.start("tourney-123")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("cancel", () => {
    it("should cancel tournament successfully", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue(
        mockTournament,
      );
      mockTournamentRepository.updateStatus.mockResolvedValue({});
      mockTournamentRepository.getEntries.mockResolvedValue([]);

      await service.cancel("tourney-123");

      expect(mockTournamentRepository.updateStatus).toHaveBeenCalledWith(
        "tourney-123",
        "cancelled",
      );
    });

    it("should throw BadRequestException when already finished", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue({
        ...mockTournament,
        status: "finished",
      });

      await expect(service.cancel("tourney-123")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("getResults", () => {
    it("should return tournament results", async () => {
      mockTournamentRepository.getResults.mockResolvedValue([
        {
          bot_id: "bot-1",
          bot: { name: "Bot1" },
          finish_position: 1,
          payout: 1000,
        },
        {
          bot_id: "bot-2",
          bot: { name: "Bot2" },
          finish_position: 2,
          payout: 500,
        },
      ]);

      const result = await service.getResults("tourney-123");

      expect(result).toHaveLength(2);
      expect(result[0].finish_position).toBe(1);
    });

    it("should filter out entries without finish position", async () => {
      mockTournamentRepository.getResults.mockResolvedValue([
        {
          bot_id: "bot-1",
          bot: { name: "Bot1" },
          finish_position: 1,
          payout: 0,
        },
        { bot_id: "bot-2", bot: null, finish_position: null, payout: 0 },
      ]);

      const result = await service.getResults("tourney-123");

      expect(result).toHaveLength(1);
    });
  });

  // ── Admin bot management ──────────────────────────────────────────────────

  describe("getAdminEntries", () => {
    it("returns mapped entries with isSystem flag", async () => {
      mockTournamentRepository.getEntries.mockResolvedValue([
        {
          id: "entry-1",
          bot_id: "bot-1",
          bot: {
            name: "The Shark",
            isSystem: true,
            user: { name: "BotRoyale Team" },
          },
        },
        {
          id: "entry-2",
          bot_id: "bot-2",
          bot: { name: "Alice", isSystem: false, user: { name: "dvir" } },
        },
      ]);

      const result = await service.getAdminEntries("tourney-123");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        entryId: "entry-1",
        botId: "bot-1",
        botName: "The Shark",
        ownerName: "BotRoyale Team",
        isSystem: true,
      });
      expect(result[1]).toEqual({
        entryId: "entry-2",
        botId: "bot-2",
        botName: "Alice",
        ownerName: "dvir",
        isSystem: false,
      });
    });

    it("falls back to 'Unknown' when bot relation is missing", async () => {
      mockTournamentRepository.getEntries.mockResolvedValue([
        { id: "entry-1", bot_id: "bot-1", bot: null },
      ]);

      const result = await service.getAdminEntries("tourney-123");

      expect(result[0].botName).toBe("Unknown");
      expect(result[0].ownerName).toBe("Unknown");
      expect(result[0].isSystem).toBe(false);
    });
  });

  describe("removeEntry", () => {
    it("deletes the entry for a registering tournament", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue({
        ...mockTournament,
        status: "registering",
      });
      mockTournamentRepository.deleteEntry.mockResolvedValue(undefined);

      await service.removeEntry("tourney-123", "entry-1");

      expect(mockTournamentRepository.deleteEntry).toHaveBeenCalledWith(
        "entry-1",
      );
    });

    it("throws BadRequestException when tournament is not registering", async () => {
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue({
        ...mockTournament,
        status: "running",
      });

      await expect(
        service.removeEntry("tourney-123", "entry-1"),
      ).rejects.toThrow(BadRequestException);
      expect(mockTournamentRepository.deleteEntry).not.toHaveBeenCalled();
    });
  });

  describe("injectSystemBots", () => {
    const makeBots = (names: string[]) =>
      names.map((name, i) => ({
        id: `sys-bot-${i}`,
        name,
        isSystem: true,
        active: true,
      }));

    function makeServiceWithBots(bots: object[]) {
      const mockDataSource = {
        getRepository: vi
          .fn()
          .mockReturnValue({ find: vi.fn().mockResolvedValue(bots) }),
        query: vi.fn().mockResolvedValue([]),
      };
      const mockCacheService = {
        getOrSet: vi
          .fn()
          .mockImplementation((_k: string, fn: () => unknown) => fn()),
      };
      return new TournamentsService(
        mockTournamentRepository as never,
        mockBotRepository as never,
        mockAnalyticsRepository as never,
        mockEventEmitter as never,
        mockCacheService as never,
        mockDataSource as never,
      );
    }

    it("injects unique bots when slots are available", async () => {
      const bots = makeBots(["Shark", "Rock", "Maniac"]);
      const svc = makeServiceWithBots(bots);
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue({
        ...mockTournament,
        max_players: 10,
      });
      mockTournamentRepository.getEntries.mockResolvedValue([]);
      mockTournamentRepository.createEntry.mockResolvedValue({});

      const result = await svc.injectSystemBots("tourney-123", "random", 3);

      expect(result.injected).toBe(3);
      expect(mockTournamentRepository.createEntry).toHaveBeenCalledTimes(3);
    });

    it("cycles through pool when all unique bots are already registered", async () => {
      const bots = makeBots(["Shark", "Rock"]);
      const svc = makeServiceWithBots(bots);
      // Both bots already registered
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue({
        ...mockTournament,
        max_players: 10,
      });
      mockTournamentRepository.getEntries.mockResolvedValue([
        { bot_id: "sys-bot-0" },
        { bot_id: "sys-bot-1" },
      ]);
      mockTournamentRepository.createEntry.mockResolvedValue({});

      const result = await svc.injectSystemBots("tourney-123", "random", 3);

      // Should still inject 3 by cycling
      expect(result.injected).toBe(3);
      expect(mockTournamentRepository.createEntry).toHaveBeenCalledTimes(3);
    });

    it("throws when tournament is not registering", async () => {
      const svc = makeServiceWithBots([]);
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue({
        ...mockTournament,
        status: "running",
      });

      await expect(svc.injectSystemBots("tourney-123")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws when tournament is already full", async () => {
      const bots = makeBots(["Shark"]);
      const svc = makeServiceWithBots(bots);
      mockTournamentRepository.findByIdOrThrow.mockResolvedValue({
        ...mockTournament,
        max_players: 2,
      });
      mockTournamentRepository.getEntries.mockResolvedValue([
        { bot_id: "a" },
        { bot_id: "b" },
      ]);

      await expect(svc.injectSystemBots("tourney-123")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("getSeedingMap", () => {
    function makeServiceWithQuery(queryResult: object[]) {
      const mockDataSource = {
        getRepository: vi.fn(),
        query: vi.fn().mockResolvedValue(queryResult),
      };
      const mockCacheService = {
        getOrSet: vi
          .fn()
          .mockImplementation((_k: string, fn: () => unknown) => fn()),
      };
      return new TournamentsService(
        mockTournamentRepository as never,
        mockBotRepository as never,
        mockAnalyticsRepository as never,
        mockEventEmitter as never,
        mockCacheService as never,
        mockDataSource as never,
      );
    }

    it("includes all tables — active and broken", async () => {
      const svc = makeServiceWithQuery([
        {
          table_id: "t1",
          table_number: "1",
          table_status: "active",
          bot_id: "b1",
          bot_name: "Shark",
          user_id: "u1",
          user_name: "Team",
          wins: "10",
          busted: false,
        },
        {
          table_id: "t2",
          table_number: "2",
          table_status: "finished",
          bot_id: "b2",
          bot_name: "Rock",
          user_id: "u1",
          user_name: "Team",
          wins: "5",
          busted: true,
        },
      ]);

      const result = await svc.getSeedingMap("tourney-123");

      expect(result.tables).toHaveLength(2);
      expect(result.tables.find((t) => t.tableNumber === 1)!.broken).toBe(
        false,
      );
      expect(result.tables.find((t) => t.tableNumber === 2)!.broken).toBe(true);
    });

    it("marks busted seats correctly", async () => {
      const svc = makeServiceWithQuery([
        {
          table_id: "t1",
          table_number: "1",
          table_status: "active",
          bot_id: "b1",
          bot_name: "Shark",
          user_id: "u1",
          user_name: "Team",
          wins: "10",
          busted: false,
        },
        {
          table_id: "t1",
          table_number: "1",
          table_status: "active",
          bot_id: "b2",
          bot_name: "Rock",
          user_id: "u1",
          user_name: "Team",
          wins: "5",
          busted: true,
        },
      ]);

      const result = await svc.getSeedingMap("tourney-123");
      const seats = result.tables[0].seats;

      expect(seats.find((s) => s.botName === "Shark")!.busted).toBe(false);
      expect(seats.find((s) => s.botName === "Rock")!.busted).toBe(true);
    });

    it("fairness score ignores broken tables", async () => {
      // Active table: avg ELO 100. Broken table: avg ELO 1000. Should not skew score.
      const svc = makeServiceWithQuery([
        {
          table_id: "t1",
          table_number: "1",
          table_status: "active",
          bot_id: "b1",
          bot_name: "A",
          user_id: "u1",
          user_name: "T",
          wins: "100",
          busted: false,
        },
        {
          table_id: "t2",
          table_number: "2",
          table_status: "active",
          bot_id: "b2",
          bot_name: "B",
          user_id: "u1",
          user_name: "T",
          wins: "100",
          busted: false,
        },
        {
          table_id: "t3",
          table_number: "3",
          table_status: "finished",
          bot_id: "b3",
          bot_name: "C",
          user_id: "u1",
          user_name: "T",
          wins: "1000",
          busted: true,
        },
      ]);

      const result = await svc.getSeedingMap("tourney-123");

      // Two active tables with equal ELO → perfect balance (score = 0)
      expect(result.fairnessScore).toBe(0);
    });
  });

  describe("getLeaderboard", () => {
    it("should return leaderboard ordered by chips", async () => {
      mockTournamentRepository.getEntries.mockResolvedValue([
        { bot_id: "bot-1", bot: { name: "Bot1" } },
        { bot_id: "bot-2", bot: { name: "Bot2" } },
      ]);
      mockTournamentRepository.getSeatsOrderedByChips.mockResolvedValue([
        { bot_id: "bot-2", chips: 15000, busted: false },
        { bot_id: "bot-1", chips: 5000, busted: false },
      ]);

      const result = await service.getLeaderboard("tourney-123");

      expect(result).toHaveLength(2);
      expect(result[0].position).toBe(1);
      expect(result[0].chips).toBe(15000);
    });
  });
});
