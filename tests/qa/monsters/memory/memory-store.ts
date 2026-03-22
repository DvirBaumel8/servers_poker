/**
 * Monster Army - Memory Store
 *
 * Persistent storage for monster run history, findings, and trends.
 * Uses SQLite for efficient querying and historical analysis.
 *
 * Features:
 * - Store all findings with fingerprints for deduplication
 * - Track finding lifecycle (open -> fixed -> regression)
 * - Calculate trends and hotspots
 * - Detect regressions automatically
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import {
  Finding,
  RunResult,
  AggregatedRunResult,
  RunConfig,
  TrendData,
  Hotspot,
  CoverageGap,
  MonsterType,
  Severity,
} from "../shared/types";

// ============================================================================
// TYPES
// ============================================================================

interface StoredFinding extends Omit<Finding, "firstSeen" | "lastSeen"> {
  firstSeen: string;
  lastSeen: string;
}

interface StoredRun {
  runId: string;
  timestamp: string;
  duration: number;
  passed: boolean;
  exitCode: number;
  gitCommit?: string;
  gitBranch?: string;
  monstersRun: MonsterType[];
  findingsSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  findingIds: string[];
}

interface MemoryData {
  version: number;
  lastUpdated: string;
  runs: StoredRun[];
  findings: Map<string, StoredFinding>; // Keyed by fingerprint
  coverageGaps: CoverageGap[];
}

// ============================================================================
// MEMORY STORE
// ============================================================================

// Configuration for automatic cleanup
const MEMORY_CONFIG = {
  maxRuns: 50, // Keep at most 50 runs
  maxFindings: 200, // Keep at most 200 findings
  maxAgeDays: 30, // Remove findings older than 30 days (unless open)
};

export class MemoryStore {
  private dataPath: string;
  private data: MemoryData;

  constructor(dataPath?: string) {
    this.dataPath =
      dataPath || join(process.cwd(), "tests/qa/monsters/data/memory.json");
    this.data = this.load();
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  private load(): MemoryData {
    try {
      const raw = readFileSync(this.dataPath, "utf-8");
      const parsed = JSON.parse(raw);

      // Convert findings array to Map
      const findingsMap = new Map<string, StoredFinding>();
      if (Array.isArray(parsed.findings)) {
        for (const f of parsed.findings) {
          findingsMap.set(f.fingerprint, f);
        }
      }

      return {
        ...parsed,
        findings: findingsMap,
      };
    } catch {
      // File doesn't exist or is invalid, return defaults
    }

    // Default empty state
    return {
      version: 1,
      lastUpdated: new Date().toISOString(),
      runs: [],
      findings: new Map(),
      coverageGaps: [],
    };
  }

  save(): void {
    const dir = dirname(this.dataPath);
    // Use recursive:true which handles race condition safely
    mkdirSync(dir, { recursive: true });

    // Auto-cleanup before save
    this.autoCleanup();

    // Convert Map to array for JSON serialization
    const output = {
      ...this.data,
      findings: Array.from(this.data.findings.values()),
      lastUpdated: new Date().toISOString(),
    };

    writeFileSync(this.dataPath, JSON.stringify(output, null, 2));

    // Auto-generate REPORT.md for human consumption
    this.generateReport();
  }

  /**
   * Generate REPORT.md from current memory state.
   * This keeps the human-readable report in sync with programmatic data.
   */
  generateReport(): void {
    const reportPath = join(dirname(this.dataPath), "..", "REPORT.md");
    const stats = this.getStats();
    const openFindings = this.getOpenFindings();
    const recentRuns = this.getRecentRuns(5);

    // Group findings by severity
    const critical = openFindings.filter((f) => f.severity === "critical");
    const high = openFindings.filter((f) => f.severity === "high");
    const medium = openFindings.filter((f) => f.severity === "medium");
    const low = openFindings.filter((f) => f.severity === "low");

    // Get recently fixed
    const fixedFindings = this.getFixedFindings().slice(-10);

    // Try to preserve manual sections from existing report
    let manualSections = "";
    try {
      const existing = readFileSync(reportPath, "utf-8");
      const manualMarker = "<!-- MANUAL SECTIONS BELOW -->";
      const manualIndex = existing.indexOf(manualMarker);
      if (manualIndex !== -1) {
        manualSections = existing.slice(manualIndex);
      }
    } catch {
      // File doesn't exist or can't be read, use defaults
    }

    // Default manual sections if none exist
    if (!manualSections) {
      manualSections = `<!-- MANUAL SECTIONS BELOW -->
<!-- Everything below this line is preserved across auto-generation -->

## Improvement Backlog

### QA System
- [ ] AI-powered visual analysis
- [ ] User journey replay from analytics
- [ ] CI integration - Monster Army as PR gate

### Performance Testing  
- [ ] Re-run load tests after N+1 fix
- [ ] WebSocket performance testing
- [ ] Memory growth / endurance test

---

*See [README.md](./README.md) for Monster Army architecture.*
`;
    }

    const report = `# Monster Army Report

**Last Updated:** ${new Date().toISOString().split("T")[0]}  
**Source:** \`tests/qa/monsters/data/memory.json\` (auto-generated)

---

## Summary

| Metric | Value |
|--------|-------|
| Total Runs | ${stats.totalRuns} |
| Open Findings | ${stats.openFindings} |
| Fixed Findings | ${stats.fixedFindings} |
| Regressions | ${stats.regressions} |
| Pass Rate | ${(stats.passRate * 100).toFixed(1)}% |

---

## Open Bugs

${critical.length === 0 && high.length === 0 && medium.length === 0 && low.length === 0 ? "*No open bugs! 🎉*\n" : ""}
${critical.length > 0 ? `### CRITICAL (${critical.length})\n\n${critical.map((f) => this.formatFinding(f)).join("\n\n")}\n` : ""}
${high.length > 0 ? `### HIGH (${high.length})\n\n${high.map((f) => this.formatFinding(f)).join("\n\n")}\n` : ""}
${medium.length > 0 ? `### MEDIUM (${medium.length})\n\n${medium.map((f) => this.formatFinding(f)).join("\n\n")}\n` : ""}
${low.length > 0 ? `### LOW (${low.length})\n\n${low.map((f) => this.formatFinding(f)).join("\n\n")}\n` : ""}
---

## Recently Fixed

${fixedFindings.length === 0 ? "*No recently fixed issues tracked in memory.*\n" : fixedFindings.map((f) => `- ~~${f.title}~~ (\`${f.fingerprint.slice(0, 8)}\`)`).join("\n")}

---

## Recent Runs

| Run ID | Date | Duration | Findings | Status |
|--------|------|----------|----------|--------|
${recentRuns.length === 0 ? "| *No runs yet* | - | - | - | - |" : recentRuns.map((r) => `| \`${r.runId.slice(0, 8)}\` | ${r.timestamp.split("T")[0]} | ${(r.duration / 1000).toFixed(1)}s | ${r.findingsSummary.total} | ${r.passed ? "✅" : "❌"} |`).join("\n")}

---

## Quick Reference

\`\`\`bash
# Run monsters
npm run monsters:quick          # Fast validation
npm run monsters:pr             # PR validation  
npm run monsters:nightly        # Full coverage

# Setup test data
npm run test:db:setup
\`\`\`

---

${manualSections}
`;

    writeFileSync(reportPath, report);
  }

  /**
   * Format a finding for markdown output.
   */
  private formatFinding(f: Finding): string {
    const location =
      f.location.file || f.location.endpoint || f.location.page || "unknown";
    return `#### ${f.title}
- **ID:** \`${f.fingerprint.slice(0, 8)}\`
- **Location:** ${location}
- **Monster:** ${f.monster}
- **Category:** ${f.category}
- **Occurrences:** ${f.occurrences || 1}
- **First Seen:** ${f.firstSeen instanceof Date ? f.firstSeen.toISOString().split("T")[0] : String(f.firstSeen).split("T")[0]}

${f.description}`;
  }

  /**
   * Automatically clean up old data to prevent unbounded growth.
   */
  private autoCleanup(): void {
    // Limit number of runs
    if (this.data.runs.length > MEMORY_CONFIG.maxRuns) {
      this.data.runs = this.data.runs.slice(-MEMORY_CONFIG.maxRuns);
    }

    // Get fingerprints from remaining runs
    const activeFingerprints = new Set<string>();
    for (const run of this.data.runs) {
      for (const fp of run.findingIds || []) {
        activeFingerprints.add(fp);
      }
    }

    // Remove old fixed findings not in recent runs
    const cutoffDate = new Date(
      Date.now() - MEMORY_CONFIG.maxAgeDays * 24 * 60 * 60 * 1000,
    );

    for (const [fingerprint, finding] of this.data.findings.entries()) {
      // Keep open findings
      if (finding.status === "open") continue;

      // Keep findings from recent runs
      if (activeFingerprints.has(fingerprint)) continue;

      // Remove old fixed findings
      const lastSeen = new Date(finding.lastSeen);
      if (lastSeen < cutoffDate) {
        this.data.findings.delete(fingerprint);
      }
    }

    // If still over limit, remove oldest fixed findings
    if (this.data.findings.size > MEMORY_CONFIG.maxFindings) {
      const sorted = Array.from(this.data.findings.entries())
        .filter(([_, f]) => f.status !== "open")
        .sort(
          (a, b) =>
            new Date(a[1].lastSeen).getTime() -
            new Date(b[1].lastSeen).getTime(),
        );

      const toRemove = sorted.slice(
        0,
        this.data.findings.size - MEMORY_CONFIG.maxFindings,
      );
      for (const [fingerprint] of toRemove) {
        this.data.findings.delete(fingerprint);
      }
    }
  }

  // ============================================================================
  // RUN MANAGEMENT
  // ============================================================================

  /**
   * Record a completed run.
   */
  recordRun(result: AggregatedRunResult): void {
    const storedRun: StoredRun = {
      runId: result.runId,
      timestamp: result.startTime.toISOString(),
      duration: result.duration,
      passed: result.passed,
      exitCode: result.exitCode,
      gitCommit: result.config.gitCommit,
      gitBranch: result.config.gitBranch,
      monstersRun: result.config.monsters,
      findingsSummary: result.findingsSummary,
      findingIds: result.allFindings.map((f) => f.fingerprint),
    };

    this.data.runs.push(storedRun);

    // Update findings
    for (const finding of result.allFindings) {
      this.updateFinding(finding);
    }

    // Keep only last 100 runs
    if (this.data.runs.length > 100) {
      this.data.runs = this.data.runs.slice(-100);
    }

    this.save();
  }

  /**
   * Get recent runs.
   */
  getRecentRuns(count: number = 10): StoredRun[] {
    return this.data.runs.slice(-count);
  }

  /**
   * Get the most recent run.
   */
  getLastRun(): StoredRun | undefined {
    return this.data.runs[this.data.runs.length - 1];
  }

  // ============================================================================
  // FINDING MANAGEMENT
  // ============================================================================

  /**
   * Update or create a finding.
   */
  private updateFinding(finding: Finding): void {
    const existing = this.data.findings.get(finding.fingerprint);

    if (existing) {
      // Update existing finding
      const stored: StoredFinding = {
        ...finding,
        firstSeen: existing.firstSeen,
        lastSeen: new Date().toISOString(),
        occurrences: existing.occurrences + 1,
      };
      this.data.findings.set(finding.fingerprint, stored);
    } else {
      // New finding
      const stored: StoredFinding = {
        ...finding,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        occurrences: 1,
      };
      this.data.findings.set(finding.fingerprint, stored);
    }
  }

  /**
   * Mark a finding as fixed.
   */
  markFixed(fingerprint: string, commit?: string, runId?: string): void {
    const finding = this.data.findings.get(fingerprint);
    if (finding) {
      finding.status = "fixed";
      finding.fixedInCommit = commit;
      finding.fixedInRun = runId;
      this.save();
    }
  }

  /**
   * Get all open findings.
   */
  getOpenFindings(): Finding[] {
    const open: Finding[] = [];
    for (const stored of this.data.findings.values()) {
      if (stored.status === "open") {
        open.push(this.toFinding(stored));
      }
    }
    return open;
  }

  /**
   * Get all fixed findings (for regression detection).
   */
  getFixedFindings(): Finding[] {
    const fixed: Finding[] = [];
    for (const stored of this.data.findings.values()) {
      if (stored.status === "fixed") {
        fixed.push(this.toFinding(stored));
      }
    }
    return fixed;
  }

  /**
   * Convert stored finding to Finding type.
   */
  private toFinding(stored: StoredFinding): Finding {
    return {
      ...stored,
      firstSeen: new Date(stored.firstSeen),
      lastSeen: new Date(stored.lastSeen),
    };
  }

  // ============================================================================
  // REGRESSION DETECTION
  // ============================================================================

  /**
   * Detect regressions by comparing current findings to previously fixed ones.
   */
  detectRegressions(currentFindings: Finding[]): Finding[] {
    const regressions: Finding[] = [];
    const fixedFindings = this.getFixedFindings();
    const fixedFingerprints = new Set(fixedFindings.map((f) => f.fingerprint));

    for (const finding of currentFindings) {
      if (fixedFingerprints.has(finding.fingerprint)) {
        // This was previously fixed but is now appearing again
        const original = fixedFindings.find(
          (f) => f.fingerprint === finding.fingerprint,
        );

        regressions.push({
          ...finding,
          category: "REGRESSION",
          severity: "critical", // Regressions are always critical
          description: `REGRESSION: This issue was previously fixed but has returned.\n\nOriginal: ${original?.description || "N/A"}\n\nCurrent: ${finding.description}`,
          tags: [...finding.tags, "regression"],
        });

        // Mark as open again
        const stored = this.data.findings.get(finding.fingerprint);
        if (stored) {
          stored.status = "open";
        }
      }
    }

    return regressions;
  }

  /**
   * Detect newly fixed findings.
   */
  detectFixed(currentFindings: Finding[]): Finding[] {
    const currentFingerprints = new Set(
      currentFindings.map((f) => f.fingerprint),
    );
    const fixed: Finding[] = [];

    for (const stored of this.data.findings.values()) {
      if (
        stored.status === "open" &&
        !currentFingerprints.has(stored.fingerprint)
      ) {
        // Was open but not found in current run - might be fixed
        // Only count if it was found in a recent run
        const recentRuns = this.data.runs.slice(-5);
        const wasInRecentRun = recentRuns.some((r) =>
          r.findingIds.includes(stored.fingerprint),
        );

        if (wasInRecentRun) {
          fixed.push(this.toFinding(stored));
        }
      }
    }

    return fixed;
  }

  // ============================================================================
  // TREND ANALYSIS
  // ============================================================================

  /**
   * Calculate trend data from historical runs.
   */
  calculateTrends(): TrendData {
    const bugsByArea = new Map<string, number>();
    const bugsByType = new Map<string, number>();
    const bugsByMonster = new Map<MonsterType, number>();

    // Count findings by various dimensions
    for (const finding of this.data.findings.values()) {
      // By area (file/endpoint/page)
      const area =
        finding.location.file ||
        finding.location.endpoint ||
        finding.location.page ||
        "unknown";
      bugsByArea.set(area, (bugsByArea.get(area) || 0) + 1);

      // By type (category)
      bugsByType.set(
        finding.category,
        (bugsByType.get(finding.category) || 0) + 1,
      );

      // By monster
      bugsByMonster.set(
        finding.monster,
        (bugsByMonster.get(finding.monster) || 0) + 1,
      );
    }

    // Calculate regression rate
    const totalFixed = Array.from(this.data.findings.values()).filter(
      (f) => f.status === "fixed",
    ).length;
    const totalRegressions = Array.from(this.data.findings.values()).filter(
      (f) => f.category === "REGRESSION",
    ).length;
    const regressionRate = totalFixed > 0 ? totalRegressions / totalFixed : 0;

    // Calculate MTTR (simplified - based on runs between first seen and fixed)
    // For now, use a placeholder
    const mttr = 24; // hours

    // Calculate bug velocity (bugs per run, rolling average)
    const recentRuns = this.data.runs.slice(-10);
    const avgBugsPerRun =
      recentRuns.length > 0
        ? recentRuns.reduce((sum, r) => sum + r.findingsSummary.total, 0) /
          recentRuns.length
        : 0;

    // Identify hotspots
    const hotspots = this.identifyHotspots();

    return {
      bugsByArea,
      bugsByType,
      bugsByMonster,
      regressionRate,
      mttr,
      bugVelocity: avgBugsPerRun,
      coverageGaps: this.data.coverageGaps,
      hotspots,
    };
  }

  /**
   * Identify hotspots (areas with recurring issues).
   */
  private identifyHotspots(): Hotspot[] {
    const areaStats = new Map<
      string,
      {
        total: number;
        regressions: number;
        lastDate: Date;
        recentCount: number;
      }
    >();

    // Count issues by area
    for (const finding of this.data.findings.values()) {
      const area =
        finding.location.file ||
        finding.location.endpoint ||
        finding.location.page;
      if (!area) continue;

      const stats = areaStats.get(area) || {
        total: 0,
        regressions: 0,
        lastDate: new Date(0),
        recentCount: 0,
      };

      stats.total++;
      if (finding.category === "REGRESSION") stats.regressions++;

      const lastSeen = new Date(finding.lastSeen);
      if (lastSeen > stats.lastDate) stats.lastDate = lastSeen;

      // Count as recent if within last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (lastSeen > weekAgo) stats.recentCount++;

      areaStats.set(area, stats);
    }

    // Convert to hotspots
    const hotspots: Hotspot[] = [];
    for (const [area, stats] of areaStats) {
      if (stats.total >= 3) {
        // Only areas with 3+ issues
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
          recommendation =
            "Issue frequency increasing - investigate root cause.";
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

    // Sort by bug count descending
    return hotspots.sort((a, b) => b.bugCount - a.bugCount);
  }

  // ============================================================================
  // COVERAGE GAPS
  // ============================================================================

  /**
   * Add a coverage gap.
   */
  addCoverageGap(gap: CoverageGap): void {
    // Avoid duplicates
    const exists = this.data.coverageGaps.some(
      (g) => g.type === gap.type && g.location === gap.location,
    );
    if (!exists) {
      this.data.coverageGaps.push(gap);
      this.save();
    }
  }

  /**
   * Remove a coverage gap (when addressed).
   */
  removeCoverageGap(type: string, location: string): void {
    this.data.coverageGaps = this.data.coverageGaps.filter(
      (g) => !(g.type === type && g.location === location),
    );
    this.save();
  }

  /**
   * Get all coverage gaps.
   */
  getCoverageGaps(): CoverageGap[] {
    return this.data.coverageGaps;
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get summary statistics.
   */
  getStats(): {
    totalRuns: number;
    totalFindings: number;
    openFindings: number;
    fixedFindings: number;
    regressions: number;
    averageRunDuration: number;
    passRate: number;
  } {
    const runs = this.data.runs;
    const findings = Array.from(this.data.findings.values());

    return {
      totalRuns: runs.length,
      totalFindings: findings.length,
      openFindings: findings.filter((f) => f.status === "open").length,
      fixedFindings: findings.filter((f) => f.status === "fixed").length,
      regressions: findings.filter((f) => f.category === "REGRESSION").length,
      averageRunDuration:
        runs.length > 0
          ? runs.reduce((sum, r) => sum + r.duration, 0) / runs.length
          : 0,
      passRate:
        runs.length > 0 ? runs.filter((r) => r.passed).length / runs.length : 0,
    };
  }

  /**
   * Clear all data (for testing).
   */
  clear(): void {
    this.data = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      runs: [],
      findings: new Map(),
      coverageGaps: [],
    };
    this.save();
  }
}

// Singleton instance
let memoryStore: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (!memoryStore) {
    memoryStore = new MemoryStore();
  }
  return memoryStore;
}
