/**
 * Monster Army - Browser Base Monster
 *
 * Shared base class for all Playwright-based browser monsters.
 * Eliminates duplication of:
 * - Browser launch / context creation
 * - Console error capture
 * - Page navigation with error handling
 * - Auth token injection into browser localStorage
 * - Common health-check DOM scripts
 *
 * Monsters that extend this get browser lifecycle managed automatically
 * via setup() and teardown(), and can focus on their specific test logic.
 */

import { Browser, BrowserContext, Page, chromium } from "playwright";
import { BaseMonster, MonsterConfig } from "./base-monster";
import { RunConfig, MonsterType, FindingCategory, Severity } from "./types";
import { createAuthHelper, AuthHelper } from "./auth-helper";
import { getEnv } from "./env-config";

// ============================================================================
// SHARED CONSTANTS
// ============================================================================

export const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
export const MOBILE_VIEWPORT = { width: 375, height: 667 };

const DEFAULT_NAV_TIMEOUT = 10_000;
const DEFAULT_WAIT_AFTER_NAV = 500;

const CONSOLE_NOISE_FILTERS = [
  "favicon",
  "[vite]",
  "DevTools",
  "404 (Not Found)",
  "net::ERR_ABORTED",
  "Download the React DevTools",
];

// ============================================================================
// SHARED HEALTH CHECK SCRIPT
// ============================================================================

/**
 * DOM-level health check injected after page loads or interactions.
 * Returns an array of { type, text, severity } problem descriptors.
 */
export const PAGE_HEALTH_CHECK_SCRIPT = `(() => {
  const problems = [];

  // React error overlay (dev mode crash)
  const reactError = document.getElementById('webpack-dev-server-client-overlay') ||
                     document.querySelector('[class*="react-error-overlay"]');
  if (reactError) {
    problems.push({ type: 'react-crash', text: 'React error overlay detected', severity: 'critical' });
  }

  // Error boundaries
  const errorBoundaries = document.querySelectorAll('[class*="ErrorBoundary"], [class*="error-boundary"]');
  for (const el of errorBoundaries) {
    const style = window.getComputedStyle(el);
    if (style.display !== 'none' && el.textContent?.trim()) {
      problems.push({ type: 'error-boundary', text: (el.textContent || '').slice(0, 120), severity: 'critical' });
    }
  }

  // Visible error banners / alerts
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
      problems.push({ type: 'error-banner', text: text.slice(0, 120), severity: 'high' });
    }
  }

  // Blank/empty page
  const body = document.body;
  const textContent = (body?.innerText || '').trim();
  if (textContent.length < 20) {
    problems.push({ type: 'blank-page', text: 'Page appears empty or blank', severity: 'medium' });
  }

  // Page title containing "error"
  if (document.title.toLowerCase().includes('error')) {
    problems.push({ type: 'error-title', text: document.title, severity: 'medium' });
  }

  // Broken images
  const images = document.querySelectorAll('img');
  let brokenImages = 0;
  for (const img of images) {
    if (img.naturalWidth === 0 && img.src && !img.src.includes('data:')) brokenImages++;
  }
  if (brokenImages > 0) {
    problems.push({ type: 'broken-images', text: brokenImages + ' broken image(s)', severity: 'medium' });
  }

  // Horizontal overflow
  if (document.documentElement.scrollWidth > window.innerWidth + 5) {
    problems.push({ type: 'overflow', text: 'Horizontal overflow detected', severity: 'low' });
  }

  return problems;
})()`;

// ============================================================================
// BROWSER BASE MONSTER
// ============================================================================

export interface BrowserMonsterConfig extends Partial<MonsterConfig> {
  name: string;
  type: MonsterType;
}

export abstract class BrowserBaseMonster extends BaseMonster {
  protected browser: Browser | null = null;
  protected authHelper: AuthHelper;
  private consoleErrors: string[] = [];

  constructor(config: BrowserMonsterConfig) {
    super({
      needsBrowser: true,
      needsServer: true,
      ...config,
    });
    this.authHelper = createAuthHelper();
  }

  // ============================================================================
  // LIFECYCLE — managed browser setup/teardown
  // ============================================================================

  protected async setup(runConfig: RunConfig): Promise<void> {
    this.browser = await this.launchBrowser();
    await this.onBrowserReady(runConfig);
  }

  protected async teardown(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.authHelper.reset();
  }

  /**
   * Override this instead of setup() to run initialization after browser is ready.
   */
  protected async onBrowserReady(_runConfig: RunConfig): Promise<void> {
    // Default: no-op. Subclasses can override.
  }

  // ============================================================================
  // BROWSER HELPERS
  // ============================================================================

  /**
   * Launch Chromium with standard config. Respects HEADLESS env var.
   */
  protected async launchBrowser(): Promise<Browser> {
    return chromium.launch({
      headless: process.env.HEADLESS !== "false",
    });
  }

