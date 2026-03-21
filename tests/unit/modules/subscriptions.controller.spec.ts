import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { SubscriptionsController } from "../../../src/modules/bots/subscriptions.controller";

describe("SubscriptionsController", () => {
  let controller: SubscriptionsController;
  let mockSubscriptionRepository: {
    findByBotId: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    findByBotAndTournament: ReturnType<typeof vi.fn>;
  };
  let mockBotRepository: {
    findById: ReturnType<typeof vi.fn>;
  };
  let mockTournamentRepository: {
    findById: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: "user-123",
    email: "test@example.com",
    role: "user",
  };

  const mockBot = {
    id: "bot-123",
    name: "TestBot",
    user_id: "user-123",
    active: true,
  };

  const mockSubscription = {
    id: "sub-123",
    bot_id: "bot-123",
    tournament_id: null,
    tournament_type_filter: "rolling",
    min_buy_in: 100,
    max_buy_in: 1000,
    priority: 50,
    status: "active",
    successful_registrations: 5,
    failed_registrations: 1,
    last_registration_attempt: new Date(),
    expires_at: null,
    created_at: new Date(),
    bot: mockBot,
    tournament: null,
  };

  beforeEach(() => {
    mockSubscriptionRepository = {
      findByBotId: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ ...mockSubscription, ...data }),
        ),
      update: vi
        .fn()
        .mockImplementation((id, data) =>
          Promise.resolve({ ...mockSubscription, ...data }),
        ),
      delete: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      findByBotAndTournament: vi.fn().mockResolvedValue(null),
    };

    mockBotRepository = {
      findById: vi.fn().mockResolvedValue(mockBot),
    };

    mockTournamentRepository = {
      findById: vi.fn().mockResolvedValue(null),
    };

    controller = new SubscriptionsController(
      mockSubscriptionRepository as never,
      mockBotRepository as never,
      mockTournamentRepository as never,
    );
  });

  describe("findAll", () => {
    it("should throw NotFoundException when bot not found", async () => {
      mockBotRepository.findById.mockResolvedValue(null);

      await expect(
        controller.findAll("invalid-bot", mockUser as never),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user does not own bot", async () => {
      mockBotRepository.findById.mockResolvedValue({
        ...mockBot,
        user_id: "other-user",
      });

      await expect(
        controller.findAll("bot-123", mockUser as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should return subscriptions for bot", async () => {
      mockSubscriptionRepository.findByBotId.mockResolvedValue([
        mockSubscription,
      ]);

      const result = await controller.findAll("bot-123", mockUser as never);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("sub-123");
    });
  });

  describe("getStats", () => {
    it("should return subscription stats", async () => {
      const subscriptions = [
        { ...mockSubscription, status: "active" },
        { ...mockSubscription, id: "sub-2", status: "paused" },
        {
          ...mockSubscription,
          id: "sub-3",
          status: "active",
          expires_at: new Date(Date.now() - 1000),
        },
      ];
      mockSubscriptionRepository.findByBotId.mockResolvedValue(subscriptions);

      const result = await controller.getStats("bot-123", mockUser as never);

      expect(result.total).toBe(3);
      expect(result.active).toBe(2);
      expect(result.paused).toBe(1);
      expect(result.expired).toBe(1);
    });
  });

  describe("create", () => {
    it("should create subscription", async () => {
      const dto = {
        tournament_type_filter: "rolling" as const,
        priority: 75,
      };

      const result = await controller.create("bot-123", dto, mockUser as never);

      expect(mockSubscriptionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bot_id: "bot-123",
          tournament_type_filter: "rolling",
          priority: 75,
        }),
      );
      expect(result.bot_id).toBe("bot-123");
    });

    it("should validate tournament exists when tournament_id provided", async () => {
      mockTournamentRepository.findById.mockResolvedValue(null);

      await expect(
        controller.create(
          "bot-123",
          { tournament_id: "invalid-tourn" },
          mockUser as never,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("delete", () => {
    it("should delete subscription", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);

      const result = await controller.delete(
        "bot-123",
        "sub-123",
        mockUser as never,
      );

      expect(result).toEqual({ success: true });
      expect(mockSubscriptionRepository.delete).toHaveBeenCalledWith("sub-123");
    });

    it("should throw NotFoundException when subscription not found", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(null);

      await expect(
        controller.delete("bot-123", "invalid-sub", mockUser as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("pause and resume", () => {
    it("should pause subscription", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue(mockSubscription);

      await controller.pause("bot-123", "sub-123", mockUser as never);

      expect(mockSubscriptionRepository.updateStatus).toHaveBeenCalledWith(
        "sub-123",
        "paused",
      );
    });

    it("should resume subscription", async () => {
      mockSubscriptionRepository.findById.mockResolvedValue({
        ...mockSubscription,
        status: "paused",
      });

      await controller.resume("bot-123", "sub-123", mockUser as never);

      expect(mockSubscriptionRepository.updateStatus).toHaveBeenCalledWith(
        "sub-123",
        "active",
      );
    });
  });
});
