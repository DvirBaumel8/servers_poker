/**
 * Accessibility Checker
 *
 * Tracks accessibility scores and violations over time.
 * Designed to integrate with axe-core when running in browser context.
 *
 * For non-browser environments, provides static HTML analysis.
 */

import {
  writeFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "fs";
import { join } from "path";

export type ViolationImpact = "critical" | "serious" | "moderate" | "minor";

export interface AccessibilityViolation {
  id: string;
  impact: ViolationImpact;
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    html: string;
    target: string[];
    failureSummary: string;
  }>;
}

export interface AccessibilityResult {
  page: string;
  viewport: string;
  timestamp: string;
  score: number; // 0-100
  violations: AccessibilityViolation[];
  passes: number;
  incomplete: number;
  inapplicable: number;
}

export interface AccessibilityReport {
  runId: string;
  timestamp: string;
  pages: AccessibilityResult[];
  summary: {
    totalPages: number;
    averageScore: number;
    totalViolations: number;
    violationsByImpact: Record<ViolationImpact, number>;
    worstPage: string;
    worstScore: number;
  };
  trend?: {
    previousRunId: string;
    scoreDelta: number;
    newViolations: number;
    fixedViolations: number;
  };
}

// Common accessibility rules to check (subset of axe-core rules)
const A11Y_RULES = {
  "button-name": {
    description: "Buttons must have discernible text",
    impact: "critical" as ViolationImpact,
    selector: "button:not([aria-label]):not([aria-labelledby])",
    check: (html: string) => !html.match(/>[\s\S]*\S[\s\S]*</), // Has text content
  },
  "image-alt": {
    description: "Images must have alternate text",
    impact: "critical" as ViolationImpact,
    selector: "img:not([alt])",
    check: () => true, // If selector matches, it's a violation
  },
  label: {
    description: "Form elements must have labels",
    impact: "serious" as ViolationImpact,
    selector:
      "input:not([type='hidden']):not([aria-label]):not([aria-labelledby])",
    check: (html: string) => !html.includes("id="), // No associated label
  },
  "link-name": {
    description: "Links must have discernible text",
    impact: "serious" as ViolationImpact,
    selector: "a:not([aria-label])",
    check: (html: string) => !html.match(/>[\s\S]*\S[\s\S]*</),
  },
  "color-contrast": {
    description: "Elements must have sufficient color contrast",
    impact: "serious" as ViolationImpact,
    selector: "*", // Would need computed styles
    check: () => false, // Can't check without browser
  },
  "heading-order": {
    description: "Heading levels should only increase by one",
    impact: "moderate" as ViolationImpact,
    selector: "h1, h2, h3, h4, h5, h6",
    check: () => false, // Needs context
  },
  "landmark-one-main": {
    description: "Page should contain one main landmark",
    impact: "moderate" as ViolationImpact,
    selector: "main, [role='main']",
    check: () => false, // Needs to count
  },
  "focus-visible": {
    description: "Interactive elements should have visible focus styles",
    impact: "serious" as ViolationImpact,
    selector: "a, button, input, select, textarea",
    check: () => false, // Can't check without browser
  },
};

export class AccessibilityChecker {
  private reportsDir: string;
  private results: AccessibilityResult[] = [];

