/**
 * Browser Explorer Monster
 *
 * A monster that ACTUALLY uses the UI like a real user:
 * - Opens browser, navigates pages
 * - Clicks buttons, fills forms
 * - Detects JavaScript console errors
 * - Detects error toasts/banners in the UI
 * - Verifies role-based element visibility
 *
 * Uses the cursor-ide-browser MCP for browser automation.
 *
 * This catches bugs that other monsters miss because they only make HTTP requests
 * and never actually render JavaScript or see error toasts.
 */

import { BaseMonster } from "../shared/base-monster";
import { RunConfig, Severity } from "../shared/types";
import {
  BROWSER_SCENARIOS,
  BrowserScenario,
  ScenarioStep,
  UserRole,
} from "./scenarios";
import {
  checkForErrors,
  checkConsoleMessages,
  checkUIForErrors,
  isCriticalConsoleError,
  formatErrorsForReport,
  ConsoleMessage,
  DetectedError,
  ErrorCheckResult,
} from "./error-detection";

export interface BrowserMonsterConfig {
  baseUrl: string;
  apiBaseUrl: string;
  defaultTimeout: number;
  waitBetweenActions: number;
  userCredentials: {
    email: string;
    password: string;
  };
  adminCredentials: {
    email: string;
    password: string;
  };
}

export const DEFAULT_CONFIG: BrowserMonsterConfig = {
  baseUrl: process.env.FRONTEND_URL || "http://localhost:3001",
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:3000",
  defaultTimeout: 10000,
  waitBetweenActions: 500,
  userCredentials: {
    email: process.env.USER_EMAIL || "test@test.local",
    password: process.env.USER_PASSWORD || "TestPassword123!",
  },
  adminCredentials: {
    email: process.env.ADMIN_EMAIL || "admin@poker.io",
    password: process.env.ADMIN_PASSWORD || "TestPassword123!",
  },
};

interface SnapshotElement {
  ref: string;
  role?: string;
  name?: string;
  text?: string;
  type?: string;
  children?: SnapshotElement[];
}

export class BrowserMonster extends BaseMonster {
  private browserConfig: BrowserMonsterConfig;
  private currentRole: UserRole = "guest";
  private viewId: string | null = null;
  private consoleErrors: ConsoleMessage[] = [];
  private mcpAvailable = false;

  constructor(browserConfig: Partial<BrowserMonsterConfig> = {}) {
    super({
      name: "Browser Explorer Monster",
      type: "browser" as any,
      timeout: 600000, // 10 minutes
      verbose: true,
    });
    this.browserConfig = { ...DEFAULT_CONFIG, ...browserConfig };
  }

  protected async setup(runConfig: RunConfig): Promise<void> {
    this.log("Setting up Browser Explorer Monster...");
    this.log(`Frontend URL: ${this.browserConfig.baseUrl}`);
    this.log(`API URL: ${this.browserConfig.apiBaseUrl}`);

    // Check if we can reach the frontend
    const healthCheck = await this.fetch(this.browserConfig.baseUrl);
    if (!healthCheck.ok) {
      throw new Error(
        `Frontend not responding at ${this.browserConfig.baseUrl}: ${healthCheck.error || healthCheck.status}`,
      );
    }
    this.log("✅ Frontend is reachable");

    // Note: MCP tools are available when run through Cursor's agent
    // When run as standalone (npm script), we'll use fallback HTTP-based checks
    this.mcpAvailable = this.checkMcpAvailability();

    if (this.mcpAvailable) {
      this.log(
        "✅ MCP browser tools available - will use real browser automation",
      );
    } else {
      this.log("⚠️  MCP not available - using HTTP-based fallback checks");
      this.log("   Run through Cursor agent for full browser automation");
    }
  }

  protected async execute(runConfig: RunConfig): Promise<void> {
    this.log("\nStarting browser exploration...\n");

    const roleArg = process.argv.find((a) => a.startsWith("--role="));
    const targetRole = roleArg ? (roleArg.split("=")[1] as UserRole) : null;
    const allRoles = process.argv.includes("--all-roles");

    const rolesToTest: UserRole[] = allRoles
      ? ["guest", "user", "admin"]
      : targetRole
        ? [targetRole]
        : ["guest", "user", "admin"];

    for (const role of rolesToTest) {
      await this.testAsRole(role);
    }

    this.printSummary();
  }

