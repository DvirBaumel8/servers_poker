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

  describe("findOne", () => {
    it("should throw NotFoundException when bot not found", async () => {
      mockBotsService.findById.mockResolvedValue(null);

      await expect(controller.findOne("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("activate", () => {
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

  describe("getBotActivity", () => {
    it("should throw NotFoundException when activity not found", async () => {
      mockBotActivityService.getBotActivity.mockResolvedValue(null);

      await expect(controller.getBotActivity("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getMyBotsActivity", () => {
    it("should return aggregated activity with totalActive and timestamp", async () => {
      const activities = [mockActivity];
      mockBotActivityService.getActiveBotsForUser.mockResolvedValue(activities);

      const result = await controller.getMyBotsActivity(mockUser as never);

      expect(result.bots).toEqual(activities);
      expect(result.totalActive).toBe(1);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe("getActiveBots", () => {
    it("should return aggregated active bots with totalActive and timestamp", async () => {
      const activities = [mockActivity];
      mockBotActivityService.getAllActiveBots.mockResolvedValue(activities);

      const result = await controller.getActiveBots();

      expect(result.bots).toEqual(activities);
      expect(result.totalActive).toBe(1);
      expect(result.timestamp).toBeDefined();
    });
  });
});