  constructor(reportsDir: string = "tests/qa/monsters/reports/accessibility") {
    this.reportsDir = join(process.cwd(), reportsDir);

    if (!existsSync(this.reportsDir)) {
      mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Analyze HTML content for accessibility issues
   * This is a simplified checker - real implementation would use axe-core
   */
  analyzeHtml(
    html: string,
    page: string,
    viewport: string,
  ): AccessibilityResult {
    const violations: AccessibilityViolation[] = [];
    let passes = 0;

    // Check for missing lang attribute
    if (!html.match(/<html[^>]*lang=/i)) {
      violations.push({
        id: "html-has-lang",
        impact: "serious",
        description: "HTML element must have a lang attribute",
        help: "Add a lang attribute to the html element",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.0/html-has-lang",
        nodes: [
          {
            html: "<html>",
            target: ["html"],
            failureSummary: "Missing lang attribute",
          },
        ],
      });
    } else {
      passes++;
    }

    // Check for viewport meta
    if (!html.includes("viewport")) {
      violations.push({
        id: "meta-viewport",
        impact: "moderate",
        description: "Zoom and scaling must not be disabled",
        help: "Ensure viewport meta allows zoom",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.0/meta-viewport",
        nodes: [
          {
            html: "<head>",
            target: ["head"],
            failureSummary: "Missing viewport meta",
          },
        ],
      });
    } else {
      passes++;
    }

    // Check for skip link
    if (!html.match(/skip|main-content/i)) {
      violations.push({
        id: "skip-link",
        impact: "moderate",
        description: "Page should have means to bypass repeated blocks",
        help: "Add skip to main content link",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.0/bypass",
        nodes: [
          {
            html: "<body>",
            target: ["body"],
            failureSummary: "No skip link found",
          },
        ],
      });
    } else {
      passes++;
    }

    // Check for main landmark
    if (!html.match(/<main|role=['"]main['"]/i)) {
      violations.push({
        id: "landmark-one-main",
        impact: "moderate",
        description: "Page should contain one main landmark",
        help: "Add a main element or role='main'",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.0/landmark-one-main",
        nodes: [
          {
            html: "<body>",
            target: ["body"],
            failureSummary: "No main landmark",
          },
        ],
      });
    } else {
      passes++;
    }

    // Check for empty buttons (simplified)
    const emptyButtons = html.match(/<button[^>]*><\/button>/gi) || [];
    if (emptyButtons.length > 0) {
      violations.push({
        id: "button-name",
        impact: "critical",
        description: "Buttons must have discernible text",
        help: "Add text content or aria-label to buttons",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.0/button-name",
        nodes: emptyButtons.map((b) => ({
          html: b,
          target: ["button"],
          failureSummary: "Button has no text content",
        })),
      });
    } else {
      passes++;
    }

    // Check for images without alt
    const imagesWithoutAlt = html.match(/<img(?![^>]*alt=)[^>]*>/gi) || [];
    if (imagesWithoutAlt.length > 0) {
      violations.push({
        id: "image-alt",
        impact: "critical",
        description: "Images must have alternate text",
        help: "Add alt attribute to images",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.0/image-alt",
        nodes: imagesWithoutAlt.map((img) => ({
          html: img.substring(0, 100),
          target: ["img"],
          failureSummary: "Image has no alt attribute",
        })),
      });
    } else {
      passes++;
    }

    // Calculate score
    const total = passes + violations.length;
    const score = total > 0 ? Math.round((passes / total) * 100) : 100;

    const result: AccessibilityResult = {
      page,
      viewport,
      timestamp: new Date().toISOString(),
      score,
      violations,
      passes,
      incomplete: 0,
      inapplicable: 0,
    };

    this.results.push(result);
    return result;
  }

  /**
   * Analyze a page by URL
   */
  async analyzePage(
    url: string,
    viewport: string,
  ): Promise<AccessibilityResult> {
    const page = new URL(url).pathname;

    try {
      const response = await fetch(url);
      const html = await response.text();
      return this.analyzeHtml(html, page, viewport);
    } catch (error: any) {
      return {
        page,
        viewport,
        timestamp: new Date().toISOString(),
        score: 0,
        violations: [
          {
            id: "page-load-error",
            impact: "critical",
            description: `Failed to load page: ${error.message}`,
            help: "Ensure the page is accessible",
            helpUrl: "",
            nodes: [],
          },
        ],
        passes: 0,
        incomplete: 0,
        inapplicable: 0,
      };
    }
  }

  /**
   * Generate accessibility report
   */
  generateReport(runId: string): AccessibilityReport {
    const violationsByImpact: Record<ViolationImpact, number> = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };

    let totalViolations = 0;
    for (const result of this.results) {
      for (const violation of result.violations) {
        violationsByImpact[violation.impact]++;
        totalViolations++;
      }
    }

    const avgScore =
      this.results.length > 0
        ? Math.round(
            this.results.reduce((sum, r) => sum + r.score, 0) /
              this.results.length,
          )
        : 0;

    const worst = this.results.reduce(
      (min, r) => (r.score < min.score ? r : min),
      this.results[0] || { page: "N/A", score: 100 },
    );

    const report: AccessibilityReport = {
      runId,
      timestamp: new Date().toISOString(),
      pages: this.results,
      summary: {
        totalPages: this.results.length,
        averageScore: avgScore,
        totalViolations,
        violationsByImpact,
        worstPage: worst.page,
        worstScore: worst.score,
      },
    };

    // Add trend comparison if previous run exists
    const previousReport = this.findPreviousReport();
    if (previousReport) {
      const prevViolationIds = new Set(
        previousReport.pages.flatMap((p) =>
          p.violations.map((v) => `${p.page}:${v.id}`),
        ),
      );
      const currViolationIds = new Set(
        this.results.flatMap((p) =>
          p.violations.map((v) => `${p.page}:${v.id}`),
        ),
      );

      const newViolations = [...currViolationIds].filter(
        (v) => !prevViolationIds.has(v),
      ).length;
      const fixedViolations = [...prevViolationIds].filter(
        (v) => !currViolationIds.has(v),
      ).length;

      report.trend = {
        previousRunId: previousReport.runId,
        scoreDelta: avgScore - previousReport.summary.averageScore,
        newViolations,
        fixedViolations,
      };
    }

    // Save report
    const reportPath = join(this.reportsDir, `a11y-${runId}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  private findPreviousReport(): AccessibilityReport | null {
    try {
      const files = readdirSync(this.reportsDir)
        .filter((f) => f.startsWith("a11y-") && f.endsWith(".json"))
        .sort()
        .reverse();

      if (files.length > 0) {
        const content = readFileSync(join(this.reportsDir, files[0]), "utf-8");
        return JSON.parse(content);
      }
    } catch {
      // No previous report
    }
    return null;
  }

  /**
   * Clear recorded results
   */
  clear(): void {
    this.results = [];
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const baseUrl = args[0] || "http://localhost:3001";

  const pages = [
    "/",
    "/login",
    "/register",
    "/tournaments",
    "/leaderboard",
    "/bots/build",
  ];

  const checker = new AccessibilityChecker();

  console.log("Accessibility Checker");
  console.log("=".repeat(60));
  console.log(`Testing ${pages.length} pages at ${baseUrl}`);
  console.log();

  Promise.all(
    pages.map((page) => checker.analyzePage(`${baseUrl}${page}`, "Desktop")),
  )
    .then(() => {
      const runId = `a11y-${Date.now()}`;
      const report = checker.generateReport(runId);

      console.log("Results:");
      console.log("-".repeat(60));

      for (const result of report.pages) {
        const scoreColor =
          result.score >= 90
            ? "\x1b[32m"
            : result.score >= 70
              ? "\x1b[33m"
              : "\x1b[31m";
        console.log(`${scoreColor}${result.score}%\x1b[0m ${result.page}`);

        for (const v of result.violations) {
          const impactColor =
            v.impact === "critical"
              ? "\x1b[31m"
              : v.impact === "serious"
                ? "\x1b[33m"
                : "\x1b[36m";
          console.log(
            `    ${impactColor}[${v.impact}]\x1b[0m ${v.description}`,
          );
        }
      }

      console.log("\nSummary:");
      console.log("-".repeat(60));
      console.log(`Average score: ${report.summary.averageScore}%`);
      console.log(`Total violations: ${report.summary.totalViolations}`);
      console.log(`  Critical: ${report.summary.violationsByImpact.critical}`);
      console.log(`  Serious: ${report.summary.violationsByImpact.serious}`);
      console.log(`  Moderate: ${report.summary.violationsByImpact.moderate}`);
      console.log(`  Minor: ${report.summary.violationsByImpact.minor}`);

      if (report.trend) {
        console.log(`\nTrend (vs ${report.trend.previousRunId}):`);
        const delta = report.trend.scoreDelta;
        const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
        console.log(`  Score: ${deltaStr}%`);
        console.log(`  New violations: ${report.trend.newViolations}`);
        console.log(`  Fixed violations: ${report.trend.fixedViolations}`);
      }

      process.exit(report.summary.violationsByImpact.critical > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(2);
    });
}

export default AccessibilityChecker;
