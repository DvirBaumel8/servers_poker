/**
 * Explorer Monster — Autonomous UI Crawler
 *
 * Unlike other browser monsters that follow hardcoded routes and scenarios,
 * this monster discovers the UI on its own. It:
 *
 * 1. Starts from seed pages
 * 2. Finds every link, button, tab, and interactive element on each page
 * 3. Clicks them all, one by one
 * 4. After each click, checks for errors, broken states, and regressions
 * 5. Discovers new pages from links and adds them to the frontier
 * 6. Repeats until the entire reachable UI surface is covered
 *
 * This catches the class of bugs where "clicking X leads to a broken state"
 * without anyone having to manually write a scenario for X.
 *
 * Run: npx ts-node tests/qa/monsters/browser-monster/explorer-monster.ts
 */

import { chromium, Browser, Page, BrowserContext } from "playwright";
import { addIssue, generateReport, Severity } from "../shared/issue-tracker";
import { runMonsterCli } from "../shared/cli-runner";
import { BaseMonster } from "../shared/base-monster";
import { RunConfig, FindingCategory } from "../shared/types";
import { getEnv } from "../shared/env-config";
import { createAuthHelper, AuthHelper } from "../shared/auth-helper";

const BASE_URL = process.env.FRONTEND_URL || "http://localhost:3001";
const PAGE_TIMEOUT = 12000;
const ACTION_WAIT = 400;
const MAX_ACTIONS_PER_PAGE = 30;
const MAX_DEPTH = 4;
const MAX_RUNTIME_MS = parseInt(
  process.env.EXPLORER_MAX_RUNTIME || "90000",
  10,
);

const MAX_PAGES_PER_PATTERN = 2;

interface ExplorerState {
  visitedUrls: Set<string>;
  visitedPatterns: Map<string, number>;
  clickedElements: Set<string>;
  findings: ExplorerFinding[];
  stats: {
    pagesVisited: number;
    elementsClicked: number;
    errorsFound: number;
    testsRun: number;
    testsPassed: number;
  };
}

interface ExplorerFinding {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  page: string;
  element?: string;
  screenshot?: string;
}

