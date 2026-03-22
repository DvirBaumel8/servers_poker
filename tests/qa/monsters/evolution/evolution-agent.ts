/**
 * Evolution Agent
 *
 * The self-improving brain of the Monster Army.
 * After each run, this agent:
 * - Analyzes findings for patterns
 * - Detects regressions
 * - Identifies coverage gaps
 * - Suggests new test cases
 * - Generates improvement recommendations
 * - Updates the memory store
 *
 * This is the key to the zero-bug approach - continuously learning
 * and improving the test suite based on what we find.
 */

import {
  AggregatedRunResult,
  Finding,
  EvolutionReport,
  Alert,
  ConfigChange,
  NewTestCase,
  HumanReviewItem,
  TrendData,
  CoverageGap,
  MonsterType,
  Severity,
} from "../shared/types";
import { MemoryStore, getMemoryStore } from "../memory/memory-store";
import { AutoImproveEngine, ImprovementReport } from "./auto-improve";

export interface EvolutionAgentConfig {
  autoImproveEnabled: boolean;
  autoImproveCommit: boolean;
  dryRun: boolean;
}

export class EvolutionAgent {
  private memory: MemoryStore;
  private autoImprover: AutoImproveEngine;
  private config: EvolutionAgentConfig;

  constructor(memory?: MemoryStore, config?: Partial<EvolutionAgentConfig>) {
    this.memory = memory || getMemoryStore();
    this.config = {
      autoImproveEnabled: false, // Disabled by default for safety
      autoImproveCommit: false,
      dryRun: true,
      ...config,
    };
    this.autoImprover = new AutoImproveEngine({
      enabled: this.config.autoImproveEnabled,
      autoCommit: this.config.autoImproveCommit,
      dryRun: this.config.dryRun,
    });
  }

  /**
   * Analyze a run and generate an evolution report.
   */
  async analyze(result: AggregatedRunResult): Promise<EvolutionReport> {
    console.log("[Evolution] Analyzing run results...");

    // Step 1: Detect regressions
    const regressions = this.memory.detectRegressions(result.allFindings);
    if (regressions.length > 0) {
      console.log(`[Evolution] ⚠️  Detected ${regressions.length} regressions`);
      // Mark regressions in the result
      result.regressions = regressions;
    }

    // Step 2: Detect newly fixed issues
    const fixed = this.memory.detectFixed(result.allFindings);
    if (fixed.length > 0) {
      console.log(`[Evolution] ✅ Detected ${fixed.length} fixed issues`);
      result.fixed = fixed;

      // Mark as fixed in memory
      for (const f of fixed) {
        this.memory.markFixed(
          f.fingerprint,
          result.config.gitCommit,
          result.runId,
        );
      }
    }

    // Step 3: Identify new findings (not seen before)
    const existingFingerprints = new Set(
      this.memory.getOpenFindings().map((f) => f.fingerprint),
    );
    result.newFindings = result.allFindings.filter(
      (f) => !existingFingerprints.has(f.fingerprint),
    );
    if (result.newFindings.length > 0) {
      console.log(
        `[Evolution] 🆕 Found ${result.newFindings.length} new issues`,
      );
    }

    // Step 4: Calculate trends
    const trends = this.memory.calculateTrends();

    // Step 5: Generate alerts
    const alerts = this.generateAlerts(result, regressions, trends);

    // Step 6: Suggest config changes
    const suggestedConfigChanges = this.suggestConfigChanges(result, trends);

    // Step 7: Suggest new test cases
    const newTestCases = this.suggestNewTestCases(result, trends);

    // Step 8: Identify items needing human review
    const humanReviewRequired = this.identifyHumanReviewItems(result);

    // Step 9: Determine overall health
    const overallHealth = this.assessHealth(result, regressions);

    // Step 10: Generate summary
    const summary = this.generateSummary(result, regressions, fixed);

    // Step 11: Record run in memory
    this.memory.recordRun(result);

    const evolutionReport: EvolutionReport = {
      runId: result.runId,
      generatedAt: new Date(),
      summary,
      overallHealth,
      alerts,
      suggestedConfigChanges,
      newTestCases,
      humanReviewRequired,
      trendAnalysis: trends,
    };

    // Step 12: Auto-improve if enabled
    if (this.config.autoImproveEnabled) {
      console.log(
        "[Evolution] Auto-improve is enabled, processing improvements...",
      );
      const improvementReport =
        await this.autoImprover.processReport(evolutionReport);
      console.log(
        `[Evolution] Applied ${improvementReport.actionsApplied}/${improvementReport.actionsPlanned} improvements`,
      );
    }

    return evolutionReport;
  }

