/**
 * Fix Workflow System
 *
 * Provides a structured approach to triaging and fixing Monster Army findings.
 *
 * Workflow:
 * 1. TRIAGE - Classify findings by priority and assignee
 * 2. PLAN - Generate fix plans for each finding
 * 3. TRACK - Monitor fix progress
 * 4. VERIFY - Confirm fixes via re-running monsters
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { Finding, Severity, MonsterType } from "../shared/types";
import { getMemoryStore } from "../memory/memory-store";

// ============================================================================
// TYPES
// ============================================================================

export interface TriagedFinding extends Finding {
  triageStatus:
    | "new"
    | "triaged"
    | "in-progress"
    | "fixed"
    | "wontfix"
    | "deferred";
  assignee?: string;
  priority: number; // 1 = highest
  estimatedEffort: "trivial" | "small" | "medium" | "large" | "unknown";
  fixPlan?: FixPlan;
  deferredUntil?: string;
  notes?: string;
}

export interface FixPlan {
  description: string;
  steps: string[];
  filesLikelyAffected: string[];
  testStrategy: string;
  riskLevel: "low" | "medium" | "high";
}

export interface TriageReport {
  generatedAt: Date;
  totalFindings: number;
  byStatus: Record<string, number>;
  byPriority: Record<number, number>;
  byEffort: Record<string, number>;
  findings: TriagedFinding[];
  nextActions: string[];
}

// ============================================================================
// FIX TEMPLATES
// ============================================================================

const FIX_TEMPLATES: Record<string, FixPlan> = {
  // Rate limiting issues
  rate_limiting: {
    description: "Add rate limiting to endpoint",
    steps: [
      "Add @Throttle decorator to controller method",
      "Configure appropriate limits (e.g., 5 requests per minute for auth)",
      "Add rate limit headers to response",
      "Test with rapid requests",
    ],
    filesLikelyAffected: [
      "src/modules/auth/auth.controller.ts",
      "src/common/guards/custom-throttler.guard.ts",
    ],
    testStrategy: "Run API Monster rate limiting tests",
    riskLevel: "low",
  },

  // Auth/401 issues
  auth_failure: {
    description: "Fix authentication handling",
    steps: [
      "Check JWT configuration in auth.module.ts",
      "Verify test credentials exist in database",
      "Check password hashing consistency",
      "Verify token generation/validation",
    ],
    filesLikelyAffected: [
      "src/modules/auth/auth.service.ts",
      "src/modules/auth/auth.controller.ts",
    ],
    testStrategy: "Run auth E2E tests and API Monster",
    riskLevel: "medium",
  },

  // Response shape issues
  response_shape: {
    description: "Update response DTO to include missing fields",
    steps: [
      "Identify the DTO class for the endpoint",
      "Add missing fields to the DTO",
      "Update service to populate the fields",
      "Update API documentation",
    ],
    filesLikelyAffected: ["src/modules/*/dto/*.dto.ts"],
    testStrategy: "Run API Monster contract tests",
    riskLevel: "low",
  },

  // Mobile overflow issues
  mobile_overflow: {
    description: "Fix responsive layout for mobile viewports",
    steps: [
      "Identify the overflowing element",
      "Add overflow-x: hidden or proper constraints",
      "Test on target viewport sizes",
      "Consider using CSS Grid or Flexbox for layout",
    ],
    filesLikelyAffected: [
      "frontend/src/index.css",
      "frontend/src/components/**/*.tsx",
    ],
    testStrategy: "Run Visual Monster on affected viewports",
    riskLevel: "low",
  },

  // WebSocket connection issues
  websocket_connection: {
    description: "Fix WebSocket connection establishment",
    steps: [
      "Check WebSocket gateway configuration",
      "Verify Redis adapter is properly configured",
      "Check CORS settings for WebSocket",
      "Verify game room exists before connecting",
    ],
    filesLikelyAffected: [
      "src/modules/games/games.gateway.ts",
      "src/common/redis/redis-io.adapter.ts",
    ],
    testStrategy: "Run API-WS Connector and E2E Monster",
    riskLevel: "medium",
  },

  // Data validation issues
  data_validation: {
    description: "Fix data validation or transformation",
    steps: [
      "Identify the data source",
      "Check entity/DTO transformations",
      "Verify database query returns correct types",
      "Add validation pipe if missing",
    ],
    filesLikelyAffected: [
      "src/modules/*/dto/*.dto.ts",
      "src/entities/*.entity.ts",
    ],
    testStrategy: "Run Tournament Flow Monster",
    riskLevel: "low",
  },
};

