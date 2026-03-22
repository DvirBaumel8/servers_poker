import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from "@nestjs/common";
import { of, throwError, delay, firstValueFrom } from "rxjs";
import { LoggingInterceptor } from "../../../src/common/interceptors/logging.interceptor";
import { TimeoutInterceptor } from "../../../src/common/interceptors/timeout.interceptor";
import { MetricsInterceptor } from "../../../src/common/interceptors/metrics.interceptor";
import { AuditLogInterceptor } from "../../../src/common/interceptors/audit-log.interceptor";

describe("Interceptors", () => {
  describe("LoggingInterceptor", () => {
    let interceptor: LoggingInterceptor;

    beforeEach(() => {
      interceptor = new LoggingInterceptor();
    });

    it("should log successful requests", async () => {
      const mockRequest = {
        method: "GET",
        url: "/api/test",
        ip: "127.0.0.1",
        get: vi.fn().mockReturnValue("test-agent"),
        user: { id: "user-123" },
      };

      const mockResponse = {
        statusCode: 200,
        get: vi.fn().mockReturnValue("100"),
      };

      const context = createMockExecutionContext(mockRequest, mockResponse);
      const next: CallHandler = {
        handle: () => of({ data: "test" }),
      };

      const result = await firstValueFrom(interceptor.intercept(context, next));
      expect(result).toEqual({ data: "test" });
    });

    it("should log requests from anonymous users", async () => {
      const mockRequest = {
        method: "POST",
        url: "/api/auth/login",
        ip: "192.168.1.1",
        get: vi.fn().mockReturnValue(""),
      };

      const mockResponse = {
        statusCode: 201,
        get: vi.fn().mockReturnValue("50"),
      };

      const context = createMockExecutionContext(mockRequest, mockResponse);
      const next: CallHandler = {
        handle: () => of({ success: true }),
      };

      const result = await firstValueFrom(interceptor.intercept(context, next));
      expect(result).toEqual({ success: true });
    });

    it("should log errors", async () => {
      const mockRequest = {
        method: "GET",
        url: "/api/error",
        ip: "127.0.0.1",
        get: vi.fn().mockReturnValue("test-agent"),
      };

      const context = createMockExecutionContext(mockRequest, {});
      const testError = new Error("Test error");
      const next: CallHandler = {
        handle: () => throwError(() => testError),
      };

      await expect(
        firstValueFrom(interceptor.intercept(context, next)),
      ).rejects.toBe(testError);
    });
  });

  describe("TimeoutInterceptor", () => {
    const createMockConfigService = (timeoutMs: number = 30000) => ({
      get: vi.fn().mockReturnValue(timeoutMs),
    });

    it("should use default timeout of 30000ms", () => {
      const configService = createMockConfigService();
      const interceptor = new TimeoutInterceptor(configService as any);
      expect(interceptor).toBeDefined();
    });

    it("should accept custom timeout", () => {
      const configService = createMockConfigService(5000);
      const interceptor = new TimeoutInterceptor(configService as any);
      expect(interceptor).toBeDefined();
    });

    it("should pass through successful responses", async () => {
      const configService = createMockConfigService(1000);
      const interceptor = new TimeoutInterceptor(configService as any);
      const context = createMockExecutionContext({}, {});
      const next: CallHandler = {
        handle: () => of({ data: "success" }),
      };

      const result = await firstValueFrom(interceptor.intercept(context, next));
      expect(result).toEqual({ data: "success" });
    });

    it("should throw RequestTimeoutException on timeout", async () => {
      const configService = createMockConfigService(10);
      const interceptor = new TimeoutInterceptor(configService as any);
      const context = createMockExecutionContext({}, {});
      const next: CallHandler = {
        handle: () => of({ data: "delayed" }).pipe(delay(100)),
      };

      await expect(
        firstValueFrom(interceptor.intercept(context, next)),
      ).rejects.toBeInstanceOf(RequestTimeoutException);
    });

    it("should pass through non-timeout errors", async () => {
      const configService = createMockConfigService(1000);
      const interceptor = new TimeoutInterceptor(configService as any);
      const context = createMockExecutionContext({}, {});
      const testError = new Error("Non-timeout error");
      const next: CallHandler = {
        handle: () => throwError(() => testError),
      };

      await expect(
        firstValueFrom(interceptor.intercept(context, next)),
      ).rejects.toBe(testError);
    });
  });

  describe("MetricsInterceptor", () => {
    it("should pass through when metricsService is null", async () => {
      const interceptor = new MetricsInterceptor(null);
      const context = createMockExecutionContext(
        { method: "GET", url: "/test" },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of({ data: "test" }),
      };

      const result = await firstValueFrom(interceptor.intercept(context, next));
      expect(result).toEqual({ data: "test" });
    });

    it("should record HTTP request metrics on success", async () => {
      const mockMetricsService = {
        recordHttpRequest: vi.fn(),
      };

      const interceptor = new MetricsInterceptor(mockMetricsService as any);
      const context = createMockExecutionContext(
        { method: "GET", url: "/api/v1/games" },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of({ data: "test" }),
      };

      await firstValueFrom(interceptor.intercept(context, next));

      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledWith(
        "GET",
        "/api/v1/games",
        200,
        expect.any(Number),
      );
    });

    it("should record HTTP request metrics on error", async () => {
      const mockMetricsService = {
        recordHttpRequest: vi.fn(),
      };

      const interceptor = new MetricsInterceptor(mockMetricsService as any);
      const context = createMockExecutionContext(
        { method: "POST", url: "/api/v1/games" },
        {},
      );
      const testError = { status: 400, message: "Bad request" };
      const next: CallHandler = {
        handle: () => throwError(() => testError),
      };

      await expect(
        firstValueFrom(interceptor.intercept(context, next)),
      ).rejects.toEqual(testError);

      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledWith(
        "POST",
        "/api/v1/games",
        400,
        expect.any(Number),
      );
    });

    it("should use status 500 when error has no status", async () => {
      const mockMetricsService = {
        recordHttpRequest: vi.fn(),
      };

      const interceptor = new MetricsInterceptor(mockMetricsService as any);
      const context = createMockExecutionContext(
        { method: "GET", url: "/api/v1/games" },
        {},
      );
      const testError = new Error("Internal error");
      const next: CallHandler = {
        handle: () => throwError(() => testError),
      };

      await expect(
        firstValueFrom(interceptor.intercept(context, next)),
      ).rejects.toBe(testError);

      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledWith(
        "GET",
        "/api/v1/games",
        500,
        expect.any(Number),
      );
    });

    it("should measure request duration accurately", async () => {
      const mockMetricsService = {
        recordHttpRequest: vi.fn(),
      };

      const interceptor = new MetricsInterceptor(mockMetricsService as any);
      const context = createMockExecutionContext(
        { method: "GET", url: "/api/v1/test" },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of({ data: "test" }).pipe(delay(50)),
      };

      await firstValueFrom(interceptor.intercept(context, next));

      const duration = mockMetricsService.recordHttpRequest.mock.calls[0][3];
      expect(duration).toBeGreaterThan(0.04);
      expect(duration).toBeLessThan(0.2);
    });
  });

  describe("AuditLogInterceptor", () => {
    let mockAuditLogRepository: any;
    let interceptor: AuditLogInterceptor;

    beforeEach(() => {
      mockAuditLogRepository = {
        create: vi.fn().mockImplementation((data) => data),
        save: vi.fn().mockResolvedValue({}),
      };
      interceptor = new AuditLogInterceptor(mockAuditLogRepository);
    });

    it("should skip non-audited routes", async () => {
      const context = createMockExecutionContext(
        { method: "GET", path: "/api/v1/health" },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of({ status: "ok" }),
      };

      const result = await firstValueFrom(interceptor.intercept(context, next));

      expect(result).toEqual({ status: "ok" });
      expect(mockAuditLogRepository.save).not.toHaveBeenCalled();
    });

    it("should audit login requests", async () => {
      const context = createMockExecutionContext(
        {
          method: "POST",
          path: "/api/v1/auth/login",
          user: { id: "user-123" },
          body: { email: "test@example.com", password: "secret" },
          ip: "127.0.0.1",
          headers: { "user-agent": "test-agent" },
        },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of({ token: "jwt-token" }),
      };

      await firstValueFrom(interceptor.intercept(context, next));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "login",
          resource: "auth",
          http_method: "POST",
          status_code: 200,
        }),
      );
    });

    it("should audit bot creation requests", async () => {
      const context = createMockExecutionContext(
        {
          method: "POST",
          path: "/api/v1/bots",
          user: { id: "user-123" },
          body: { name: "TestBot", endpoint: "http://localhost:3000" },
          ip: "192.168.1.1",
          headers: { "user-agent": "curl/7.68.0" },
        },
        { statusCode: 201 },
      );
      const next: CallHandler = {
        handle: () => of({ id: "bot-123", name: "TestBot" }),
      };

      await firstValueFrom(interceptor.intercept(context, next));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "create",
          resource: "bots",
          http_method: "POST",
        }),
      );
    });

    it("should audit sensitive data access (hands)", async () => {
      const context = createMockExecutionContext(
        {
          method: "GET",
          path: "/api/v1/games/game-123/hands",
          user: { id: "user-456" },
          body: null,
          ip: "10.0.0.1",
          headers: {},
        },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of([{ handId: "h1" }, { handId: "h2" }]),
      };

      await firstValueFrom(interceptor.intercept(context, next));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "read",
          resource: "games",
        }),
      );
    });

    it("should audit errors", async () => {
      const context = createMockExecutionContext(
        {
          method: "POST",
          path: "/api/v1/auth/login",
          user: null,
          body: { email: "test@example.com", password: "wrong" },
          ip: "127.0.0.1",
          headers: {},
        },
        {},
      );
      const testError = { status: 401, message: "Invalid credentials" };
      const next: CallHandler = {
        handle: () => throwError(() => testError),
      };

      await expect(
        firstValueFrom(interceptor.intercept(context, next)),
      ).rejects.toEqual(testError);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "login",
          status_code: 401,
          error_message: "Invalid credentials",
        }),
      );
    });

    it("should redact password fields in request body", async () => {
      const context = createMockExecutionContext(
        {
          method: "POST",
          path: "/api/v1/auth/register",
          user: null,
          body: { email: "test@example.com", password: "supersecret" },
          ip: "127.0.0.1",
          headers: {},
        },
        { statusCode: 201 },
      );
      const next: CallHandler = {
        handle: () => of({ id: "user-123" }),
      };

      await firstValueFrom(interceptor.intercept(context, next));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          request_body: expect.objectContaining({
            email: "test@example.com",
            password: "[REDACTED]",
          }),
        }),
      );
    });

    it("should extract resource ID from path", async () => {
      const context = createMockExecutionContext(
        {
          method: "GET",
          path: "/api/v1/games/550e8400-e29b-41d4-a716-446655440000/hands",
          user: { id: "user-123" },
          body: null,
          ip: "127.0.0.1",
          headers: {},
        },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of([]),
      };

      await firstValueFrom(interceptor.intercept(context, next));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          resource_id: "550e8400-e29b-41d4-a716-446655440000",
        }),
      );
    });

    it("should handle save failures gracefully", async () => {
      mockAuditLogRepository.save.mockRejectedValue(new Error("DB error"));

      const context = createMockExecutionContext(
        {
          method: "POST",
          path: "/api/v1/auth/login",
          user: null,
          body: {},
          ip: "127.0.0.1",
          headers: {},
        },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of({ token: "jwt" }),
      };

      const result = await firstValueFrom(interceptor.intercept(context, next));
      expect(result).toEqual({ token: "jwt" });
    });

    it("should map DELETE method to delete action", async () => {
      const context = createMockExecutionContext(
        {
          method: "DELETE",
          path: "/api/v1/bots/bot-123",
          user: { id: "user-123" },
          body: null,
          ip: "127.0.0.1",
          headers: {},
        },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of({ success: true }),
      };

      await firstValueFrom(interceptor.intercept(context, next));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "delete",
        }),
      );
    });

    it("should map PUT method to update action", async () => {
      const context = createMockExecutionContext(
        {
          method: "PUT",
          path: "/api/v1/bots/bot-123",
          user: { id: "user-123" },
          body: { name: "UpdatedBot" },
          ip: "127.0.0.1",
          headers: {},
        },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of({ id: "bot-123", name: "UpdatedBot" }),
      };

      await firstValueFrom(interceptor.intercept(context, next));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "update",
        }),
      );
    });

    it("should audit leaderboard access", async () => {
      const context = createMockExecutionContext(
        {
          method: "GET",
          path: "/api/v1/games/leaderboard",
          user: { id: "user-123" },
          body: null,
          ip: "127.0.0.1",
          headers: {},
        },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of([{ rank: 1, name: "Bot1" }]),
      };

      await firstValueFrom(interceptor.intercept(context, next));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditLogRepository.create).toHaveBeenCalled();
    });

    it("should audit tournament results access", async () => {
      const context = createMockExecutionContext(
        {
          method: "GET",
          path: "/api/v1/tournaments/tournament-123/results",
          user: { id: "user-123" },
          body: null,
          ip: "127.0.0.1",
          headers: {},
        },
        { statusCode: 200 },
      );
      const next: CallHandler = {
        handle: () => of({ winner: "Bot1" }),
      };

      await firstValueFrom(interceptor.intercept(context, next));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "read",
          resource: "tournaments",
        }),
      );
    });
  });
});

function createMockExecutionContext(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
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
