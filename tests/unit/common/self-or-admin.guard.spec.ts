import { describe, it, expect, beforeEach, vi } from "vitest";
import { ForbiddenException, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  SelfOrAdminGuard,
  SELF_OR_ADMIN_KEY,
} from "../../../src/common/guards/self-or-admin.guard";

describe("SelfOrAdminGuard", () => {
  let guard: SelfOrAdminGuard;
  let mockReflector: {
    get: ReturnType<typeof vi.fn>;
  };

  function createMockContext(
    userId: string,
    userRole: string,
    paramId: string,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: userId, role: userRole },
          params: { id: paramId },
        }),
      }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    mockReflector = {
      get: vi.fn(),
    };

    guard = new SelfOrAdminGuard(mockReflector as unknown as Reflector);
  });

  describe("canActivate", () => {
    it("should return true when no decorator is applied", () => {
      mockReflector.get.mockReturnValue(undefined);

      const context = createMockContext("user-123", "user", "user-456");
      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it("should return true when user accesses their own resource", () => {
      mockReflector.get.mockReturnValue("id");

      const context = createMockContext("user-123", "user", "user-123");
      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it("should return true when admin accesses any resource", () => {
      mockReflector.get.mockReturnValue("id");

      const context = createMockContext("admin-user", "admin", "user-123");
      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it("should throw ForbiddenException when user accesses another user's resource", () => {
      mockReflector.get.mockReturnValue("id");

      const context = createMockContext("user-123", "user", "user-456");

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when no user is authenticated", () => {
      mockReflector.get.mockReturnValue("id");

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: null,
            params: { id: "user-123" },
          }),
        }),
        getHandler: () => ({}),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should return true when param ID is not present", () => {
      mockReflector.get.mockReturnValue("id");

      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: "user-123", role: "user" },
            params: {},
          }),
        }),
        getHandler: () => ({}),
      } as unknown as ExecutionContext;

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});