// ============================================================================
// TRIAGE ENGINE
// ============================================================================

export class TriageEngine {
  private triageFile: string;
  private triaged: Map<string, TriagedFinding> = new Map();

  constructor() {
    this.triageFile = join(process.cwd(), "tests/qa/monsters/data/triage.json");
    this.load();
  }

  private load(): void {
    if (existsSync(this.triageFile)) {
      try {
        const data = JSON.parse(readFileSync(this.triageFile, "utf-8"));
        for (const f of data.findings || []) {
          this.triaged.set(f.fingerprint, f);
        }
      } catch (e) {
        console.warn("Could not load triage data:", e);
      }
    }
  }

  private save(): void {
    const data = {
      lastUpdated: new Date().toISOString(),
      findings: Array.from(this.triaged.values()),
    };
    writeFileSync(this.triageFile, JSON.stringify(data, null, 2));
  }

  /**
   * Auto-triage findings based on patterns
   */
  autoTriage(findings: Finding[]): TriagedFinding[] {
    const result: TriagedFinding[] = [];

    for (const finding of findings) {
      // Check if already triaged
      const existing = this.triaged.get(finding.fingerprint);
      if (existing) {
        result.push(existing);
        continue;
      }

      // Auto-classify
      const triaged = this.classifyFinding(finding);
      this.triaged.set(finding.fingerprint, triaged);
      result.push(triaged);
    }

    this.save();
    return result;
  }

  private classifyFinding(finding: Finding): TriagedFinding {
    const priority = this.calculatePriority(finding);
    const effort = this.estimateEffort(finding);
    const fixPlan = this.suggestFixPlan(finding);

    return {
      ...finding,
      triageStatus: "new",
      priority,
      estimatedEffort: effort,
      fixPlan,
    };
  }

  private calculatePriority(finding: Finding): number {
    // Priority 1-5, lower is higher priority
    const severityMap: Record<Severity, number> = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    };

    let priority = severityMap[finding.severity];

    // Boost priority for certain categories
    if (finding.category === "SECURITY") priority = Math.max(1, priority - 1);
    if (finding.category === "REGRESSION") priority = Math.max(1, priority - 1);

    // Boost priority for money/invariant issues
    if (finding.tags?.includes("money")) priority = 1;
    if (finding.tags?.includes("invariant")) priority = 1;

    return priority;
  }

  private estimateEffort(finding: Finding): TriagedFinding["estimatedEffort"] {
    const title = finding.title.toLowerCase();
    const desc = finding.description.toLowerCase();

    // Trivial fixes
    if (title.includes("overflow") || title.includes("responsive"))
      return "trivial";
    if (title.includes("rate limit")) return "small";
    if (title.includes("response shape")) return "small";

    // Medium fixes
    if (title.includes("auth") || title.includes("login")) return "medium";
    if (title.includes("websocket")) return "medium";

    // Large fixes
    if (finding.category === "SECURITY" && finding.severity === "critical")
      return "large";
    if (desc.includes("data loss") || desc.includes("corruption"))
      return "large";

    return "unknown";
  }

  private suggestFixPlan(finding: Finding): FixPlan | undefined {
    const title = finding.title.toLowerCase();
    const desc = finding.description.toLowerCase();

    if (title.includes("rate limit")) return FIX_TEMPLATES.rate_limiting;
    if (title.includes("login") && desc.includes("401"))
      return FIX_TEMPLATES.auth_failure;
    if (title.includes("response shape") || title.includes("missing field"))
      return FIX_TEMPLATES.response_shape;
    if (title.includes("overflow")) return FIX_TEMPLATES.mobile_overflow;
    if (title.includes("websocket")) return FIX_TEMPLATES.websocket_connection;
    if (title.includes("invalid") && title.includes("leaderboard"))
      return FIX_TEMPLATES.data_validation;

    return undefined;
  }

  /**
   * Mark a finding as in-progress
   */
  startFix(fingerprint: string, assignee?: string): void {
    const finding = this.triaged.get(fingerprint);
    if (finding) {
      finding.triageStatus = "in-progress";
      finding.assignee = assignee;
      this.save();
    }
  }

  /**
   * Mark a finding as fixed (will be verified on next run)
   */
  markFixed(fingerprint: string): void {
    const finding = this.triaged.get(fingerprint);
    if (finding) {
      finding.triageStatus = "fixed";
      this.save();
    }
  }

  /**
   * Defer a finding to later
   */
  defer(fingerprint: string, until: string, reason: string): void {
    const finding = this.triaged.get(fingerprint);
    if (finding) {
      finding.triageStatus = "deferred";
      finding.deferredUntil = until;
      finding.notes = reason;
      this.save();
    }
  }

  /**
   * Generate a triage report
   */
  generateReport(): TriageReport {
    const findings = Array.from(this.triaged.values());

    const byStatus: Record<string, number> = {};
    const byPriority: Record<number, number> = {};
    const byEffort: Record<string, number> = {};

    for (const f of findings) {
      byStatus[f.triageStatus] = (byStatus[f.triageStatus] || 0) + 1;
      byPriority[f.priority] = (byPriority[f.priority] || 0) + 1;
      byEffort[f.estimatedEffort] = (byEffort[f.estimatedEffort] || 0) + 1;
    }

    // Generate next actions
    const nextActions: string[] = [];
    const p1Issues = findings.filter(
      (f) => f.priority === 1 && f.triageStatus === "new",
    );
    if (p1Issues.length > 0) {
      nextActions.push(
        `🚨 ${p1Issues.length} P1 issues need immediate attention`,
      );
    }

    const trivialIssues = findings.filter(
      (f) => f.estimatedEffort === "trivial" && f.triageStatus === "new",
    );
    if (trivialIssues.length > 0) {
      nextActions.push(
        `💨 ${trivialIssues.length} quick wins (trivial effort)`,
      );
    }

    const inProgress = findings.filter((f) => f.triageStatus === "in-progress");
    if (inProgress.length > 0) {
      nextActions.push(`🔧 ${inProgress.length} fixes in progress`);
    }

    return {
      generatedAt: new Date(),
      totalFindings: findings.length,
      byStatus,
      byPriority,
      byEffort,
      findings: findings.sort((a, b) => a.priority - b.priority),
      nextActions,
    };
  }
}

