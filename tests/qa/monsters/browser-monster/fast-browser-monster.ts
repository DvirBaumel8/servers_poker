#!/usr/bin/env npx ts-node
/**
 * ⚡ FAST BROWSER QA MONSTER - Speed-Optimized Bug Finding
 *
 * Same bug detection, 10x faster:
 * - Parallel browser contexts for different test types
 * - Batch page evaluations
 * - Smart sampling (critical paths only)
 * - Skip redundant checks
 *
 * Target: < 60 seconds for comprehensive bug scan
 *
 * Run: npm run monsters:browser:fast
 */

import {
  BrowserBaseMonster,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  PAGE_HEALTH_CHECK_SCRIPT,
} from "../shared/browser-base-monster";
import { RunConfig, Severity } from "../shared/types";
import { runMonsterCli } from "../shared/cli-runner";

// ============================================================================
// CRITICAL PATHS TO TEST (Focused subset)
// ============================================================================

const CRITICAL_ROUTES = [
  { path: "/", name: "Home" },
  { path: "/login", name: "Login" },
  { path: "/tournaments", name: "Tournaments" },
  { path: "/tables", name: "Tables" },
  { path: "/bots/build", name: "Bot Builder" },
];

// ============================================================================
// BATCH CHECK SCRIPTS
// ============================================================================

const FORM_VALIDATION_CHECK = `
(() => {
  const issues = [];
  
  const forms = document.querySelectorAll('form');
  forms.forEach((form, idx) => {
    const inputs = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"])');
    inputs.forEach(input => {
      const name = input.getAttribute('name') || input.getAttribute('placeholder') || 'input';
      if (['email', 'password', 'username'].some(t => name.toLowerCase().includes(t))) {
        if (!input.hasAttribute('required') && !input.hasAttribute('aria-required')) {
          issues.push({ 
            severity: 'medium', 
            title: 'Missing Required', 
            desc: name + ' should be required' 
          });
        }
      }
    });
  });
  
  return issues;
})()
`;

const INTERACTIVE_ELEMENTS_CHECK = `
(() => {
  const issues = [];
  
  const buttons = document.querySelectorAll('button');
  buttons.forEach(btn => {
    const style = getComputedStyle(btn);
    if (style.opacity === '0' || style.visibility === 'hidden') {
      issues.push({ severity: 'medium', title: 'Hidden Interactive', desc: 'Button is invisible but in DOM' });
    }
  });
  
  const links = document.querySelectorAll('a[href="#"], a[href=""], a:not([href])');
  if (links.length > 0) {
    issues.push({ severity: 'low', title: 'Empty Links', desc: links.length + ' links without valid href' });
  }
  
  const clickables = document.querySelectorAll('button, a, input, select');
  let tooSmall = 0;
  clickables.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.width < 30 && rect.height < 30) {
      tooSmall++;
    }
  });
  if (tooSmall > 3) {
    issues.push({ severity: 'low', title: 'Small Touch Targets', desc: tooSmall + ' elements too small to tap' });
  }
  
  return issues;
})()
`;

// ============================================================================
// FAST BROWSER QA MONSTER
// ============================================================================

class FastBrowserMonster extends BrowserBaseMonster {
  constructor() {
    super({
      name: "Fast Browser QA",
      type: "fast-browser",
      timeout: 60000,
    });
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    console.log("\n" + "═".repeat(60));
    console.log("  ⚡ FAST BROWSER QA MONSTER");
    console.log("═".repeat(60));
    console.log("  Target: Bug scan in < 60 seconds\n");

    await Promise.all([
      this.runDesktopChecks(),
      this.runMobileChecks(),
      this.runFormChecks(),
    ]);
  }

  private async runDesktopChecks(): Promise<void> {
    const context = await this.createContext(DESKTOP_VIEWPORT);
    const { page, getConsoleErrors } = await this.createPage(context);

    console.log("  📍 Desktop checks...");

    for (const route of CRITICAL_ROUTES) {
      this.recordCheck();
      const loaded = await this.navigateTo(page, route.path);
      if (!loaded) continue;

      const issues = (await page.evaluate(PAGE_HEALTH_CHECK_SCRIPT)) as Array<{
        type: string;
        text: string;
        severity: string;
      }>;
      for (const issue of issues) {
        this.addFinding({
          category: "BUG",
          severity: issue.severity as Severity,
          title: issue.type,
          description: issue.text,
          location: { page: route.path },
          reproducible: true,
          tags: ["desktop", "health-check"],
        });
      }

      const interactiveIssues = (await page.evaluate(
        INTERACTIVE_ELEMENTS_CHECK,
      )) as Array<{ severity: string; title: string; desc: string }>;
      for (const issue of interactiveIssues) {
        this.addFinding({
          category: "BUG",
          severity: issue.severity as Severity,
          title: issue.title,
          description: issue.desc,
          location: { page: route.path },
          reproducible: true,
          tags: ["desktop", "interactive"],
        });
      }

      this.recordTest(true);
    }

    const consoleErrors = getConsoleErrors();
    for (const error of consoleErrors.slice(0, 5)) {
      const isInfiniteLoop = error.includes("Maximum update depth");
      this.addFinding({
        category: "BUG",
        severity: isInfiniteLoop ? "high" : "medium",
        title: isInfiniteLoop ? "React Infinite Loop" : "Console Error",
        description: error.slice(0, 100),
        location: { page: "console" },
        reproducible: true,
        tags: ["console"],
      });
    }

    console.log(`    ✓ ${CRITICAL_ROUTES.length} routes checked`);
    await context.close();
  }

  private async runMobileChecks(): Promise<void> {
    const context = await this.createContext(MOBILE_VIEWPORT, {
      isMobile: true,
    });
    const { page } = await this.createPage(context);

    console.log("  📍 Mobile checks...");

    for (const route of CRITICAL_ROUTES.slice(0, 2)) {
      this.recordCheck();
      const loaded = await this.navigateTo(page, route.path);
      if (!loaded) continue;

      const issues = (await page.evaluate(PAGE_HEALTH_CHECK_SCRIPT)) as Array<{
        type: string;
        text: string;
        severity: string;
      }>;
      for (const issue of issues) {
        this.addFinding({
          category: "BUG",
          severity: issue.severity as Severity,
          title: `Mobile: ${issue.type}`,
          description: issue.text,
          location: { page: route.path },
          reproducible: true,
          tags: ["mobile", "health-check"],
        });
      }

      this.recordTest(true);
    }

    console.log(`    ✓ Mobile responsive checked`);
    await context.close();
  }

  private async runFormChecks(): Promise<void> {
    const context = await this.createContext(DESKTOP_VIEWPORT);
    const { page } = await this.createPage(context);

    console.log("  📍 Form validation checks...");

    const formRoutes = ["/login", "/register"];
    for (const route of formRoutes) {
      this.recordCheck();
      const loaded = await this.navigateTo(page, route);
      if (!loaded) continue;

      const issues = (await page.evaluate(FORM_VALIDATION_CHECK)) as Array<{
        severity: string;
        title: string;
        desc: string;
      }>;
      for (const issue of issues) {
        this.addFinding({
          category: "BUG",
          severity: issue.severity as Severity,
          title: issue.title,
          description: issue.desc,
          location: { page: route },
          reproducible: true,
          tags: ["form-validation"],
        });
      }

      this.recordTest(true);
    }

    console.log(`    ✓ Form validation checked`);
    await context.close();
  }
}

// ============================================================================
// CLI
// ============================================================================

runMonsterCli(new FastBrowserMonster(), "fast-browser");

export { FastBrowserMonster };
