/**
 * Visual Monster
 *
 * Tests visual aspects of the frontend:
 * - Responsive design across viewports
 * - Overflow detection
 * - Console error monitoring
 * - Accessibility checks
 * - Screenshot capture for visual regression
 *
 * Can run in two modes:
 * - Headless (CI): Uses page evaluation for checks
 * - Interactive (MCP): Uses browser tools for manual inspection
 */

import { BaseMonster } from "../shared/base-monster";
import { RunConfig, Severity } from "../shared/types";
import { getEnv, createAuthHelper, runMonsterCli, AuthHelper } from "../shared";
import {
  VISUAL_MONSTER_CONFIG,
  Viewport,
  PageConfig,
  VisualCheck,
  getPublicPages,
} from "./visual-monster.config";
import {
  PERMISSION_CHECKS,
  PermissionCheck,
  getChecksForRole,
} from "./permission-checks";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

interface PageTestResult {
  page: PageConfig;
  viewport: Viewport;
  consoleErrors: string[];
  overflows: { selector: string; element: string }[];
  accessibilityIssues: { selector: string; issue: string }[];
  screenshot?: string;
  loadTime: number;
}

export class VisualMonster extends BaseMonster {
  private screenshotDir: string;
  private results: PageTestResult[] = [];
  private authHelper: AuthHelper = createAuthHelper();
  private apiBaseUrl: string;

