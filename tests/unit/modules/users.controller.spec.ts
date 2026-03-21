import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
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

  const regularUser = {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    role: "user",
  };

  const adminUser = {
    id: "admin-123",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
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
    it("should return all users for admin", async () => {
      mockUsersService.findAll.mockResolvedValue([mockUserResponse]);

      const result = await controller.findAll(adminUser as never);

      expect(result).toEqual([mockUserResponse]);
    });

    it("should throw ForbiddenException for non-admin", async () => {
      await expect(controller.findAll(regularUser as never)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("findOne", () => {
    it("should return user when user requests own data", async () => {
      mockUsersService.findById.mockResolvedValue(mockUserResponse);

      const result = await controller.findOne("user-123", regularUser as never);

      expect(result).toEqual(mockUserResponse);
    });

    it("should return user when admin requests any user", async () => {
      mockUsersService.findById.mockResolvedValue(mockUserResponse);

      const result = await controller.findOne("user-123", adminUser as never);

      expect(result).toEqual(mockUserResponse);
    });

    it("should throw ForbiddenException when user requests other user's data", async () => {
      await expect(
        controller.findOne("other-user", regularUser as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw NotFoundException when user not found", async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(
        controller.findOne("user-123", regularUser as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    it("should update own user data", async () => {
      const updateDto = { name: "Updated Name" };
      mockUsersService.update.mockResolvedValue({
        ...mockUserResponse,
        name: "Updated Name",
      });

      const result = await controller.update(
        "user-123",
        updateDto as never,
        regularUser as never,
      );

      expect(result.name).toBe("Updated Name");
    });

    it("should allow admin to update any user", async () => {
      mockUsersService.update.mockResolvedValue(mockUserResponse);

      await controller.update(
        "user-123",
        { name: "Test" } as never,
        adminUser as never,
      );

      expect(mockUsersService.update).toHaveBeenCalled();
    });

    it("should throw ForbiddenException when updating other user", async () => {
      await expect(
        controller.update(
          "other-user",
          { name: "Test" } as never,
          regularUser as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("adminUpdate", () => {
    it("should allow admin to update user with admin fields", async () => {
      const adminDto = { role: "admin", active: false };
      mockUsersService.adminUpdate.mockResolvedValue({
        ...mockUserResponse,
        ...adminDto,
      });

      const result = await controller.adminUpdate(
        "user-123",
        adminDto as never,
        adminUser as never,
      );

      expect(result.role).toBe("admin");
    });

    it("should throw ForbiddenException for non-admin", async () => {
      await expect(
        controller.adminUpdate(
          "user-123",
          { role: "admin" } as never,
          regularUser as never,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("deactivate", () => {
    it("should allow user to deactivate own account", async () => {
      mockUsersService.deactivate.mockResolvedValue(undefined);

      const result = await controller.deactivate(
        "user-123",
        regularUser as never,
      );

      expect(result).toEqual({ success: true });
    });

    it("should allow admin to deactivate any user", async () => {
      mockUsersService.deactivate.mockResolvedValue(undefined);

      const result = await controller.deactivate(
        "user-123",
        adminUser as never,
      );

      expect(result).toEqual({ success: true });
    });

    it("should throw ForbiddenException when deactivating other user", async () => {
      await expect(
        controller.deactivate("other-user", regularUser as never),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("rotateApiKey", () => {
    it("should rotate own API key", async () => {
      mockApiKeyRotationService.rotateApiKey.mockResolvedValue({
        newApiKey: "new-key",
        oldApiKeyValidUntil: new Date("2024-01-01"),
        rotatedAt: new Date("2024-01-01"),
      });

      const result = await controller.rotateApiKey(
        "user-123",
        regularUser as never,
      );

      expect(result.newApiKey).toBe("new-key");
      expect(result.message).toContain("rotated successfully");
    });

    it("should throw ForbiddenException when rotating other user's key", async () => {
      await expect(
        controller.rotateApiKey("other-user", regularUser as never),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getApiKeyStatus", () => {
    it("should return API key status for own account", async () => {
      mockApiKeyRotationService.getRotationStatus.mockResolvedValue({
        hasLegacyKeys: true,
        legacyKeyExpiresAt: new Date("2024-01-01"),
      });

      const result = await controller.getApiKeyStatus(
        "user-123",
        regularUser as never,
      );

      expect(result.hasLegacyKeys).toBe(true);
    });

    it("should throw ForbiddenException for other user's status", async () => {
      await expect(
        controller.getApiKeyStatus("other-user", regularUser as never),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("revokeApiKeys", () => {
    it("should allow admin to revoke API keys", async () => {
      mockApiKeyRotationService.revokeAllKeys.mockResolvedValue(undefined);

      const result = await controller.revokeApiKeys(
        "user-123",
        adminUser as never,
      );

      expect(result.message).toContain("revoked");
    });

    it("should throw ForbiddenException for non-admin", async () => {
      await expect(
        controller.revokeApiKeys("user-123", regularUser as never),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
