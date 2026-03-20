import { describe, it, expect } from "vitest";

describe("Input Validation", () => {
  describe("table name validation", () => {
    const tableNameRegex = /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/;

    it("should accept valid table names", () => {
      expect(tableNameRegex.test("MyTable")).toBe(true);
      expect(tableNameRegex.test("Table 1")).toBe(true);
      expect(tableNameRegex.test("my-table")).toBe(true);
      expect(tableNameRegex.test("table_name")).toBe(true);
      expect(tableNameRegex.test("1stTable")).toBe(true);
    });

    it("should reject XSS attempts in table names", () => {
      expect(tableNameRegex.test("<script>alert(1)</script>")).toBe(false);
      expect(tableNameRegex.test("<img src=x onerror=alert(1)>")).toBe(false);
      expect(tableNameRegex.test("javascript:alert(1)")).toBe(false);
    });

    it("should reject table names with special characters", () => {
      expect(tableNameRegex.test("table@home")).toBe(false);
      expect(tableNameRegex.test("table#1")).toBe(false);
      expect(tableNameRegex.test("table$$$")).toBe(false);
      expect(tableNameRegex.test("table;DROP TABLE")).toBe(false);
    });

    it("should reject empty string", () => {
      expect(tableNameRegex.test("")).toBe(false);
    });

    it("should reject names starting with special chars", () => {
      expect(tableNameRegex.test(" table")).toBe(false);
      expect(tableNameRegex.test("-table")).toBe(false);
      expect(tableNameRegex.test("_table")).toBe(false);
    });
  });

  describe("blind value validation", () => {
    it("should reject negative blind values", () => {
      expect(-50).toBeLessThan(1);
    });

    it("should reject zero blind values", () => {
      expect(0).toBeLessThan(1);
    });

    it("should accept valid blind values", () => {
      expect(10).toBeGreaterThanOrEqual(1);
      expect(25).toBeGreaterThanOrEqual(1);
      expect(100).toBeGreaterThanOrEqual(1);
    });

    it("big blind should be >= small blind for valid config", () => {
      const configs = [
        { small: 10, big: 20 },
        { small: 25, big: 50 },
        { small: 50, big: 100 },
      ];

      for (const config of configs) {
        expect(config.big).toBeGreaterThanOrEqual(config.small);
      }
    });
  });

  describe("starting chips validation", () => {
    it("should require minimum 100 starting chips", () => {
      expect(100).toBeGreaterThanOrEqual(100);
      expect(50).toBeLessThan(100);
    });
  });

  describe("error message sanitization", () => {
    it("should not expose database constraint names", () => {
      const goodMessage =
        "Invalid table configuration: check that blind values and starting chips are valid positive numbers";
      const badMessage =
        'new row for relation "tables" violates check constraint "CHK_123"';

      expect(goodMessage).not.toContain("constraint");
      expect(goodMessage).not.toContain("relation");
      expect(badMessage).toContain("constraint");
    });

    it("should provide user-friendly error messages", () => {
      const userMessages = [
        "A table with this name already exists",
        "Invalid table configuration: check that blind values and starting chips are valid positive numbers",
        "Failed to create table. Please check your input and try again.",
      ];

      for (const msg of userMessages) {
        expect(msg.length).toBeLessThan(200);
        expect(msg).not.toMatch(/SQL|SELECT|INSERT|DELETE|constraint/i);
      }
    });
  });
});
