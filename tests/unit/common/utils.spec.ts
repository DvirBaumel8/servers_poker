import { describe, it, expect, vi } from "vitest";
import { NotFoundException, ForbiddenException, Logger } from "@nestjs/common";
import {
  assertFound,
  assertOwnershipOrAdmin,
  assertSelfOrAdmin,
  toPaginatedResponse,
  toPaginatedResponseRaw,
  logOperationError,
  logOperationWarning,
} from "../../../src/common/utils";

describe("assert-entity utilities", () => {
  describe("assertFound", () => {
    it("should not throw when entity exists", () => {
      const entity = { id: "123", name: "Test" };

      expect(() => {
        assertFound(entity, "Entity", "123");
      }).not.toThrow();
    });

    it("should throw NotFoundException when entity is null", () => {
      expect(() => {
        assertFound(null, "Bot", "bot-123");
      }).toThrow(NotFoundException);

      expect(() => {
        assertFound(null, "Bot", "bot-123");
      }).toThrow("Bot bot-123 not found");
    });

    it("should throw NotFoundException when entity is undefined", () => {
      expect(() => {
        assertFound(undefined, "Tournament", "t-456");
      }).toThrow(NotFoundException);
    });

    it("should narrow type after assertion", () => {
      const entity: { id: string } | null = { id: "123" };
      assertFound(entity, "Entity", "123");
      expect(entity.id).toBe("123");
    });
  });

  describe("assertOwnershipOrAdmin", () => {
    it("should not throw when user is owner", () => {
      expect(() => {
        assertOwnershipOrAdmin("user-123", "user-123", false);
      }).not.toThrow();
    });

    it("should not throw when user is admin", () => {
      expect(() => {
        assertOwnershipOrAdmin("user-123", "other-user", true);
      }).not.toThrow();
    });

    it("should throw ForbiddenException when not owner and not admin", () => {
      expect(() => {
        assertOwnershipOrAdmin("user-123", "other-user", false);
      }).toThrow(ForbiddenException);
    });

    it("should use custom error message", () => {
      expect(() => {
        assertOwnershipOrAdmin(
          "user-123",
          "other-user",
          false,
          "Custom access denied",
        );
      }).toThrow("Custom access denied");
    });
  });

  describe("assertSelfOrAdmin", () => {
    it("should not throw when accessing own resource", () => {
      expect(() => {
        assertSelfOrAdmin("user-123", "user-123", false);
      }).not.toThrow();
    });

    it("should not throw when user is admin", () => {
      expect(() => {
        assertSelfOrAdmin("target-user", "admin-user", true);
      }).not.toThrow();
    });

    it("should throw ForbiddenException when not self and not admin", () => {
      expect(() => {
        assertSelfOrAdmin("target-user", "other-user", false);
      }).toThrow(ForbiddenException);
    });
  });
});

describe("pagination utilities", () => {
  describe("toPaginatedResponse", () => {
    it("should create correct paginated response", () => {
      const items = [
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
      ];

      const result = toPaginatedResponse(items, 10, 5, 0, (item) => ({
        id: item.id,
      }));

      expect(result).toEqual({
        data: [{ id: "1" }, { id: "2" }],
        total: 10,
        limit: 5,
        offset: 0,
        hasMore: true,
      });
    });

    it("should set hasMore to false when no more items", () => {
      const items = [{ id: "1" }];

      const result = toPaginatedResponse(items, 1, 10, 0, (item) => item);

      expect(result.hasMore).toBe(false);
    });

    it("should handle empty results", () => {
      const result = toPaginatedResponse([], 0, 10, 0, (item) => item);

      expect(result).toEqual({
        data: [],
        total: 0,
        limit: 10,
        offset: 0,
        hasMore: false,
      });
    });

    it("should correctly calculate hasMore with offset", () => {
      const items = [{ id: "3" }, { id: "4" }];

      const result = toPaginatedResponse(items, 10, 2, 2, (item) => item);

      expect(result.hasMore).toBe(true);
    });
  });

  describe("toPaginatedResponseRaw", () => {
    it("should create response without mapping", () => {
      const items = [{ id: "1" }, { id: "2" }];

      const result = toPaginatedResponseRaw(items, 5, 10, 0);

      expect(result).toEqual({
        data: items,
        total: 5,
        limit: 10,
        offset: 0,
        hasMore: true,
      });
    });
  });
});

describe("logging utilities", () => {
  describe("logOperationError", () => {
    it("should log error with context", () => {
      const mockLogger = {
        error: vi.fn(),
      };

      const error = new Error("Connection failed");

      logOperationError(mockLogger as unknown as Logger, "save data", error, {
        userId: "123",
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to save data [userId=123]: Connection failed",
        error.stack,
      );
    });

    it("should handle non-Error objects", () => {
      const mockLogger = {
        error: vi.fn(),
      };

      logOperationError(
        mockLogger as unknown as Logger,
        "process",
        "string error",
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to process: string error",
        undefined,
      );
    });

    it("should work without context", () => {
      const mockLogger = {
        error: vi.fn(),
      };

      const error = new Error("Test error");
      logOperationError(mockLogger as unknown as Logger, "run task", error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to run task: Test error",
        error.stack,
      );
    });
  });

  describe("logOperationWarning", () => {
    it("should log warning with context", () => {
      const mockLogger = {
        warn: vi.fn(),
      };

      logOperationWarning(
        mockLogger as unknown as Logger,
        "Retry attempt",
        "Connection unstable",
        { attempt: 3 },
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Retry attempt [attempt=3]: Connection unstable",
      );
    });

    it("should work without context", () => {
      const mockLogger = {
        warn: vi.fn(),
      };

      logOperationWarning(
        mockLogger as unknown as Logger,
        "Cache miss",
        "Using fallback",
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Cache miss: Using fallback",
      );
    });
  });
});
