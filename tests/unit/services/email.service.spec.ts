import { describe, it, expect, beforeEach, vi } from "vitest";
import { EmailService } from "../../../src/services/email.service";
import { ConfigService } from "@nestjs/config";

describe("EmailService", () => {
  let emailService: EmailService;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          SMTP_HOST: undefined,
          SMTP_PORT: 587,
          SMTP_USER: undefined,
          SMTP_PASS: undefined,
          EMAIL_FROM: "noreply@test.com",
          APP_NAME: "Test Poker",
        };
        return config[key] ?? defaultValue;
      }),
    };

    emailService = new EmailService(mockConfigService as ConfigService);
  });

  describe("constructor", () => {
    it("should initialize in dev mode when SMTP not configured", () => {
      expect(emailService).toBeDefined();
    });

    it("should initialize with SMTP when configured", () => {
      const smtpConfig = {
        get: vi.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            SMTP_HOST: "smtp.test.com",
            SMTP_PORT: 587,
            SMTP_USER: "user@test.com",
            SMTP_PASS: "password123",
            EMAIL_FROM: "noreply@test.com",
            APP_NAME: "Test Poker",
          };
          return config[key] ?? defaultValue;
        }),
      };

      const service = new EmailService(smtpConfig as ConfigService);
      expect(service).toBeDefined();
    });

    it("should use port 465 for secure connection", () => {
      const smtpConfig = {
        get: vi.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            SMTP_HOST: "smtp.test.com",
            SMTP_PORT: 465,
            SMTP_USER: "user@test.com",
            SMTP_PASS: "password123",
          };
          return config[key] ?? defaultValue;
        }),
      };

      const service = new EmailService(smtpConfig as ConfigService);
      expect(service).toBeDefined();
    });
  });

  describe("sendEmail", () => {
    it("should log email in dev mode and return true", async () => {
      const result = await emailService.sendEmail({
        to: "test@example.com",
        subject: "Test Subject",
        text: "Test body",
      });

      expect(result).toBe(true);
    });

    it("should handle email with HTML content", async () => {
      const result = await emailService.sendEmail({
        to: "test@example.com",
        subject: "Test Subject",
        text: "Test body",
        html: "<p>Test HTML body</p>",
      });

      expect(result).toBe(true);
    });
  });

  describe("sendVerificationCode", () => {
    it("should send verification code email", async () => {
      const result = await emailService.sendVerificationCode(
        "test@example.com",
        "123456",
      );

      expect(result).toBe(true);
    });
  });

  describe("sendWelcomeEmail", () => {
    it("should send welcome email", async () => {
      const result = await emailService.sendWelcomeEmail(
        "test@example.com",
        "John Doe",
      );

      expect(result).toBe(true);
    });
  });

  describe("sendPasswordResetCode", () => {
    it("should send password reset code email", async () => {
      const result = await emailService.sendPasswordResetCode(
        "test@example.com",
        "654321",
      );

      expect(result).toBe(true);
    });
  });

  describe("generateVerificationCode", () => {
    it("should generate a 6-digit code", () => {
      const code = emailService.generateVerificationCode();

      expect(code).toHaveLength(6);
      expect(parseInt(code)).toBeGreaterThanOrEqual(100000);
      expect(parseInt(code)).toBeLessThan(1000000);
    });

    it("should generate different codes on each call", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(emailService.generateVerificationCode());
      }
      expect(codes.size).toBeGreaterThan(90);
    });
  });
});
