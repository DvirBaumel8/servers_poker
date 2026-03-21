import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { UsersController } from "../../../src/modules/users/users.controller";

describe("UsersController", () => {
  let controller: UsersController;
  let mockUsersService: {
    findAll: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    adminUpdate: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
  };
  let mockApiKeyRotationService: {
    rotateApiKey: ReturnType<typeof vi.fn>;
    getRotationStatus: ReturnType<typeof vi.fn>;
    revokeAllKeys: ReturnType<typeof vi.fn>;
  };

  const mockUserResponse = {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    role: "user",
    active: true,
  };

  beforeEach(() => {
    mockUsersService = {
      findAll: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      adminUpdate: vi.fn(),
      deactivate: vi.fn(),
    };

    mockApiKeyRotationService = {
      rotateApiKey: vi.fn(),
      getRotationStatus: vi.fn(),
      revokeAllKeys: vi.fn(),
    };

    controller = new UsersController(
      mockUsersService as never,
      mockApiKeyRotationService as never,
    );
  });

  describe("findAll", () => {
    it("should return all users with pagination", async () => {
      const mockPaginatedResult = {
        data: [mockUserResponse],
        total: 1,
        limit: 20,
        offset: 0,
      };
      mockUsersService.findAllPaginated = vi
        .fn()
        .mockResolvedValue(mockPaginatedResult);

      const result = await controller.findAll({ limit: 20, offset: 0 });

      expect(result).toEqual(mockPaginatedResult);
      expect(mockUsersService.findAllPaginated).toHaveBeenCalledWith(20, 0);
    });

    it("should use default pagination values", async () => {
      const mockPaginatedResult = {
        data: [mockUserResponse],
        total: 1,
        limit: 20,
        offset: 0,
      };
      mockUsersService.findAllPaginated = vi
        .fn()
        .mockResolvedValue(mockPaginatedResult);

      const result = await controller.findAll({});

      expect(result).toEqual(mockPaginatedResult);
      expect(mockUsersService.findAllPaginated).toHaveBeenCalledWith(20, 0);
    });
  });

  describe("findOne", () => {
    it("should return user when found", async () => {
      mockUsersService.findById.mockResolvedValue(mockUserResponse);

      const result = await controller.findOne("user-123");

      expect(result).toEqual(mockUserResponse);
    });

    it("should throw NotFoundException when user not found", async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(controller.findOne("user-123")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("update", () => {
    it("should update user data", async () => {
      const updateDto = { name: "Updated Name" };
      mockUsersService.update.mockResolvedValue({
        ...mockUserResponse,
        name: "Updated Name",
      });

      const result = await controller.update("user-123", updateDto as never);

      expect(result.name).toBe("Updated Name");
      expect(mockUsersService.update).toHaveBeenCalledWith(
        "user-123",
        updateDto,
      );
    });
  });

  describe("adminUpdate", () => {
    it("should update user with admin fields", async () => {
      const adminDto = { role: "admin", active: false };
      mockUsersService.adminUpdate.mockResolvedValue({
        ...mockUserResponse,
        ...adminDto,
      });

      const result = await controller.adminUpdate(
        "user-123",
        adminDto as never,
      );

      expect(result.role).toBe("admin");
      expect(mockUsersService.adminUpdate).toHaveBeenCalledWith(
        "user-123",
        adminDto,
      );
    });
  });

  describe("deactivate", () => {
    it("should deactivate user account", async () => {
      mockUsersService.deactivate.mockResolvedValue(undefined);

      const result = await controller.deactivate("user-123");

      expect(result).toEqual({ success: true });
      expect(mockUsersService.deactivate).toHaveBeenCalledWith("user-123");
    });
  });

  describe("rotateApiKey", () => {
    it("should rotate API key", async () => {
      mockApiKeyRotationService.rotateApiKey.mockResolvedValue({
        newApiKey: "new-key",
        oldApiKeyValidUntil: new Date("2024-01-01"),
        rotatedAt: new Date("2024-01-01"),
      });

      const result = await controller.rotateApiKey("user-123");

      expect(result.newApiKey).toBe("new-key");
      expect(result.message).toContain("rotated successfully");
      expect(mockApiKeyRotationService.rotateApiKey).toHaveBeenCalledWith(
        "user-123",
      );
    });
  });

  describe("getApiKeyStatus", () => {
    it("should return API key status", async () => {
      mockApiKeyRotationService.getRotationStatus.mockResolvedValue({
        hasLegacyKeys: true,
        legacyKeyExpiresAt: new Date("2024-01-01"),
      });

      const result = await controller.getApiKeyStatus("user-123");

      expect(result.hasLegacyKeys).toBe(true);
      expect(mockApiKeyRotationService.getRotationStatus).toHaveBeenCalledWith(
        "user-123",
      );
    });
  });

  describe("revokeApiKeys", () => {
    it("should revoke API keys", async () => {
      mockApiKeyRotationService.revokeAllKeys.mockResolvedValue(undefined);

      const result = await controller.revokeApiKeys("user-123");

      expect(result.message).toContain("revoked");
      expect(mockApiKeyRotationService.revokeAllKeys).toHaveBeenCalledWith(
        "user-123",
      );
    });
  });
});
