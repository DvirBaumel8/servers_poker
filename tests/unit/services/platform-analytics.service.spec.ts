import { describe, it, expect, beforeEach, vi } from "vitest";
import { PlatformAnalyticsService } from "../../../src/services/platform-analytics.service";

describe("PlatformAnalyticsService", () => {
  let service: PlatformAnalyticsService;
  let mockUserRepository: {
    count: ReturnType<typeof vi.fn>;
  };
  let mockBotRepository: {
    count: ReturnType<typeof vi.fn>;
  };
  let mockGameRepository: {
    count: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  let mockHandRepository: {
    count: ReturnType<typeof vi.fn>;
  };
  let mockTournamentRepository: {
    count: ReturnType<typeof vi.fn>;
  };
  let mockBotEventRepository: {
    count: ReturnType<typeof vi.fn>;
  };
  let mockChipMovementRepository: {
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  let mockActionRepository: {
    count: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  let mockGamePlayerRepository: {
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  let mockMetricsRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let mockAuditLogRepository: {
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };

  const createMockQueryBuilder = (result: unknown = null) => {
    const qb = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      addGroupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      getRawOne: vi.fn().mockResolvedValue(result),
      getRawMany: vi.fn().mockResolvedValue(result),
    };
    return qb;
  };

  beforeEach(() => {
    mockUserRepository = {
      count: vi.fn().mockResolvedValue(100),
    };

    mockBotRepository = {
      count: vi.fn().mockResolvedValue(50),
    };

    mockGameRepository = {
      count: vi.fn().mockResolvedValue(25),
      createQueryBuilder: vi
        .fn()
        .mockReturnValue(createMockQueryBuilder({ count: "10" })),
    };

    mockHandRepository = {
      count: vi.fn().mockResolvedValue(1000),
    };

    mockTournamentRepository = {
      count: vi.fn().mockResolvedValue(15),
    };

    mockBotEventRepository = {
      count: vi.fn().mockResolvedValue(5),
    };

    mockChipMovementRepository = {
      createQueryBuilder: vi
        .fn()
        .mockReturnValue(createMockQueryBuilder({ total: "500000" })),
    };

    mockActionRepository = {
      count: vi.fn().mockResolvedValue(5000),
      createQueryBuilder: vi
        .fn()
        .mockReturnValue(createMockQueryBuilder({ avg: "45" })),
    };

    mockGamePlayerRepository = {
      createQueryBuilder: vi
        .fn()
        .mockReturnValue(createMockQueryBuilder({ count: "20" })),
    };

    mockMetricsRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi
        .fn()
        .mockImplementation((data) => ({ id: "metrics-1", ...data })),
      save: vi.fn().mockImplementation((data) => Promise.resolve(data)),
    };

    mockAuditLogRepository = {
      createQueryBuilder: vi
        .fn()
        .mockReturnValue(createMockQueryBuilder({ count: "30" })),
    };

    service = new PlatformAnalyticsService(
      mockUserRepository as never,
      mockBotRepository as never,
      mockGameRepository as never,
      mockHandRepository as never,
      mockTournamentRepository as never,
      mockBotEventRepository as never,
      mockChipMovementRepository as never,
      mockActionRepository as never,
      mockGamePlayerRepository as never,
      mockMetricsRepository as never,
      mockAuditLogRepository as never,
    );
  });

  describe("getLifetimeStats", () => {
    it("should return aggregated lifetime statistics", async () => {
      const result = await service.getLifetimeStats();

      expect(result).toEqual({
        totalUsers: 100,
        totalBots: 50,
        totalHandsDealt: 1000,
        totalTournaments: 15,
        totalGames: 25,
        totalChipVolume: 500000,
      });
    });

    it("should handle zero chip volume", async () => {
      mockChipMovementRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({ total: null }),
      );

      const result = await service.getLifetimeStats();

      expect(result.totalChipVolume).toBe(0);
    });

    it("should cache hand count for performance", async () => {
      await service.getLifetimeStats();
      await service.getLifetimeStats();

      // Should only call count once due to caching
      expect(mockHandRepository.count).toHaveBeenCalledTimes(1);
    });
  });

  describe("getTodayStats", () => {
    it("should return today's statistics", async () => {
      const result = await service.getTodayStats();

      expect(result).toHaveProperty("newUsers");
      expect(result).toHaveProperty("activeUsers");
      expect(result).toHaveProperty("newBots");
      expect(result).toHaveProperty("activeBots");
      expect(result).toHaveProperty("gamesPlayed");
      expect(result).toHaveProperty("handsDealt");
      expect(result).toHaveProperty("tournamentsCompleted");
    });

    it("should filter by today's date", async () => {
      await service.getTodayStats();

      expect(mockUserRepository.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.any(Object),
          }),
        }),
      );
    });
  });

  describe("getLiveStats", () => {
    it("should return live game statistics", async () => {
      mockGameRepository.count.mockResolvedValue(3);
      mockTournamentRepository.count.mockResolvedValue(1);

      const result = await service.getLiveStats();

      expect(result).toHaveProperty("activeGames");
      expect(result).toHaveProperty("activeTournaments");
      expect(result).toHaveProperty("playersInGames");
      expect(result).toHaveProperty("currentHandsPerMinute");
    });
  });

  describe("getHealthStats", () => {
    it("should return health and performance statistics", async () => {
      const result = await service.getHealthStats();

      expect(result).toHaveProperty("avgBotResponseMs");
      expect(result).toHaveProperty("botTimeoutCount");
      expect(result).toHaveProperty("botErrorCount");
      expect(result).toHaveProperty("errorRate");
    });

    it("should calculate error rate correctly", async () => {
      mockBotEventRepository.count
        .mockResolvedValueOnce(10) // timeouts
        .mockResolvedValueOnce(5); // errors
      mockActionRepository.count.mockResolvedValue(1000);

      const result = await service.getHealthStats();

      // 15 errors / 1000 actions = 1.5%
      expect(result.errorRate).toBe("1.50%");
    });

    it("should handle zero actions gracefully", async () => {
      mockActionRepository.count.mockResolvedValue(0);

      const result = await service.getHealthStats();

      expect(result.errorRate).toBe("0%");
    });
  });

  describe("getPlatformStats", () => {
    it("should combine all stats into one response", async () => {
      const result = await service.getPlatformStats();

      expect(result).toHaveProperty("lifetime");
      expect(result).toHaveProperty("today");
      expect(result).toHaveProperty("live");
      expect(result).toHaveProperty("health");
      expect(result).toHaveProperty("generatedAt");
      expect(new Date(result.generatedAt)).toBeInstanceOf(Date);
    });
  });

  describe("getTopPerformers", () => {
    it("should return top performing bots", async () => {
      const mockPerformers = [
        { botId: "bot-1", botName: "Winner", netChips: "10000" },
        { botId: "bot-2", botName: "Runner", netChips: "5000" },
      ];

      mockGamePlayerRepository.createQueryBuilder.mockReturnValue({
        ...createMockQueryBuilder([]),
        getRawMany: vi.fn().mockResolvedValue(mockPerformers),
      });

      const result = await service.getTopPerformers(5);

      expect(result).toHaveLength(2);
      expect(result[0].botName).toBe("Winner");
      expect(result[0].netChips).toBe(10000);
    });

    it("should limit results to requested count", async () => {
      const mockPerformers = Array.from({ length: 10 }, (_, i) => ({
        botId: `bot-${i}`,
        botName: `Bot${i}`,
        netChips: String(10000 - i * 100),
      }));

      mockGamePlayerRepository.createQueryBuilder.mockReturnValue({
        ...createMockQueryBuilder([]),
        getRawMany: vi.fn().mockResolvedValue(mockPerformers.slice(0, 3)),
      });

      const result = await service.getTopPerformers(3);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it("should handle empty results", async () => {
      mockGamePlayerRepository.createQueryBuilder.mockReturnValue({
        ...createMockQueryBuilder([]),
        getRawMany: vi.fn().mockResolvedValue([]),
      });

      const result = await service.getTopPerformers(5);

      expect(result).toEqual([]);
    });
  });

  describe("saveDailyMetrics", () => {
    it("should create new metrics record for today", async () => {
      mockMetricsRepository.findOne.mockResolvedValue(null);

      await service.saveDailyMetrics();

      expect(mockMetricsRepository.create).toHaveBeenCalled();
      expect(mockMetricsRepository.save).toHaveBeenCalled();
    });

    it("should update existing metrics record", async () => {
      const existingMetrics = {
        id: "existing-1",
        date: new Date(),
        total_users: 50,
      };
      mockMetricsRepository.findOne.mockResolvedValue(existingMetrics);

      const result = await service.saveDailyMetrics();

      expect(result.total_users).toBe(100); // Updated from mock
      expect(mockMetricsRepository.save).toHaveBeenCalled();
    });
  });

  describe("getMetricsHistory", () => {
    it("should return metrics for specified number of days", async () => {
      const mockHistory = [
        { date: new Date("2026-03-19"), hands_dealt: 100 },
        { date: new Date("2026-03-20"), hands_dealt: 150 },
        { date: new Date("2026-03-21"), hands_dealt: 200 },
      ];
      mockMetricsRepository.find.mockResolvedValue(mockHistory);

      const result = await service.getMetricsHistory(30);

      expect(result).toHaveLength(3);
      expect(mockMetricsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { date: "ASC" },
        }),
      );
    });

    it("should default to 30 days", async () => {
      await service.getMetricsHistory();

      expect(mockMetricsRepository.find).toHaveBeenCalled();
    });
  });

  describe("getDailySummaryData", () => {
    it("should return comprehensive daily summary data", async () => {
      mockGamePlayerRepository.createQueryBuilder.mockReturnValue({
        ...createMockQueryBuilder([]),
        getRawMany: vi.fn().mockResolvedValue([]),
      });

      const result = await service.getDailySummaryData();

      expect(result).toHaveProperty("date");
      expect(result).toHaveProperty("lifetime");
      expect(result).toHaveProperty("today");
      expect(result).toHaveProperty("health");
      expect(result).toHaveProperty("topPerformers");
      expect(result).toHaveProperty("peakConcurrentGames");
    });
  });
});
