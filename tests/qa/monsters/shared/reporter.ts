/**
 * Monster Army - Reporter
 *
 * Generates reports in various formats:
 * - Console output (for local runs)
 * - Markdown (for PR comments and documentation)
 * - JSON (for CI systems and storage)
 */

import {
  AggregatedRunResult,
  Finding,
  RunResult,
  Severity,
  MonsterType,
  EvolutionReport,
  sortBySeverity,
  groupByLocation,
} from "./types";

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const SEVERITY_ICONS: Record<Severity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
};

const MONSTER_ICONS: Record<MonsterType, string> = {
  api: "🔌",
  visual: "👁️",
  chaos: "🌪️",
  perf: "⚡",
  guardian: "🛡️",
  invariant: "🔒",
  contract: "📜",
  browser: "🌐",
  "css-lint": "🎨",
  "layout-lint": "📐",
  "design-critic": "🎭",
  "code-quality": "🔍",
  // Connectors
  "api-db": "🗄️",
  "api-ws": "📡",
  "ws-ui": "🖥️",
  "auth-flow": "🔐",
  // Flows
  "game-flow": "🎮",
  "tournament-flow": "🏆",
  "betting-flow": "💰",
  "player-flow": "👤",
  simulation: "🎰", // Live game simulation
  // E2E
  e2e: "🌐",
  // Browser QA
  "browser-qa": "🧪",
};

// ============================================================================
// CONSOLE REPORTER
// ============================================================================

