/**
 * 🗂️ UNIFIED ISSUE TRACKER
 *
 * Single source of truth for ALL monster findings.
 * All monsters write here, creating one consolidated view.
 *
 * Features:
 * - Deduplication by fingerprint
 * - Tracks issue history (first seen, last seen, occurrences)
 * - Categorizes by source monster
 * - Supports resolution tracking
 * - Generates consolidated reports
 */

import * as fs from "fs";
import { readJsonSafe } from "./fs-utils";
import * as path from "path";
import * as crypto from "crypto";
import {
  TrendData,
  Hotspot,
  CoverageGap,
  MonsterType,
  Severity,
} from "./types";

// Re-export Severity from the single source of truth
export type { Severity } from "./types";

export type IssueStatus = "open" | "in_progress" | "resolved" | "wont_fix";

export interface Issue {
  id: string;
  fingerprint: string;

  // Classification
  category: string;
  severity: Severity;
  source: string; // Which monster found it

  // Details
  title: string;
  description: string;
  location: string;
  suggestion?: string;
  competitorNote?: string;

  // Tracking
  status: IssueStatus;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;

  // Resolution
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
}

export interface QualityReportData {
  overallScore: number;
  grade: string;
  summary: string;
  categories: Record<string, { score: number; status: string }>;
  priorities: string[];
  competitorInsights: string[];
  generatedAt: string;
}

export interface IssueDatabase {
  version: number;
  lastUpdated: string;
  issues: Issue[];
  qualityReport?: QualityReportData;
  stats: {
    totalFound: number;
    totalResolved: number;
    bySource: Record<string, number>;
    bySeverity: Record<Severity, number>;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DB_PATH = path.join(
  process.cwd(),
  "tests/qa/monsters/shared/issues.json",
);
const REPORT_PATH = path.join(process.cwd(), "docs/MONSTERS_ISSUES.md");

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

export function loadIssueDatabase(): IssueDatabase {
  return (
    readJsonSafe<IssueDatabase>(DB_PATH) ?? {
      version: 1,
      lastUpdated: new Date().toISOString(),
      issues: [],
      stats: {
        totalFound: 0,
        totalResolved: 0,
        bySource: {},
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      },
    }
  );
}

const LOCK_PATH = DB_PATH + ".lock";
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 50;
const LOCK_MAX_RETRIES = 200;

function acquireLock(): void {
  for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
    try {
      fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx" });
      return;
    } catch {
      if (fs.existsSync(LOCK_PATH)) {
        try {
          const stat = fs.statSync(LOCK_PATH);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            fs.unlinkSync(LOCK_PATH);
            continue;
          }
        } catch {
          // stat/unlink race — retry
        }
      }
      const waitMs = LOCK_RETRY_MS + Math.random() * LOCK_RETRY_MS;
      const waitUntil = Date.now() + waitMs;
      while (Date.now() < waitUntil) {
        /* busy-wait (sync context, no async available) */
      }
    }
  }
  throw new Error("Could not acquire issue-tracker lock after max retries");
}

function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    // Already released
  }
}

/**
 * Execute a read-modify-write cycle on the issue database with file locking.
 * All mutations to issues.json MUST go through this function to prevent
 * lost-update races when multiple monsters run in parallel.
 */
function withLockedDatabase<T>(fn: (db: IssueDatabase) => T): T {
  acquireLock();
  try {
    const db = loadIssueDatabase();
    const result = fn(db);
    db.lastUpdated = new Date().toISOString();
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return result;
  } finally {
    releaseLock();
  }
}

