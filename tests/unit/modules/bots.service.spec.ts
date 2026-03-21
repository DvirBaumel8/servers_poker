import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { BotsService } from "../../../src/modules/bots/bots.service";
import { BotOwnershipService } from "../../../src/modules/bots/bot-ownership.service";
import { ConfigService } from "@nestjs/config";

describe("BotsService", () => {
  let service: BotsService;
  let mockBotRepository: {
    findById: ReturnType<typeof vi.fn>;
    findByIdOrThrow: ReturnType<typeof vi.fn>;
    findByUserId: ReturnType<typeof vi.fn>;
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
  let mockConfigService: Partial<ConfigService>;
  let mockUrlValidator: {
    validate: ReturnType<typeof vi.fn>;
    validateWithHealthCheck: ReturnType<typeof vi.fn>;
  };

  const mockBot = {
    id: "bot-123",
    name: "TestBot",
    endpoint: "http://localhost:4000/action",
    description: "A test bot",
    active: true,
    user_id: "user-123",
    created_at: new Date("2024-01-01"),
    last_validation: null,
    last_validation_score: null,
  };

  beforeEach(() => {
    mockBotRepository = {
      findById: vi.fn(),
      findByIdOrThrow: vi.fn(),
      findByUserId: vi.fn(),
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

    mockConfigService = {
      get: vi.fn().mockReturnValue(10000),
    };

    mockUrlValidator = {
      validate: vi.fn().mockReturnValue({ valid: true }),
      validateWithHealthCheck: vi.fn(),
    };

    service = new BotsService(
      mockBotRepository as never,
      mockAnalyticsRepository as never,
      mockBotOwnershipService as never,
      mockConfigService as ConfigService,
      mockUrlValidator as never,
    );
  });

  describe("create", () => {
    it("should create a bot successfully", async () => {
      mockBotRepository.findByUserId.mockResolvedValue([]);
      mockBotRepository.findByName.mockResolvedValue(null);
      mockUrlValidator.validateWithHealthCheck.mockResolvedValue({
        valid: true,
      });
      mockBotRepository.create.mockResolvedValue(mockBot);

      const result = await service.create("user-123", {
        name: "TestBot",
        endpoint: "http://localhost:4000/action",
      });

      expect(result.name).toBe("TestBot");
      expect(mockBotRepository.create).toHaveBeenCalled();
    });

    it("should throw BadRequestException when bot limit reached", async () => {
      const existingBots = Array(10).fill(mockBot);
      mockBotRepository.findByUserId.mockResolvedValue(existingBots);

      await expect(
        service.create("user-123", {
          name: "NewBot",
          endpoint: "http://localhost:4001/action",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw ConflictException when bot name exists", async () => {
      mockBotRepository.findByUserId.mockResolvedValue([]);
      mockBotRepository.findByName.mockResolvedValue(mockBot);

      await expect(
        service.create("user-123", {
          name: "TestBot",
          endpoint: "http://localhost:4000/action",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw BadRequestException when URL validation fails", async () => {
      mockBotRepository.findByUserId.mockResolvedValue([]);
      mockBotRepository.findByName.mockResolvedValue(null);
      mockUrlValidator.validateWithHealthCheck.mockResolvedValue({
        valid: false,
        error: "Invalid URL",
      });

      await expect(
        service.create("user-123", {
          name: "TestBot",
          endpoint: "http://invalid-url",
        }),
      ).rejects.toThrow(BadRequestException);
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
