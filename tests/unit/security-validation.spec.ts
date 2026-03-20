import { describe, it, expect } from "vitest";

describe("Security Input Validation Rules", () => {
  describe("table name validation", () => {
    const regex = /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/;

    it("should block script tags", () => {
      expect(regex.test("<script>alert(1)</script>")).toBe(false);
    });

    it("should block img tags", () => {
      expect(regex.test("<img src=x onerror=alert(1)>")).toBe(false);
    });

    it("should block SQL injection", () => {
      expect(regex.test("Table' OR 1=1--")).toBe(false);
      expect(regex.test("'; DROP TABLE users;--")).toBe(false);
    });

    it("should block event handlers", () => {
      expect(regex.test("onload=alert(1)")).toBe(false);
    });

    it("should allow valid table names", () => {
      expect(regex.test("My Table")).toBe(true);
      expect(regex.test("Table-1")).toBe(true);
      expect(regex.test("high_stakes_9max")).toBe(true);
    });
  });

  describe("user name validation", () => {
    const regex = /^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/;

    it("should block script injection", () => {
      expect(regex.test("<script>alert(1)</script>")).toBe(false);
    });

    it("should block HTML tags", () => {
      expect(regex.test("<b>bold</b>")).toBe(false);
      expect(regex.test("<img src=x>")).toBe(false);
    });

    it("should allow valid names", () => {
      expect(regex.test("JohnDoe")).toBe(true);
      expect(regex.test("Jane.Doe")).toBe(true);
      expect(regex.test("User_123")).toBe(true);
      expect(regex.test("A B")).toBe(true);
    });

    it("should reject names starting with special chars", () => {
      expect(regex.test(".name")).toBe(false);
      expect(regex.test("_name")).toBe(false);
      expect(regex.test(" name")).toBe(false);
    });
  });

  describe("bot description validation", () => {
    const regex = /^[^<>]*$/;

    it("should block all HTML tags", () => {
      expect(regex.test("<script>alert(1)</script>")).toBe(false);
      expect(regex.test("<img src=x>")).toBe(false);
      expect(regex.test("<div>content</div>")).toBe(false);
      expect(regex.test("<a href='evil'>click</a>")).toBe(false);
    });

    it("should allow safe descriptions", () => {
      expect(regex.test("A conservative poker bot")).toBe(true);
      expect(regex.test("Uses GTO strategy, version 2.0")).toBe(true);
      expect(regex.test("Bot that plays tight-aggressive (TAG) style")).toBe(
        true,
      );
      expect(regex.test("Win rate: 55% | ROI: 12%")).toBe(true);
    });

    it("should allow special chars except angle brackets", () => {
      expect(regex.test("!@#$%^&*()_+-=[]{}|;':\",.?/~`")).toBe(true);
    });
  });

  describe("password strength validation", () => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

    it("should reject all-lowercase", () => {
      expect(regex.test("password123")).toBe(false);
    });

    it("should reject all-uppercase", () => {
      expect(regex.test("PASSWORD123")).toBe(false);
    });

    it("should reject no digits", () => {
      expect(regex.test("PasswordOnly")).toBe(false);
    });

    it("should reject all spaces", () => {
      expect(regex.test("        ")).toBe(false);
    });

    it("should accept strong passwords", () => {
      expect(regex.test("SecurePass123")).toBe(true);
      expect(regex.test("MyP@ssw0rd!")).toBe(true);
      expect(regex.test("aB1")).toBe(true);
    });
  });

  describe("bot name validation", () => {
    const regex = /^[a-zA-Z0-9_-]+$/;

    it("should block XSS in bot names", () => {
      expect(regex.test("<script>")).toBe(false);
      expect(regex.test("bot<>test")).toBe(false);
    });

    it("should block spaces", () => {
      expect(regex.test("my bot")).toBe(false);
    });

    it("should allow valid bot names", () => {
      expect(regex.test("MyBot")).toBe(true);
      expect(regex.test("bot-v2")).toBe(true);
      expect(regex.test("bot_123")).toBe(true);
    });
  });

  describe("IDOR prevention patterns", () => {
    it("should validate UUID format", () => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      expect(uuidRegex.test("e5b538e0-1899-4e72-83d0-7ff2e0660182")).toBe(true);
      expect(uuidRegex.test("not-a-uuid")).toBe(false);
      expect(uuidRegex.test("' OR 1=1--")).toBe(false);
      expect(uuidRegex.test("../../admin")).toBe(false);
    });
  });

  describe("SQL injection patterns", () => {
    it("common payloads should fail validation regexes", () => {
      const nameRegex = /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/;
      const payloads = [
        "' OR '1'='1",
        "'; DROP TABLE users;--",
        "1 UNION SELECT * FROM users",
        "admin'--",
        "1' AND 1=1#",
        "' OR 1=1/*",
      ];

      for (const payload of payloads) {
        expect(nameRegex.test(payload)).toBe(false);
      }
    });
  });

  describe("SSRF prevention", () => {
    it("should identify dangerous URLs", () => {
      const dangerousPatterns = [
        "http://169.254.169.254",
        "http://127.0.0.1",
        "http://0.0.0.0",
        "http://localhost",
        "file:///etc/passwd",
        "gopher://internal",
      ];

      for (const url of dangerousPatterns) {
        const isInternal =
          /^(file:|gopher:|http:\/\/(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.0\.0\.0|localhost))/i.test(
            url,
          );
        expect(isInternal).toBe(true);
      }
    });
  });
});