export function saveDatabase(db: IssueDatabase): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function generateFingerprint(
  category: string,
  title: string,
  location: string,
): string {
  // Normalize location to avoid duplicate issues for different game/tournament IDs
  // e.g., /api/v1/games/abc-123/state -> /api/v1/games/*/state
  const normalizedLocation = location
    .replace(/\/[a-f0-9-]{36}\//g, "/*/") // UUID pattern
    .replace(/\/[a-f0-9-]{8,}\//g, "/*/") // Shorter hex IDs
    .replace(/\?.*$/, ""); // Remove query params

  const raw = `${category}:${title}:${normalizedLocation}`.toLowerCase();
  return raw
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

// ============================================================================
// ISSUE OPERATIONS
// ============================================================================

type AddIssueParams = {
  category: string;
  severity: Severity;
  source: string;
  title: string;
  description: string;
  location: string;
  suggestion?: string;
  competitorNote?: string;
};

function upsertIssue(db: IssueDatabase, params: AddIssueParams): Issue {
  const fingerprint = generateFingerprint(
    params.category,
    params.title,
    params.location,
  );
  const now = new Date().toISOString();

  const existing = db.issues.find((i) => i.fingerprint === fingerprint);

  if (existing) {
    existing.lastSeen = now;
    existing.occurrences++;

    const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
    if (severityRank[params.severity] < severityRank[existing.severity]) {
      existing.severity = params.severity;
    }

    if (existing.status === "resolved") {
      existing.status = "open";
      console.log(`  ⚠️  Issue reopened: ${params.title}`);
    }

    return existing;
  }

  const issue: Issue = {
    id: `ISS-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    fingerprint,
    category: params.category,
    severity: params.severity,
    source: params.source,
    title: params.title,
    description: params.description,
    location: params.location,
    suggestion: params.suggestion,
    competitorNote: params.competitorNote,
    status: "open",
    firstSeen: now,
    lastSeen: now,
    occurrences: 1,
  };

  db.issues.push(issue);
  db.stats.totalFound++;
  db.stats.bySource[params.source] =
    (db.stats.bySource[params.source] || 0) + 1;
  db.stats.bySeverity[params.severity]++;

  return issue;
}

export function addIssue(params: AddIssueParams): Issue {
  return withLockedDatabase((db) => upsertIssue(db, params));
}

export function addIssues(issues: AddIssueParams[]): Issue[] {
  return withLockedDatabase((db) => issues.map((i) => upsertIssue(db, i)));
}

export function resolveIssue(
  fingerprint: string,
  resolution: string,
  resolvedBy = "auto",
): boolean {
  return withLockedDatabase((db) => {
    const issue = db.issues.find((i) => i.fingerprint === fingerprint);
    if (!issue) return false;

    issue.status = "resolved";
    issue.resolvedAt = new Date().toISOString();
    issue.resolvedBy = resolvedBy;
    issue.resolution = resolution;
    db.stats.totalResolved++;
    return true;
  });
}

export function getOpenIssues(): Issue[] {
  const db = loadIssueDatabase();
  return db.issues.filter(
    (i) => i.status === "open" || i.status === "in_progress",
  );
}

export function getIssuesBySource(source: string): Issue[] {
  const db = loadIssueDatabase();
  return db.issues.filter((i) => i.source === source);
}

export function getIssuesBySeverity(severity: Severity): Issue[] {
  const db = loadIssueDatabase();
  return db.issues.filter(
    (i) => i.severity === severity && i.status === "open",
  );
}

export function getStats(): IssueDatabase["stats"] & { openCount: number } {
  const db = loadIssueDatabase();
  const openCount = db.issues.filter((i) => i.status === "open").length;
  return { ...db.stats, openCount };
}

export function updateQualityReport(data: QualityReportData): void {
  withLockedDatabase((db) => {
    db.qualityReport = data;
  });
}

export function getQualityReport(): QualityReportData | undefined {
  const db = loadIssueDatabase();
  return db.qualityReport;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateQualitySection(db: IssueDatabase): string {
  const qr = db.qualityReport;
  if (!qr) {
    return `## 🎯 Product Quality Report

*No quality report available. Run \`npm run monsters:quality\` to generate.*

---
`;
  }

  const gradeEmoji = qr.grade.startsWith("A")
    ? "🏆"
    : qr.grade === "B"
      ? "✅"
      : qr.grade === "C"
        ? "⚠️"
        : "❌";

  return `## 🎯 Product Quality Report

**Last Run:** ${new Date(qr.generatedAt).toLocaleString()}
**Overall Score:** ${qr.overallScore}/10 (${gradeEmoji} ${qr.grade})

### ${qr.summary}

### Category Breakdown

| Category | Score | Status |
|----------|-------|--------|
${Object.entries(qr.categories)
  .map(([cat, data]) => `| ${cat} | ${data.score}/10 | ${data.status} |`)
  .join("\n")}

${
  qr.priorities.length > 0
    ? `### 🎯 Top Priorities

${qr.priorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
    : ""
}

${
  qr.competitorInsights.length > 0
    ? `### 🏁 Competitor Insights

${qr.competitorInsights
  .slice(0, 5)
  .map((c) => `- ${c}`)
  .join("\n")}`
    : ""
}

---
`;
}

export function generateReport(): string {
  const db = loadIssueDatabase();
  const openIssues = db.issues.filter((i) => i.status === "open");

  const severityIcon = (s: Severity) =>
    s === "critical"
      ? "🔴"
      : s === "high"
        ? "🟠"
        : s === "medium"
          ? "🟡"
          : "🟢";

  let sourceTable = "";
  if (openIssues.length > 0) {
    const sourceCounts = openIssues.reduce<Record<string, number>>((acc, i) => {
      acc[i.source] = (acc[i.source] || 0) + 1;
      return acc;
    }, {});
    const sourceRows = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => `| ${source} | ${count} |`)
      .join("\n");
    sourceTable = `### By Source Monster

| Monster | Open Issues |
|---------|-------------|
${sourceRows}`;
  }

  const report = `# 🗂️ Monster Issues Report

**Last Updated:** ${new Date().toLocaleString()}
**Database Version:** ${db.version}

## Summary

| Metric | Count |
|--------|-------|
| Open Issues | ${openIssues.length} |

${
  openIssues.length > 0
    ? `### By Severity (Open Only)

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${openIssues.filter((i) => i.severity === "critical").length} |
| 🟠 High | ${openIssues.filter((i) => i.severity === "high").length} |
| 🟡 Medium | ${openIssues.filter((i) => i.severity === "medium").length} |
| 🟢 Low | ${openIssues.filter((i) => i.severity === "low").length} |

${sourceTable}`
    : "No open issues."
}

---

## 🔴 Critical Issues

${
  openIssues
    .filter((i) => i.severity === "critical")
    .map(
      (i) => `
### ${i.id}: ${i.title}

- **Category:** ${i.category}
- **Location:** ${i.location}
- **Found by:** ${i.source}
- **Occurrences:** ${i.occurrences}
- **First Seen:** ${new Date(i.firstSeen).toLocaleDateString()}

${i.description}

${i.suggestion ? `**Suggestion:** ${i.suggestion}` : ""}
${i.competitorNote ? `**Competitor Note:** ${i.competitorNote}` : ""}
`,
    )
    .join("\n") || "*No critical issues! 🎉*"
}

---

## 🟠 High Priority Issues

${
  openIssues
    .filter((i) => i.severity === "high")
    .slice(0, 10)
    .map((i) => `- **${i.id}** [${i.category}] ${i.title} — ${i.location}`)
    .join("\n") || "*No high priority issues!*"
}

---

## 🟡 Medium Priority Issues

${
  openIssues
    .filter((i) => i.severity === "medium")
    .slice(0, 10)
    .map((i) => `- **${i.id}** [${i.category}] ${i.title}`)
    .join("\n") || "*No medium priority issues!*"
}

---

## 🟢 Low Priority Issues

${
  openIssues
    .filter((i) => i.severity === "low")
    .slice(0, 10)
    .map((i) => `- ${i.title}`)
    .join("\n") || "*No low priority issues!*"
}

---

${generateQualitySection(db)}

*Generated by Monster Issue Tracker*
`;

  // Save report
  fs.writeFileSync(REPORT_PATH, report);

  return report;
}

// ============================================================================
// FINDING ADAPTER (for consumers that expect Finding-like objects)
// ============================================================================

export interface IssueFinding {
  id: string;
  fingerprint: string;
  title: string;
  description: string;
  category: string;
  severity: Severity;
  source: string;
  location: string;
  status: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  suggestion?: string;
  tags: string[];
}

export function getOpenIssuesAsFindings(): IssueFinding[] {
  const issues = getOpenIssues();
  return issues.map((issue) => ({
    id: issue.id,
    fingerprint: issue.fingerprint,
    title: issue.title,
    description: issue.description,
    category: issue.category,
    severity: issue.severity,
    source: issue.source,
    location: issue.location,
    status: issue.status,
    occurrences: issue.occurrences,
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    suggestion: issue.suggestion,
    tags: [],
  }));
}

// ============================================================================
// CONSOLE SUMMARY
// ============================================================================

export function printSummary(): void {
  const stats = getStats();
  const openIssues = getOpenIssues();

  console.log("\n" + "═".repeat(50));
  console.log("  🗂️  MONSTER ISSUE TRACKER");
  console.log("═".repeat(50));
  console.log(`\n  Open Issues: ${stats.openCount}`);
  console.log(
    `    🔴 Critical: ${openIssues.filter((i) => i.severity === "critical").length}`,
  );
  console.log(
    `    🟠 High:     ${openIssues.filter((i) => i.severity === "high").length}`,
  );
  console.log(
    `    🟡 Medium:   ${openIssues.filter((i) => i.severity === "medium").length}`,
  );
  console.log(
    `    🟢 Low:      ${openIssues.filter((i) => i.severity === "low").length}`,
  );
  console.log(`\n  Total Found: ${stats.totalFound}`);
  console.log("═".repeat(50) + "\n");
}

// ============================================================================
// ISSUE EXPIRATION & COMPACTION
// ============================================================================

const RESOLVED_EXPIRY_DAYS = 30;
const STALE_OPEN_RUNS_THRESHOLD = 5;

/**
 * Remove resolved issues older than RESOLVED_EXPIRY_DAYS and
 * auto-resolve open issues not seen in the last STALE_OPEN_RUNS_THRESHOLD runs.
 * Returns counts of expired and auto-resolved issues.
 */
export function compactDatabase(): {
  expired: number;
  autoResolved: number;
  beforeSize: number;
  afterSize: number;
} {
  return withLockedDatabase((db) => {
    const beforeSize = db.issues.length;
    const now = Date.now();
    const expiryMs = RESOLVED_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    let expired = 0;
    let autoResolved = 0;

    const runHistory = loadRunHistory();
    const lastNRuns = runHistory.slice(-STALE_OPEN_RUNS_THRESHOLD);
    const cutoffDate =
      lastNRuns.length > 0
        ? new Date(lastNRuns[0].timestamp).getTime()
        : now - 7 * 24 * 60 * 60 * 1000;

    db.issues = db.issues.filter((issue) => {
      if (issue.status === "resolved" && issue.resolvedAt) {
        const resolvedAt = new Date(issue.resolvedAt).getTime();
        if (now - resolvedAt > expiryMs) {
          expired++;
          return false;
        }
      }
      return true;
    });

    for (const issue of db.issues) {
      if (issue.status === "open") {
        const lastSeen = new Date(issue.lastSeen).getTime();
        if (lastSeen < cutoffDate) {
          issue.status = "resolved";
          issue.resolvedAt = new Date().toISOString();
          issue.resolvedBy = "auto-expiry";
          issue.resolution = `Not seen in last ${STALE_OPEN_RUNS_THRESHOLD} runs`;
          autoResolved++;
        }
      }
    }

    return {
      expired,
      autoResolved,
      beforeSize,
      afterSize: db.issues.length,
    };
  });
}

// ============================================================================
// REGRESSION & FIXED DETECTION
// ============================================================================

export function detectRegressions(currentFingerprints: Set<string>): Issue[] {
  return withLockedDatabase((db) => {
    const regressions: Issue[] = [];

    for (const issue of db.issues) {
      if (
        issue.status === "resolved" &&
        currentFingerprints.has(issue.fingerprint)
      ) {
        issue.status = "open";
        issue.resolvedAt = undefined;
        issue.resolvedBy = undefined;
        issue.resolution = undefined;
        regressions.push(issue);
      }
    }

    return regressions;
  });
}

export function detectNewlyFixed(currentFingerprints: Set<string>): Issue[] {
  const db = loadIssueDatabase();
  const fixed: Issue[] = [];

  for (const issue of db.issues) {
    if (
      issue.status === "open" &&
      !currentFingerprints.has(issue.fingerprint)
    ) {
      fixed.push(issue);
    }
  }

  return fixed;
}

// ============================================================================
// RUN HISTORY
// ============================================================================

interface RunRecord {
  runId: string;
  timestamp: string;
  duration: number;
  passed: boolean;
  findingCount: number;
  bySeverity: Record<string, number>;
}

const RUN_HISTORY_PATH = path.join(
  process.cwd(),
  "tests/qa/monsters/shared/run-history.json",
);

function loadRunHistory(): RunRecord[] {
  return readJsonSafe<RunRecord[]>(RUN_HISTORY_PATH) ?? [];
}

function saveRunHistory(runs: RunRecord[]): void {
  const dir = path.dirname(RUN_HISTORY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const trimmed = runs.slice(-100);
  fs.writeFileSync(RUN_HISTORY_PATH, JSON.stringify(trimmed, null, 2));
}

export function recordRun(record: {
  runId: string;
  duration: number;
  passed: boolean;
  findingCount: number;
  bySeverity: Record<string, number>;
}): void {
  const runs = loadRunHistory();
  runs.push({
    ...record,
    timestamp: new Date().toISOString(),
  });
  saveRunHistory(runs);
}

export function getRunHistory(count = 10): RunRecord[] {
  const runs = loadRunHistory();
  return runs.slice(-count);
}

// ============================================================================
// TREND ANALYSIS
// ============================================================================

export function calculateTrends(): TrendData {
  const db = loadIssueDatabase();
  const runs = loadRunHistory();

  const bugsByArea = new Map<string, number>();
  const bugsByType = new Map<string, number>();
  const bugsByMonster = new Map<MonsterType, number>();

  for (const issue of db.issues) {
    const area = issue.location || "unknown";
    bugsByArea.set(area, (bugsByArea.get(area) || 0) + 1);

    bugsByType.set(issue.category, (bugsByType.get(issue.category) || 0) + 1);

    const monster = (issue.source || "api") as MonsterType;
    bugsByMonster.set(monster, (bugsByMonster.get(monster) || 0) + 1);
  }

  const recentRuns = runs.slice(-10);
  const bugVelocity =
    recentRuns.length > 0
      ? recentRuns.reduce((sum, r) => sum + r.findingCount, 0) /
        recentRuns.length
      : 0;

  const totalFixed = db.issues.filter((i) => i.status === "resolved").length;
  const reopened = db.issues.filter(
    (i) => i.status === "open" && i.resolvedAt !== undefined,
  ).length;
  const regressionRate = totalFixed > 0 ? reopened / totalFixed : 0;

  const mttr = 24;

  const hotspots = identifyHotspots(db);

  return {
    bugsByArea,
    bugsByType,
    bugsByMonster,
    regressionRate,
    mttr,
    bugVelocity,
    coverageGaps: [],
    hotspots,
  };
}

function identifyHotspots(db: IssueDatabase): Hotspot[] {
  const areaStats = new Map<
    string,
    {
      total: number;
      regressions: number;
      lastDate: Date;
      recentCount: number;
    }
  >();

  for (const issue of db.issues) {
    const area = issue.location;
    if (!area) continue;

    const stats = areaStats.get(area) || {
      total: 0,
      regressions: 0,
      lastDate: new Date(0),
      recentCount: 0,
    };

    stats.total++;
    if (issue.status === "open" && issue.resolvedAt !== undefined) {
      stats.regressions++;
    }

    const lastSeen = new Date(issue.lastSeen);
    if (lastSeen > stats.lastDate) stats.lastDate = lastSeen;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (lastSeen > weekAgo) stats.recentCount++;

    areaStats.set(area, stats);
  }

  const hotspots: Hotspot[] = [];
  for (const [area, stats] of Array.from(areaStats.entries())) {
    if (stats.total >= 3) {
      const trend: "increasing" | "stable" | "decreasing" =
        stats.recentCount > stats.total / 2
          ? "increasing"
          : stats.recentCount > 0
            ? "stable"
            : "decreasing";

      let recommendation = "Continue monitoring.";
      if (stats.regressions > 0) {
        recommendation = "High regression count - add more test coverage.";
      } else if (trend === "increasing") {
        recommendation = "Issue frequency increasing - investigate root cause.";
      }

      hotspots.push({
        area,
        bugCount: stats.total,
        regressionCount: stats.regressions,
        lastIssue: stats.lastDate,
        trend,
        recommendation,
      });
    }
  }

  return hotspots.sort((a, b) => b.bugCount - a.bugCount);
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes("--report")) {
    const report = generateReport();
    console.log(report);
    console.log(`\nReport saved to: ${REPORT_PATH}`);
  } else if (args.includes("--summary")) {
    printSummary();
  } else if (args.includes("--clear")) {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify(
        {
          version: 1,
          lastUpdated: new Date().toISOString(),
          issues: [],
          stats: {
            totalFound: 0,
            totalResolved: 0,
            bySource: {},
            bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
          },
        },
        null,
        2,
      ),
    );
    console.log("Issue database cleared.");
  } else {
    printSummary();
    console.log("Commands:");
    console.log("  --report   Generate markdown report");
    console.log("  --summary  Show summary");
    console.log("  --clear    Clear all issues");
  }
}
