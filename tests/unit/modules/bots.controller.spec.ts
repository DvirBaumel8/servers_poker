import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { BotsController } from "../../../src/modules/bots/bots.controller";

describe("BotsController", () => {
  let controller: BotsController;
  let mockBotsService: {
    findActive: ReturnType<typeof vi.fn>;
    findByUserId: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    getProfile: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    validate: ReturnType<typeof vi.fn>;
    activate: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
  };
  let mockBotActivityService: {
    getBotActivity: ReturnType<typeof vi.fn>;
    getActiveBotsForUser: ReturnType<typeof vi.fn>;
    getAllActiveBots: ReturnType<typeof vi.fn>;
  };

  const mockBot = {
    id: "bot-123",
    name: "TestBot",
    endpoint: "http://localhost:4000/action",
    active: true,
    user_id: "user-123",
  };

  const mockUser = {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    role: "user",
  };

  const mockActivity = {
    botId: "bot-123",
    botName: "TestBot",
    isActive: true,
    activeGames: [
      {
        tableId: "table-1",
        gameId: "game-1",
        status: "running",
        handNumber: 5,
        chips: 1000,
        joinedAt: new Date().toISOString(),
      },
    ],
    activeTournaments: [],
    lastActivityAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockBotsService = {
      findActive: vi.fn(),
      findByUserId: vi.fn(),
      findById: vi.fn(),
      getProfile: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      validate: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
    };

    mockBotActivityService = {
      getBotActivity: vi.fn(),
      getActiveBotsForUser: vi.fn(),
      getAllActiveBots: vi.fn(),
    };

    controller = new BotsController(
      mockBotsService as never,
      mockBotActivityService as never,
    );
  });

  describe("findAll", () => {
    it("should return active bots with pagination", async () => {
      const paginatedResult = {
        data: [mockBot],
        total: 1,
        limit: 20,
        offset: 0,
      };
      mockBotsService.findActivePaginated = vi
        .fn()
        .mockResolvedValue(paginatedResult);

      const result = await controller.findAll({ limit: 20, offset: 0 });

      expect(result).toEqual(paginatedResult);
      expect(mockBotsService.findActivePaginated).toHaveBeenCalledWith(20, 0);
    });
  });

  describe("findMy", () => {
    it("should return bots owned by current user with pagination", async () => {
      const paginatedResult = {
        data: [mockBot],
        total: 1,
        limit: 20,
        offset: 0,
      };
      mockBotsService.findByUserIdPaginated = vi
        .fn()
        .mockResolvedValue(paginatedResult);

      const result = await controller.findMy(mockUser as never, {
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual(paginatedResult);
      expect(mockBotsService.findByUserIdPaginated).toHaveBeenCalledWith(
        "user-123",
        20,
        0,
      );
    });
  });

  describe("findOne", () => {
    it("should return bot when found", async () => {
      mockBotsService.findById.mockResolvedValue(mockBot);

      const result = await controller.findOne("bot-123");

      expect(result).toEqual(mockBot);
    });

    it("should throw NotFoundException when bot not found", async () => {
      mockBotsService.findById.mockResolvedValue(null);

      await expect(controller.findOne("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getProfile", () => {
    it("should return bot profile", async () => {
      const profile = { botId: "bot-123", gamesPlayed: 100 };
      mockBotsService.getProfile.mockResolvedValue(profile);

      const result = await controller.getProfile("bot-123");

      expect(result).toEqual(profile);
    });
  });

  describe("create", () => {
    it("should create bot for current user", async () => {
      const createDto = { name: "NewBot", endpoint: "http://localhost:4001" };
      mockBotsService.create.mockResolvedValue({ ...mockBot, ...createDto });

      const result = await controller.create(
        createDto as never,
        mockUser as never,
      );

      expect(mockBotsService.create).toHaveBeenCalledWith(
        "user-123",
        createDto,
      );
      expect(result.name).toBe("NewBot");
    });
  });

  describe("update", () => {
    it("should update bot", async () => {
      const updateDto = { description: "Updated description" };
      mockBotsService.update.mockResolvedValue({ ...mockBot, ...updateDto });

      const result = await controller.update(
        "bot-123",
        updateDto as never,
        mockUser as never,
      );

      expect(mockBotsService.update).toHaveBeenCalledWith(
        "bot-123",
        "user-123",
        updateDto,
      );
      expect(result.description).toBe("Updated description");
    });
  });

  describe("validate", () => {
    it("should validate bot", async () => {
      const validationResult = { valid: true, score: 100 };
      mockBotsService.validate.mockResolvedValue(validationResult);

      const result = await controller.validate("bot-123");

      expect(result).toEqual(validationResult);
    });
  });

  describe("activate", () => {
    it("should activate bot", async () => {
      mockBotsService.activate.mockResolvedValue(undefined);

      const result = await controller.activate("bot-123", mockUser as never);

      expect(result).toEqual({ success: true });
      expect(mockBotsService.activate).toHaveBeenCalledWith(
        "bot-123",
        "user-123",
        false,
      );
    });

    it("should pass admin flag for admin users", async () => {
      const adminUser = { ...mockUser, role: "admin" };
      mockBotsService.activate.mockResolvedValue(undefined);

      await controller.activate("bot-123", adminUser as never);

      expect(mockBotsService.activate).toHaveBeenCalledWith(
        "bot-123",
        "user-123",
        true,
      );
    });
  });

  describe("deactivate", () => {
    it("should deactivate bot", async () => {
      mockBotsService.deactivate.mockResolvedValue(undefined);

      const result = await controller.deactivate("bot-123", mockUser as never);

      expect(result).toEqual({ success: true });
      expect(mockBotsService.deactivate).toHaveBeenCalledWith(
        "bot-123",
        "user-123",
        false,
      );
    });
  });

  describe("getBotActivity", () => {
    it("should return bot activity when found", async () => {
      mockBotActivityService.getBotActivity.mockResolvedValue(mockActivity);

      const result = await controller.getBotActivity("bot-123");

      expect(result).toEqual(mockActivity);
      expect(mockBotActivityService.getBotActivity).toHaveBeenCalledWith(
        "bot-123",
      );
    });

    it("should throw NotFoundException when activity not found", async () => {
      mockBotActivityService.getBotActivity.mockResolvedValue(null);

      await expect(controller.getBotActivity("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getMyBotsActivity", () => {
    it("should return activities for user bots", async () => {
      const activities = [mockActivity];
      mockBotActivityService.getActiveBotsForUser.mockResolvedValue(activities);

      const result = await controller.getMyBotsActivity(mockUser as never);

      expect(result.bots).toEqual(activities);
      expect(result.totalActive).toBe(1);
      expect(result.timestamp).toBeDefined();
      expect(mockBotActivityService.getActiveBotsForUser).toHaveBeenCalledWith(
        "user-123",
      );
    });
  });

  describe("getActiveBots", () => {
    it("should return all active bots", async () => {
      const activities = [mockActivity];
      mockBotActivityService.getAllActiveBots.mockResolvedValue(activities);

      const result = await controller.getActiveBots();

      expect(result.bots).toEqual(activities);
      expect(result.totalActive).toBe(1);
      expect(result.timestamp).toBeDefined();
    });
  });
});
