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
import * as path from "path";
import * as crypto from "crypto";

// ============================================================================
// TYPES
// ============================================================================

export type Severity = "critical" | "high" | "medium" | "low";
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
  if (fs.existsSync(DB_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    } catch {
      console.warn("Issue database corrupted, starting fresh");
    }
  }

  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    issues: [],
    stats: {
      totalFound: 0,
      totalResolved: 0,
      bySource: {},
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    },
  };
}

function saveDatabase(db: IssueDatabase): void {
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

export function addIssue(params: {
  category: string;
  severity: Severity;
  source: string;
  title: string;
  description: string;
  location: string;
  suggestion?: string;
  competitorNote?: string;
}): Issue {
  const db = loadIssueDatabase();
  const fingerprint = generateFingerprint(
    params.category,
    params.title,
    params.location,
  );
  const now = new Date().toISOString();

  // Check if issue already exists
  const existing = db.issues.find((i) => i.fingerprint === fingerprint);

  if (existing) {
    // Update existing issue
    existing.lastSeen = now;
    existing.occurrences++;

    // Escalate severity if needed
    const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
    if (severityRank[params.severity] < severityRank[existing.severity]) {
      existing.severity = params.severity;
    }

    // Reopen if was resolved
    if (existing.status === "resolved") {
      existing.status = "open";
      console.log(`  ⚠️  Issue reopened: ${params.title}`);
    }

    saveDatabase(db);
    return existing;
  }

  // Create new issue with unique ID (crypto random to avoid collisions)
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

  saveDatabase(db);
  return issue;
}

export function addIssues(
  issues: Array<{
    category: string;
    severity: Severity;
    source: string;
    title: string;
    description: string;
    location: string;
    suggestion?: string;
    competitorNote?: string;
  }>,
): Issue[] {
  return issues.map((i) => addIssue(i));
}

export function resolveIssue(
  fingerprint: string,
  resolution: string,
  resolvedBy = "auto",
): boolean {
  const db = loadIssueDatabase();
  const issue = db.issues.find((i) => i.fingerprint === fingerprint);

  if (!issue) return false;

  issue.status = "resolved";
  issue.resolvedAt = new Date().toISOString();
  issue.resolvedBy = resolvedBy;
  issue.resolution = resolution;
  db.stats.totalResolved++;

  saveDatabase(db);
  return true;
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
  const db = loadIssueDatabase();
  db.qualityReport = data;
  db.lastUpdated = new Date().toISOString();
  saveDatabase(db);
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
  const resolvedIssues = db.issues.filter((i) => i.status === "resolved");

  const severityIcon = (s: Severity) =>
    s === "critical"
      ? "🔴"
      : s === "high"
        ? "🟠"
        : s === "medium"
          ? "🟡"
          : "🟢";

  const report = `# 🗂️ Monster Issues Report

**Last Updated:** ${new Date().toLocaleString()}
**Database Version:** ${db.version}

## Summary

| Metric | Count |
|--------|-------|
| Total Issues Found | ${db.stats.totalFound} |
| Open Issues | ${openIssues.length} |
| Resolved Issues | ${resolvedIssues.length} |

### By Severity (Open Only)

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${openIssues.filter((i) => i.severity === "critical").length} |
| 🟠 High | ${openIssues.filter((i) => i.severity === "high").length} |
| 🟡 Medium | ${openIssues.filter((i) => i.severity === "medium").length} |
| 🟢 Low | ${openIssues.filter((i) => i.severity === "low").length} |

### By Source Monster

| Monster | Issues Found |
|---------|--------------|
${Object.entries(db.stats.bySource)
  .sort((a, b) => b[1] - a[1])
  .map(([source, count]) => `| ${source} | ${count} |`)
  .join("\n")}

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

## Recently Resolved

${
  resolvedIssues
    .sort((a, b) => (b.resolvedAt || "").localeCompare(a.resolvedAt || ""))
    .slice(0, 5)
    .map(
      (i) =>
        `- ✅ **${i.title}** — Resolved ${i.resolvedAt ? new Date(i.resolvedAt).toLocaleDateString() : ""}`,
    )
    .join("\n") || "*No resolved issues yet.*"
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
  console.log(
    `\n  Total Found: ${stats.totalFound} | Resolved: ${stats.totalResolved}`,
  );
  console.log("═".repeat(50) + "\n");
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