  /**
   * Create a new browser context with the given viewport.
   */
  protected async createContext(
    viewport = DESKTOP_VIEWPORT,
    options: { isMobile?: boolean } = {},
  ): Promise<BrowserContext> {
    if (!this.browser) throw new Error("Browser not launched");
    return this.browser.newContext({
      viewport,
      ...(options.isMobile ? { isMobile: true } : {}),
    });
  }

  /**
   * Create a new page with console error capture set up.
   */
  protected async createPage(
    context: BrowserContext,
  ): Promise<{ page: Page; getConsoleErrors: () => string[] }> {
    const page = await context.newPage();
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (!CONSOLE_NOISE_FILTERS.some((f) => text.includes(f))) {
          errors.push(text);
        }
      }
    });

    page.on("pageerror", (error) => {
      errors.push(`PageError: ${error.message}`);
    });

    return {
      page,
      getConsoleErrors: () => [...errors],
    };
  }

  /**
   * Navigate to a page with error handling. Returns true if successful.
   */
  protected async navigateTo(
    page: Page,
    url: string,
    options: {
      timeout?: number;
      waitForSelector?: string;
      waitAfterNav?: number;
    } = {},
  ): Promise<boolean> {
    const {
      timeout = DEFAULT_NAV_TIMEOUT,
      waitForSelector = "h1, main, nav, [class*='page']",
      waitAfterNav = DEFAULT_WAIT_AFTER_NAV,
    } = options;

    const env = getEnv();
    const fullUrl = url.startsWith("http") ? url : `${env.frontendUrl}${url}`;

    try {
      await page.goto(fullUrl, {
        timeout,
        waitUntil: "domcontentloaded",
      });

      if (waitForSelector) {
        await page
          .waitForSelector(waitForSelector, { timeout: 5000 })
          .catch(() => {});
      }

      if (waitAfterNav > 0) {
        await page.waitForTimeout(waitAfterNav);
      }

      return true;
    } catch (err: any) {
      if (!err.message?.includes("net::ERR_ABORTED")) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: `Page failed to load: ${url}`,
          description: `Navigation to ${url} failed: ${err.message}`,
          location: { page: url },
          reproducible: true,
          tags: ["navigation", "page-load"],
        });
      }
      return false;
    }
  }

  /**
   * Run the shared health check script on the current page.
   * Returns the number of problems found and auto-adds findings.
   */
  protected async runHealthCheck(
    page: Page,
    pageUrl: string,
    context = "page-load",
  ): Promise<number> {
    try {
      const problems: Array<{
        type: string;
        text: string;
        severity: string;
      }> = await page.evaluate(PAGE_HEALTH_CHECK_SCRIPT);

      for (const problem of problems) {
        this.addFinding({
          category:
            (problem.type
              .toUpperCase()
              .replace(/-/g, "_") as FindingCategory) || "BUG",
          severity: (problem.severity as Severity) || "medium",
          title: `${problem.type} after ${context}`,
          description: `On ${pageUrl} after ${context}: ${problem.text}`,
          location: { page: pageUrl },
          reproducible: true,
          tags: ["health-check", problem.type],
        });
      }

      return problems.length;
    } catch {
      return 0;
    }
  }

  /**
   * Authenticate in the browser by injecting a token into localStorage.
   * Uses the shared auth-helper for token acquisition.
   */
  protected async authenticateInBrowser(
    page: Page,
    role: "user" | "admin",
  ): Promise<string | null> {
    const token =
      role === "admin"
        ? await this.authHelper.authenticateAsAdmin()
        : await this.authHelper.authenticateAsUser();

    if (!token) {
      this.log(`Could not obtain token for ${role}`);
      return null;
    }

    const env = getEnv();

    await page.goto(`${env.frontendUrl}/`, {
      timeout: DEFAULT_NAV_TIMEOUT,
      waitUntil: "domcontentloaded",
    });

    await page.evaluate((t: string) => {
      localStorage.setItem(
        "poker-auth",
        JSON.stringify({ state: { token: t }, version: 0 }),
      );
    }, token);

    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_NAV_TIMEOUT,
    });
    await page.waitForTimeout(1500);

    this.log(`Authenticated as ${role}`);
    return token;
  }

  /**
   * Ensure the auth token is still in localStorage after a navigation or click.
   */
  protected async guardAuthToken(page: Page, token: string): Promise<void> {
    try {
      const storedRaw = await page.evaluate(() =>
        localStorage.getItem("poker-auth"),
      );
      const hasToken = storedRaw && storedRaw.includes(token.slice(0, 20));
      if (!hasToken) {
        await page.evaluate((t: string) => {
          localStorage.setItem(
            "poker-auth",
            JSON.stringify({ state: { token: t }, version: 0 }),
          );
        }, token);
        await page.reload({
          waitUntil: "domcontentloaded",
          timeout: DEFAULT_NAV_TIMEOUT,
        });
        await page.waitForTimeout(500);
      }
    } catch {
      // Page context might be destroyed
    }
  }
}
