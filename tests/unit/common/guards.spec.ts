import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "../../../src/common/guards/jwt-auth.guard";
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
