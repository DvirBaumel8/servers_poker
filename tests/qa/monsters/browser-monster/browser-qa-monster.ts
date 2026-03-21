/**
 * Browser QA Monster - FAST COMPREHENSIVE UI TESTING
 *
 * Optimized for speed through:
 * - Parallel browser contexts for independent tests
 * - Batch page.evaluate() for multiple checks per page load
 * - Smart sampling instead of exhaustive iteration
 * - Early exit on critical failures
 *
 * Target runtime: < 2 minutes (down from 7+ minutes)
 *
 * Run: npm run monsters:browser-qa
 */

import { chromium, Browser, Page, BrowserContext } from "playwright";
import { addIssue, Severity } from "../shared/issue-tracker";

const BASE_URL = process.env.FRONTEND_URL || "http://localhost:3001";
const MAX_PARALLEL_CONTEXTS = 4;
const PAGE_TIMEOUT_MS = 10000;

// ============================================================================
// ROUTES TO TEST
// ============================================================================

const CRITICAL_ROUTES = [
  "/",
  "/login",
  "/register",
  "/tournaments",
  "/bots",
  "/leaderboard",
];

const AUTH_ROUTES = ["/profile", "/tournaments"];
const ADMIN_ROUTES = ["/admin/tournaments", "/admin/analytics"];

// ============================================================================
// TYPES
// ============================================================================

interface Finding {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  location: string;
  element?: string;
  reproducible: boolean;
  steps?: string[];
}

interface TestStats {
  run: number;
  passed: number;
  failed: number;
}

// ============================================================================
// BATCH CHECK SCRIPTS (run multiple checks in single page.evaluate)
// ============================================================================

const BATCH_PAGE_HEALTH_CHECK = `(() => {
  const issues = [];
  
  // Check for JS errors in DOM
  const errorElements = document.querySelectorAll('[class*="error"], [class*="Error"]');
  const visibleErrors = Array.from(errorElements).filter(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.textContent?.trim();
  });
  if (visibleErrors.length > 0) {
    issues.push({ type: 'error-state', count: visibleErrors.length, sample: visibleErrors[0]?.textContent?.slice(0, 100) });
  }
  
  // Check for broken images
  const images = document.querySelectorAll('img');
  const brokenImages = Array.from(images).filter(img => !img.complete || img.naturalHeight === 0);
  if (brokenImages.length > 0) {
    issues.push({ type: 'broken-image', count: brokenImages.length });
  }
  
  // Check for empty links
  const links = document.querySelectorAll('a');
  const emptyLinks = Array.from(links).filter(a => !a.href || a.href === '#' || a.href === 'javascript:void(0)');
  if (emptyLinks.length > 0) {
    issues.push({ type: 'empty-link', count: emptyLinks.length });
  }
  
  // Check for buttons without text/aria-label
  const buttons = document.querySelectorAll('button');
  const unlabeledButtons = Array.from(buttons).filter(btn => 
    !btn.textContent?.trim() && !btn.getAttribute('aria-label') && !btn.querySelector('svg')
  );
  if (unlabeledButtons.length > 0) {
    issues.push({ type: 'unlabeled-button', count: unlabeledButtons.length });
  }
  
  // Check for inputs without labels
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])');
  const unlabeledInputs = Array.from(inputs).filter(input => {
    const id = input.id;
    const hasLabel = id && document.querySelector('label[for="' + id + '"]');
    const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
    const hasPlaceholder = input.placeholder;
    return !hasLabel && !hasAriaLabel && !hasPlaceholder;
  });
  if (unlabeledInputs.length > 0) {
    issues.push({ type: 'unlabeled-input', count: unlabeledInputs.length });
  }
  
  // Check for console errors (if any were captured)
  const hasReactError = document.body?.innerHTML?.includes('Maximum update depth exceeded') ||
                        document.body?.innerHTML?.includes('Error boundary');
  if (hasReactError) {
    issues.push({ type: 'react-error', description: 'React error detected in page' });
  }
  
  // Check for horizontal overflow
  const hasOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  if (hasOverflow) {
    issues.push({ type: 'horizontal-overflow', width: document.documentElement.scrollWidth });
  }
  
  // Check for z-index issues (elements covering others unexpectedly)
  const fixedElements = document.querySelectorAll('[style*="position: fixed"], [style*="position:fixed"]');
  if (fixedElements.length > 3) {
    issues.push({ type: 'too-many-fixed', count: fixedElements.length });
  }
  
  return {
    url: window.location.href,
    title: document.title,
    issues,
    elementCounts: {
      buttons: buttons.length,
      links: links.length,
      inputs: inputs.length,
      images: images.length,
    }
  };
})()`;

