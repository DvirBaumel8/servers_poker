import { describe, it, expect, beforeEach, vi } from "vitest";
import { UrlValidatorService } from "../../../src/common/validators/url-validator.service";
import { ConfigService } from "@nestjs/config";

describe("UrlValidatorService", () => {
  describe("development mode", () => {
    let service: UrlValidatorService;

    beforeEach(() => {
      const mockConfig = {
        get: vi.fn().mockReturnValue("development"),
      };
      service = new UrlValidatorService(mockConfig as unknown as ConfigService);
    });

    describe("validate", () => {
      it("should accept valid HTTP URL", () => {
        const result = service.validate("http://example.com/action");
        expect(result.valid).toBe(true);
      });

      it("should accept valid HTTPS URL", () => {
        const result = service.validate("https://example.com/action");
        expect(result.valid).toBe(true);
      });

      it("should accept localhost with warning", () => {
        const result = service.validate("http://localhost:4000/action");
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain(
          "Using localhost/private IP - will be blocked in production",
        );
      });

      it("should accept private IP with warning", () => {
        const result = service.validate("http://192.168.1.100:4000/action");
        expect(result.valid).toBe(true);
        expect(result.warnings).toBeDefined();
      });

      it("should warn about HTTP in development", () => {
        const result = service.validate("http://example.com/action");
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain(
          "Using HTTP - HTTPS will be required in production",
        );
      });

      it("should reject non-HTTP protocols", () => {
        const result = service.validate("ftp://example.com/file");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Only HTTP and HTTPS protocols");
      });

      it("should reject invalid URL format", () => {
        const result = service.validate("not-a-valid-url");
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Invalid URL format");
      });

      it("should warn about suspicious ports", () => {
        const result = service.validate("http://example.com:3306/action");
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain(
          "Port 3306 looks like an internal service - be careful",
        );
      });
    });
  });

  describe("production mode", () => {
    let service: UrlValidatorService;

    beforeEach(() => {
      const mockConfig = {
        get: vi.fn().mockReturnValue("production"),
      };
      service = new UrlValidatorService(mockConfig as unknown as ConfigService);
    });

    describe("validate", () => {
      it("should require HTTPS in production", () => {
        const result = service.validate("http://example.com/action");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("HTTPS is required");
      });

      it("should accept HTTPS URL", () => {
        const result = service.validate("https://example.com/action");
        expect(result.valid).toBe(true);
      });

      it("should reject localhost", () => {
        const result = service.validate("https://localhost:4000/action");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP addresses are not allowed");
      });

      it("should reject 127.x.x.x addresses", () => {
        const result = service.validate("https://127.0.0.1:4000/action");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP addresses");
      });

      it("should reject 10.x.x.x addresses", () => {
        const result = service.validate("https://10.0.0.1:4000/action");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP addresses");
      });

      it("should reject 192.168.x.x addresses", () => {
        const result = service.validate("https://192.168.1.1:4000/action");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP addresses");
      });

      it("should reject 172.16-31.x.x addresses", () => {
        const result = service.validate("https://172.16.0.1:4000/action");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP addresses");
      });

      it("should reject 169.254.x.x link-local addresses", () => {
        const result = service.validate("https://169.254.169.254/action");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP addresses");
      });

      it("should reject suspicious ports", () => {
        const result = service.validate("https://example.com:22/action");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Port 22 is not allowed");
      });

      it("should reject database ports", () => {
        const result = service.validate("https://example.com:5432/action");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Port 5432 is not allowed");
      });
    });
  });

  describe("validateWithHealthCheck", () => {
    let service: UrlValidatorService;

    beforeEach(() => {
      const mockConfig = {
        get: vi.fn().mockReturnValue("development"),
      };
      service = new UrlValidatorService(mockConfig as unknown as ConfigService);
    });

    it("should return invalid result for invalid URL", async () => {
      const result = await service.validateWithHealthCheck("invalid-url");
      expect(result.valid).toBe(false);
    });

    it("should handle timeout", async () => {
      // Mock fetch to simulate abort error
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const result = await service.validateWithHealthCheck(
        "http://example.com/action",
        100,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("timed out");
    });

    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const result = await service.validateWithHealthCheck(
        "http://example.com/action",
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot reach bot endpoint");
    });

    it("should return success for healthy endpoint", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await service.validateWithHealthCheck(
        "http://localhost:4000/action",
      );

      expect(result.valid).toBe(true);
      expect(result.healthCheck?.success).toBe(true);
    });

    it("should try main endpoint if /health fails", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        return Promise.resolve({ ok: true, status: 200 });
      });

      const result = await service.validateWithHealthCheck(
        "https://api.example.com/action",
      );

      expect(result.valid).toBe(true);
      expect(callCount).toBe(2);
    });

    it("should return error if both health checks fail", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await service.validateWithHealthCheck(
        "https://api.example.com/action",
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("HTTP 500");
    });

    it("should skip health check for localhost in non-production", async () => {
      const result = await service.validateWithHealthCheck(
        "http://localhost:4000/action",
      );

      expect(result.valid).toBe(true);
      expect(result.healthCheck).toEqual({ success: true, latencyMs: 0 });
    });
  });
});