  /**
   * Enable auto-improvement mode.
   * CAUTION: This will modify code files!
   */
  enableAutoImprove(
    options: { commit?: boolean; dryRun?: boolean } = {},
  ): void {
    this.config.autoImproveEnabled = true;
    this.config.autoImproveCommit = options.commit || false;
    this.config.dryRun = options.dryRun ?? true;

    this.autoImprover = new AutoImproveEngine({
      enabled: true,
      autoCommit: this.config.autoImproveCommit,
      dryRun: this.config.dryRun,
    });

    console.log(
      `[Evolution] Auto-improve enabled. Commit: ${this.config.autoImproveCommit}, DryRun: ${this.config.dryRun}`,
    );
  }

  /**
   * Generate improvement actions from findings without applying them.
   * Useful for previewing what would change.
   */
  async previewImprovements(
    result: AggregatedRunResult,
  ): Promise<ImprovementReport> {
    const report = await this.analyze(result);

    // Create a dry-run improver
    const previewImprover = new AutoImproveEngine({
      enabled: true,
      autoCommit: false,
      dryRun: true,
    });

    return previewImprover.processReport(report);
  }

  // ============================================================================
  // ALERT GENERATION
  // ============================================================================

  private generateAlerts(
    result: AggregatedRunResult,
    regressions: Finding[],
    trends: TrendData,
  ): Alert[] {
    const alerts: Alert[] = [];

    // Critical: Any regressions
    if (regressions.length > 0) {
      alerts.push({
        level: "critical",
        message: `${regressions.length} regression(s) detected - previously fixed bugs have returned`,
        action:
          "Investigate immediately. Check recent commits that may have reintroduced these issues.",
        relatedFindings: regressions.map((r) => r.id),
      });
    }

    // Critical: Any critical severity findings
    if (result.findingsSummary.critical > 0) {
      alerts.push({
        level: "critical",
        message: `${result.findingsSummary.critical} critical issue(s) found`,
        action: "Block deployment. These issues must be fixed before release.",
        relatedFindings: result.allFindings
          .filter((f) => f.severity === "critical")
          .map((f) => f.id),
      });
    }

    // Warning: High regression rate trend
    if (trends.regressionRate > 0.2) {
      alerts.push({
        level: "warning",
        message: `High regression rate: ${(trends.regressionRate * 100).toFixed(1)}% of fixed bugs return`,
        action:
          "Review test coverage and fix quality. Consider adding integration tests.",
      });
    }

    // Warning: Increasing bug velocity
    const stats = this.memory.getStats();
    if (
      trends.bugVelocity >
      (stats.totalFindings / Math.max(stats.totalRuns, 1)) * 1.5
    ) {
      alerts.push({
        level: "warning",
        message:
          "Bug velocity is increasing - finding more bugs per run than average",
        action:
          "This could indicate degrading code quality or improved detection. Investigate.",
      });
    }

    // Warning: Hotspots
    const criticalHotspots = trends.hotspots.filter(
      (h) => h.bugCount >= 5 || h.regressionCount >= 2,
    );
    if (criticalHotspots.length > 0) {
      alerts.push({
        level: "warning",
        message: `${criticalHotspots.length} high-risk area(s) identified with recurring issues`,
        action: `Focus testing on: ${criticalHotspots.map((h) => h.area).join(", ")}`,
      });
    }

    // Info: Coverage gaps
    if (trends.coverageGaps.length > 0) {
      const highPriority = trends.coverageGaps.filter(
        (g) => g.priority === "high",
      );
      if (highPriority.length > 0) {
        alerts.push({
          level: "info",
          message: `${highPriority.length} high-priority coverage gap(s) identified`,
          action: "Consider adding tests for these areas.",
        });
      }
    }

    // Info: Monster failures
    for (const [monster, monsterResult] of result.monsterResults) {
      if (monsterResult.error) {
        alerts.push({
          level: "warning",
          message: `${monster} Monster failed: ${monsterResult.error}`,
          action: "Check monster configuration and dependencies.",
        });
      }
    }

    return alerts;
  }

