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

    controller = new BotsController(mockBotsService as never);
  });

  describe("findAll", () => {
    it("should return active bots", async () => {
      mockBotsService.findActive.mockResolvedValue([mockBot]);

      const result = await controller.findAll();

      expect(result).toEqual([mockBot]);
      expect(mockBotsService.findActive).toHaveBeenCalled();
    });
  });

  describe("findMy", () => {
    it("should return bots owned by current user", async () => {
      mockBotsService.findByUserId.mockResolvedValue([mockBot]);

      const result = await controller.findMy(mockUser as never);

      expect(result).toEqual([mockBot]);
      expect(mockBotsService.findByUserId).toHaveBeenCalledWith("user-123");
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
});