// ============================================================================
// CLI
// ============================================================================

export function printTriageReport(report: TriageReport): void {
  console.log("\n" + "═".repeat(70));
  console.log("  🔍 TRIAGE REPORT");
  console.log("═".repeat(70) + "\n");

  console.log(`  Total Findings: ${report.totalFindings}`);
  console.log("");

  console.log("  By Status:");
  for (const [status, count] of Object.entries(report.byStatus)) {
    const icon =
      status === "new"
        ? "🆕"
        : status === "in-progress"
          ? "🔧"
          : status === "fixed"
            ? "✅"
            : "📋";
    console.log(`    ${icon} ${status}: ${count}`);
  }
  console.log("");

  console.log("  By Priority:");
  for (const [priority, count] of Object.entries(report.byPriority)) {
    const icon =
      priority === "1"
        ? "🔴"
        : priority === "2"
          ? "🟠"
          : priority === "3"
            ? "🟡"
            : "🔵";
    console.log(`    ${icon} P${priority}: ${count}`);
  }
  console.log("");

  console.log("  By Effort:");
  for (const [effort, count] of Object.entries(report.byEffort)) {
    console.log(`    ${effort}: ${count}`);
  }
  console.log("");

  if (report.nextActions.length > 0) {
    console.log("  Next Actions:");
    for (const action of report.nextActions) {
      console.log(`    ${action}`);
    }
    console.log("");
  }

  // Show top 5 priority issues with fix plans
  const topIssues = report.findings
    .filter((f) => f.triageStatus === "new")
    .slice(0, 5);
  if (topIssues.length > 0) {
    console.log("  Top Priority Issues:");
    console.log("  " + "─".repeat(50));

    for (const issue of topIssues) {
      console.log(
        `\n  P${issue.priority} | ${issue.severity.toUpperCase()} | ${issue.estimatedEffort}`,
      );
      console.log(`  ${issue.title}`);

      if (issue.fixPlan) {
        console.log(`  📋 Fix Plan: ${issue.fixPlan.description}`);
        console.log(`     Steps:`);
        for (const step of issue.fixPlan.steps.slice(0, 3)) {
          console.log(`       - ${step}`);
        }
        console.log(`     Risk: ${issue.fixPlan.riskLevel}`);
      }
    }
  }

  console.log("\n" + "═".repeat(70));
}

// Entry point
if (require.main === module) {
  const memory = getMemoryStore();
  const openFindings = memory.getOpenFindings();

  const triage = new TriageEngine();
  const triaged = triage.autoTriage(openFindings);
  const report = triage.generateReport();

  printTriageReport(report);

  // Save detailed report
  const reportPath = join(
    process.cwd(),
    "tests/qa/monsters/reports/triage-report.json",
  );
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nDetailed report saved to: ${reportPath}`);
}
