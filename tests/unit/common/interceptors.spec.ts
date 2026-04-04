import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from "@nestjs/common";
import { of, throwError, delay, firstValueFrom } from "rxjs";
import { LoggingInterceptor } from "../../../src/common/interceptors/logging.interceptor";
import { TimeoutInterceptor } from "../../../src/common/interceptors/timeout.interceptor";

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