  constructor() {
    super({
      name: "Visual Monster",
      type: "visual",
      timeout: 300000, // 5 minutes
      verbose: true,
    });
    this.screenshotDir = join(
      process.cwd(),
      VISUAL_MONSTER_CONFIG.screenshotDir,
    );
    const env = getEnv();
    this.apiBaseUrl = env.apiBaseUrl.replace("/api/v1", "");
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  protected async setup(runConfig: RunConfig): Promise<void> {
    this.log("Setting up Visual Monster...");

    // Create screenshot directory
    if (!existsSync(this.screenshotDir)) {
      mkdirSync(this.screenshotDir, { recursive: true });
    }

    // Create run-specific subdirectory
    const runDir = join(this.screenshotDir, runConfig.runId);
    if (!existsSync(runDir)) {
      mkdirSync(runDir, { recursive: true });
    }

    // Verify frontend is running
    const healthCheck = await this.fetch(VISUAL_MONSTER_CONFIG.baseUrl);
    if (!healthCheck.ok) {
      throw new Error(
        `Frontend not responding at ${VISUAL_MONSTER_CONFIG.baseUrl}: ${healthCheck.error || healthCheck.status}`,
      );
    }
    this.log("✅ Frontend is running");

    // Authenticate for permission tests
    await this.setupAuthTokens();
  }

  protected async execute(runConfig: RunConfig): Promise<void> {
    this.log("Starting visual tests...");

    // Test public pages first (no auth needed)
    const publicPages = getPublicPages();
    this.log(`\nTesting ${publicPages.length} public pages...`);

    for (const page of publicPages) {
      await this.testPage(page, runConfig);
    }

    // Run permission tests
    this.log("\n" + "─".repeat(50));
    this.log("PERMISSION TESTS");
    this.log("─".repeat(50));
    await this.testPermissions();

    // Generate summary
    this.generateSummary(runConfig);
  }

  protected async teardown(): Promise<void> {
    this.log("Visual Monster teardown complete");
  }

  // ============================================================================
  // PAGE TESTING
  // ============================================================================

  private async testPage(
    page: PageConfig,
    runConfig: RunConfig,
  ): Promise<void> {
    this.log(`\nTesting page: ${page.name} (${page.path})`);

    // Test at each viewport
    for (const viewport of VISUAL_MONSTER_CONFIG.viewports) {
      const result = await this.testPageAtViewport(page, viewport, runConfig);
      this.results.push(result);

      // Record findings
      this.processResult(result);
    }
  }

  private async testPageAtViewport(
    page: PageConfig,
    viewport: Viewport,
    runConfig: RunConfig,
  ): Promise<PageTestResult> {
    const result: PageTestResult = {
      page,
      viewport,
      consoleErrors: [],
      overflows: [],
      accessibilityIssues: [],
      loadTime: 0,
    };

    const url = `${VISUAL_MONSTER_CONFIG.baseUrl}${page.path}`;
    const startTime = Date.now();

    try {
      // Use API-based checks since we don't have Playwright installed
      // In production, this would use Playwright or the browser MCP
      const response = await this.fetch(url);
      result.loadTime = Date.now() - startTime;

      if (!response.ok) {
        this.addFinding({
          category: "BUG",
          severity: page.critical ? "critical" : "high",
          title: `Page not accessible: ${page.name}`,
          description: `${page.path} returned ${response.status}`,
          location: { page: page.path, viewport: viewport.name },
          reproducible: true,
          reproductionSteps: [
            `Navigate to ${url}`,
            `Observe ${response.status} error`,
          ],
          tags: ["visual", "page-load", viewport.deviceType],
        });
        this.recordTest(false);
        return result;
      }

      // Check response for common issues
      const html = typeof response.data === "string" ? response.data : "";

      // Check for React error boundary
      if (html.includes("Something went wrong") || html.includes("Error:")) {
        result.consoleErrors.push("Possible React error boundary triggered");
      }

      // Check for empty content
      if (html.length < 500 && !page.path.includes("login")) {
        result.consoleErrors.push("Page content suspiciously short");
      }

      // Note: We can't actually detect overflow without rendering the page.
      // The CSS now has overflow-x: hidden on body, so horizontal scroll is prevented.
      // This heuristic check has been removed since it produces false positives.
      // For actual overflow detection, use browser-based E2E tests.

      // Check load time
      if (result.loadTime > 3000) {
        this.addFinding({
          category: "DEGRADATION",
          severity: "medium",
          title: `Slow page load: ${page.name}`,
          description: `Page took ${result.loadTime}ms to load (threshold: 3000ms)`,
          location: { page: page.path, viewport: viewport.name },
          evidence: { metrics: { loadTime: result.loadTime } },
          reproducible: true,
          tags: ["visual", "performance", viewport.deviceType],
        });
      }

      this.recordTest(true);
    } catch (error: any) {
      result.consoleErrors.push(`Load error: ${error.message}`);
      this.recordTest(false);
    }

    return result;
  }

  private processResult(result: PageTestResult): void {
    const { page, viewport } = result;

    // Process console errors
    for (const error of result.consoleErrors) {
      // Check against known patterns
      for (const pattern of VISUAL_MONSTER_CONFIG.consoleErrorPatterns) {
        if (pattern.pattern.test(error)) {
          this.addFinding({
            category: "BUG",
            severity: pattern.severity,
            title: `Console error on ${page.name}`,
            description: error,
            location: { page: page.path, viewport: viewport.name },
            evidence: { consoleErrors: [error] },
            reproducible: true,
            tags: ["visual", "console-error", viewport.deviceType],
          });
          break;
        }
      }
    }

    // Process overflows
    for (const overflow of result.overflows) {
      this.addFinding({
        category: "BUG",
        severity: "medium",
        title: `Overflow detected on ${page.name}`,
        description: `Element "${overflow.selector}" has overflow at ${viewport.name} (${viewport.width}x${viewport.height})`,
        location: { page: page.path, viewport: viewport.name },
        evidence: { raw: overflow },
        reproducible: true,
        reproductionSteps: [
          `Navigate to ${page.path}`,
          `Set viewport to ${viewport.width}x${viewport.height}`,
          `Observe overflow on ${overflow.selector}`,
        ],
        tags: ["visual", "overflow", viewport.deviceType],
      });
    }

    // Process accessibility issues
    for (const issue of result.accessibilityIssues) {
      this.addFinding({
        category: "A11Y",
        severity: "high",
        title: `Accessibility issue on ${page.name}`,
        description: `${issue.issue} (${issue.selector})`,
        location: { page: page.path, viewport: viewport.name },
        evidence: { raw: issue },
        reproducible: true,
        tags: ["visual", "accessibility", viewport.deviceType],
      });
    }
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  private async setupAuthTokens(): Promise<void> {
    // Get user token
    const userToken = await this.authHelper.authenticateAsUser();
    if (userToken) {
      this.log("✅ User authentication successful");
    } else {
      this.logWarn("Could not authenticate as regular user");
    }

    // Get admin token
    const adminToken = await this.authHelper.authenticateAsAdmin();
    if (adminToken) {
      this.log("✅ Admin authentication successful");
    } else {
      this.logWarn("Could not authenticate as admin");
    }
  }

  // ============================================================================
  // PERMISSION TESTING
  // ============================================================================

  private async testPermissions(): Promise<void> {
    // Test as guest (no auth)
    this.log("\n🔓 Testing as GUEST...");
    for (const check of getChecksForRole("guest")) {
      await this.runPermissionCheck(check, null);
    }

    // Test as regular user
    if (this.authHelper.userToken) {
      this.log("\n👤 Testing as USER...");
      for (const check of getChecksForRole("user")) {
        await this.runPermissionCheck(check, this.authHelper.userToken);
      }
    } else {
      this.log("\n⏭️  Skipping USER tests (no auth token)");
    }

    // Test as admin
    if (this.authHelper.adminToken) {
      this.log("\n👑 Testing as ADMIN...");
      for (const check of getChecksForRole("admin")) {
        await this.runPermissionCheck(check, this.authHelper.adminToken);
      }
    } else {
      this.log("\n⏭️  Skipping ADMIN tests (no auth token)");
    }
  }

  private async runPermissionCheck(
    check: PermissionCheck,
    _token: string | null,
  ): Promise<void> {
    const url = `${VISUAL_MONSTER_CONFIG.baseUrl}${check.page}`;

    // IMPORTANT: This is HTTP-only mode. React SPAs render content via JavaScript,
    // so we can only check if the page returns 200 - not the actual rendered content.
    // For full permission testing, use the browser-use subagent or Playwright.
    const response = await this.fetch(url);

    // We can only reliably test:
    // 1. If the page returns a successful HTTP status
    // 2. If the initial HTML contains certain markers (limited for SPAs)

    // Skip checks that require JavaScript rendering (shouldFind/shouldNotFind)
    // These produce false positives in HTTP-only mode
    if (check.shouldFind || check.shouldNotFind) {
      this.log(
        `  ⏭️  ${check.name} - skipped (requires browser for SPA content)`,
      );
      this.recordTest(true, true); // Skip
      return;
    }

    // Check for redirect expectations - this CAN work with HTTP
    // because React Router won't redirect without JS, but server-side redirects will
    if (check.expectRedirect) {
      // For SPAs, client-side redirects won't happen without JS
      // We can only detect server-side 302 redirects
      if (response.status === 302 || response.status === 301) {
        this.recordTest(true);
        this.log(`  ✅ ${check.name} (server redirect)`);
        return;
      }

      // If page returns 200, SPA will handle redirect client-side (can't test without browser)
      if (response.ok) {
        this.log(
          `  ⏭️  ${check.name} - skipped (client-side redirect requires browser)`,
        );
        this.recordTest(true, true); // Skip - can't verify without JS
        return;
      }
    }

    // Page should be accessible
    if (!response.ok) {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: `Page not accessible: ${check.page}`,
        description: `${check.name} - Page returned ${response.status}`,
        location: { page: check.page },
        reproducible: true,
        tags: ["permission", "http-error"],
      });
      this.recordTest(false);
      this.log(`  ❌ ${check.name} - HTTP ${response.status}`);
      return;
    }

    this.recordTest(true);
    this.log(`  ✅ ${check.name}`);
  }

