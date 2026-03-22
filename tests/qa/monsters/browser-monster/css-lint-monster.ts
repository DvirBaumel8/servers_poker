/**
 * CSS Lint Monster
 *
 * Analyzes CSS files for common UI/UX issues:
 * - Buttons without hover states
 * - Low contrast colors
 * - Missing cursor styles
 * - Elements that look disabled but aren't
 *
 * This catches the "Deactivate button looks disabled" bug.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { BaseMonster } from "../shared/base-monster";
import { RunConfig, MonsterType } from "../shared/types";
import { runMonsterCli } from "../shared";
import {
  checkCssForAccessibilityIssues,
  BUTTON_STYLE_EXPECTATIONS,
} from "./accessibility-checks";

const MONSTER_TYPE: MonsterType = "browser";

interface CssRule {
  selector: string;
  properties: Record<string, string>;
  raw: string;
}

export class CssLintMonster extends BaseMonster {
  private cssPath: string;
  private cssContent: string = "";

  constructor() {
    super({
      name: "CSS Lint Monster",
      type: MONSTER_TYPE,
      timeout: 30000,
      verbose: true,
    });
    this.cssPath = join(process.cwd(), "frontend/src/index.css");
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("Setting up CSS Lint Monster...");

    if (!existsSync(this.cssPath)) {
      throw new Error(`CSS file not found: ${this.cssPath}`);
    }

    this.cssContent = readFileSync(this.cssPath, "utf-8");
    this.log(
      `Loaded CSS file: ${this.cssPath} (${this.cssContent.length} bytes)`,
    );
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("\nAnalyzing CSS for UI/UX issues...\n");

    // Parse CSS rules
    const rules = this.parseCssRules(this.cssContent);
    this.log(`Found ${rules.length} CSS rules`);

    // Check button styles
    await this.checkButtonStyles(rules);

    // Check for accessibility issues
    await this.checkAccessibility(rules);

    // Check for missing interactive states
    await this.checkInteractiveStates(rules);

    this.printSummary();
  }

  protected async teardown(): Promise<void> {
    this.log("CSS Lint Monster complete");
  }

  private parseCssRules(css: string): CssRule[] {
    const rules: CssRule[] = [];

    // Simple CSS parser - extract selector { properties }
    const ruleRegex = /([^{}]+)\{([^{}]+)\}/g;
    let match;

    while ((match = ruleRegex.exec(css)) !== null) {
      const selector = match[1].trim();
      const propertiesRaw = match[2].trim();

      const properties: Record<string, string> = {};
      const propParts = propertiesRaw.split(";");

      for (const part of propParts) {
        const colonIdx = part.indexOf(":");
        if (colonIdx > 0) {
          const prop = part.slice(0, colonIdx).trim();
          const value = part.slice(colonIdx + 1).trim();
          properties[prop] = value;
        }
      }

      rules.push({ selector, properties, raw: propertiesRaw });
    }

    return rules;
  }

  private async checkButtonStyles(rules: CssRule[]): Promise<void> {
    this.log("\n📋 Checking button styles...");

    const buttonClasses = Object.keys(BUTTON_STYLE_EXPECTATIONS);

    for (const btnClass of buttonClasses) {
      const rule = rules.find((r) => r.selector === `.${btnClass}`);
      const hoverRule = rules.find(
        (r) =>
          r.selector === `.${btnClass}:hover` ||
          r.selector.includes(`.${btnClass}:hover`),
      );
      const focusRule = rules.find(
        (r) =>
          r.selector === `.${btnClass}:focus` ||
          r.selector.includes(`.${btnClass}:focus`),
      );

      if (!rule) {
        this.log(`  ⚠️  No rule found for .${btnClass}`);
        continue;
      }

      const expectations = BUTTON_STYLE_EXPECTATIONS[btnClass];
      const issues: string[] = [];

      // Check for hover state
      const hasHoverInTailwind = rule.raw.includes("hover:");
      if (!hoverRule && !hasHoverInTailwind) {
        issues.push("missing hover state");

        this.addFinding({
          category: "A11Y",
          severity: "high",
          title: `Button .${btnClass} has no hover state`,
          description: `The .${btnClass} button class does not define a :hover style. Users cannot tell when they're hovering over the button, making it appear non-interactive.`,
          location: { file: this.cssPath, component: `.${btnClass}` },
          reproducible: true,
          reproductionSteps: [
            `Open any page with a .${btnClass} button`,
            "Hover over the button",
            "Notice no visual change occurs",
          ],
          tags: ["css", "accessibility", "button", "hover"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }

      // Check for cursor pointer
      const hasCursorInTailwind = rule.raw.includes("cursor-pointer");
      const hasCursorProperty = rule.properties["cursor"] === "pointer";
      if (!hasCursorProperty && !hasCursorInTailwind) {
        issues.push("missing cursor:pointer");

        this.addFinding({
          category: "A11Y",
          severity: "medium",
          title: `Button .${btnClass} may lack cursor:pointer`,
          description: `The .${btnClass} button class does not explicitly set cursor:pointer. Depending on browser defaults, users may not see the pointer cursor when hovering.`,
          location: { file: this.cssPath, component: `.${btnClass}` },
          reproducible: true,
          tags: ["css", "accessibility", "button", "cursor"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }

      // Check for focus indicator
      const hasFocusInTailwind = rule.raw.includes("focus:");
      if (!focusRule && !hasFocusInTailwind) {
        issues.push("missing focus indicator");

        this.addFinding({
          category: "A11Y",
          severity: "high",
          title: `Button .${btnClass} has no focus indicator`,
          description: `The .${btnClass} button class does not define a :focus style. Keyboard users cannot see which element has focus. WCAG 2.4.7 requires visible focus.`,
          location: { file: this.cssPath, component: `.${btnClass}` },
          reproducible: true,
          reproductionSteps: [
            `Open any page with a .${btnClass} button`,
            "Tab to the button using keyboard",
            "Notice no visual focus ring appears",
          ],
          tags: ["css", "accessibility", "button", "focus", "wcag"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }

      // Check for low-opacity background that looks disabled
      if (rule.properties["background"]) {
        const bgMatch = rule.properties["background"].match(
          /rgba\([^)]+,\s*(0\.\d+)\)/,
        );
        if (bgMatch) {
          const alpha = parseFloat(bgMatch[1]);
          if (alpha < 0.35) {
            issues.push(
              `very low background opacity (${(alpha * 100).toFixed(0)}%)`,
            );

            this.addFinding({
              category: "BUG",
              severity: "high",
              title: `Button .${btnClass} looks disabled due to low opacity`,
              description: `The .${btnClass} button has a background with only ${(alpha * 100).toFixed(0)}% opacity (${rule.properties["background"]}). This makes the button appear disabled or non-interactive when it is actually clickable.`,
              location: { file: this.cssPath, component: `.${btnClass}` },
              evidence: {
                raw: {
                  background: rule.properties["background"],
                  alpha,
                },
              },
              reproducible: true,
              reproductionSteps: [
                `Navigate to a page with a .${btnClass} button (e.g., /bots page "Deactivate" button)`,
                "Observe the button appears faded/disabled",
                "Click the button - it actually works",
              ],
              tags: ["css", "ux", "button", "contrast", "disabled-appearance"],
            });
            this.recordTest(false);
          } else {
            this.recordTest(true);
          }
        }
      }

      // Log summary for this button
      if (issues.length > 0) {
        this.log(`  ❌ .${btnClass}: ${issues.join(", ")}`);
      } else {
        this.log(`  ✅ .${btnClass}: all checks passed`);
      }
    }
  }

  private async checkAccessibility(rules: CssRule[]): Promise<void> {
    this.log("\n📋 Checking accessibility patterns...");

    // Use the existing checker
    const issues = checkCssForAccessibilityIssues(this.cssContent);

    for (const issue of issues) {
      this.addFinding({
        category: issue.wcagViolation ? "A11Y" : "BUG",
        severity: issue.severity,
        title: `${issue.type}: ${issue.element}`,
        description: issue.description,
        location: { file: this.cssPath, component: issue.element },
        reproducible: true,
        tags: ["css", "accessibility", issue.type],
      });
      this.recordTest(false);
      this.log(`  ❌ ${issue.element}: ${issue.description}`);
    }

    if (issues.length === 0) {
      this.log("  ✅ No accessibility issues found in CSS patterns");
      this.recordTest(true);
    }
  }

  private async checkInteractiveStates(rules: CssRule[]): Promise<void> {
    this.log("\n📋 Checking interactive states...");

    // Find all button/link classes that should have interactive states
    const interactiveSelectors = rules
      .filter(
        (r) => r.selector.startsWith(".btn") || r.selector.includes("button"),
      )
      .map((r) => r.selector);

    for (const selector of interactiveSelectors) {
      // Skip pseudo-selectors themselves
      if (selector.includes(":")) continue;

      const hasHover = rules.some(
        (r) =>
          r.selector === `${selector}:hover` ||
          r.selector.startsWith(`${selector}:hover`),
      );
      const hasActive = rules.some(
        (r) =>
          r.selector === `${selector}:active` ||
          r.selector.startsWith(`${selector}:active`),
      );

      // Check if hover is defined via Tailwind in the base rule
      const baseRule = rules.find((r) => r.selector === selector);
      const hasTailwindHover = baseRule?.raw.includes("hover:") ?? false;

      if (!hasHover && !hasTailwindHover) {
        this.log(`  ⚠️  ${selector} has no :hover state`);
      } else {
        this.log(`  ✅ ${selector} has hover state`);
      }
    }
  }

  private printSummary(): void {
    this.log("\n" + "═".repeat(60));
    this.log("  CSS LINT MONSTER SUMMARY");
    this.log("═".repeat(60));
    this.log(`Tests run: ${this.testsRun}`);
    this.log(`Passed: ${this.testsPassed}`);
    this.log(`Failed: ${this.testsFailed}`);
    this.log(`Findings: ${this.findings.length}`);
  }
}

// CLI runner
if (require.main === module) {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  🎨 CSS LINT MONSTER                                             ║
║                                                                  ║
║  Analyzes CSS for UI/UX issues:                                  ║
║  - Buttons without hover states                                  ║
║  - Low contrast / disabled-looking elements                      ║
║  - Missing cursor styles                                         ║
║  - Missing focus indicators                                      ║
╚══════════════════════════════════════════════════════════════════╝
`);

  runMonsterCli(new CssLintMonster(), MONSTER_TYPE);
}