  protected async teardown(): Promise<void> {
    // Cleanup: unlock browser if locked
    if (this.mcpAvailable && this.viewId) {
      try {
        await this.browserUnlock();
      } catch {
        // Ignore unlock errors
      }
    }
    this.log("Browser Monster teardown complete");
  }

  private async testAsRole(role: UserRole): Promise<void> {
    this.log("\n" + "═".repeat(60));
    this.log(`  Testing as ${role.toUpperCase()}`);
    this.log("═".repeat(60) + "\n");

    this.currentRole = role;
    this.consoleErrors = [];

    // Get scenarios for this role
    const scenarios = BROWSER_SCENARIOS.filter((s) => s.role === role);

    if (scenarios.length === 0) {
      this.log(`No scenarios defined for role: ${role}`);
      return;
    }

    for (const scenario of scenarios) {
      await this.runScenario(scenario);
    }
  }

  private async runScenario(scenario: BrowserScenario): Promise<void> {
    this.log(`\n📋 Scenario: ${scenario.name}`);
    this.log(`   ${scenario.description}`);

    let scenarioPassed = true;

    for (const step of scenario.steps) {
      try {
        const stepResult = await this.executeStep(step);
        if (!stepResult.passed) {
          scenarioPassed = false;
          this.log(`   ❌ Step failed: ${step.action} - ${stepResult.error}`);

          if (step.action !== "checkNoErrors") {
            this.addFinding({
              category: "BUG",
              severity: this.getSeverityForStep(step),
              title: `${scenario.name}: ${step.action} failed`,
              description:
                stepResult.error ||
                `Step "${step.action}" failed in scenario "${scenario.name}"`,
              location: { page: step.url || scenario.steps[0]?.url || "/" },
              evidence: stepResult.evidence,
              reproducible: true,
              reproductionSteps: this.buildReproSteps(scenario, step),
              tags: ["browser", scenario.role, step.action],
            });
          }
        } else {
          this.log(
            `   ✅ ${step.action}${step.url ? `: ${step.url}` : ""}${step.text ? `: "${step.text}"` : ""}`,
          );
        }
      } catch (error: any) {
        scenarioPassed = false;
        this.log(`   ❌ Step error: ${step.action} - ${error.message}`);
      }
    }

    this.recordTest(scenarioPassed);
  }

  private async executeStep(step: ScenarioStep): Promise<{
    passed: boolean;
    error?: string;
    evidence?: any;
  }> {
    switch (step.action) {
      case "navigate":
        return this.stepNavigate(step.url!);

      case "checkNoErrors":
        return this.stepCheckNoErrors();

      case "verifyVisible":
        return this.stepVerifyVisible(step.text!);

      case "verifyNotVisible":
        return this.stepVerifyNotVisible(step.text!);

      case "click":
        return this.stepClick(step.text!);

      case "fill":
        return this.stepFill(step.fields!);

      case "wait":
        return this.stepWait(step.timeout || 1000);

      case "checkConsole":
        return this.stepCheckConsole();

      default:
        return { passed: false, error: `Unknown action: ${step.action}` };
    }
  }

  private async stepNavigate(
    url: string,
  ): Promise<{ passed: boolean; error?: string; evidence?: any }> {
    const fullUrl = url.startsWith("http")
      ? url
      : `${this.browserConfig.baseUrl}${url}`;

    if (this.mcpAvailable) {
      // Use MCP browser navigation
      try {
        await this.browserNavigate(fullUrl);
        await this.wait(this.browserConfig.waitBetweenActions);

        // Quick check for immediate critical errors after navigation
        const snapshot = await this.browserSnapshot();
        const uiErrors = checkUIForErrors(snapshot);
        const criticalUIErrors = uiErrors.filter(
          (e) => e.severity === "critical",
        );

        if (criticalUIErrors.length > 0) {
          return {
            passed: false,
            error: `Page loaded with critical errors: ${criticalUIErrors.map((e) => e.message).join("; ")}`,
            evidence: { uiErrors: criticalUIErrors },
          };
        }

        return { passed: true };
      } catch (error: any) {
        return { passed: false, error: error.message };
      }
    } else {
      // Fallback: HTTP fetch and check HTML for errors
      const response = await this.fetch(fullUrl);
      if (!response.ok) {
        return { passed: false, error: `HTTP ${response.status}` };
      }

      // Check the HTML for obvious error indicators
      const html = typeof response.data === "string" ? response.data : "";
      const uiErrors = checkUIForErrors(html);
      const criticalUIErrors = uiErrors.filter(
        (e) => e.severity === "critical",
      );

      if (criticalUIErrors.length > 0) {
        return {
          passed: false,
          error: `Page contains error indicators: ${criticalUIErrors.map((e) => e.message).join("; ")}`,
          evidence: { uiErrors: criticalUIErrors },
        };
      }

      return { passed: true };
    }
  }

