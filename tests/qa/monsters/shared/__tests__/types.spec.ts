import { describe, it, expect } from "vitest";
import {
  generateFingerprint,
  createFinding,
  shouldFailRun,
  countBySeverity,
  sortBySeverity,
  normalizeCardToString,
  normalizeCardsToStrings,
} from "../types";

describe("generateFingerprint", () => {
  it("produces deterministic output for same inputs", () => {
    const a = generateFingerprint("api", "BUG", { file: "foo.ts" }, "broken");
    const b = generateFingerprint("api", "BUG", { file: "foo.ts" }, "broken");
    expect(a).toBe(b);
  });

  it("produces different output for different inputs", () => {
    const a = generateFingerprint("api", "BUG", { file: "foo.ts" }, "broken");
    const b = generateFingerprint("api", "BUG", { file: "bar.ts" }, "broken");
    expect(a).not.toBe(b);
  });

  it("returns a 16-char hex string", () => {
    const fp = generateFingerprint("api", "BUG", { file: "x.ts" }, "title");
    expect(fp).toMatch(/^[a-f0-9]{16}$/);
  });

  it("handles empty location gracefully", () => {
    const fp = generateFingerprint("api", "BUG", {}, "title");
    expect(fp).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe("createFinding", () => {
  it("creates a finding with auto-generated id and fingerprint", () => {
    const finding = createFinding({
      monster: "api",
      category: "BUG",
      severity: "high",
      title: "Test bug",
      description: "A test bug",
      location: { file: "test.ts" },
      reproducible: true,
      tags: ["test"],
    });

    expect(finding.id).toContain("api-");
    expect(finding.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(finding.status).toBe("open");
    expect(finding.occurrences).toBe(1);
    expect(finding.firstSeen).toBeInstanceOf(Date);
    expect(finding.lastSeen).toBeInstanceOf(Date);
  });
});

describe("shouldFailRun", () => {
  it("returns true when critical findings exist", () => {
    const findings = [
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "critical",
        title: "Critical",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
    ];
    expect(shouldFailRun(findings)).toBe(true);
  });

  it("returns true when high findings exist", () => {
    const findings = [
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "high",
        title: "High",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
    ];
    expect(shouldFailRun(findings)).toBe(true);
  });

  it("returns false when only medium/low findings exist", () => {
    const findings = [
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "medium",
        title: "Medium",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "low",
        title: "Low",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
    ];
    expect(shouldFailRun(findings)).toBe(false);
  });

  it("returns false for empty findings", () => {
    expect(shouldFailRun([])).toBe(false);
  });
});

describe("countBySeverity", () => {
  it("counts findings by severity level", () => {
    const findings = [
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "critical",
        title: "c1",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "critical",
        title: "c2",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "medium",
        title: "m1",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
    ];

    const counts = countBySeverity(findings);
    expect(counts.critical).toBe(2);
    expect(counts.high).toBe(0);
    expect(counts.medium).toBe(1);
    expect(counts.low).toBe(0);
  });
});

describe("sortBySeverity", () => {
  it("sorts critical before high before medium before low", () => {
    const findings = [
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "low",
        title: "low",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "critical",
        title: "critical",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "medium",
        title: "medium",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
    ];

    const sorted = sortBySeverity(findings);
    expect(sorted[0].severity).toBe("critical");
    expect(sorted[1].severity).toBe("medium");
    expect(sorted[2].severity).toBe("low");
  });

  it("does not mutate the original array", () => {
    const findings = [
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "low",
        title: "low",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
      createFinding({
        monster: "api",
        category: "BUG",
        severity: "critical",
        title: "critical",
        description: "",
        location: {},
        reproducible: true,
        tags: [],
      }),
    ];

    const original = [...findings];
    sortBySeverity(findings);
    expect(findings[0].severity).toBe(original[0].severity);
  });
});

describe("normalizeCardToString", () => {
  it("returns card string for string input", () => {
    expect(normalizeCardToString("A♥")).toBe("A♥");
  });

  it("returns ?? for null/undefined", () => {
    expect(normalizeCardToString(null)).toBe("??");
    expect(normalizeCardToString(undefined)).toBe("??");
  });

  it("handles undefinedundefined strings", () => {
    expect(normalizeCardToString("undefinedundefined")).toBe("??");
  });

  it("converts object cards to strings", () => {
    expect(normalizeCardToString({ rank: "A", suit: "♠" })).toBe("A♠");
  });

  it("returns ?? for objects with missing rank/suit", () => {
    expect(normalizeCardToString({ rank: "A" })).toBe("??");
    expect(normalizeCardToString({})).toBe("??");
  });
});

describe("normalizeCardsToStrings", () => {
  it("normalizes array of mixed cards", () => {
    const result = normalizeCardsToStrings([
      "A♥",
      { rank: "K", suit: "♠" },
      null,
    ]);
    expect(result).toEqual(["A♥", "K♠", "??"]);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeCardsToStrings(null as any)).toEqual([]);
  });
});
