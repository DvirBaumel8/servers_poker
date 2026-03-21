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
  };
  let mockBotRepository: {
    findById: ReturnType<typeof vi.fn>;
    findByIds: ReturnType<typeof vi.fn>;
  };
  let mockAnalyticsRepository: Record<string, never>;

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
    late_reg_ends_level: 4,
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
    };

    mockBotRepository = {
      findById: vi.fn(),
      findByIds: vi.fn(),
    };

    mockAnalyticsRepository = {};

    service = new TournamentsService(
      mockTournamentRepository as never,
      mockBotRepository as never,
      mockAnalyticsRepository as never,
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
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
      mockBotRepository.findById.mockResolvedValue(mockBot);
      mockTournamentRepository.getEntries.mockResolvedValue([]);
      mockTournamentRepository.createEntry.mockResolvedValue({});

      await service.register("tourney-123", "bot-123", "user-123");

      expect(mockTournamentRepository.createEntry).toHaveBeenCalled();
    });

    it("should throw NotFoundException when tournament not found", async () => {
      mockTournamentRepository.findById.mockResolvedValue(null);

      await expect(
        service.register("nonexistent", "bot-123", "user-123"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException when tournament not accepting registrations", async () => {
      mockTournamentRepository.findById.mockResolvedValue({
        ...mockTournament,
        status: "running",
        late_reg_ends_level: 4,
      });

      // No currentLevel provided, should reject
      await expect(
        service.register("tourney-123", "bot-123", "user-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should allow late registration when within late_reg_ends_level", async () => {
      mockTournamentRepository.findById.mockResolvedValue({
        ...mockTournament,
        status: "running",
        late_reg_ends_level: 4,
      });
      mockBotRepository.findById.mockResolvedValue(mockBot);
      mockTournamentRepository.getEntries.mockResolvedValue([]);
      mockTournamentRepository.createEntry.mockResolvedValue({});

      // currentLevel 2 is within late_reg_ends_level 4
      await service.register("tourney-123", "bot-123", "user-123", 2);

      expect(mockTournamentRepository.createEntry).toHaveBeenCalled();
    });

    it("should reject late registration when past late_reg_ends_level", async () => {
      mockTournamentRepository.findById.mockResolvedValue({
        ...mockTournament,
        status: "running",
        late_reg_ends_level: 4,
      });

      // currentLevel 5 is past late_reg_ends_level 4
      await expect(
        service.register("tourney-123", "bot-123", "user-123", 5),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException when bot not found", async () => {
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
      mockBotRepository.findById.mockResolvedValue(null);

      await expect(
        service.register("tourney-123", "nonexistent", "user-123"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user does not own bot", async () => {
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
      mockBotRepository.findById.mockResolvedValue({
        ...mockBot,
        user_id: "other-user",
      });

      await expect(
        service.register("tourney-123", "bot-123", "user-123"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw BadRequestException when bot is not active", async () => {
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
      mockBotRepository.findById.mockResolvedValue({
        ...mockBot,
        active: false,
      });

      await expect(
        service.register("tourney-123", "bot-123", "user-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when tournament is full", async () => {
      mockTournamentRepository.findById.mockResolvedValue({
        ...mockTournament,
        max_players: 1,
      });
      mockBotRepository.findById.mockResolvedValue(mockBot);
      mockTournamentRepository.getEntries.mockResolvedValue([
        { bot_id: "other" },
      ]);

      await expect(
        service.register("tourney-123", "bot-123", "user-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when bot already registered", async () => {
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
      mockBotRepository.findById.mockResolvedValue(mockBot);
      mockTournamentRepository.getEntries.mockResolvedValue([
        { bot_id: "bot-123" },
      ]);

      await expect(
        service.register("tourney-123", "bot-123", "user-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when same user already has bot registered", async () => {
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
      mockBotRepository.findById.mockResolvedValue(mockBot);
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
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
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
      mockTournamentRepository.findById.mockResolvedValue({
        ...mockTournament,
        status: "running",
      });

      await expect(
        service.unregister("tourney-123", "bot-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when bot not registered", async () => {
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
      mockTournamentRepository.findEntryByBotId.mockResolvedValue(null);

      await expect(
        service.unregister("tourney-123", "bot-123"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("start", () => {
    it("should start tournament successfully", async () => {
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
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
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
      mockTournamentRepository.getEntries.mockResolvedValue([]);

      await expect(service.start("tourney-123")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("cancel", () => {
    it("should cancel tournament successfully", async () => {
      mockTournamentRepository.findById.mockResolvedValue(mockTournament);
      mockTournamentRepository.updateStatus.mockResolvedValue({});

      await service.cancel("tourney-123");

      expect(mockTournamentRepository.updateStatus).toHaveBeenCalledWith(
        "tourney-123",
        "cancelled",
      );
    });

    it("should throw BadRequestException when already finished", async () => {
      mockTournamentRepository.findById.mockResolvedValue({
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