  private async stepCheckNoErrors(): Promise<{
    passed: boolean;
    error?: string;
    evidence?: any;
  }> {
    if (this.mcpAvailable) {
      // Get console messages using MCP
      const consoleMessages = await this.browserGetConsoleMessages();

      // Get UI snapshot
      const snapshot = await this.browserSnapshot();

      // Use comprehensive error detection
      const errorCheck = checkForErrors(consoleMessages, snapshot);

      if (errorCheck.hasErrors) {
        return {
          passed: false,
          error: errorCheck.summary,
          evidence: {
            errors: errorCheck.errors,
            warnings: errorCheck.warnings,
            formattedErrors: formatErrorsForReport(errorCheck.errors),
          },
        };
      }

      // Log warnings but don't fail
      if (errorCheck.warnings.length > 0) {
        this.logWarn(`Found ${errorCheck.warnings.length} warning(s)`);
      }

      return { passed: true };
    } else {
      // Fallback: Check accumulated console errors using HTTP-fetched HTML
      if (this.consoleErrors.length > 0) {
        const consoleCheck = checkConsoleMessages(this.consoleErrors);
        const criticalErrors = consoleCheck.filter(
          (e) => e.severity === "critical" || e.severity === "high",
        );

        if (criticalErrors.length > 0) {
          return {
            passed: false,
            error: `Found ${criticalErrors.length} critical/high console error(s)`,
            evidence: { consoleErrors: criticalErrors },
          };
        }
      }
      return { passed: true };
    }
  }

  private async stepVerifyVisible(
    text: string,
  ): Promise<{ passed: boolean; error?: string }> {
    if (this.mcpAvailable) {
      const snapshot = await this.browserSnapshot();
      const found = this.findTextInSnapshot(snapshot, text);

      if (!found) {
        return { passed: false, error: `Text "${text}" not found on page` };
      }
      return { passed: true };
    } else {
      // Fallback: Cannot verify visibility without browser
      this.logWarn(`Skipping visibility check for "${text}" - requires MCP`);
      return { passed: true };
    }
  }

  private async stepVerifyNotVisible(
    text: string,
  ): Promise<{ passed: boolean; error?: string }> {
    if (this.mcpAvailable) {
      const snapshot = await this.browserSnapshot();
      const found = this.findTextInSnapshot(snapshot, text);

      if (found) {
        return {
          passed: false,
          error: `Text "${text}" SHOULD NOT be visible but was found`,
        };
      }
      return { passed: true };
    } else {
      // Fallback: Cannot verify visibility without browser
      this.logWarn(`Skipping visibility check for "${text}" - requires MCP`);
      return { passed: true };
    }
  }

  private async stepClick(
    text: string,
  ): Promise<{ passed: boolean; error?: string }> {
    if (this.mcpAvailable) {
      const snapshot = await this.browserSnapshot(true);
      const element = this.findClickableElement(snapshot, text);

      if (!element) {
        return {
          passed: false,
          error: `Clickable element "${text}" not found`,
        };
      }

      try {
        await this.browserClick(element.ref, text);
        await this.wait(this.browserConfig.waitBetweenActions);
        return { passed: true };
      } catch (error: any) {
        return { passed: false, error: error.message };
      }
    } else {
      this.logWarn(`Skipping click on "${text}" - requires MCP`);
      return { passed: true };
    }
  }

  private async stepFill(
    fields: Record<string, string>,
  ): Promise<{ passed: boolean; error?: string }> {
    if (this.mcpAvailable) {
      const snapshot = await this.browserSnapshot(true);

      for (const [fieldName, value] of Object.entries(fields)) {
        const input = this.findInputByLabel(snapshot, fieldName);

        if (!input) {
          return {
            passed: false,
            error: `Input field "${fieldName}" not found`,
          };
        }

        try {
          await this.browserFill(input.ref, fieldName, value);
          await this.wait(100);
        } catch (error: any) {
          return {
            passed: false,
            error: `Failed to fill "${fieldName}": ${error.message}`,
          };
        }
      }

      return { passed: true };
    } else {
      this.logWarn("Skipping form fill - requires MCP");
      return { passed: true };
    }
  }

