import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  loadIssueDatabase,
  addIssue,
  addIssues,
  resolveIssue,
  getOpenIssues,
  getIssuesBySource,
  getIssuesBySeverity,
  getStats,
  compactDatabase,
  detectRegressions,
  detectNewlyFixed,
  generateReport,
  IssueDatabase,
} from "../issue-tracker";

const DB_PATH = path.join(
  process.cwd(),
  "tests/qa/monsters/shared/issues.json",
);
const LOCK_PATH = DB_PATH + ".lock";
const REPORT_PATH = path.join(process.cwd(), "docs/MONSTERS_ISSUES.md");

let originalDb: string | null = null;

beforeEach(() => {
  if (fs.existsSync(DB_PATH)) {
    originalDb = fs.readFileSync(DB_PATH, "utf-8");
  }
  // Start with a clean database
  fs.writeFileSync(
    DB_PATH,
    JSON.stringify({
      version: 1,
      lastUpdated: new Date().toISOString(),
      issues: [],
      stats: {
        totalFound: 0,
        totalResolved: 0,
        bySource: {},
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      },
    }),
  );
  // Clean up any stale locks
  if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
});

afterEach(() => {
  if (originalDb) {
    fs.writeFileSync(DB_PATH, originalDb);
  }
  if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
});

describe("loadIssueDatabase", () => {
  it("returns a valid database structure", () => {
    const db = loadIssueDatabase();
    expect(db.version).toBe(1);
    expect(db.issues).toEqual([]);
    expect(db.stats.totalFound).toBe(0);
  });

  it("returns fresh db when file is corrupted", () => {
    fs.writeFileSync(DB_PATH, "not json");
    const db = loadIssueDatabase();
    expect(db.version).toBe(1);
    expect(db.issues).toEqual([]);
  });
});

describe("addIssue", () => {
  it("creates a new issue with correct fields", () => {
    const issue = addIssue({
      category: "BUG",
      severity: "high",
      source: "api",
      title: "Endpoint broken",
      description: "Returns 500",
      location: "/api/v1/users",
    });

    expect(issue.id).toMatch(/^ISS-[A-F0-9]{8}$/);
    expect(issue.severity).toBe("high");
    expect(issue.status).toBe("open");
    expect(issue.occurrences).toBe(1);
  });

  it("deduplicates by fingerprint", () => {
    addIssue({
      category: "BUG",
      severity: "medium",
      source: "api",
      title: "Broken endpoint",
      description: "Returns 500",
      location: "/api/v1/users",
    });

    const second = addIssue({
      category: "BUG",
      severity: "medium",
      source: "api",
      title: "Broken endpoint",
      description: "Returns 500 again",
      location: "/api/v1/users",
    });

    expect(second.occurrences).toBe(2);
    const db = loadIssueDatabase();
    expect(db.issues).toHaveLength(1);
  });

  it("escalates severity on re-report", () => {
    addIssue({
      category: "BUG",
      severity: "medium",
      source: "api",
      title: "Issue X",
      description: "Desc",
      location: "/api/x",
    });

    const escalated = addIssue({
      category: "BUG",
      severity: "critical",
      source: "api",
      title: "Issue X",
      description: "Worse now",
      location: "/api/x",
    });

    expect(escalated.severity).toBe("critical");
  });

  it("reopens resolved issues", () => {
    const issue = addIssue({
      category: "BUG",
      severity: "high",
      source: "api",
      title: "Reopen test",
      description: "desc",
      location: "/x",
    });

    resolveIssue(issue.fingerprint, "fixed");

    const reopened = addIssue({
      category: "BUG",
      severity: "high",
      source: "api",
      title: "Reopen test",
      description: "desc",
      location: "/x",
    });

    expect(reopened.status).toBe("open");
  });

  it("normalizes UUIDs in location for fingerprinting", () => {
    const a = addIssue({
      category: "BUG",
      severity: "medium",
      source: "api",
      title: "UUID test",
      description: "d",
      location: "/api/v1/games/550e8400-e29b-41d4-a716-446655440000/state",
    });

    const b = addIssue({
      category: "BUG",
      severity: "medium",
      source: "api",
      title: "UUID test",
      description: "d",
      location: "/api/v1/games/12345678-abcd-efab-cdef-123456789012/state",
    });

    expect(b.occurrences).toBe(2);
  });
});

describe("addIssues (batch)", () => {
  it("adds multiple issues in a single locked transaction", () => {
    const results = addIssues([
      {
        category: "BUG",
        severity: "high",
        source: "api",
        title: "Bug 1",
        description: "d1",
        location: "/a",
      },
      {
        category: "BUG",
        severity: "medium",
        source: "api",
        title: "Bug 2",
        description: "d2",
        location: "/b",
      },
    ]);

    expect(results).toHaveLength(2);
    const db = loadIssueDatabase();
    expect(db.issues).toHaveLength(2);
    expect(db.stats.totalFound).toBe(2);
  });
});