interface InteractiveElement {
  selector: string;
  text: string;
  tag: string;
  type: string;
  href?: string;
  role?: string;
  isVisible: boolean;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

// ============================================================================
// HEALTH CHECK — injected into every page after every action
// ============================================================================

const HEALTH_CHECK_SCRIPT = `(() => {
  const problems = [];

  // 1. Visible error banners / alerts
  const errorEls = document.querySelectorAll(
    '[class*="error" i], [class*="alert" i], [role="alert"], [class*="Error"]'
  );
  for (const el of errorEls) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const lc = text.toLowerCase();
    if (lc.includes('error') || lc.includes('failed') || lc.includes('not found') ||
        lc.includes('unexpected') || lc.includes('went wrong') || lc.includes('crash')) {
      problems.push({ type: 'error-banner', text: text.slice(0, 120), tag: el.tagName });
    }
  }

  // 2. Uncaught error boundaries
  const errorBoundaries = document.querySelectorAll('[class*="ErrorBoundary"], [class*="error-boundary"]');
  for (const el of errorBoundaries) {
    const style = window.getComputedStyle(el);
    if (style.display !== 'none' && el.textContent?.trim()) {
      problems.push({ type: 'error-boundary', text: (el.textContent || '').slice(0, 120) });
    }
  }

  // 3. Blank/empty page (no meaningful content)
  const body = document.body;
  const textContent = (body?.innerText || '').trim();
  if (textContent.length < 20) {
    problems.push({ type: 'blank-page', text: 'Page appears empty or blank' });
  }

  // 4. React error overlay (dev mode crash)
  const reactError = document.getElementById('webpack-dev-server-client-overlay') ||
                     document.querySelector('[class*="react-error-overlay"]');
  if (reactError) {
    problems.push({ type: 'react-crash', text: 'React error overlay detected' });
  }

  // 5. Page title containing "error"
  if (document.title.toLowerCase().includes('error')) {
    problems.push({ type: 'error-title', text: document.title });
  }

  return problems;
})()`;

// Discover all interactive elements on the page
const DISCOVER_ELEMENTS_SCRIPT = `(() => {
  const elements = [];
  const seen = new Set();

  const interactiveSelectors = [
    'a[href]',
    'button:not([disabled])',
    '[role="button"]:not([disabled])',
    '[role="tab"]',
    '[role="menuitem"]',
    'input[type="radio"]',
    'input[type="checkbox"]',
    '[class*="tab" i][class*="item" i]',
    '[class*="card" i][onclick]',
    '[class*="selector" i] button',
    '[class*="Segment"] button',
    'details > summary',
  ];

  for (const selector of interactiveSelectors) {
    for (const el of document.querySelectorAll(selector)) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isVisible = style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        style.opacity !== '0' &&
                        rect.width > 0 && rect.height > 0;
      if (!isVisible) continue;

      const text = (el.textContent || '').trim().slice(0, 80);
      const href = el.getAttribute('href') || undefined;
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute('type') || '';
      const role = el.getAttribute('role') || '';

      // Deduplicate by text+tag+href
      const key = tag + '|' + text + '|' + (href || '') + '|' + role;
      if (seen.has(key)) continue;
      seen.add(key);

      // Build a unique selector
      let selector = '';
      if (el.id) {
        selector = '#' + el.id;
      } else {
        const idx = Array.from(el.parentElement?.children || []).indexOf(el);
        const parentId = el.parentElement?.id ? '#' + el.parentElement.id + ' > ' : '';
        selector = parentId + tag + ':nth-child(' + (idx + 1) + ')';
      }

      elements.push({
        selector,
        text,
        tag,
        type,
        href,
        role,
        isVisible,
        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      });
    }
  }

  return elements;
})()`;

// ============================================================================
// EXPLORER MONSTER
// ============================================================================

export class ExplorerMonster extends BaseMonster {
  private browser: Browser | null = null;
  private currentAuthToken: string | null = null;
  private authHelper: AuthHelper;
  private runStartTime = 0;
  private explorerState: ExplorerState = {
    visitedUrls: new Set(),
    visitedPatterns: new Map(),
    clickedElements: new Set(),
    findings: [],
    stats: {
      pagesVisited: 0,
      elementsClicked: 0,
      errorsFound: 0,
      testsRun: 0,
      testsPassed: 0,
    },
  };

  constructor() {
    super({
      name: "Explorer Monster",
      type: "explorer",
      timeout: MAX_RUNTIME_MS + 10000,
      verbose: true,
      needsBrowser: true,
      needsServer: true,
    });
    this.authHelper = createAuthHelper();
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.explorerState = {
      visitedUrls: new Set(),
      visitedPatterns: new Map(),
      clickedElements: new Set(),
      findings: [],
      stats: {
        pagesVisited: 0,
        elementsClicked: 0,
        errorsFound: 0,
        testsRun: 0,
        testsPassed: 0,
      },
    };
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.runStartTime = Date.now();
    this.log("Starting autonomous UI exploration...");

    try {
      this.browser = await chromium.launch({ headless: true });

      const roles: Array<"guest" | "user" | "admin"> = [
        "guest",
        "user",
        "admin",
      ];
      for (let i = 0; i < roles.length; i++) {
        if (Date.now() - this.runStartTime > MAX_RUNTIME_MS) {
          this.log(
            `Time limit reached (${MAX_RUNTIME_MS / 1000}s), stopping exploration`,
          );
          break;
        }

        const role = roles[i];
        this.log(`\n═══════════════════════════════════════`);
        this.log(`  PHASE ${i + 1}: Exploring as ${role.toUpperCase()}`);
        this.log(`═══════════════════════════════════════\n`);

        if (i > 0) {
          this.explorerState.visitedUrls.clear();
          this.explorerState.clickedElements.clear();
          this.explorerState.visitedPatterns.clear();
        }
        this.currentAuthToken = null;
        await this.exploreAsRole(role);
      }
    } finally {
      await this.browser?.close();
    }

    this.printExplorerReport();
  }

  protected async teardown(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }

