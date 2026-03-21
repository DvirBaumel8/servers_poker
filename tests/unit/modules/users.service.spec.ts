import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { UsersService } from "../../../src/modules/users/users.service";

describe("UsersService", () => {
  let service: UsersService;
  let mockUserRepository: {
    findById: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    role: "user",
    active: true,
    created_at: new Date("2024-01-01"),
    last_login_at: new Date("2024-01-15"),
  };

  beforeEach(() => {
    mockUserRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      update: vi.fn(),
    };
    service = new UsersService(mockUserRepository as never);
  });

  describe("findById", () => {
    it("should return user response dto when user exists", async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await service.findById("user-123");

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
        active: mockUser.active,
        created_at: mockUser.created_at,
        last_login_at: mockUser.last_login_at,
      });
    });

    it("should return null when user not found", async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      const result = await service.findById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findAll", () => {
    it("should return array of user response dtos", async () => {
      const users = [
        mockUser,
        { ...mockUser, id: "user-456", email: "other@example.com" },
      ];
      mockUserRepository.findAll.mockResolvedValue(users);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("user-123");
      expect(result[1].id).toBe("user-456");
    });

    it("should return empty array when no users", async () => {
      mockUserRepository.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe("update", () => {
    it("should update and return user response dto", async () => {
      const updatedUser = { ...mockUser, name: "Updated Name" };
      mockUserRepository.update.mockResolvedValue(updatedUser);

      const result = await service.update("user-123", { name: "Updated Name" });

      expect(result.name).toBe("Updated Name");
      expect(mockUserRepository.update).toHaveBeenCalledWith("user-123", {
        name: "Updated Name",
      });
    });

    it("should throw NotFoundException when user not found", async () => {
      mockUserRepository.update.mockResolvedValue(null);

      await expect(
        service.update("nonexistent", { name: "New Name" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("adminUpdate", () => {
    it("should update user with admin fields", async () => {
      const updatedUser = { ...mockUser, role: "admin", active: false };
      mockUserRepository.update.mockResolvedValue(updatedUser);

      const result = await service.adminUpdate("user-123", {
        role: "admin",
        active: false,
      });

      expect(result.role).toBe("admin");
      expect(result.active).toBe(false);
    });

    it("should throw NotFoundException when user not found", async () => {
      mockUserRepository.update.mockResolvedValue(null);

      await expect(
        service.adminUpdate("nonexistent", { role: "admin" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("deactivate", () => {
    it("should call update with active: false", async () => {
      mockUserRepository.update.mockResolvedValue(mockUser);

      await service.deactivate("user-123");

      expect(mockUserRepository.update).toHaveBeenCalledWith("user-123", {
        active: false,
      });
    });
  });
});
