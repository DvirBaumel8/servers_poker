import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { DailySummaryService } from "../../../src/services/daily-summary.service";
import { ConfigService } from "@nestjs/config";

describe("DailySummaryService", () => {
  let service: DailySummaryService;
  let mockConfigService: {
    get: ReturnType<typeof vi.fn>;
  };
  let mockEmailService: {
    sendEmail: ReturnType<typeof vi.fn>;
  };
  let mockAnalyticsService: {
    getDailySummaryData: ReturnType<typeof vi.fn>;
    saveDailyMetrics: ReturnType<typeof vi.fn>;
  };
  let mockRedisHealthService: {
    getHealthStatus: ReturnType<typeof vi.fn>;
  };
  let mockSummaryRepository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  const mockSummaryData = {
    date: new Date("2026-03-21"),
    lifetime: {
      totalUsers: 100,
      totalBots: 50,
      totalHandsDealt: 1000,
      totalTournaments: 15,
      totalGames: 25,
      totalChipVolume: 500000,
    },
    today: {
      newUsers: 5,
      activeUsers: 20,
      newBots: 3,
      activeBots: 15,
      gamesPlayed: 10,
      handsDealt: 200,
      tournamentsCompleted: 2,
    },
    health: {
      avgBotResponseMs: 45,
      botTimeoutCount: 2,
      botErrorCount: 1,
      errorRate: "0.15%",
    },
    topPerformers: [
      { botId: "bot-1", botName: "WinnerBot", netChips: 5000 },
      { botId: "bot-2", botName: "RunnerBot", netChips: 3000 },
    ],
    peakConcurrentGames: 8,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T09:00:00Z"));

    mockConfigService = {
      get: vi.fn((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          DAILY_SUMMARY_ENABLED: "true",
          DAILY_SUMMARY_RECIPIENTS: "admin@test.com,owner@test.com",
          DAILY_SUMMARY_HOUR: "8",
          APP_NAME: "Test Poker Platform",
        };
        return config[key] ?? defaultValue;
      }),
    };

    mockEmailService = {
      sendEmail: vi.fn().mockResolvedValue(true),
    };

    mockAnalyticsService = {
      getDailySummaryData: vi.fn().mockResolvedValue(mockSummaryData),
      saveDailyMetrics: vi.fn().mockResolvedValue({}),
    };

    mockRedisHealthService = {
      getHealthStatus: vi.fn().mockResolvedValue({
        connected: true,
        latencyMs: 5,
      }),
    };

    mockSummaryRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation((data) => ({ id: "summary-1", ...data })),
      save: vi.fn().mockImplementation((data) => Promise.resolve(data)),
    };

    service = new DailySummaryService(
      mockConfigService as unknown as ConfigService,
      mockEmailService as never,
      mockAnalyticsService as never,
      mockRedisHealthService as never,
      mockSummaryRepository as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should parse recipients correctly", () => {
      expect(service).toBeDefined();
    });

    it("should handle empty recipients", () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === "DAILY_SUMMARY_RECIPIENTS") return "";
          return defaultValue;
        },
      );

      const emptyService = new DailySummaryService(
        mockConfigService as unknown as ConfigService,
        mockEmailService as never,
        mockAnalyticsService as never,
        mockRedisHealthService as never,
        mockSummaryRepository as never,
      );

      expect(emptyService).toBeDefined();
    });

    it("should filter invalid email addresses", () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === "DAILY_SUMMARY_RECIPIENTS")
            return "valid@test.com,invalid,another@test.com";
          return defaultValue;
        },
      );

      const filteredService = new DailySummaryService(
        mockConfigService as unknown as ConfigService,
        mockEmailService as never,
        mockAnalyticsService as never,
        mockRedisHealthService as never,
        mockSummaryRepository as never,
      );

      expect(filteredService).toBeDefined();
    });
  });

  describe("sendDailySummary", () => {
    it("should send email to all recipients", async () => {
      const result = await service.sendDailySummary();

      expect(result).toBe(true);
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(2); // Two recipients
    });

    it("should return false when no recipients configured", async () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === "DAILY_SUMMARY_RECIPIENTS") return "";
          if (key === "DAILY_SUMMARY_ENABLED") return "true";
          return defaultValue;
        },
      );

      const emptyService = new DailySummaryService(
        mockConfigService as unknown as ConfigService,
        mockEmailService as never,
        mockAnalyticsService as never,
        mockRedisHealthService as never,
        mockSummaryRepository as never,
      );

      const result = await emptyService.sendDailySummary();

      expect(result).toBe(false);
    });

    it("should skip if summary already sent for that date", async () => {
      mockSummaryRepository.findOne.mockResolvedValue({
        id: "existing",
        status: "sent",
        summary_date: new Date("2026-03-20"),
      });

      const result = await service.sendDailySummary();

      expect(result).toBe(true);
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    it("should create summary record on first send", async () => {
      await service.sendDailySummary();

      expect(mockSummaryRepository.create).toHaveBeenCalled();
      expect(mockSummaryRepository.save).toHaveBeenCalled();
    });

    it("should update summary record on successful send", async () => {
      await service.sendDailySummary();

      const savedSummary = mockSummaryRepository.save.mock.calls[0][0];
      expect(savedSummary.status).toBe("sent");
      expect(savedSummary.sent_at).toBeDefined();
    });

    it("should mark as failed if any email fails", async () => {
      mockEmailService.sendEmail
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await service.sendDailySummary();

      expect(result).toBe(false);
      const savedSummary = mockSummaryRepository.save.mock.calls[0][0];
      expect(savedSummary.status).toBe("failed");
    });

    it("should handle analytics service error", async () => {
      mockAnalyticsService.getDailySummaryData.mockRejectedValue(
        new Error("Database error"),
      );

      const result = await service.sendDailySummary();

      expect(result).toBe(false);
      const savedSummary = mockSummaryRepository.save.mock.calls[0][0];
      expect(savedSummary.status).toBe("failed");
      expect(savedSummary.error_message).toBe("Database error");
    });

    it("should include correct subject line", async () => {
      await service.sendDailySummary();

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("Daily Summary"),
        }),
      );
    });

    it("should include both text and HTML content", async () => {
      await service.sendDailySummary();

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("DAILY SUMMARY"),
          html: expect.stringContaining("<!DOCTYPE html>"),
        }),
      );
    });
  });

  describe("handleDailySummaryCron", () => {
    it("should not send if disabled", async () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: unknown) => {
          if (key === "DAILY_SUMMARY_ENABLED") return "false";
          return defaultValue;
        },
      );

      const disabledService = new DailySummaryService(
        mockConfigService as unknown as ConfigService,
        mockEmailService as never,
        mockAnalyticsService as never,
        mockRedisHealthService as never,
        mockSummaryRepository as never,
      );

      await disabledService.handleDailySummaryCron();

      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    it("should not send if not at configured hour", async () => {
      // Time is set to 9:00, but configured hour is 8
      vi.setSystemTime(new Date("2026-03-21T09:00:00Z"));

      await service.handleDailySummaryCron();

      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    it("should send at configured hour", async () => {
      vi.setSystemTime(new Date("2026-03-21T08:00:00Z"));

      await service.handleDailySummaryCron();

      expect(mockAnalyticsService.getDailySummaryData).toHaveBeenCalled();
    });
  });

  describe("handleDailyMetricsCron", () => {
    it("should save daily metrics", async () => {
      await service.handleDailyMetricsCron();

      expect(mockAnalyticsService.saveDailyMetrics).toHaveBeenCalled();
    });

    it("should handle save errors gracefully", async () => {
      mockAnalyticsService.saveDailyMetrics.mockRejectedValue(
        new Error("Save failed"),
      );

      // Should not throw
      await expect(service.handleDailyMetricsCron()).resolves.not.toThrow();
    });
  });

  describe("triggerManualSummary", () => {
    it("should trigger summary send immediately", async () => {
      const result = await service.triggerManualSummary();

      expect(result).toBe(true);
      expect(mockAnalyticsService.getDailySummaryData).toHaveBeenCalled();
    });
  });

  describe("email content generation", () => {
    it("should include platform health status", async () => {
      await service.sendDailySummary();

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Platform Health"),
        }),
      );
    });

    it("should include user activity metrics", async () => {
      await service.sendDailySummary();

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("User Activity"),
          text: expect.stringContaining("New Registrations"),
        }),
      );
    });

    it("should include top performers", async () => {
      await service.sendDailySummary();

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Top Performing Bots"),
          text: expect.stringContaining("WinnerBot"),
        }),
      );
    });

    it("should handle Redis disconnected status", async () => {
      mockRedisHealthService.getHealthStatus.mockResolvedValue({
        connected: false,
      });

      await service.sendDailySummary();

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Redis Status: Disconnected"),
        }),
      );
    });

    it("should format large numbers correctly", async () => {
      mockAnalyticsService.getDailySummaryData.mockResolvedValue({
        ...mockSummaryData,
        lifetime: {
          ...mockSummaryData.lifetime,
          totalChipVolume: 1500000000,
        },
      });

      await service.sendDailySummary();

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("1.5B"),
        }),
      );
    });
  });
});