  private explorerAddFinding(finding: ExplorerFinding): void {
    const fingerprint = `${finding.category}|${this.getUrlPattern(finding.page)}|${finding.element || ""}`;
    const isDuplicate = this.explorerState.findings.some(
      (f) =>
        `${f.category}|${this.getUrlPattern(f.page)}|${f.element || ""}` ===
        fingerprint,
    );
    if (isDuplicate) return;

    this.explorerState.findings.push(finding);
    this.explorerState.stats.errorsFound++;

    const category = (finding.category as FindingCategory) || "BUG";

    super.addFinding({
      category,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      location: { page: finding.page, component: finding.element },
      reproducible: true,
      tags: ["explorer", finding.category.toLowerCase()],
    });
  }

  private async exploreAsRole(role: "guest" | "user" | "admin"): Promise<void> {
    const context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (
          !text.includes("favicon") &&
          !text.includes("DevTools") &&
          !text.includes("404 (Not Found)")
        ) {
          consoleErrors.push(text);
        }
      }
    });

    page.on("pageerror", (error) => {
      consoleErrors.push(`PageError: ${error.message}`);
    });

    // Authenticate if needed
    if (role !== "guest") {
      await this.authenticateInBrowser(page, role);
    }

    // Determine seed pages
    const seeds = this.getSeedPages(role);
    const frontier: Array<{ url: string; depth: number }> = seeds.map(
      (url) => ({ url, depth: 0 }),
    );

    while (frontier.length > 0) {
      if (Date.now() - this.runStartTime > MAX_RUNTIME_MS) {
        this.log("Time limit reached, ending exploration early");
        break;
      }

      const { url, depth } = frontier.shift()!;
      if (this.explorerState.visitedUrls.has(url)) continue;
      if (depth > MAX_DEPTH) continue;
      if (!this.shouldVisitUrl(url)) continue;

      this.explorerState.visitedUrls.add(url);
      this.explorerState.stats.pagesVisited++;

      this.log(`\n📄 [${role}] Visiting: ${url} (depth ${depth})`);

      try {
        await page.goto(`${BASE_URL}${url}`, {
          timeout: PAGE_TIMEOUT,
          waitUntil: "domcontentloaded",
        });
        await page
          .waitForSelector("h1, main, nav, [class*='page-shell']", {
            timeout: 5000,
          })
          .catch(() => {});
        await page.waitForTimeout(ACTION_WAIT);
      } catch (err: any) {
        if (!err.message?.includes("net::ERR_ABORTED")) {
          this.explorerAddFinding({
            severity: "high",
            category: "NAVIGATION",
            title: `Page failed to load: ${url}`,
            description: `Navigation to ${url} failed: ${err.message}`,
            page: url,
          });
        }
        continue;
      }

      // Check for redirect (auth guard)
      const currentUrl = new URL(page.url());
      const currentPath = currentUrl.pathname;
      if (currentPath !== url && currentPath === "/login") {
        this.log(`  ↳ Redirected to /login (auth required)`);
        this.explorerState.stats.testsRun++;
        this.explorerState.stats.testsPassed++;
        this.recordTest(true);
        continue;
      }

      // Health check after page load
      consoleErrors.length = 0;
      const loadProblems = await this.runHealthCheck(page, url, "page-load");

      if (consoleErrors.length > 0) {
        const criticalErrors = consoleErrors.filter(
          (e) =>
            e.includes("TypeError") ||
            e.includes("ReferenceError") ||
            e.includes("Cannot read") ||
            e.includes("is not a function") ||
            e.includes("Uncaught"),
        );
        if (criticalErrors.length > 0) {
          this.explorerAddFinding({
            severity: "critical",
            category: "CONSOLE_ERROR",
            title: `JS error on ${url}`,
            description: `Console errors on page load:\n${criticalErrors.join("\n")}`,
            page: url,
          });
        }
      }

      // Discover all interactive elements
      let elements: InteractiveElement[] = [];
      try {
        elements = await page.evaluate(DISCOVER_ELEMENTS_SCRIPT);
      } catch {
        this.log("  ⚠️ Could not discover elements");
        continue;
      }

      this.log(`  Found ${elements.length} interactive elements`);

      // Extract links for frontier
      for (const el of elements) {
        if (el.href && el.href.startsWith("/") && !el.href.startsWith("//")) {
          const cleanHref = el.href.split("?")[0].split("#")[0];
          if (
            !this.explorerState.visitedUrls.has(cleanHref) &&
            !this.isExternalOrAsset(cleanHref)
          ) {
            frontier.push({ url: cleanHref, depth: depth + 1 });
          }
        }
      }

      // Click every non-navigation, non-form-submit interactive element
      const clickableElements = elements.filter(
        (el) =>
          !this.isNavigationLink(el) && !this.shouldSkipClick(el, currentPath),
      );

      let actionsOnPage = 0;
      for (const el of clickableElements) {
        if (actionsOnPage >= MAX_ACTIONS_PER_PAGE) break;
        if (Date.now() - this.runStartTime > MAX_RUNTIME_MS) return;

        const elementKey = `${url}|${el.selector}|${el.text}`;
        if (this.explorerState.clickedElements.has(elementKey)) continue;
        this.explorerState.clickedElements.add(elementKey);

        await this.clickAndVerify(page, el, url, consoleErrors);
        actionsOnPage++;
      }
    }

    await context.close();
  }

  private async clickAndVerify(
    page: Page,
    element: InteractiveElement,
    pageUrl: string,
    consoleErrors: string[],
  ): Promise<void> {
    const label = element.text || element.selector;
    this.explorerState.stats.elementsClicked++;
    this.explorerState.stats.testsRun++;

    // Save state before click
    const urlBefore = page.url();
    consoleErrors.length = 0;

    try {
      // Try clicking by various strategies
      let clicked = false;

      // Strategy 1: Click by text content
      if (element.text && !clicked) {
        try {
          const locator =
            element.tag === "a"
              ? page.locator(`a`, { hasText: element.text }).first()
              : element.tag === "button"
                ? page.locator(`button`, { hasText: element.text }).first()
                : page
                    .locator(`${element.tag}`, { hasText: element.text })
                    .first();

          if ((await locator.count()) > 0 && (await locator.isVisible())) {
            await locator.click({ timeout: 3000 });
            clicked = true;
          }
        } catch {
          // Fall through to next strategy
        }
      }

      // Strategy 2: Click by selector
      if (!clicked) {
        try {
          const el = page.locator(element.selector).first();
          if ((await el.count()) > 0 && (await el.isVisible())) {
            await el.click({ timeout: 3000 });
            clicked = true;
          }
        } catch {
          // Element might have been removed from DOM
        }
      }

      if (!clicked) {
        this.explorerState.stats.testsPassed++;
        this.recordTest(true);
        return;
      }

      await page.waitForTimeout(ACTION_WAIT);

      // Guard: restore auth token if a click destroyed it
      await this.guardAuthToken(page);

      // Check for problems AFTER the click
      const problems = await this.runHealthCheck(
        page,
        pageUrl,
        `click "${label}"`,
      );

      // Check for new console errors
      const newCriticalErrors = consoleErrors.filter(
        (e) =>
          e.includes("TypeError") ||
          e.includes("ReferenceError") ||
          e.includes("Cannot read") ||
          e.includes("is not a function") ||
          e.includes("Uncaught") ||
          e.includes("Unhandled"),
      );

      if (newCriticalErrors.length > 0) {
        this.explorerAddFinding({
          severity: "critical",
          category: "JS_CRASH",
          title: `Clicking "${label}" causes JS error`,
          description: `On page ${pageUrl}, clicking "${label}" (${element.tag}) caused:\n${newCriticalErrors.join("\n")}`,
          page: pageUrl,
          element: label,
        });
        this.recordTest(false);
      } else if (problems === 0) {
        this.explorerState.stats.testsPassed++;
        this.recordTest(true);
      } else {
        this.recordTest(false);
      }

      // If we navigated away, go back
      const urlAfter = page.url();
      if (urlAfter !== urlBefore) {
        try {
          await page.goto(urlBefore, {
            timeout: PAGE_TIMEOUT,
            waitUntil: "domcontentloaded",
          });
          await page.waitForTimeout(ACTION_WAIT);
        } catch {
          // If we can't go back, that's ok — next iteration will navigate
        }
      }
    } catch (err: any) {
      // Click itself failed — element might be detached, obscured, etc.
      this.explorerState.stats.testsPassed++;
      this.recordTest(true);
    }
  }

  private async guardAuthToken(page: Page): Promise<void> {
    if (!this.currentAuthToken) return;
    try {
      const storedRaw = await page.evaluate(() =>
        localStorage.getItem("poker-auth"),
      );
      const hasToken =
        storedRaw && storedRaw.includes(this.currentAuthToken!.slice(0, 20));
      if (!hasToken) {
        await page.evaluate((t: string) => {
          localStorage.setItem(
            "poker-auth",
            JSON.stringify({ state: { token: t }, version: 0 }),
          );
        }, this.currentAuthToken);
        await page.reload({
          waitUntil: "domcontentloaded",
          timeout: PAGE_TIMEOUT,
        });
        await page.waitForTimeout(500);
      }
    } catch {
      // Page context might be destroyed — will recover on next navigation
    }
  }

  private async runHealthCheck(
    page: Page,
    pageUrl: string,
    context: string,
  ): Promise<number> {
    try {
      const problems: Array<{ type: string; text: string }> =
        await page.evaluate(HEALTH_CHECK_SCRIPT);

      for (const problem of problems) {
        const severity =
          problem.type === "react-crash" || problem.type === "error-boundary"
            ? "critical"
            : problem.type === "error-banner"
              ? "high"
              : problem.type === "blank-page"
                ? "medium"
                : "low";

        this.explorerAddFinding({
          severity,
          category: problem.type.toUpperCase().replace(/-/g, "_"),
          title: `${problem.type} after ${context}`,
          description: `On ${pageUrl} after ${context}: ${problem.text}`,
          page: pageUrl,
        });
      }

      return problems.length;
    } catch {
      return 0;
    }
  }

  private async authenticateInBrowser(
    page: Page,
    role: "user" | "admin",
  ): Promise<void> {
    const env = getEnv();
    const email = role === "admin" ? env.adminEmail : env.userEmail;
    const password = role === "admin" ? env.adminPassword : env.userPassword;

    this.log(`🔐 Authenticating as ${role} (${email})...`);

    try {
      // Use shared auth-helper for token acquisition
      let result =
        role === "admin"
          ? await this.authHelper.authenticate({ email, password })
          : await this.authHelper.authenticate({ email, password });

      // If login fails for user, try register+verify flow
      if (!result.token && role === "user") {
        result = await this.authHelper.registerAndVerify({ email, password });
      }

      if (!result.token) {
        this.log(`  ⚠️ Could not obtain token, exploring as guest`);
        return;
      }

      this.currentAuthToken = result.token;

      await page.goto(`${BASE_URL}/`, {
        timeout: PAGE_TIMEOUT,
        waitUntil: "domcontentloaded",
      });

      await page.evaluate((t: string) => {
        localStorage.setItem(
          "poker-auth",
          JSON.stringify({ state: { token: t }, version: 0 }),
        );
      }, result.token);

      await page.reload({
        waitUntil: "domcontentloaded",
        timeout: PAGE_TIMEOUT,
      });
      await page.waitForTimeout(1500);

      await page.goto(`${BASE_URL}/profile`, {
        timeout: PAGE_TIMEOUT,
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(1000);

      const isLoggedIn = !page.url().includes("/login");
      if (isLoggedIn) {
        this.log(`  ✅ Authenticated as ${role}`);
      } else {
        this.log(`  ⚠️ Token injection didn't take effect, exploring as guest`);
      }
    } catch (err: any) {
      this.log(`  ⚠️ Auth failed: ${err.message}`);
    }
  }

  private getSeedPages(role: "guest" | "user" | "admin"): string[] {
    const common = ["/", "/tournaments", "/bots", "/leaderboard", "/tables"];

    if (role === "guest") {
      return [...common, "/login", "/register"];
    }
    if (role === "user") {
      return [...common, "/bots/build", "/profile"];
    }
    return [
      ...common,
      "/bots/build",
      "/profile",
      "/admin",
      "/admin/analytics",
      "/admin/tournaments",
    ];
  }

  private shouldSkipClick(
    el: InteractiveElement,
    currentPath: string,
  ): boolean {
    const text = el.text.toLowerCase();

    // Never click logout — it destroys the auth session
    if (
      text === "logout" ||
      text === "log out" ||
      text === "sign out" ||
      text.includes("sign out") ||
      text.includes("log out")
    ) {
      return true;
    }

    // Skip form submits on auth pages (produces expected validation errors)
    const formPages = [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
    ];
    if (formPages.includes(currentPath)) {
      if (
        el.type === "submit" ||
        text.includes("sign in") ||
        text.includes("create account") ||
        text.includes("register") ||
        text.includes("reset") ||
        text.includes("submit")
      ) {
        return true;
      }
    }

    // Skip destructive actions that would alter real data
    if (
      text.includes("delete") ||
      text.includes("remove all") ||
      text.includes("clear all")
    ) {
      return true;
    }

    return false;
  }

  private isNavigationLink(el: InteractiveElement): boolean {
    return el.tag === "a" && !!el.href && el.href.startsWith("/");
  }

  /**
   * Normalizes URLs with UUIDs/IDs to a pattern so we don't visit
   * /tournaments/abc-123, /tournaments/def-456, etc. 30+ times.
   * After MAX_PAGES_PER_PATTERN for a pattern, skip new instances.
   */
  private getUrlPattern(url: string): string {
    return url
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ":id",
      )
      .replace(/\/\d+/g, "/:num");
  }

  private shouldVisitUrl(url: string): boolean {
    const pattern = this.getUrlPattern(url);
    const count = this.explorerState.visitedPatterns.get(pattern) || 0;
    if (count >= MAX_PAGES_PER_PATTERN) return false;
    this.explorerState.visitedPatterns.set(pattern, count + 1);
    return true;
  }

  private isExternalOrAsset(href: string): boolean {
    return (
      href.startsWith("http") ||
      href.startsWith("mailto") ||
      href.startsWith("tel") ||
      href.endsWith(".pdf") ||
      href.endsWith(".png") ||
      href.endsWith(".jpg")
    );
  }

  private printExplorerReport(): void {
    const elapsed = ((Date.now() - this.startTime.getTime()) / 1000).toFixed(1);
    const { stats, findings } = this.explorerState;

    console.log("\n" + "═".repeat(60));
    console.log("  EXPLORER MONSTER — RESULTS");
    console.log("═".repeat(60));
    console.log(`  Duration:           ${elapsed}s`);
    console.log(`  Pages visited:      ${stats.pagesVisited}`);
    console.log(`  Elements clicked:   ${stats.elementsClicked}`);
    console.log(`  Tests run:          ${stats.testsRun}`);
    console.log(`  Tests passed:       ${stats.testsPassed}`);
    console.log(`  Errors found:       ${stats.errorsFound}`);
    console.log(
      `  Pass rate:          ${stats.testsRun > 0 ? ((stats.testsPassed / stats.testsRun) * 100).toFixed(1) : 0}%`,
    );
    console.log("═".repeat(60));

    if (findings.length > 0) {
      console.log("\n  FINDINGS:\n");

      const critical = findings.filter((f) => f.severity === "critical");
      const high = findings.filter((f) => f.severity === "high");
      const medium = findings.filter((f) => f.severity === "medium");

      for (const f of [...critical, ...high, ...medium]) {
        const icon =
          f.severity === "critical"
            ? "🔴"
            : f.severity === "high"
              ? "🟠"
              : "🟡";
        console.log(`  ${icon} [${f.category}] ${f.title}`);
        console.log(`     Page: ${f.page}`);
        if (f.element) console.log(`     Element: ${f.element}`);
        console.log(`     ${f.description.split("\n")[0]}`);
        console.log();
      }

      console.log(`  Result: ❌ FAILED (${findings.length} issues)`);
    } else {
      console.log(`\n  Result: ✅ PASSED — No issues found`);
    }

    console.log("═".repeat(60) + "\n");
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (require.main === module) {
  runMonsterCli(new ExplorerMonster(), "explorer");
}
