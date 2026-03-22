/**
 * Performance Profiler
 *
 * Measures and tracks page performance metrics:
 * - Page load time
 * - Time to first paint
 * - Time to interactive
 * - Resource loading times
 *
 * Sets thresholds and flags slow pages.
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";

export interface PerformanceThresholds {
  pageLoadMs: number;
  timeToFirstPaintMs: number;
  timeToInteractiveMs: number;
  apiResponseMs: number;
}

export interface PageMetrics {
  page: string;
  viewport: string;
  timestamp: string;
  loadTimeMs: number;
  timeToFirstPaintMs?: number;
  timeToInteractiveMs?: number;
  resourceCount: number;
  totalResourceSizeKb: number;
  apiCalls: ApiCallMetric[];
  passed: boolean;
  violations: string[];
}

export interface ApiCallMetric {
  url: string;
  method: string;
  durationMs: number;
  status: number;
  sizeBytes: number;
}

export interface PerformanceReport {
  runId: string;
  timestamp: string;
  thresholds: PerformanceThresholds;
  pages: PageMetrics[];
  summary: {
    totalPages: number;
    passedPages: number;
    failedPages: number;
    avgLoadTimeMs: number;
    slowestPage: string;
    slowestLoadTimeMs: number;
  };
}

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  pageLoadMs: 3000,
  timeToFirstPaintMs: 1500,
  timeToInteractiveMs: 5000,
  apiResponseMs: 1000,
};

export class PerformanceProfiler {
  private thresholds: PerformanceThresholds;
  private metricsDir: string;
  private metrics: PageMetrics[] = [];

  constructor(
    thresholds: Partial<PerformanceThresholds> = {},
    metricsDir: string = "tests/qa/monsters/reports/performance",
  ) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.metricsDir = join(process.cwd(), metricsDir);

    if (!existsSync(this.metricsDir)) {
      mkdirSync(this.metricsDir, { recursive: true });
    }
  }

  /**
   * Record metrics for a page load
   */
  recordPageMetrics(
    page: string,
    viewport: string,
    metrics: Omit<
      PageMetrics,
      "page" | "viewport" | "timestamp" | "passed" | "violations"
    >,
  ): PageMetrics {
    const violations: string[] = [];

    if (metrics.loadTimeMs > this.thresholds.pageLoadMs) {
      violations.push(
        `Page load too slow: ${metrics.loadTimeMs}ms (threshold: ${this.thresholds.pageLoadMs}ms)`,
      );
    }

    if (
      metrics.timeToFirstPaintMs &&
      metrics.timeToFirstPaintMs > this.thresholds.timeToFirstPaintMs
    ) {
      violations.push(
        `First paint too slow: ${metrics.timeToFirstPaintMs}ms (threshold: ${this.thresholds.timeToFirstPaintMs}ms)`,
      );
    }

    if (
      metrics.timeToInteractiveMs &&
      metrics.timeToInteractiveMs > this.thresholds.timeToInteractiveMs
    ) {
      violations.push(
        `Time to interactive too slow: ${metrics.timeToInteractiveMs}ms (threshold: ${this.thresholds.timeToInteractiveMs}ms)`,
      );
    }

    for (const api of metrics.apiCalls) {
      if (api.durationMs > this.thresholds.apiResponseMs) {
        violations.push(
          `Slow API call: ${api.url} took ${api.durationMs}ms (threshold: ${this.thresholds.apiResponseMs}ms)`,
        );
      }
    }

    const pageMetrics: PageMetrics = {
      page,
      viewport,
      timestamp: new Date().toISOString(),
      ...metrics,
      passed: violations.length === 0,
      violations,
    };

    this.metrics.push(pageMetrics);
    return pageMetrics;
  }

  /**
   * Simulate measuring page load (for non-browser environments)
   */
  async measurePageLoad(url: string, viewport: string): Promise<PageMetrics> {
    const page = new URL(url).pathname;
    const startTime = Date.now();

    try {
      const response = await fetch(url);
      const loadTimeMs = Date.now() - startTime;

      const text = await response.text();
      const sizeKb = text.length / 1024;

      return this.recordPageMetrics(page, viewport, {
        loadTimeMs,
        resourceCount: 1, // Just the HTML
        totalResourceSizeKb: Math.round(sizeKb * 100) / 100,
        apiCalls: [],
      });
    } catch (error: any) {
      return this.recordPageMetrics(page, viewport, {
        loadTimeMs: Date.now() - startTime,
        resourceCount: 0,
        totalResourceSizeKb: 0,
        apiCalls: [],
      });
    }
  }

  /**
   * Generate performance report
   */
  generateReport(runId: string): PerformanceReport {
    const passedPages = this.metrics.filter((m) => m.passed).length;
    const failedPages = this.metrics.filter((m) => !m.passed).length;
    const avgLoadTimeMs =
      this.metrics.length > 0
        ? Math.round(
            this.metrics.reduce((sum, m) => sum + m.loadTimeMs, 0) /
              this.metrics.length,
          )
        : 0;

    const slowest = this.metrics.reduce(
      (max, m) => (m.loadTimeMs > max.loadTimeMs ? m : max),
      this.metrics[0] || { page: "N/A", loadTimeMs: 0 },
    );

    const report: PerformanceReport = {
      runId,
      timestamp: new Date().toISOString(),
      thresholds: this.thresholds,
      pages: this.metrics,
      summary: {
        totalPages: this.metrics.length,
        passedPages,
        failedPages,
        avgLoadTimeMs,
        slowestPage: slowest.page,
        slowestLoadTimeMs: slowest.loadTimeMs,
      },
    };

    // Save report
    const reportPath = join(this.metricsDir, `performance-${runId}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  /**
   * Compare with previous run to detect regressions
   */
  compareWithPrevious(
    currentReport: PerformanceReport,
    previousRunId: string,
  ): {
    regressions: Array<{
      page: string;
      previousMs: number;
      currentMs: number;
      delta: number;
    }>;
    improvements: Array<{
      page: string;
      previousMs: number;
      currentMs: number;
      delta: number;
    }>;
  } {
    const previousPath = join(
      this.metricsDir,
      `performance-${previousRunId}.json`,
    );

    if (!existsSync(previousPath)) {
      return { regressions: [], improvements: [] };
    }

    const previousReport: PerformanceReport = JSON.parse(
      readFileSync(previousPath, "utf-8"),
    );
    const previousByPage = new Map(
      previousReport.pages.map((p) => [p.page, p.loadTimeMs]),
    );

    const regressions: Array<{
      page: string;
      previousMs: number;
      currentMs: number;
      delta: number;
    }> = [];
    const improvements: Array<{
      page: string;
      previousMs: number;
      currentMs: number;
      delta: number;
    }> = [];

    for (const current of currentReport.pages) {
      const previous = previousByPage.get(current.page);
      if (previous !== undefined) {
        const delta = current.loadTimeMs - previous;
        const deltaPercent = (delta / previous) * 100;

        if (deltaPercent > 20) {
          regressions.push({
            page: current.page,
            previousMs: previous,
            currentMs: current.loadTimeMs,
            delta,
          });
        } else if (deltaPercent < -20) {
          improvements.push({
            page: current.page,
            previousMs: previous,
            currentMs: current.loadTimeMs,
            delta,
          });
        }
      }
    }

    return { regressions, improvements };
  }

  /**
   * Get current thresholds
   */
  getThresholds(): PerformanceThresholds {
    return { ...this.thresholds };
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Clear recorded metrics
   */
  clear(): void {
    this.metrics = [];
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
    "/tournaments",
    "/leaderboard",
    "/tables",
    "/bots/build",
  ];

  const profiler = new PerformanceProfiler();

  console.log("Performance Profiler");
  console.log("=".repeat(60));
  console.log(`Testing ${pages.length} pages at ${baseUrl}`);
  console.log(`Thresholds: ${JSON.stringify(profiler.getThresholds())}`);
  console.log();

  Promise.all(
    pages.map((page) =>
      profiler.measurePageLoad(`${baseUrl}${page}`, "Desktop 1920"),
    ),
  )
    .then(() => {
      const runId = `perf-${Date.now()}`;
      const report = profiler.generateReport(runId);

      console.log("\nResults:");
      console.log("-".repeat(60));

      for (const page of report.pages) {
        const status = page.passed ? "✓" : "✗";
        const color = page.passed ? "\x1b[32m" : "\x1b[31m";
        console.log(
          `${color}${status}\x1b[0m ${page.page}: ${page.loadTimeMs}ms (${page.totalResourceSizeKb}kb)`,
        );
        for (const violation of page.violations) {
          console.log(`    ⚠ ${violation}`);
        }
      }

      console.log("\nSummary:");
      console.log("-".repeat(60));
      console.log(`Total pages: ${report.summary.totalPages}`);
      console.log(`Passed: ${report.summary.passedPages}`);
      console.log(`Failed: ${report.summary.failedPages}`);
      console.log(`Average load time: ${report.summary.avgLoadTimeMs}ms`);
      console.log(
        `Slowest: ${report.summary.slowestPage} (${report.summary.slowestLoadTimeMs}ms)`,
      );

      process.exit(report.summary.failedPages > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("Error:", err.message);
      process.exit(2);
    });
}

export default PerformanceProfiler;
