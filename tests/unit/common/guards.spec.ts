import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "../../../src/common/guards/jwt-auth.guard";
import { ApiKeyGuard } from "../../../src/common/guards/api-key.guard";
import { RolesGuard } from "../../../src/common/guards/roles.guard";

describe("Guards", () => {
  describe("JwtAuthGuard", () => {
    let guard: JwtAuthGuard;
    let reflector: Reflector;

    beforeEach(() => {
      reflector = new Reflector();
      guard = new JwtAuthGuard(reflector);
    });

    it("should allow access for public routes", () => {
      const context = createMockExecutionContext();
      vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it("should call parent canActivate for protected routes", async () => {
      const context = createMockExecutionContext();
      vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);

      // The parent's canActivate will return a Promise that rejects
      // because passport JWT strategy is not registered in unit tests.
      // We verify it doesn't return true (which would bypass auth)
      // and properly rejects with the expected error
      const result = guard.canActivate(context);

      // Result should be a Promise (from parent AuthGuard)
      expect(result).not.toBe(true);
      expect(result).toBeInstanceOf(Promise);

      // The promise should reject because JWT strategy isn't configured
      await expect(result).rejects.toThrow("Unknown authentication strategy");
    });
  });

  describe("ApiKeyGuard", () => {
    let guard: ApiKeyGuard;
    let mockUserRepository: { findByApiKey: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockUserRepository = {
        findByApiKey: vi.fn(),
      };
      guard = new ApiKeyGuard(mockUserRepository as never);
    });

    it("should throw UnauthorizedException when no auth header", async () => {
      const context = createMockExecutionContext({ headers: {} });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException for invalid header format", async () => {
      const context = createMockExecutionContext({
        headers: { authorization: "InvalidFormat" },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException for invalid API key", async () => {
      mockUserRepository.findByApiKey.mockResolvedValue(null);
      const context = createMockExecutionContext({
        headers: { authorization: "Bearer invalid-key" },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw UnauthorizedException for deactivated user", async () => {
      mockUserRepository.findByApiKey.mockResolvedValue({
        id: "1",
        active: false,
      });
      const context = createMockExecutionContext({
        headers: { authorization: "Bearer valid-key" },
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should allow access for valid API key", async () => {
      const mockUser = { id: "1", active: true };
      mockUserRepository.findByApiKey.mockResolvedValue(mockUser);
      const request = { headers: { authorization: "Bearer valid-key" } };
      const context = createMockExecutionContext(request);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(request).toHaveProperty("user", mockUser);
    });
  });

  describe("RolesGuard", () => {
    let guard: RolesGuard;
    let reflector: Reflector;

    beforeEach(() => {
      reflector = new Reflector();
      guard = new RolesGuard(reflector);
    });

    it("should allow access when no roles required", () => {
      const context = createMockExecutionContext();
      vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(null);

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });

    it("should throw ForbiddenException when no user", () => {
      const context = createMockExecutionContext({ user: undefined });
      vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should throw ForbiddenException when user lacks required role", () => {
      const context = createMockExecutionContext({ user: { role: "user" } });
      vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("should allow access when user has required role", () => {
      const context = createMockExecutionContext({ user: { role: "admin" } });
      vi.spyOn(reflector, "getAllAndOverride").mockReturnValue([
        "admin",
        "moderator",
      ]);

      const result = guard.canActivate(context);
      expect(result).toBe(true);
    });
  });
});

function createMockExecutionContext(
  request: Record<string, unknown> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
    getArgs: () => [],
    getArgByIndex: () => ({}),
    switchToRpc: () => ({ getContext: () => ({}), getData: () => ({}) }),
    switchToWs: () => ({ getClient: () => ({}), getData: () => ({}) }),
    getType: () => "http",
  } as ExecutionContext;
}
