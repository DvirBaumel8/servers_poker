import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { HmacSigningService } from "../../../src/common/security/hmac-signing.service";

describe("HmacSigningService", () => {
  let service: HmacSigningService;
  const secretKey = "test-secret-key-12345";

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HmacSigningService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(300000), // 5 minutes
          },
        },
      ],
    }).compile();

    service = module.get<HmacSigningService>(HmacSigningService);
  });

  describe.concurrent("signPayload", () => {
    it("should sign a payload with all required fields", () => {
      const payload = { action: "call", amount: 100 };
      const signed = service.signPayload(payload, secretKey);

      expect(signed.payload).toBe(JSON.stringify(payload));
      expect(signed.signature).toBeDefined();
      expect(signed.signature.length).toBe(64); // SHA256 hex
      expect(signed.timestamp).toBeGreaterThan(0);
      expect(signed.nonce).toBeDefined();
      expect(signed.nonce.length).toBe(32); // 16 bytes hex
    });

    it("should produce different signatures for different payloads", () => {
      const signed1 = service.signPayload({ action: "call" }, secretKey);
      const signed2 = service.signPayload({ action: "fold" }, secretKey);

      expect(signed1.signature).not.toBe(signed2.signature);
    });

    it("should produce different nonces each time", () => {
      const signed1 = service.signPayload({ test: true }, secretKey);
      const signed2 = service.signPayload({ test: true }, secretKey);

      expect(signed1.nonce).not.toBe(signed2.nonce);
    });
  });

  describe.concurrent("verifySignature", () => {
    it("should verify a valid signature", () => {
      const payload = { action: "raise", amount: 200 };
      const signed = service.signPayload(payload, secretKey);
      const result = service.verifySignature(signed, secretKey);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject invalid signature", () => {
      const payload = { action: "check" };
      const signed = service.signPayload(payload, secretKey);

      // Tamper with signature
      signed.signature = "0".repeat(64);

      const result = service.verifySignature(signed, secretKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid signature");
    });

    it("should reject tampered payload", () => {
      const payload = { action: "call", amount: 100 };
      const signed = service.signPayload(payload, secretKey);

      // Tamper with payload
      signed.payload = JSON.stringify({ action: "call", amount: 1000 });

      const result = service.verifySignature(signed, secretKey);

      expect(result.valid).toBe(false);
    });

    it("should reject wrong secret key", () => {
      const payload = { test: true };
      const signed = service.signPayload(payload, secretKey);
      const result = service.verifySignature(signed, "wrong-key");

      expect(result.valid).toBe(false);
    });

    it("should reject replayed nonce", () => {
      const payload = { test: true };
      const signed = service.signPayload(payload, secretKey);

      // First verification should succeed
      const result1 = service.verifySignature(signed, secretKey);
      expect(result1.valid).toBe(true);

      // Second verification with same nonce should fail
      const result2 = service.verifySignature(signed, secretKey);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain("replay");
    });
  });

  describe.concurrent("generateSecretKey", () => {
    it("should generate a 64-character hex key", () => {
      const key = service.generateSecretKey();

      expect(key.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(key)).toBe(true);
    });

    it("should generate unique keys", () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(service.generateSecretKey());
      }
      expect(keys.size).toBe(100);
    });
  });

  describe.concurrent("generateSignedHeaders", () => {
    it("should generate all required headers", () => {
      const payload = { data: "test" };
      const headers = service.generateSignedHeaders(payload, secretKey);

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["X-Poker-Signature"]).toBeDefined();
      expect(headers["X-Poker-Timestamp"]).toBeDefined();
      expect(headers["X-Poker-Nonce"]).toBeDefined();
    });
  });

  describe.concurrent("verifySignedRequest", () => {
    it("should verify request with valid headers", () => {
      const payload = { test: true };
      const headers = service.generateSignedHeaders(payload, secretKey);
      const body = JSON.stringify(payload);

      // Convert headers to lowercase keys (as they would be in HTTP)
      const lowerHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        lowerHeaders[key.toLowerCase()] = value;
      }

      const result = service.verifySignedRequest(body, lowerHeaders, secretKey);

      expect(result.valid).toBe(true);
    });

    it("should reject request with missing headers", () => {
      const result = service.verifySignedRequest(
        "{}",
        { "content-type": "application/json" },
        secretKey,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing");
    });
  });
});
