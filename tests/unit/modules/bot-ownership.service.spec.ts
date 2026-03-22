import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { BotOwnershipService } from "../../../src/modules/bots/bot-ownership.service";

describe("BotOwnershipService", () => {
  let service: BotOwnershipService;
  let mockBotRepository: {
    findByIdOrThrow: ReturnType<typeof vi.fn>;
  };

  const mockBot = {
    id: "bot-123",
    name: "TestBot",
    endpoint: "http://localhost:4000/action",
    user_id: "user-123",
    active: true,
  };

  beforeEach(() => {
    mockBotRepository = {
      findByIdOrThrow: vi.fn(),
    };

    service = new BotOwnershipService(mockBotRepository as never);
  });

  describe("getBotWithOwnershipCheck", () => {
    it("should return bot when user owns it", async () => {
      mockBotRepository.findByIdOrThrow.mockResolvedValue(mockBot);

      const result = await service.getBotWithOwnershipCheck(
        "bot-123",
        "user-123",
        false,
      );

      expect(result).toEqual(mockBot);
      expect(mockBotRepository.findByIdOrThrow).toHaveBeenCalledWith("bot-123");
    });

    it("should return bot when user is admin", async () => {
      mockBotRepository.findByIdOrThrow.mockResolvedValue(mockBot);

      const result = await service.getBotWithOwnershipCheck(
        "bot-123",
        "other-user",
        true,
      );

      expect(result).toEqual(mockBot);
    });

    it("should throw ForbiddenException when user does not own bot", async () => {
      mockBotRepository.findByIdOrThrow.mockResolvedValue(mockBot);

      await expect(
        service.getBotWithOwnershipCheck("bot-123", "other-user", false),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException when bot does not exist", async () => {
      mockBotRepository.findByIdOrThrow.mockRejectedValue(
        new NotFoundException("Bot not-found not found"),
      );

      await expect(
        service.getBotWithOwnershipCheck("not-found", "user-123", false),
      ).rejects.toThrow(NotFoundException);
    });

    it("should use custom error message", async () => {
      mockBotRepository.findByIdOrThrow.mockResolvedValue(mockBot);

      await expect(
        service.getBotWithOwnershipCheck(
          "bot-123",
          "other-user",
          false,
          "Custom message",
        ),
      ).rejects.toThrow("Custom message");
    });
  });

  describe("assertOwnership", () => {
    it("should not throw when user owns bot", () => {
      expect(() => {
        service.assertOwnership(mockBot as never, "user-123", false);
      }).not.toThrow();
    });

    it("should not throw when user is admin", () => {
      expect(() => {
        service.assertOwnership(mockBot as never, "other-user", true);
      }).not.toThrow();
    });

    it("should throw ForbiddenException when user does not own bot", () => {
      expect(() => {
        service.assertOwnership(mockBot as never, "other-user", false);
      }).toThrow(ForbiddenException);
    });

    it("should use custom error message", () => {
      expect(() => {
        service.assertOwnership(
          mockBot as never,
          "other-user",
          false,
          "Custom forbidden message",
        );
      }).toThrow("Custom forbidden message");
    });
  });

  describe("isOwnerOrAdmin", () => {
    it("should return true when user owns bot", () => {
      expect(service.isOwnerOrAdmin(mockBot as never, "user-123", false)).toBe(
        true,
      );
    });

    it("should return true when user is admin", () => {
      expect(service.isOwnerOrAdmin(mockBot as never, "other-user", true)).toBe(
        true,
      );
    });

    it("should return false when user does not own bot and is not admin", () => {
      expect(
        service.isOwnerOrAdmin(mockBot as never, "other-user", false),
      ).toBe(false);
    });
  });
});