  // ============================================================================
  // CONFIG CHANGE SUGGESTIONS
  // ============================================================================

  private suggestConfigChanges(
    result: AggregatedRunResult,
    trends: TrendData,
  ): ConfigChange[] {
    const changes: ConfigChange[] = [];

    // Suggest adding tests for hotspots
    for (const hotspot of trends.hotspots) {
      if (hotspot.trend === "increasing" && hotspot.regressionCount > 0) {
        changes.push({
          monster: "api",
          changeType: "add_test",
          details: `Add more test coverage for ${hotspot.area}`,
          reason: `${hotspot.bugCount} bugs found, ${hotspot.regressionCount} regressions`,
          priority: "high",
        });
      }
    }

    // Suggest adding invariants based on findings
    const moneyBugs = result.allFindings.filter(
      (f) =>
        f.tags.includes("money") ||
        f.description.toLowerCase().includes("chip"),
    );
    if (moneyBugs.length > 0) {
      changes.push({
        monster: "invariant",
        changeType: "add_invariant",
        details: "Review and strengthen money-related invariants",
        reason: `${moneyBugs.length} money-related issues found`,
        priority: "high",
      });
    }

    // Suggest edge cases based on findings
    const overflowBugs = result.allFindings.filter((f) =>
      f.tags.includes("overflow"),
    );
    if (overflowBugs.length > 0) {
      changes.push({
        monster: "visual",
        changeType: "add_edge_case",
        details: "Add overflow testing for affected viewports",
        reason: `${overflowBugs.length} overflow issues found`,
        priority: "medium",
      });
    }

    // Suggest removing flaky tests
    // Would need to track flakiness over time
    // For now, identify tests that pass sometimes and fail sometimes

    return changes;
  }

  // ============================================================================
  // NEW TEST CASE SUGGESTIONS
  // ============================================================================

  private suggestNewTestCases(
    result: AggregatedRunResult,
    trends: TrendData,
  ): NewTestCase[] {
    const testCases: NewTestCase[] = [];

    // Suggest tests based on findings
    for (const finding of result.allFindings.slice(0, 5)) {
      // Limit suggestions
      if (finding.category === "BUG" && finding.severity === "critical") {
        testCases.push({
          description: `Add regression test for: ${finding.title}`,
          targetMonster: finding.monster,
          implementation: this.generateTestSkeleton(finding),
          derivedFrom: finding.id,
        });
      }
    }

    // Suggest tests for coverage gaps
    for (const gap of trends.coverageGaps.slice(0, 3)) {
      const monster = this.mapGapToMonster(gap.type);
      testCases.push({
        description: `Add coverage for: ${gap.location}`,
        targetMonster: monster,
        implementation: `// TODO: Add test for ${gap.location}\n// ${gap.suggestion}`,
      });
    }

    return testCases;
  }

  private generateTestSkeleton(finding: Finding): string {
    const lines = [
      `// Regression test for: ${finding.title}`,
      `// Derived from finding: ${finding.id}`,
      `// Severity: ${finding.severity}`,
      ``,
    ];

    if (finding.location.endpoint) {
      lines.push(`test('${finding.title}', async () => {`);
      lines.push(
        `  const response = await fetch('${finding.location.endpoint}');`,
      );
      lines.push(`  // Add assertions based on expected behavior`);
      lines.push(`  expect(response.ok).toBe(true);`);
      lines.push(`});`);
    } else if (finding.location.page) {
      lines.push(`test('${finding.title}', async ({ page }) => {`);
      lines.push(`  await page.goto('${finding.location.page}');`);
      lines.push(`  // Add assertions based on expected behavior`);
      lines.push(`});`);
    } else {
      lines.push(`test('${finding.title}', async () => {`);
      lines.push(`  // TODO: Implement test`);
      lines.push(`});`);
    }

    return lines.join("\n");
  }