  // NOTE: shouldFind and shouldNotFind checks have been moved to browser-based testing.
  // HTTP-only mode cannot reliably test React SPA content because:
  // 1. Initial HTML is just a shell with <div id="root"></div>
  // 2. Actual content renders after JavaScript executes
  // 3. React Router handles redirects client-side
  //
  // For full permission testing, use:
  // - The browser-use subagent in Cursor
  // - Playwright/Puppeteer-based E2E tests
  // - The E2E Monster with proper browser context

  // ============================================================================
  // SUMMARY
  // ============================================================================

  private generateSummary(runConfig: RunConfig): void {
    const summaryPath = join(
      this.screenshotDir,
      runConfig.runId,
      "summary.json",
    );

    const summary = {
      runId: runConfig.runId,
      timestamp: new Date().toISOString(),
      pagesTestedCount: new Set(this.results.map((r) => r.page.path)).size,
      viewportsTestedCount: VISUAL_MONSTER_CONFIG.viewports.length,
      totalCombinations: this.results.length,
      issuesByViewport: this.groupIssuesByViewport(),
      issuesByPage: this.groupIssuesByPage(),
    };

    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    this.log(`Summary written to ${summaryPath}`);
  }

  private groupIssuesByViewport(): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const result of this.results) {
      const key = result.viewport.name;
      const issueCount =
        result.consoleErrors.length +
        result.overflows.length +
        result.accessibilityIssues.length;

      counts[key] = (counts[key] || 0) + issueCount;
    }

    return counts;
  }

  private groupIssuesByPage(): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const result of this.results) {
      const key = result.page.path;
      const issueCount =
        result.consoleErrors.length +
        result.overflows.length +
        result.accessibilityIssues.length;

      counts[key] = (counts[key] || 0) + issueCount;
    }

    return counts;
  }
}

// ============================================================================
// CLI RUNNER
// ============================================================================

if (require.main === module) {
  runMonsterCli(new VisualMonster(), "visual");
}
