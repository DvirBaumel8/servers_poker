import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { BotAutoRegistrationService } from "../../../src/services/bot/bot-auto-registration.service";

describe("BotAutoRegistrationService", () => {
  let service: BotAutoRegistrationService;
  let mockSubscriptionRepository: {
    findById: ReturnType<typeof vi.fn>;
    findByBotId: ReturnType<typeof vi.fn>;
    findActiveByBotId: ReturnType<typeof vi.fn>;
    findByTournamentId: ReturnType<typeof vi.fn>;
    findAllActive: ReturnType<typeof vi.fn>;
    findMatchingSubscriptions: ReturnType<typeof vi.fn>;
    incrementSuccessful: ReturnType<typeof vi.fn>;
    incrementFailed: ReturnType<typeof vi.fn>;
    deleteExpired: ReturnType<typeof vi.fn>;
  };
  let mockTournamentRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let mockEntryRepository: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    createQueryBuilder: ReturnType<typeof vi.fn>;
  };
  let mockBotRepository: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let mockEventEmitter: EventEmitter2;

  const mockSubscription = {
    id: "sub-123",
    bot_id: "bot-123",
    tournament_id: null,
    tournament_type_filter: null,
    min_buy_in: null,
    max_buy_in: null,
    priority: 50,
    status: "active",
    successful_registrations: 0,
    failed_registrations: 0,
  };

  const mockBot = {
    id: "bot-123",
    name: "TestBot",
    active: true,
    user_id: "user-123",
  };

  const mockTournament = {
    id: "tourn-123",
    name: "Test Tournament",
    type: "rolling",
    status: "registering",
    buy_in: 100,
    max_players: 10,
  };

  beforeEach(() => {
    mockSubscriptionRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findByBotId: vi.fn().mockResolvedValue([]),
      findActiveByBotId: vi.fn().mockResolvedValue([]),
      findByTournamentId: vi.fn().mockResolvedValue([]),
      findAllActive: vi.fn().mockResolvedValue([]),
      findMatchingSubscriptions: vi.fn().mockResolvedValue([]),
      incrementSuccessful: vi.fn().mockResolvedValue(undefined),
      incrementFailed: vi.fn().mockResolvedValue(undefined),
      deleteExpired: vi.fn().mockResolvedValue(0),
    };

    mockTournamentRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
    };

    const mockQueryBuilder = {
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getCount: vi.fn().mockResolvedValue(0),
    };

    mockEntryRepository = {
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation((data) => data),
      save: vi
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ ...data, id: "entry-123" }),
        ),
      createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
    };

    mockBotRepository = {
      findOne: vi.fn().mockResolvedValue(null),
    };

    mockEventEmitter = new EventEmitter2();
    vi.spyOn(mockEventEmitter, "emit");

    service = new BotAutoRegistrationService(
      mockSubscriptionRepository as never,
      mockTournamentRepository as never,
      mockEntryRepository as never,
      mockBotRepository as never,
      mockEventEmitter,
    );
  });

  describe("manualTrigger", () => {
    it("should return failure when subscription not found", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(null);

      const result = await service.manualTrigger("invalid-sub", "tourn-123");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("Subscription not found");
    });

    it("should return failure when bot not found", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);
      mockBotRepository.findOne.mockResolvedValue(null);

      const result = await service.manualTrigger("sub-123", "tourn-123");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("Bot not found");
      expect(mockSubscriptionRepository.incrementFailed).toHaveBeenCalled();
    });

    it("should return failure when bot is inactive", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);
      mockBotRepository.findOne.mockResolvedValue({
        ...mockBot,
        active: false,
      });

      const result = await service.manualTrigger("sub-123", "tourn-123");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("Bot is inactive");
    });

    it("should return success when bot already registered", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);
      mockBotRepository.findOne.mockResolvedValue(mockBot);
      mockEntryRepository.findOne.mockResolvedValue({
        id: "existing-entry",
        tournament_id: "tourn-123",
        bot_id: "bot-123",
      });

      const result = await service.manualTrigger("sub-123", "tourn-123");

      expect(result.success).toBe(true);
      expect(result.reason).toBe("Bot already registered");
    });

    it("should return failure when tournament not found", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);
      mockBotRepository.findOne.mockResolvedValue(mockBot);
      mockEntryRepository.findOne.mockResolvedValue(null);
      mockTournamentRepository.findOne.mockResolvedValue(null);

      const result = await service.manualTrigger("sub-123", "tourn-123");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("Tournament not found");
    });

    it("should return failure when tournament not accepting registrations", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);
      mockBotRepository.findOne.mockResolvedValue(mockBot);
      mockEntryRepository.findOne.mockResolvedValue(null);
      mockTournamentRepository.findOne.mockResolvedValue({
        ...mockTournament,
        status: "running",
      });

      const result = await service.manualTrigger("sub-123", "tourn-123");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("Tournament not accepting registrations");
    });

    it("should return failure when tournament is full", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);
      mockBotRepository.findOne.mockResolvedValue(mockBot);
      mockEntryRepository.findOne.mockResolvedValue(null);
      mockTournamentRepository.findOne.mockResolvedValue(mockTournament);
      mockEntryRepository.count.mockResolvedValue(10);

      const result = await service.manualTrigger("sub-123", "tourn-123");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("Tournament is full");
    });

    it("should successfully register bot when all conditions are met", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);
      mockBotRepository.findOne.mockResolvedValue(mockBot);
      mockEntryRepository.findOne.mockResolvedValue(null);
      mockTournamentRepository.findOne.mockResolvedValue(mockTournament);
      mockEntryRepository.count.mockResolvedValue(5);

      const result = await service.manualTrigger("sub-123", "tourn-123");

      expect(result.success).toBe(true);
      expect(mockEntryRepository.save).toHaveBeenCalled();
      expect(
        mockSubscriptionRepository.incrementSuccessful,
      ).toHaveBeenCalledWith("sub-123");
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        "bot.autoRegistered",
        expect.objectContaining({
          botId: "bot-123",
          tournamentId: "tourn-123",
        }),
      );
    });
  });

  describe("processScheduledRegistrations", () => {
    it("should not run if already processing", async () => {
      (service as any).isProcessing = true;

      await service.processScheduledRegistrations();

      expect(mockSubscriptionRepository.deleteExpired).not.toHaveBeenCalled();
    });

    it("should cleanup expired subscriptions", async () => {
      mockSubscriptionRepository.deleteExpired.mockResolvedValue(3);

      await service.processScheduledRegistrations();

      expect(mockSubscriptionRepository.deleteExpired).toHaveBeenCalled();
    });

    it("should process all active subscriptions for open tournaments", async () => {
      mockTournamentRepository.find.mockResolvedValue([mockTournament]);
      mockSubscriptionRepository.findAllActive.mockResolvedValue([
        mockSubscription,
      ]);
      mockBotRepository.findOne.mockResolvedValue(mockBot);
      mockEntryRepository.count.mockResolvedValue(5);

      await service.processScheduledRegistrations();

      expect(mockSubscriptionRepository.findAllActive).toHaveBeenCalled();
    });
  });
});