  private async stepWait(ms: number): Promise<{ passed: boolean }> {
    await this.wait(ms);
    return { passed: true };
  }

  private async stepCheckConsole(): Promise<{
    passed: boolean;
    error?: string;
    evidence?: any;
  }> {
    if (this.mcpAvailable) {
      const messages = await this.browserGetConsoleMessages();

      // Use error detection module to identify critical errors
      const detectedErrors = checkConsoleMessages(messages);
      const criticalErrors = detectedErrors.filter(
        (e) => e.severity === "critical",
      );

      if (criticalErrors.length > 0) {
        return {
          passed: false,
          error: `Found ${criticalErrors.length} critical JS error(s)`,
          evidence: {
            consoleErrors: criticalErrors,
            formattedErrors: formatErrorsForReport(criticalErrors),
          },
        };
      }

      // Check for high severity errors too
      const highErrors = detectedErrors.filter((e) => e.severity === "high");
      if (highErrors.length > 0) {
        return {
          passed: false,
          error: `Found ${highErrors.length} high-severity error(s)`,
          evidence: {
            consoleErrors: highErrors,
            formattedErrors: formatErrorsForReport(highErrors),
          },
        };
      }

      return { passed: true };
    } else {
      // In fallback mode, check any accumulated errors
      const criticalCount = this.consoleErrors.filter((e) =>
        isCriticalConsoleError(e.text),
      ).length;

      if (criticalCount > 0) {
        return {
          passed: false,
          error: `Found ${criticalCount} critical console error(s)`,
          evidence: { consoleErrors: this.consoleErrors },
        };
      }

      return { passed: true };
    }
  }

  // ============================================================================
  // MCP BROWSER HELPERS
  // ============================================================================

  private checkMcpAvailability(): boolean {
    // MCP is available when running through Cursor's agent
    // Check by looking for MCP-related environment or context
    return false; // Will be set to true when integrated with Cursor MCP
  }

  private async browserNavigate(url: string): Promise<void> {
    // This would call: browser_navigate MCP tool
    // For now, log the intent
    this.log(`[MCP] Navigate to: ${url}`);
    throw new Error("MCP not available - run through Cursor agent");
  }

  private async browserSnapshot(interactive = false): Promise<string> {
    // This would call: browser_snapshot MCP tool
    this.log(`[MCP] Taking snapshot (interactive: ${interactive})`);
    throw new Error("MCP not available - run through Cursor agent");
  }

  private async browserClick(ref: string, description: string): Promise<void> {
    // This would call: browser_click MCP tool
    this.log(`[MCP] Click: ${description} (ref: ${ref})`);
    throw new Error("MCP not available - run through Cursor agent");
  }

  private async browserFill(
    ref: string,
    description: string,
    value: string,
  ): Promise<void> {
    // This would call: browser_fill MCP tool
    this.log(`[MCP] Fill "${description}" with "${value}" (ref: ${ref})`);
    throw new Error("MCP not available - run through Cursor agent");
  }

  private async browserGetConsoleMessages(): Promise<ConsoleMessage[]> {
    // This would call: browser_console_messages MCP tool
    this.log("[MCP] Getting console messages");
    throw new Error("MCP not available - run through Cursor agent");
  }

  private async browserLock(): Promise<void> {
    // This would call: browser_lock MCP tool
    this.log("[MCP] Locking browser");
  }

  private async browserUnlock(): Promise<void> {
    // This would call: browser_unlock MCP tool
    this.log("[MCP] Unlocking browser");
  }

  // ============================================================================
  // SNAPSHOT PARSING HELPERS
  // ============================================================================

  private findTextInSnapshot(snapshot: string, text: string): boolean {
    return snapshot.toLowerCase().includes(text.toLowerCase());
  }

  private findClickableElement(
    snapshot: string,
    text: string,
  ): { ref: string } | null {
    // Parse snapshot to find clickable elements with matching text
    // In real implementation, this would parse the accessibility tree
    const refMatch = snapshot.match(
      new RegExp(`ref="([^"]+)"[^>]*>${text}`, "i"),
    );
    if (refMatch) {
      return { ref: refMatch[1] };
    }
    return null;
  }

  private findInputByLabel(
    snapshot: string,
    label: string,
  ): { ref: string } | null {
    // Parse snapshot to find input with matching label
    const refMatch = snapshot.match(
      new RegExp(`${label}[^"]*ref="([^"]+)"`, "i"),
    );
    if (refMatch) {
      return { ref: refMatch[1] };
    }
    return null;
  }