describe("resolveIssue", () => {
  it("marks an issue as resolved", () => {
    const issue = addIssue({
      category: "BUG",
      severity: "high",
      source: "api",
      title: "Resolve me",
      description: "d",
      location: "/x",
    });

    const result = resolveIssue(issue.fingerprint, "patched");
    expect(result).toBe(true);

    const db = loadIssueDatabase();
    const resolved = db.issues[0];
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolution).toBe("patched");
  });

  it("returns false for unknown fingerprint", () => {
    expect(resolveIssue("nonexistent", "fix")).toBe(false);
  });
});

describe("getOpenIssues", () => {
  it("returns only open/in_progress issues", () => {
    addIssue({
      category: "BUG",
      severity: "high",
      source: "api",
      title: "Open",
      description: "d",
      location: "/a",
    });
    const resolved = addIssue({
      category: "BUG",
      severity: "high",
      source: "api",
      title: "Resolved",
      description: "d",
      location: "/b",
    });
    resolveIssue(resolved.fingerprint, "fixed");

    const open = getOpenIssues();
    expect(open).toHaveLength(1);
    expect(open[0].title).toBe("Open");
  });
});

describe("getIssuesBySource", () => {
  it("filters by source monster", () => {
    addIssue({
      category: "BUG",
      severity: "high",
      source: "api",
      title: "API bug",
      description: "d",
      location: "/a",
    });
    addIssue({
      category: "BUG",
      severity: "high",
      source: "browser",
      title: "Browser bug",
      description: "d",
      location: "/b",
    });

    const apiIssues = getIssuesBySource("api");
    expect(apiIssues).toHaveLength(1);
    expect(apiIssues[0].source).toBe("api");
  });
});

describe("getIssuesBySeverity", () => {
  it("returns open issues of a specific severity", () => {
    addIssue({
      category: "BUG",
      severity: "critical",
      source: "api",
      title: "Critical",
      description: "d",
      location: "/a",
    });
    addIssue({
      category: "BUG",
      severity: "medium",
      source: "api",
      title: "Medium",
      description: "d",
      location: "/b",
    });

    const criticals = getIssuesBySeverity("critical");
    expect(criticals).toHaveLength(1);
  });
});

describe("detectRegressions", () => {
  it("reopens resolved issues that reappear", () => {
    const issue = addIssue({
      category: "BUG",
      severity: "high",
      source: "api",
      title: "Regress me",
      description: "d",
      location: "/x",
    });
    resolveIssue(issue.fingerprint, "fixed");

    const regressions = detectRegressions(new Set([issue.fingerprint]));
    expect(regressions).toHaveLength(1);
    expect(regressions[0].status).toBe("open");
  });
});

describe("detectNewlyFixed", () => {
  it("identifies open issues not in current fingerprints", () => {
    addIssue({
      category: "BUG",
      severity: "high",
      source: "api",
      title: "Fixed now",
      description: "d",
      location: "/x",
    });

    const fixed = detectNewlyFixed(new Set());
    expect(fixed).toHaveLength(1);
  });
});

describe("compactDatabase", () => {
  it("removes expired resolved issues", () => {
    const issue = addIssue({
      category: "BUG",
      severity: "high",
      source: "api",
      title: "Old issue",
      description: "d",
      location: "/x",
    });
    resolveIssue(issue.fingerprint, "fixed");

    // Manually backdate the resolvedAt
    const db = loadIssueDatabase();
    db.issues[0].resolvedAt = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

    const result = compactDatabase();
    expect(result.expired).toBe(1);
    expect(result.afterSize).toBe(0);
  });
});

describe("generateReport", () => {
  it("produces a markdown report string", () => {
    addIssue({
      category: "BUG",
      severity: "critical",
      source: "api",
      title: "Critical bug",
      description: "Bad stuff",
      location: "/api/v1/test",
    });

    const report = generateReport();
    expect(report).toContain("Monster Issues Report");
    expect(report).toContain("Critical bug");
    expect(report).toContain("Open Issues");
  });
});

describe("getStats", () => {
  it("includes openCount", () => {
    addIssue({
      category: "BUG",
      severity: "high",
      source: "api",
      title: "Open",
      description: "d",
      location: "/a",
    });

    const stats = getStats();
    expect(stats.openCount).toBe(1);
    expect(stats.totalFound).toBe(1);
  });
});
