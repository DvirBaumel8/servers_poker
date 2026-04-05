import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { BotsService } from "../../../src/modules/bots/bots.service";

describe("BotsService", () => {
  let service: BotsService;
  let mockBotRepository: {
    findById: ReturnType<typeof vi.fn>;
    findByIdOrThrow: ReturnType<typeof vi.fn>;
    findByUserId: ReturnType<typeof vi.fn>;
    findActiveByUserId: ReturnType<typeof vi.fn>;
    findActiveByUserAndName: ReturnType<typeof vi.fn>;
    findByName: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
    activate: ReturnType<typeof vi.fn>;
  };
  let mockAnalyticsRepository: {
    getBotProfile: ReturnType<typeof vi.fn>;
  };
  let mockBotOwnershipService: {
    getBotWithOwnershipCheck: ReturnType<typeof vi.fn>;
    assertOwnership: ReturnType<typeof vi.fn>;
  };
  let mockUserRepository: {
    findById: ReturnType<typeof vi.fn>;
  };

  const defaultStrategy = {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 50,
      bluffFrequency: 30,
      riskTolerance: 50,
      tightness: 50,
    },
  };

  const mockBot = {
    id: "bot-123",
    name: "TestBot",
    strategy: defaultStrategy,
    description: "A test bot",
    active: true,
    user_id: "user-123",
    created_at: new Date("2024-01-01"),
  };

  const freeUser = { id: "user-123", subscription_status: "free" };
  const proUser = { id: "user-123", subscription_status: "active" };

  beforeEach(() => {
    mockBotRepository = {
      findById: vi.fn(),
      findByIdOrThrow: vi.fn(),
      findByUserId: vi.fn(),
      findActiveByUserId: vi.fn(),
      findActiveByUserAndName: vi.fn(),
      findByName: vi.fn(),
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deactivate: vi.fn(),
      activate: vi.fn(),
    };

    mockAnalyticsRepository = {
      getBotProfile: vi.fn(),
    };

    mockBotOwnershipService = {
      getBotWithOwnershipCheck: vi.fn(),
      assertOwnership: vi.fn(),
    };

    mockUserRepository = {
      findById: vi.fn(),
    };

    service = new BotsService(
      mockBotRepository as never,
      mockAnalyticsRepository as never,
      mockBotOwnershipService as never,
      mockUserRepository as never,
    );
  });

  describe("create", () => {
    it("should create a bot successfully for a free user with 0 bots", async () => {
      mockUserRepository.findById.mockResolvedValue(freeUser);
      mockBotRepository.findActiveByUserId.mockResolvedValue([]);
      mockBotRepository.findActiveByUserAndName.mockResolvedValue(null);
      mockBotRepository.create.mockResolvedValue(mockBot);

      const result = await service.create("user-123", {
        name: "TestBot",
        strategy: defaultStrategy,
      } as never);

      expect(result.name).toBe("TestBot");
      expect(mockBotRepository.create).toHaveBeenCalled();
    });

    it("should throw BadRequestException when free user already has 1 bot", async () => {
      mockUserRepository.findById.mockResolvedValue(freeUser);
      mockBotRepository.findActiveByUserId.mockResolvedValue([mockBot]); // 1 bot = at limit

      await expect(
        service.create("user-123", {
          name: "NewBot",
          strategy: defaultStrategy,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it("error message for free user references 1 bot limit and upgrade", async () => {
      mockUserRepository.findById.mockResolvedValue(freeUser);
      mockBotRepository.findActiveByUserId.mockResolvedValue([mockBot]);

      await expect(
        service.create("user-123", {
          name: "NewBot",
          strategy: defaultStrategy,
        } as never),
      ).rejects.toThrow(/maximum of 1 bot/);
    });

    it("should allow a pro user to create up to 5 bots", async () => {
      mockUserRepository.findById.mockResolvedValue(proUser);
      mockBotRepository.findActiveByUserId.mockResolvedValue(
        Array(4).fill(mockBot), // 4 bots — one slot remaining
      );
      mockBotRepository.findActiveByUserAndName.mockResolvedValue(null);
      mockBotRepository.create.mockResolvedValue({
        ...mockBot,
        id: "bot-999",
        name: "Bot5",
      });

      const result = await service.create("user-123", {
        name: "Bot5",
        strategy: defaultStrategy,
      } as never);

      expect(result.name).toBe("Bot5");
    });

    it("should throw BadRequestException when pro user already has 5 bots", async () => {
      mockUserRepository.findById.mockResolvedValue(proUser);
      mockBotRepository.findActiveByUserId.mockResolvedValue(
        Array(5).fill(mockBot), // 5 bots = at limit
      );

      await expect(
        service.create("user-123", {
          name: "Bot6",
          strategy: defaultStrategy,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it("error message for pro user references 5 bot limit", async () => {
      mockUserRepository.findById.mockResolvedValue(proUser);
      mockBotRepository.findActiveByUserId.mockResolvedValue(
        Array(5).fill(mockBot),
      );

      await expect(
        service.create("user-123", {
          name: "Bot6",
          strategy: defaultStrategy,
        } as never),
      ).rejects.toThrow(/maximum of 5 bots/);
    });

    it("should treat expired subscription as free tier (limit 1)", async () => {
      mockUserRepository.findById.mockResolvedValue({
        id: "user-123",
        subscription_status: "expired",
      });
      mockBotRepository.findActiveByUserId.mockResolvedValue([mockBot]); // 1 bot

      await expect(
        service.create("user-123", {
          name: "NewBot",
          strategy: defaultStrategy,
        } as never),
      ).rejects.toThrow(/maximum of 1 bot/);
    });

    it("should treat cancelled subscription as free tier (limit 1)", async () => {
      mockUserRepository.findById.mockResolvedValue({
        id: "user-123",
        subscription_status: "cancelled",
      });
      mockBotRepository.findActiveByUserId.mockResolvedValue([mockBot]);

      await expect(
        service.create("user-123", {
          name: "NewBot",
          strategy: defaultStrategy,
        } as never),
      ).rejects.toThrow(/maximum of 1 bot/);
    });

    it("should throw ConflictException when bot name already exists", async () => {
      mockUserRepository.findById.mockResolvedValue(freeUser);
      mockBotRepository.findActiveByUserId.mockResolvedValue([]);
      mockBotRepository.findActiveByUserAndName.mockResolvedValue(mockBot);

      await expect(
        service.create("user-123", {
          name: "TestBot",
          strategy: defaultStrategy,
        } as never),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("duplicate", () => {
    it("should throw BadRequestException when free user tries to duplicate beyond 1 bot", async () => {
      mockBotRepository.findById.mockResolvedValue(mockBot);
      mockUserRepository.findById.mockResolvedValue(freeUser);
      mockBotRepository.findActiveByUserId.mockResolvedValue([mockBot]); // already at limit

      await expect(service.duplicate("bot-123", "user-123")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException when pro user tries to duplicate beyond 5 bots", async () => {
      mockBotRepository.findById.mockResolvedValue(mockBot);
      mockUserRepository.findById.mockResolvedValue(proUser);
      mockBotRepository.findActiveByUserId.mockResolvedValue(
        Array(5).fill(mockBot),
      );

      await expect(service.duplicate("bot-123", "user-123")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("findById", () => {
    it("should return bot response dto when found", async () => {
      mockBotRepository.findById.mockResolvedValue(mockBot);

      const result = await service.findById("bot-123");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("TestBot");
    });

    it("should return null when not found", async () => {
      mockBotRepository.findById.mockResolvedValue(null);

      const result = await service.findById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findByUserId", () => {
    it("should return array of bot response dtos", async () => {
      mockBotRepository.findByUserId.mockResolvedValue([mockBot]);

      const result = await service.findByUserId("user-123");

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("TestBot");
    });
  });

  describe("findAll", () => {
    it("should return all bots", async () => {
      mockBotRepository.findAll.mockResolvedValue([mockBot]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
    });
  });

  describe("findActive", () => {
    it("should return only active bots", async () => {
      const inactiveBot = { ...mockBot, id: "bot-456", active: false };
      mockBotRepository.findAll.mockResolvedValue([mockBot, inactiveBot]);

      const result = await service.findActive();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("bot-123");
    });
  });

  describe("update", () => {
    it("should update bot successfully", async () => {
      const updatedBot = { ...mockBot, description: "Updated" };
      mockBotOwnershipService.getBotWithOwnershipCheck.mockResolvedValue(
        mockBot,
      );
      mockBotRepository.update.mockResolvedValue(updatedBot);

      const result = await service.update("bot-123", "user-123", {
        description: "Updated",
      });

      expect(result.description).toBe("Updated");
    });

    it("should throw NotFoundException when bot not found", async () => {
      mockBotOwnershipService.getBotWithOwnershipCheck.mockRejectedValue(
        new NotFoundException("Bot bot-123 not found"),
      );

      await expect(
        service.update("nonexistent", "user-123", {}),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user does not own bot", async () => {
      mockBotOwnershipService.getBotWithOwnershipCheck.mockRejectedValue(
        new ForbiddenException("You do not own this bot"),
      );

      await expect(service.update("bot-123", "other-user", {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("deactivate", () => {
    it("should deactivate own bot", async () => {
      mockBotOwnershipService.getBotWithOwnershipCheck.mockResolvedValue(
        mockBot,
      );
      mockBotRepository.deactivate.mockResolvedValue(undefined);

      await service.deactivate("bot-123", "user-123", false);

      expect(mockBotRepository.deactivate).toHaveBeenCalledWith("bot-123");
    });

    it("should allow admin to deactivate any bot", async () => {
      mockBotOwnershipService.getBotWithOwnershipCheck.mockResolvedValue(
        mockBot,
      );
      mockBotRepository.deactivate.mockResolvedValue(undefined);

      await service.deactivate("bot-123", "other-user", true);

      expect(mockBotRepository.deactivate).toHaveBeenCalledWith("bot-123");
    });

    it("should throw NotFoundException when bot not found", async () => {
      mockBotOwnershipService.getBotWithOwnershipCheck.mockRejectedValue(
        new NotFoundException("Bot nonexistent not found"),
      );

      await expect(
        service.deactivate("nonexistent", "user-123", false),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when non-admin deactivates other's bot", async () => {
      mockBotOwnershipService.getBotWithOwnershipCheck.mockRejectedValue(
        new ForbiddenException("You do not own this bot"),
      );

      await expect(
        service.deactivate("bot-123", "other-user", false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("activate", () => {
    it("should activate own bot", async () => {
      const inactiveBot = { ...mockBot, active: false };
      mockBotOwnershipService.getBotWithOwnershipCheck.mockResolvedValue(
        inactiveBot,
      );
      mockBotRepository.activate.mockResolvedValue(undefined);

      await service.activate("bot-123", "user-123", false);

      expect(mockBotRepository.activate).toHaveBeenCalledWith("bot-123");
    });

    it("should throw NotFoundException when bot not found", async () => {
      mockBotOwnershipService.getBotWithOwnershipCheck.mockRejectedValue(
        new NotFoundException("Bot nonexistent not found"),
      );

      await expect(
        service.activate("nonexistent", "user-123", false),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when non-admin activates other's bot", async () => {
      mockBotOwnershipService.getBotWithOwnershipCheck.mockRejectedValue(
        new ForbiddenException("You do not own this bot"),
      );

      await expect(
        service.activate("bot-123", "other-user", false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getProfile", () => {
    it("should return bot profile", async () => {
      const profile = { botId: "bot-123", gamesPlayed: 100 };
      mockAnalyticsRepository.getBotProfile.mockResolvedValue(profile);

      const result = await service.getProfile("bot-123");

      expect(result).toEqual(profile);
    });

    it("should throw NotFoundException when profile not found", async () => {
      mockAnalyticsRepository.getBotProfile.mockResolvedValue(null);

      await expect(service.getProfile("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