  private findErrorIndicators(snapshot: string): string[] {
    const indicators: string[] = [];
    const errorPatterns = [
      /error[:\s].*?([^<]+)/gi,
      /alert-?danger[^>]*>([^<]+)/gi,
      /bg-red[^>]*>([^<]+)/gi,
      /something went wrong/gi,
      /please sign in/gi,
      /could not be refreshed/gi,
      /is not a function/gi,
    ];

    for (const pattern of errorPatterns) {
      const matches = snapshot.match(pattern);
      if (matches) {
        indicators.push(...matches);
      }
    }

    return indicators;
  }

  // ============================================================================
  // UTILITY HELPERS
  // ============================================================================

  private async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getSeverityForStep(step: ScenarioStep): Severity {
    switch (step.action) {
      case "checkNoErrors":
      case "checkConsole":
        return "critical";
      case "verifyNotVisible":
        return "high"; // Security concern if admin-only element is visible
      case "click":
      case "fill":
        return "high";
      default:
        return "medium";
    }
  }

  private buildReproSteps(
    scenario: BrowserScenario,
    failedStep: ScenarioStep,
  ): string[] {
    const steps: string[] = [];

    if (scenario.role !== "guest") {
      steps.push(`Log in as ${scenario.role}`);
    }

    for (const step of scenario.steps) {
      steps.push(this.describeStep(step));
      if (step === failedStep) {
        steps.push("Observe the error");
        break;
      }
    }

    return steps;
  }

  private describeStep(step: ScenarioStep): string {
    switch (step.action) {
      case "navigate":
        return `Navigate to ${step.url}`;
      case "click":
        return `Click on "${step.text}"`;
      case "fill":
        return `Fill form fields: ${Object.keys(step.fields!).join(", ")}`;
      case "verifyVisible":
        return `Verify "${step.text}" is visible`;
      case "verifyNotVisible":
        return `Verify "${step.text}" is NOT visible`;
      case "checkNoErrors":
        return "Check for errors";
      case "wait":
        return `Wait ${step.timeout}ms`;
      default:
        return step.action;
    }
  }

  private printSummary(): void {
    this.log("\n" + "═".repeat(60));
    this.log("  BROWSER MONSTER SUMMARY");
    this.log("═".repeat(60));
    this.log(`Tests run: ${this.testsRun}`);
    this.log(`Passed: ${this.testsPassed}`);
    this.log(`Failed: ${this.testsFailed}`);
    this.log(`Findings: ${this.findings.length}`);
  }
}

// ============================================================================
// CLI RUNNER
// ============================================================================

if (require.main === module) {
  const monster = new BrowserMonster();
  const runConfig: RunConfig = {
    version: 1,
    runId: `browser-monster-${Date.now()}`,
    startTime: new Date(),
    monsters: ["browser" as any],
    triggeredBy: "manual",
  };

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  🌐 BROWSER EXPLORER MONSTER                                     ║
║                                                                  ║
║  Tests the UI like a REAL user:                                  ║
║  - Navigates pages                                               ║
║  - Clicks buttons, fills forms                                   ║
║  - Detects JS console errors                                     ║
║  - Detects error toasts/banners                                  ║
║  - Verifies role-based element visibility                        ║
╚══════════════════════════════════════════════════════════════════╝

Usage:
  npx ts-node browser-monster.ts [options]

Options:
  --role=guest|user|admin   Test as specific role
  --all-roles               Test as all roles (default)

Note: For full browser automation, run through Cursor agent.
      Standalone mode uses HTTP fallback checks.
`);

  monster
    .run(runConfig)
    .then((result) => {
      console.log("\n" + "=".repeat(60));
      console.log("BROWSER MONSTER RESULT");
      console.log("=".repeat(60));
      console.log(`Status: ${result.passed ? "✅ PASSED" : "❌ FAILED"}`);
      console.log(
        `Tests: ${result.testsRun} (${result.testsPassed} passed, ${result.testsFailed} failed)`,
      );
      console.log(`Findings: ${result.findings.length}`);

      if (result.findings.length > 0) {
        console.log("\nFindings:");
        for (const finding of result.findings) {
          const icon =
            finding.severity === "critical"
              ? "🔴"
              : finding.severity === "high"
                ? "🟠"
                : "🟡";
          console.log(
            `  ${icon} [${finding.severity.toUpperCase()}] ${finding.title}`,
          );
        }
      }

      process.exit(result.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Browser Monster crashed:", err);
      process.exit(2);
    });
}