export function printConsoleReport(result: AggregatedRunResult): void {
  const { cyan, green, red, yellow, bold, reset, dim } = COLORS;

  // Header
  console.log(`\n${cyan}${"═".repeat(70)}${reset}`);
  console.log(`${cyan}${bold}  MONSTER ARMY - RUN REPORT${reset}`);
  console.log(`${cyan}${"═".repeat(70)}${reset}\n`);

  // Run info
  console.log(`  Run ID:     ${result.runId}`);
  console.log(`  Started:    ${result.startTime.toISOString()}`);
  console.log(`  Duration:   ${(result.duration / 1000).toFixed(1)}s`);
  console.log(`  Monsters:   ${result.config.monsters.join(", ")}`);
  if (result.config.gitCommit) {
    console.log(`  Commit:     ${result.config.gitCommit.slice(0, 8)}`);
  }
  if (result.config.gitBranch) {
    console.log(`  Branch:     ${result.config.gitBranch}`);
  }

  // Summary
  console.log(`\n${bold}  SUMMARY${reset}`);
  console.log(`  ${"─".repeat(40)}`);

  const { findingsSummary } = result;
  console.log(
    `  ${SEVERITY_ICONS.critical} Critical:  ${findingsSummary.critical}`,
  );
  console.log(`  ${SEVERITY_ICONS.high} High:      ${findingsSummary.high}`);
  console.log(
    `  ${SEVERITY_ICONS.medium} Medium:    ${findingsSummary.medium}`,
  );
  console.log(`  ${SEVERITY_ICONS.low} Low:       ${findingsSummary.low}`);
  console.log(`  ${"─".repeat(40)}`);
  console.log(`  Total:      ${findingsSummary.total}`);

  // Per-monster results
  console.log(`\n${bold}  MONSTER RESULTS${reset}`);
  console.log(`  ${"─".repeat(40)}`);

  for (const [monster, monsterResult] of result.monsterResults) {
    const icon = MONSTER_ICONS[monster] || "👾";
    const status = monsterResult.passed
      ? `${green}PASSED${reset}`
      : `${red}FAILED${reset}`;
    const findings = monsterResult.findings.length;
    const duration = (monsterResult.duration / 1000).toFixed(1);

    console.log(
      `  ${icon} ${monster.padEnd(12)} ${status}  ${findings} findings  ${dim}${duration}s${reset}`,
    );
  }

  // Changes from previous run
  const knownIssues =
    result.allFindings.length -
    result.newFindings.length -
    result.regressions.length;

  console.log(`\n${bold}  ISSUE STATUS${reset}`);
  console.log(`  ${"─".repeat(40)}`);

  if (result.newFindings.length > 0) {
    console.log(
      `  ${yellow}🆕 New issues:        ${result.newFindings.length}${reset}`,
    );
  }
  if (result.regressions.length > 0) {
    console.log(
      `  ${red}🔄 Regressions:       ${result.regressions.length}${reset}`,
    );
  }
  if (knownIssues > 0) {
    console.log(`  ${dim}📋 Known (existing):  ${knownIssues}${reset}`);
  }
  if (result.fixed.length > 0) {
    console.log(
      `  ${green}✅ Fixed this run:    ${result.fixed.length}${reset}`,
    );
  }
  if (
    result.newFindings.length === 0 &&
    result.regressions.length === 0 &&
    knownIssues === 0
  ) {
    console.log(`  ${green}✨ No issues found!${reset}`);
  }

  // Build sets for quick lookup
  const newFingerprintSet = new Set(
    result.newFindings.map((f) => f.fingerprint),
  );
  const regressionFingerprintSet = new Set(
    result.regressions.map((f) => f.fingerprint),
  );
  const knownCount =
    result.allFindings.length -
    result.newFindings.length -
    result.regressions.length;

  // Detailed findings
  if (result.allFindings.length > 0) {
    console.log(`\n${bold}  FINDINGS${reset}`);
    console.log(`  ${"─".repeat(40)}`);

    // Show breakdown
    if (result.newFindings.length > 0 || result.regressions.length > 0) {
      console.log(
        `  ${dim}(${result.newFindings.length} new, ${result.regressions.length} regressions, ${knownCount} known)${reset}`,
      );
    }

    const sorted = sortBySeverity(result.allFindings);
    const grouped = groupByLocation(sorted);

    for (const [location, findings] of grouped) {
      console.log(`\n  ${cyan}${location}${reset}`);
      for (const finding of findings) {
        const icon = SEVERITY_ICONS[finding.severity];

        // Add status indicator
        let statusTag = "";
        if (newFingerprintSet.has(finding.fingerprint)) {
          statusTag = `${yellow}[NEW]${reset} `;
        } else if (regressionFingerprintSet.has(finding.fingerprint)) {
          statusTag = `${red}[REGRESSION]${reset} `;
        } else {
          statusTag = `${dim}[known]${reset} `;
        }

        console.log(
          `    ${icon} ${statusTag}[${finding.category}] ${finding.title}`,
        );
        if (finding.description.length < 80) {
          console.log(`       ${dim}${finding.description}${reset}`);
        }
      }
    }
  }

  // Final status
  console.log(`\n${cyan}${"═".repeat(70)}${reset}`);
  if (result.passed) {
    console.log(`${green}${bold}  ✅ RUN PASSED${reset}`);
  } else {
    console.log(`${red}${bold}  ❌ RUN FAILED${reset}`);
    if (findingsSummary.critical > 0) {
      console.log(
        `     ${red}${findingsSummary.critical} critical issues must be fixed${reset}`,
      );
    }
    if (findingsSummary.high > 0) {
      console.log(
        `     ${yellow}${findingsSummary.high} high priority issues found${reset}`,
      );
    }
  }
  console.log(`${cyan}${"═".repeat(70)}${reset}\n`);
}

// ============================================================================
// MARKDOWN REPORTER
// ============================================================================