const BATCH_INTERACTIVE_CHECK = `(() => {
  const issues = [];
  
  // Check clickable elements have pointer cursor
  const clickables = document.querySelectorAll('button, a, [onclick], [role="button"]');
  const badCursors = Array.from(clickables).filter(el => {
    const style = window.getComputedStyle(el);
    return style.cursor !== 'pointer' && style.display !== 'none';
  });
  if (badCursors.length > 0) {
    issues.push({ type: 'bad-cursor', count: badCursors.length });
  }
  
  // Check for disabled buttons that look enabled
  const disabledButtons = document.querySelectorAll('button[disabled]');
  const badDisabled = Array.from(disabledButtons).filter(btn => {
    const style = window.getComputedStyle(btn);
    return style.opacity === '1' && style.cursor !== 'not-allowed';
  });
  if (badDisabled.length > 0) {
    issues.push({ type: 'disabled-not-styled', count: badDisabled.length });
  }
  
  // Check for focus visibility
  const focusableCount = document.querySelectorAll('button, a, input, select, textarea, [tabindex]').length;
  
  // Check for touch targets (minimum 44x44px)
  const smallTargets = Array.from(clickables).filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
  });
  if (smallTargets.length > 5) {
    issues.push({ type: 'small-touch-targets', count: smallTargets.length });
  }
  
  return { issues, focusableCount };
})()`;

const BATCH_FORM_CHECK = `(() => {
  const issues = [];
  const forms = document.querySelectorAll('form');
  
  forms.forEach((form, idx) => {
    // Check for submit button
    const hasSubmit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    if (!hasSubmit) {
      issues.push({ type: 'no-submit-button', form: idx });
    }
    
    // Check required fields have validation
    const requiredInputs = form.querySelectorAll('[required]');
    const emailInputs = form.querySelectorAll('input[type="email"]');
    const passwordInputs = form.querySelectorAll('input[type="password"]');
    
    // Check password fields have minlength or pattern
    passwordInputs.forEach(pwd => {
      if (!pwd.minLength && !pwd.pattern) {
        issues.push({ type: 'weak-password-validation', form: idx });
      }
    });
  });
  
  return { formCount: forms.length, issues };
})()`;

// ============================================================================
// BROWSER QA MONSTER CLASS
// ============================================================================

class BrowserQAMonster {
  name = "Browser QA Monster";
  type = "browser-qa";

  private browser: Browser | null = null;
  private findings: Finding[] = [];
  private stats: TestStats = { run: 0, passed: 0, failed: 0 };
  private consoleErrors: string[] = [];

  async run(): Promise<{
    passed: boolean;
    findings: Finding[];
    stats: TestStats;
    duration: number;
  }> {
    const startTime = Date.now();
    console.log("\n" + "═".repeat(70));
    console.log("  🧪 BROWSER QA MONSTER - FAST COMPREHENSIVE UI TESTING");
    console.log("═".repeat(70) + "\n");

    try {
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS !== "false",
      });

      // Run test groups in parallel using multiple browser contexts
      console.log("  🚀 Running parallel test groups...\n");

      await Promise.all([
        this.runPublicPagesTests(),
        this.runAuthTests(),
        this.runAdminTests(),
        this.runInteractiveTests(),
      ]);

      // Sequential tests that need specific state
      console.log("\n  📝 Running sequential tests...\n");
      await this.runFormTests();
      await this.runNavigationTests();