  private mapGapToMonster(gapType: string): MonsterType {
    switch (gapType) {
      case "untested_endpoint":
        return "api";
      case "untested_page":
      case "untested_component":
        return "visual";
      case "untested_flow":
        return "visual";
      default:
        return "api";
    }
  }

  // ============================================================================
  // HUMAN REVIEW IDENTIFICATION
  // ============================================================================

  private identifyHumanReviewItems(
    result: AggregatedRunResult,
  ): HumanReviewItem[] {
    const items: HumanReviewItem[] = [];

    for (const finding of result.allFindings) {
      // Flag findings that need human judgment
      if (finding.category === "CONCERN") {
        items.push({
          finding,
          reason: "This is a potential issue that needs human verification",
          question: "Is this a real problem or expected behavior?",
        });
      }

      // Flag potential false positives
      if (finding.occurrences === 1 && finding.severity === "low") {
        items.push({
          finding,
          reason: "First occurrence of this issue with low severity",
          question: "Is this a real issue or a one-time anomaly?",
        });
      }

      // Flag complex multi-location issues
      if (finding.tags.includes("cross-component")) {
        items.push({
          finding,
          reason: "Issue spans multiple components",
          question:
            "What is the root cause and which component should be fixed?",
        });
      }
    }

    return items.slice(0, 10); // Limit to top 10
  }

  // ============================================================================
  // HEALTH ASSESSMENT
  // ============================================================================

  private assessHealth(
    result: AggregatedRunResult,
    regressions: Finding[],
  ): "healthy" | "concerning" | "critical" {
    // Critical if any critical findings or regressions
    if (result.findingsSummary.critical > 0 || regressions.length > 0) {
      return "critical";
    }

    // Concerning if many high severity issues
    if (result.findingsSummary.high > 5) {
      return "concerning";
    }

    // Concerning if any monster failed
    for (const [_, monsterResult] of result.monsterResults) {
      if (monsterResult.error) {
        return "concerning";
      }
    }

    // Concerning if trend is bad
    const stats = this.memory.getStats();
    if (stats.passRate < 0.7) {
      return "concerning";
    }

    return "healthy";
  }

  // ============================================================================
  // SUMMARY GENERATION
  // ============================================================================

  private generateSummary(
    result: AggregatedRunResult,
    regressions: Finding[],
    fixed: Finding[],
  ): string {
    const lines: string[] = [];

    // Overall status
    if (result.passed) {
      lines.push("✅ Run passed with no critical or high severity issues.");
    } else {
      lines.push("❌ Run failed due to critical or high severity issues.");
    }

    // Key metrics
    lines.push(
      `Found ${result.findingsSummary.total} issues: ` +
        `${result.findingsSummary.critical} critical, ` +
        `${result.findingsSummary.high} high, ` +
        `${result.findingsSummary.medium} medium, ` +
        `${result.findingsSummary.low} low.`,
    );

    // Regressions
    if (regressions.length > 0) {
      lines.push(
        `⚠️ ${regressions.length} regression(s) detected - previously fixed bugs have returned.`,
      );
    }

    // Fixed
    if (fixed.length > 0) {
      lines.push(
        `🎉 ${fixed.length} issue(s) appear to be fixed since last run.`,
      );
    }

    // New findings
    if (result.newFindings.length > 0) {
      lines.push(`🆕 ${result.newFindings.length} new issue(s) discovered.`);
    }

    // Monster status
    const failedMonsters: string[] = [];
    for (const [monster, monsterResult] of result.monsterResults) {
      if (!monsterResult.passed || monsterResult.error) {
        failedMonsters.push(monster);
      }
    }
    if (failedMonsters.length > 0) {
      lines.push(`⚠️ Failed monsters: ${failedMonsters.join(", ")}`);
    }

    return lines.join(" ");
  }
}