export function generateMarkdownReport(result: AggregatedRunResult): string {
  const lines: string[] = [];

  // Header
  lines.push("# 🦖 Monster Army - QA Report");
  lines.push("");
  lines.push(`**Run ID:** \`${result.runId}\``);
  lines.push(`**Date:** ${result.startTime.toISOString()}`);
  lines.push(`**Duration:** ${(result.duration / 1000).toFixed(1)}s`);
  if (result.config.gitCommit) {
    lines.push(`**Commit:** \`${result.config.gitCommit.slice(0, 8)}\``);
  }
  lines.push("");

  // Status badge
  if (result.passed) {
    lines.push("## ✅ Status: PASSED");
  } else {
    lines.push("## ❌ Status: FAILED");
  }
  lines.push("");

  // Summary table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Severity | Count |");
  lines.push("|----------|-------|");
  lines.push(`| 🔴 Critical | ${result.findingsSummary.critical} |`);
  lines.push(`| 🟠 High | ${result.findingsSummary.high} |`);
  lines.push(`| 🟡 Medium | ${result.findingsSummary.medium} |`);
  lines.push(`| 🔵 Low | ${result.findingsSummary.low} |`);
  lines.push(`| **Total** | **${result.findingsSummary.total}** |`);
  lines.push("");

  // Monster results
  lines.push("## Monster Results");
  lines.push("");
  lines.push("| Monster | Status | Findings | Duration |");
  lines.push("|---------|--------|----------|----------|");

  for (const [monster, monsterResult] of result.monsterResults) {
    const icon = MONSTER_ICONS[monster] || "👾";
    const status = monsterResult.passed ? "✅ Passed" : "❌ Failed";
    const findings = monsterResult.findings.length;
    const duration = (monsterResult.duration / 1000).toFixed(1);

    lines.push(
      `| ${icon} ${monster} | ${status} | ${findings} | ${duration}s |`,
    );
  }
  lines.push("");

  // Note: We only show remaining issues, not fixed ones.
  // Fixed issues are tracked in memory but not displayed in the report.

  // Detailed findings
  if (result.allFindings.length > 0) {
    lines.push("## Detailed Findings");
    lines.push("");

    const sorted = sortBySeverity(result.allFindings);

    for (const severity of [
      "critical",
      "high",
      "medium",
      "low",
    ] as Severity[]) {
      const findings = sorted.filter((f) => f.severity === severity);
      if (findings.length === 0) continue;

      lines.push(
        `### ${SEVERITY_ICONS[severity]} ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${findings.length})`,
      );
      lines.push("");

      for (const finding of findings) {
        lines.push(`<details>`);
        lines.push(
          `<summary><strong>[${finding.category}]</strong> ${finding.title}</summary>`,
        );
        lines.push("");
        lines.push(`**Monster:** ${finding.monster}`);
        lines.push(
          `**Location:** \`${finding.location.file || finding.location.endpoint || finding.location.page || "unknown"}\``,
        );
        lines.push("");
        lines.push(finding.description);
        lines.push("");

        if (finding.reproductionSteps && finding.reproductionSteps.length > 0) {
          lines.push("**Reproduction Steps:**");
          for (const step of finding.reproductionSteps) {
            lines.push(`1. ${step}`);
          }
          lines.push("");
        }

        if (finding.evidence?.diff) {
          lines.push("**Expected vs Actual:**");
          lines.push("```diff");
          lines.push(`- ${JSON.stringify(finding.evidence.diff.expected)}`);
          lines.push(`+ ${JSON.stringify(finding.evidence.diff.actual)}`);
          lines.push("```");
          lines.push("");
        }

        lines.push(`</details>`);
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

// ============================================================================
// JSON REPORTER
// ============================================================================

export function generateJsonReport(result: AggregatedRunResult): string {
  // Convert Maps to objects for JSON serialization
  const monsterResultsObj: Record<string, RunResult> = {};
  for (const [monster, monsterResult] of result.monsterResults) {
    monsterResultsObj[monster] = monsterResult;
  }

  const output = {
    runId: result.runId,
    timestamp: result.startTime.toISOString(),
    duration: result.duration,
    passed: result.passed,
    exitCode: result.exitCode,
    config: {
      ...result.config,
      startTime: result.config.startTime.toISOString(),
    },
    summary: result.findingsSummary,
    monsterResults: monsterResultsObj,
    findings: result.allFindings.map((f) => ({
      ...f,
      firstSeen: f.firstSeen.toISOString(),
      lastSeen: f.lastSeen.toISOString(),
    })),
    changes: {
      newFindings: result.newFindings.map((f) => f.id),
      regressions: result.regressions.map((f) => f.id),
      fixed: result.fixed.map((f) => f.id),
    },
  };

  return JSON.stringify(output, null, 2);
}

// ============================================================================
// EVOLUTION REPORT
// ============================================================================

export function printEvolutionReport(report: EvolutionReport): void {
  const { cyan, green, red, yellow, blue, magenta, bold, reset, dim } = COLORS;

  console.log(`\n${magenta}${"═".repeat(70)}${reset}`);
  console.log(`${magenta}${bold}  EVOLUTION AGENT ANALYSIS${reset}`);
  console.log(`${magenta}${"═".repeat(70)}${reset}\n`);

  // Health status
  const healthIcon =
    report.overallHealth === "healthy"
      ? `${green}✅${reset}`
      : report.overallHealth === "concerning"
        ? `${yellow}⚠️${reset}`
        : `${red}🚨${reset}`;

  console.log(
    `  Overall Health: ${healthIcon} ${report.overallHealth.toUpperCase()}`,
  );
  console.log("");

  // Summary
  console.log(`  ${dim}${report.summary}${reset}`);
  console.log("");

  // Alerts
  if (report.alerts.length > 0) {
    console.log(`${bold}  ALERTS${reset}`);
    console.log(`  ${"─".repeat(40)}`);

    for (const alert of report.alerts) {
      const icon =
        alert.level === "critical"
          ? `${red}🚨${reset}`
          : alert.level === "warning"
            ? `${yellow}⚠️${reset}`
            : `${blue}ℹ️${reset}`;

      console.log(`  ${icon} ${alert.message}`);
      console.log(`     ${dim}Action: ${alert.action}${reset}`);
    }
    console.log("");
  }

  // Suggested improvements
  if (report.suggestedConfigChanges.length > 0) {
    console.log(`${bold}  SUGGESTED IMPROVEMENTS${reset}`);
    console.log(`  ${"─".repeat(40)}`);

    for (const change of report.suggestedConfigChanges) {
      const icon = MONSTER_ICONS[change.monster] || "👾";
      console.log(
        `  ${icon} [${change.monster}] ${change.changeType}: ${change.details}`,
      );
      console.log(`     ${dim}Reason: ${change.reason}${reset}`);
    }
    console.log("");
  }

  // New test cases
  if (report.newTestCases.length > 0) {
    console.log(`${bold}  NEW TEST CASES${reset}`);
    console.log(`  ${"─".repeat(40)}`);

    for (const testCase of report.newTestCases) {
      const icon = MONSTER_ICONS[testCase.targetMonster] || "👾";
      console.log(`  ${icon} ${testCase.description}`);
      if (testCase.derivedFrom) {
        console.log(`     ${dim}Derived from: ${testCase.derivedFrom}${reset}`);
      }
    }
    console.log("");
  }

  // Human review
  if (report.humanReviewRequired.length > 0) {
    console.log(`${bold}  HUMAN REVIEW REQUIRED${reset}`);
    console.log(`  ${"─".repeat(40)}`);

    for (const item of report.humanReviewRequired) {
      console.log(`  ❓ ${item.question}`);
      console.log(`     ${dim}Finding: ${item.finding.title}${reset}`);
      console.log(`     ${dim}Reason: ${item.reason}${reset}`);
    }
    console.log("");
  }

  console.log(`${magenta}${"═".repeat(70)}${reset}\n`);
}

const { magenta } = COLORS;

export function generateEvolutionMarkdown(report: EvolutionReport): string {
  const lines: string[] = [];

  lines.push("# 🧬 Evolution Agent Analysis");
  lines.push("");
  lines.push(`**Generated:** ${report.generatedAt.toISOString()}`);
  lines.push(`**Run:** \`${report.runId}\``);
  lines.push("");

  // Health
  const healthIcon =
    report.overallHealth === "healthy"
      ? "✅"
      : report.overallHealth === "concerning"
        ? "⚠️"
        : "🚨";
  lines.push(
    `## ${healthIcon} Overall Health: ${report.overallHealth.toUpperCase()}`,
  );
  lines.push("");
  lines.push(report.summary);
  lines.push("");

  // Alerts
  if (report.alerts.length > 0) {
    lines.push("## Alerts");
    lines.push("");
    for (const alert of report.alerts) {
      const icon =
        alert.level === "critical"
          ? "🚨"
          : alert.level === "warning"
            ? "⚠️"
            : "ℹ️";
      lines.push(`### ${icon} ${alert.message}`);
      lines.push("");
      lines.push(`**Action:** ${alert.action}`);
      lines.push("");
    }
  }

  // Improvements
  if (report.suggestedConfigChanges.length > 0) {
    lines.push("## Suggested Improvements");
    lines.push("");
    lines.push("| Monster | Change | Details | Priority |");
    lines.push("|---------|--------|---------|----------|");
    for (const change of report.suggestedConfigChanges) {
      lines.push(
        `| ${change.monster} | ${change.changeType} | ${change.details} | ${change.priority} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