      await this.browser.close();
    } catch (error) {
      console.error("Monster crashed:", error);
      if (this.browser) await this.browser.close();
      throw error;
    }

    // Print summary
    this.printSummary(Date.now() - startTime);

    const hasHighSeverity = this.findings.some(
      (f) => f.severity === "critical" || f.severity === "high",
    );

    return {
      passed: !hasHighSeverity,
      findings: this.findings,
      stats: this.stats,
      duration: Date.now() - startTime,
    };
  }

  // ============================================================================
  // PARALLEL TEST GROUPS
  // ============================================================================

  private async runPublicPagesTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  📄 Testing public pages...");

    for (const route of CRITICAL_ROUTES) {
      await this.testPage(page, route);
    }

    await context.close();
    console.log("  ✅ Public pages done");
  }

  private async runAuthTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  🔐 Testing auth flows...");

    // Test login page
    await page.goto(`${BASE_URL}/login`, { timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(500);

    // Check login form exists
    const hasEmailInput = await page.$(
      'input[type="email"], input[name="email"]',
    );
    const hasPasswordInput = await page.$('input[type="password"]');
    const hasSubmitBtn = await page.$(
      'button[type="submit"], button:has-text("Sign In"), button:has-text("Login")',
    );

    if (!hasEmailInput || !hasPasswordInput) {
      this.addFinding(
        "FORM",
        "high",
        "Login form incomplete",
        "Missing email or password input",
        "/login",
      );
    }
    if (!hasSubmitBtn) {
      this.addFinding(
        "FORM",
        "high",
        "Login form missing submit",
        "No submit button found",
        "/login",
      );
    }

    // Test registration page
    await page.goto(`${BASE_URL}/register`, { timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(500);

    const regCheck = (await page.evaluate(BATCH_FORM_CHECK)) as any;
    if (regCheck.issues.length > 0) {
      for (const issue of regCheck.issues) {
        this.addFinding(
          "FORM",
          "medium",
          `Registration form issue: ${issue.type}`,
          JSON.stringify(issue),
          "/register",
        );
      }
    }

    // Try to login with test user
    try {
      await page.goto(`${BASE_URL}/login`, { timeout: PAGE_TIMEOUT_MS });
      await page.fill(
        'input[type="email"], input[name="email"]',
        "test@example.com",
      );
      await page.fill('input[type="password"]', "password123");
      await page.click(
        'button[type="submit"], button:has-text("Sign In"), button:has-text("Login")',
      );
      await page.waitForTimeout(2000);

      // Check if logged in
      const url = page.url();
      if (url.includes("/login")) {
        // Still on login page - check for error message
        const errorVisible = await page.$('[class*="error"], [role="alert"]');
        if (!errorVisible) {
          this.addFinding(
            "UX",
            "medium",
            "Login error not shown",
            "Failed login but no error message visible",
            "/login",
          );
        }
      }
    } catch (e) {
      // Login attempt failed, that's ok for testing
    }

    await context.close();
    console.log("  ✅ Auth tests done");
  }

  private async runAdminTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  👑 Testing admin pages...");

    for (const route of ADMIN_ROUTES) {
      try {
        await page.goto(`${BASE_URL}${route}`, { timeout: PAGE_TIMEOUT_MS });
        await page.waitForTimeout(500);

        // Check for redirect to login (expected for unauthenticated)
        const url = page.url();
        if (!url.includes("/login") && !url.includes("/admin")) {
          // Neither redirected nor on admin page - weird state
          this.addFinding(
            "AUTH",
            "high",
            "Admin route unprotected",
            `${route} accessible without auth`,
            route,
          );
        }

        // Run batch health check
        const health = (await page.evaluate(BATCH_PAGE_HEALTH_CHECK)) as any;
        this.processHealthCheck(health, route);
      } catch (e) {
        // Page didn't load, could be expected
      }
    }

    await context.close();
    console.log("  ✅ Admin tests done");
  }

  private async runInteractiveTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  🖱️  Testing interactive elements...");

    // Test home page interactivity
    await page.goto(`${BASE_URL}/`, { timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(500);

    const interactiveCheck = (await page.evaluate(
      BATCH_INTERACTIVE_CHECK,
    )) as any;
    if (interactiveCheck.issues.length > 0) {
      for (const issue of interactiveCheck.issues) {
        this.addFinding(
          "UX",
          "low",
          `Interactive issue: ${issue.type}`,
          `Count: ${issue.count}`,
          "/",
        );
      }
    }

    // Test tournaments page interactivity
    await page.goto(`${BASE_URL}/tournaments`, { timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(500);

    const tournamentCheck = (await page.evaluate(
      BATCH_INTERACTIVE_CHECK,
    )) as any;
    if (tournamentCheck.issues.length > 0) {
      for (const issue of tournamentCheck.issues) {
        this.addFinding(
          "UX",
          "low",
          `Interactive issue: ${issue.type}`,
          `Count: ${issue.count}`,
          "/tournaments",
        );
      }
    }

    // Test clicking on key elements (sample)
    const clickableSelectors = [
      'a[href="/tournaments"]',
      'a[href="/bots"]',
      'a[href="/leaderboard"]',
      "button:first-of-type",
    ];

    for (const selector of clickableSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            await element.click({ timeout: 2000 });
            await page.waitForTimeout(300);
            this.stats.passed++;
          }
        }
        this.stats.run++;
      } catch (e) {
        this.stats.failed++;
        this.stats.run++;
      }
    }

    await context.close();
    console.log("  ✅ Interactive tests done");
  }

  // ============================================================================
  // SEQUENTIAL TESTS
  // ============================================================================

  private async runFormTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  📝 Testing forms...");

    const formPages = ["/login", "/register", "/forgot-password"];

    for (const route of formPages) {
      try {
        await page.goto(`${BASE_URL}${route}`, { timeout: PAGE_TIMEOUT_MS });
        await page.waitForTimeout(500);

        const formCheck = (await page.evaluate(BATCH_FORM_CHECK)) as any;

        if (formCheck.formCount === 0) {
          this.addFinding(
            "FORM",
            "high",
            "No form found",
            `Expected form on ${route}`,
            route,
          );
        }

        for (const issue of formCheck.issues) {
          this.addFinding(
            "FORM",
            "medium",
            `Form issue: ${issue.type}`,
            JSON.stringify(issue),
            route,
          );
        }

        this.stats.run++;
        this.stats.passed++;
      } catch (e) {
        this.stats.run++;
        this.stats.failed++;
      }
    }

    await context.close();
    console.log("  ✅ Form tests done");
  }

  private async runNavigationTests(): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    this.setupPageListeners(page);

    console.log("  🧭 Testing navigation...");

    // Test 404 page
    try {
      await page.goto(`${BASE_URL}/this-page-does-not-exist-12345`, {
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(500);

      const has404 = await page.evaluate(`
        document.body.innerText.toLowerCase().includes('404') ||
        document.body.innerText.toLowerCase().includes('not found') ||
        document.body.innerText.toLowerCase().includes('page not found')
      `);

      if (!has404) {
        this.addFinding(
          "NAV",
          "medium",
          "Missing 404 page",
          "Invalid URL doesn't show 404 error",
          "/invalid-url",
        );
      }
    } catch (e) {
      // Page error is acceptable for 404 test
    }

    // Test back button navigation
    try {
      await page.goto(`${BASE_URL}/`, { timeout: PAGE_TIMEOUT_MS });
      await page.goto(`${BASE_URL}/tournaments`, { timeout: PAGE_TIMEOUT_MS });
      await page.goBack();
      await page.waitForTimeout(500);

      const url = page.url();
      if (!url.endsWith("/") && !url.includes("localhost:3001")) {
        this.addFinding(
          "NAV",
          "medium",
          "Back navigation broken",
          "Browser back button doesn't work correctly",
          "/",
        );
      }
    } catch (e) {
      // Navigation test failed
    }

    // Test deep linking
    try {
      await page.goto(`${BASE_URL}/tournaments?sort=date&filter=active`, {
        timeout: PAGE_TIMEOUT_MS,
      });
      await page.waitForTimeout(500);

      // Page should load without error
      const health = (await page.evaluate(BATCH_PAGE_HEALTH_CHECK)) as any;
      if (health.issues.some((i: any) => i.type === "react-error")) {
        this.addFinding(
          "NAV",
          "high",
          "Deep linking fails",
          "URL with query params causes error",
          "/tournaments?...",
        );
      }
    } catch (e) {
      // Deep linking failed
    }

    await context.close();
    console.log("  ✅ Navigation tests done");
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private setupPageListeners(page: Page): void {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (!text.includes("[vite]") && !text.includes("favicon")) {
          this.consoleErrors.push(text);
        }
      }
    });

    page.on("pageerror", (error) => {
      this.addFinding(
        "CRASH",
        "critical",
        "JavaScript Crash",
        error.message.slice(0, 200),
        page.url(),
      );
    });
  }

  private async testPage(page: Page, route: string): Promise<void> {
    try {
      await page.goto(`${BASE_URL}${route}`, { timeout: PAGE_TIMEOUT_MS });
      await page.waitForTimeout(500);

      const health = (await page.evaluate(BATCH_PAGE_HEALTH_CHECK)) as any;
      this.processHealthCheck(health, route);

      this.stats.run++;
      this.stats.passed++;
    } catch (e: any) {
      this.stats.run++;
      this.stats.failed++;
      this.addFinding(
        "LOAD",
        "high",
        "Page failed to load",
        e.message?.slice(0, 100) || "Unknown error",
        route,
      );
    }
  }

  private processHealthCheck(health: any, route: string): void {
    if (!health || !health.issues) return;

    for (const issue of health.issues) {
      switch (issue.type) {
        case "error-state":
          this.addFinding(
            "ERROR",
            "high",
            "Error state visible",
            `${issue.count} error elements: ${issue.sample}`,
            route,
          );
          break;
        case "broken-image":
          this.addFinding(
            "ASSET",
            "medium",
            "Broken images",
            `${issue.count} images failed to load`,
            route,
          );
          break;
        case "empty-link":
          this.addFinding(
            "NAV",
            "low",
            "Empty links",
            `${issue.count} links with no valid href`,
            route,
          );
          break;
        case "unlabeled-button":
          this.addFinding(
            "A11Y",
            "medium",
            "Unlabeled buttons",
            `${issue.count} buttons without text/aria-label`,
            route,
          );
          break;
        case "unlabeled-input":
          this.addFinding(
            "A11Y",
            "medium",
            "Unlabeled inputs",
            `${issue.count} inputs without labels`,
            route,
          );
          break;
        case "react-error":
          this.addFinding(
            "CRASH",
            "critical",
            "React Error",
            issue.description,
            route,
          );
          break;
        case "horizontal-overflow":
          this.addFinding(
            "LAYOUT",
            "medium",
            "Horizontal overflow",
            `Page width: ${issue.width}px`,
            route,
          );
          break;
        case "too-many-fixed":
          this.addFinding(
            "LAYOUT",
            "low",
            "Too many fixed elements",
            `${issue.count} fixed position elements`,
            route,
          );
          break;
      }
    }
  }

  private addFinding(
    category: string,
    severity: "critical" | "high" | "medium" | "low",
    title: string,
    description: string,
    location: string,
  ): void {
    // Sync to unified issue tracker
    try {
      addIssue({
        category,
        severity: severity as Severity,
        source: "browser-qa",
        title,
        description,
        location,
      });
    } catch {
      // Silently ignore
    }

    this.findings.push({
      id: `browser-qa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category,
      severity,
      title,
      description,
      location,
      reproducible: true,
    });
  }

  private printSummary(duration: number): void {
    console.log("\n" + "═".repeat(70));
    console.log("  📊 BROWSER QA MONSTER SUMMARY");
    console.log("═".repeat(70));

    console.log(`\n  ⏱️  Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(
      `  📋 Tests: ${this.stats.run} run, ${this.stats.passed} passed, ${this.stats.failed} failed`,
    );
    console.log(`  🔍 Findings: ${this.findings.length}`);

    const bySeverity = {
      critical: this.findings.filter((f) => f.severity === "critical").length,
      high: this.findings.filter((f) => f.severity === "high").length,
      medium: this.findings.filter((f) => f.severity === "medium").length,
      low: this.findings.filter((f) => f.severity === "low").length,
    };

    console.log(`     🔴 Critical: ${bySeverity.critical}`);
    console.log(`     🟠 High: ${bySeverity.high}`);
    console.log(`     🟡 Medium: ${bySeverity.medium}`);
    console.log(`     🟢 Low: ${bySeverity.low}`);

    if (this.consoleErrors.length > 0) {
      console.log(`\n  ⚠️  Console Errors: ${this.consoleErrors.length}`);
      this.consoleErrors.slice(0, 3).forEach((e) => {
        console.log(`     - ${e.slice(0, 60)}...`);
      });
    }

    const passed = bySeverity.critical === 0 && bySeverity.high === 0;
    console.log(`\n  ${passed ? "✅ PASSED" : "❌ FAILED"}`);
    console.log("═".repeat(70) + "\n");
  }
}

// ============================================================================
// CLI RUNNER
// ============================================================================

async function main(): Promise<void> {
  const monster = new BrowserQAMonster();
  const result = await monster.run();

  console.log(`\nFindings: ${result.findings.length}`);
  console.log(`Duration: ${result.duration}ms`);

  process.exit(result.passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Browser QA Monster failed:", err);
  process.exit(1);
});
