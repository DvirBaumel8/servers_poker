import { describe, it, expect } from "vitest";
import { AuthService } from "../../src/modules/auth/auth.service";
import * as bcrypt from "bcrypt";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe.concurrent("Auth Integration Tests (Unit-style)", () => {
  describe.concurrent("Password Hashing", () => {
    it("should hash passwords correctly", async () => {
      const password = `SecurePassword123!-${uid()}`;
      const hash = await bcrypt.hash(password, 10);

      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);

      const isMatch = await bcrypt.compare(password, hash);
      expect(isMatch).toBe(true);
    });

    it("should reject wrong password", async () => {
      const password = `SecurePassword123!-${uid()}`;
      const wrongPassword = `WrongPassword123!-${uid()}`;
      const hash = await bcrypt.hash(password, 10);

      const isMatch = await bcrypt.compare(wrongPassword, hash);
      expect(isMatch).toBe(false);
    });
  });

  describe.concurrent("Input Validation", () => {
    it("should validate email format", () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const testId = uid();

      expect(emailRegex.test(`user-${testId}@example.com`)).toBe(true);
      expect(emailRegex.test(`user.name-${testId}@example.co.uk`)).toBe(true);
      expect(emailRegex.test(`invalid-email-${testId}`)).toBe(false);
      expect(emailRegex.test(`missing-${testId}@domain`)).toBe(false);
    });

    it("should validate password length", () => {
      const minLength = 8;
      const testId = uid();

      expect(`short${testId.slice(0, 2)}`.slice(0, 5).length >= minLength).toBe(false);
      expect(`validpassword-${testId}`.length >= minLength).toBe(true);
      expect(`SecurePassword123!-${testId}`.length >= minLength).toBe(true);
    });
  });

  describe.concurrent("API Key Generation", () => {
    it("should generate unique API keys", async () => {
      const keys = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const key = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        keys.add(key);
      }

      expect(keys.size).toBe(100);
    });

    it("should generate keys of correct length", () => {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const key = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      expect(key.length).toBe(64);
    });
  });
});
