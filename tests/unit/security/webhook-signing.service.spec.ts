import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { WebhookSigningService } from "../../../src/common/security/webhook-signing.service";

describe("WebhookSigningService", () => {
  let service: WebhookSigningService;
  const webhookSecret = "whsec_test-webhook-secret";

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookSigningService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(300000), // 5 minutes
          },
        },
      ],
    }).compile();

    service = module.get<WebhookSigningService>(WebhookSigningService);
  });

  describe("createSignedWebhook", () => {
    it("should create a signed webhook with all fields", () => {
      const event = "game.started";
      const data = { gameId: "123", players: ["bot1", "bot2"] };

      const signed = service.createSignedWebhook(event, data, webhookSecret);

      expect(signed.payload.event).toBe(event);
      expect(signed.payload.data).toEqual(data);
      expect(signed.payload.timestamp).toBeGreaterThan(0);
      expect(signed.payload.webhookId).toBeDefined();
      expect(signed.signature).toBeDefined();
      expect(signed.headers["X-Poker-Webhook-Signature"]).toBe(signed.signature);
    });

    it("should generate unique webhook IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const signed = service.createSignedWebhook("test", {}, webhookSecret);
        ids.add(signed.payload.webhookId);
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("verifyWebhook", () => {
    it("should verify a valid webhook", () => {
      const event = "hand.completed";
      const data = { handNumber: 5, winner: "bot1" };

      const { body, headers } = service.createWebhookHeaders(
        event,
        data,
        webhookSecret,
      );

      // Convert to lowercase headers
      const lowerHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        lowerHeaders[key.toLowerCase()] = value;
      }

      // Prepend v1= to signature as the service expects
      lowerHeaders["x-poker-webhook-signature"] =
        `v1=${lowerHeaders["x-poker-webhook-signature"]}`;

      const result = service.verifyWebhook(body, lowerHeaders, webhookSecret);

      expect(result.valid).toBe(true);
      expect(result.payload?.event).toBe(event);
    });

    it("should reject webhook with wrong secret", () => {
      const { body, headers } = service.createWebhookHeaders(
        "test",
        {},
        webhookSecret,
      );

      const lowerHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        lowerHeaders[key.toLowerCase()] = value;
      }
      lowerHeaders["x-poker-webhook-signature"] =
        `v1=${lowerHeaders["x-poker-webhook-signature"]}`;

      const result = service.verifyWebhook(body, lowerHeaders, "wrong-secret");

      expect(result.valid).toBe(false);
    });

    it("should reject webhook with missing signature header", () => {
      const result = service.verifyWebhook(
        "{}",
        {
          "x-poker-webhook-timestamp": Date.now().toString(),
          "x-poker-webhook-id": "123",
        },
        webhookSecret,
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing");
    });

    it("should reject webhook with tampered body", () => {
      const { headers } = service.createWebhookHeaders(
        "test",
        { original: true },
        webhookSecret,
      );

      const lowerHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        lowerHeaders[key.toLowerCase()] = value;
      }
      lowerHeaders["x-poker-webhook-signature"] =
        `v1=${lowerHeaders["x-poker-webhook-signature"]}`;

      // Send different body than what was signed
      const tamperedBody = JSON.stringify({
        event: "test",
        data: { tampered: true },
        timestamp: Date.now(),
        webhookId: "fake",
      });

      const result = service.verifyWebhook(
        tamperedBody,
        lowerHeaders,
        webhookSecret,
      );

      expect(result.valid).toBe(false);
    });
  });

  describe("generateWebhookSecret", () => {
    it("should generate a secret with proper prefix", () => {
      const secret = service.generateWebhookSecret();

      expect(secret.startsWith("whsec_")).toBe(true);
      expect(secret.length).toBeGreaterThan(10);
    });

    it("should generate unique secrets", () => {
      const secrets = new Set<string>();
      for (let i = 0; i < 100; i++) {
        secrets.add(service.generateWebhookSecret());
      }
      expect(secrets.size).toBe(100);
    });
  });
});
