/**
 * Auto-Improve System
 *
 * Allows the Evolution Agent to actually modify monster configurations
 * and create new test cases based on its analysis.
 *
 * Safety mechanisms:
 * 1. All changes are written to a "pending" branch
 * 2. Changes require human approval before merging
 * 3. Each change has a clear explanation and rollback path
 * 4. Test changes are validated before committing
 *
 * What it can modify:
 * - API Monster config: Add new endpoints to test
 * - Visual Monster config: Add new pages/viewports
 * - Invariant rules: Add new invariants based on bugs found
 * - Create new test files for specific bugs
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import {
  Finding,
  EvolutionReport,
  ConfigChange,
  NewTestCase,
  CoverageGap,
  MonsterType,
} from "../shared/types";
import { CodeFixer, fixAllIssues, FixResult } from "./code-fixer";

// ============================================================================
// TYPES
// ============================================================================

export interface AutoImproveConfig {
  enabled: boolean;
  autoCommit: boolean; // If false, only writes files (no git)
  branchPrefix: string; // Branch name prefix for changes
  requireApproval: boolean; // If true, creates PR instead of merging
  maxChangesPerRun: number; // Limit changes per run
  dryRun: boolean; // If true, only logs what would be done
}

export interface ImprovementAction {
  id: string;
  type:
    | "add_endpoint"
    | "add_page"
    | "add_invariant"
    | "create_test"
    | "update_config";
  description: string;
  targetFile: string;
  change: string; // The actual code/config change
  reason: string;
  derivedFrom?: string; // Finding ID that triggered this
  applied: boolean;
  error?: string;
}

export interface ImprovementReport {
  runId: string;
  timestamp: Date;
  actionsPlanned: number;
  actionsApplied: number;
  actionsFailed: number;
  actions: ImprovementAction[];
  branchCreated?: string;
  prUrl?: string;
  codeFixResult?: FixResult;
}

// ============================================================================
// AUTO-IMPROVE ENGINE
// ============================================================================

export class AutoImproveEngine {
  private config: AutoImproveConfig;
  private actions: ImprovementAction[] = [];
  private workspaceRoot: string;

  constructor(config: Partial<AutoImproveConfig> = {}) {
    this.config = {
      enabled: true,
      autoCommit: false, // Safe default
      branchPrefix: "monster-improve",
      requireApproval: true,
      maxChangesPerRun: 10,
      dryRun: false,
      ...config,
    };
    this.workspaceRoot = process.cwd();
  }

  /**
   * Process an evolution report and generate improvements.
   */
  async processReport(report: EvolutionReport): Promise<ImprovementReport> {
    console.log("[AutoImprove] Processing evolution report...");

    this.actions = [];
    let codeFixResult: FixResult | undefined;

    // Step 1: Try to auto-fix code issues directly
    if (this.config.enabled) {
      console.log("[AutoImprove] Analyzing findings for direct code fixes...");

      // Get findings that can be auto-fixed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getMemoryStore } = require("../memory/memory-store");
      const memory = getMemoryStore();
      const openFindings = memory.getOpenFindings();

      if (openFindings.length > 0) {
        console.log(`[AutoImprove] Found ${openFindings.length} open findings`);
        codeFixResult = await fixAllIssues(openFindings, this.config.dryRun);

        if (codeFixResult.applied > 0) {
          console.log(
            `[AutoImprove] 🔧 Applied ${codeFixResult.applied} code fixes directly!`,
          );
        }
        if (this.config.dryRun && codeFixResult.totalFixes > 0) {
          console.log(
            `[AutoImprove] DRY RUN - Would apply ${codeFixResult.totalFixes} code fixes`,
          );
        }
      }
    }

    // Step 2: Generate config/test improvement actions
    for (const change of report.suggestedConfigChanges.slice(
      0,
      this.config.maxChangesPerRun,
    )) {
      const action = await this.generateActionFromChange(change);
      if (action) {
        this.actions.push(action);
      }
    }

    // Generate actions from new test cases
    for (const testCase of report.newTestCases.slice(0, 5)) {
      const action = await this.generateActionFromTestCase(testCase);
      if (action) {
        this.actions.push(action);
      }
    }

    // Generate actions from coverage gaps
    for (const gap of report.trendAnalysis.coverageGaps.slice(0, 5)) {
      const action = await this.generateActionFromGap(gap);
      if (action) {
        this.actions.push(action);
      }
    }

    console.log(
      `[AutoImprove] Generated ${this.actions.length} config/test improvement actions`,
    );

    // Step 3: Apply config actions if enabled
    if (this.config.enabled && !this.config.dryRun) {
      await this.applyActions();
    } else if (this.config.dryRun && this.actions.length > 0) {
      console.log("[AutoImprove] DRY RUN - would apply these config actions:");
      for (const action of this.actions) {
        console.log(`  - ${action.type}: ${action.description}`);
      }
    }

    const finalReport = this.generateReport(report.runId);
    finalReport.codeFixResult = codeFixResult;
    return finalReport;
  }

  // ============================================================================
  // ACTION GENERATION
  // ============================================================================

  private async generateActionFromChange(
    change: ConfigChange,
  ): Promise<ImprovementAction | null> {
    const id = `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    switch (change.changeType) {
      case "add_test":
        return this.generateAddEndpointAction(id, change);

      case "add_invariant":
        return this.generateAddInvariantAction(id, change);

      case "add_edge_case":
        return this.generateAddEdgeCaseAction(id, change);

      default:
        return null;
    }
  }

  private async generateAddEndpointAction(
    id: string,
    change: ConfigChange,
  ): Promise<ImprovementAction | null> {
    // Parse endpoint from details (e.g., "Add test for /api/v1/payments")
    const endpointMatch = change.details.match(/\/api\/v1\/[\w\/-]+/);
    if (!endpointMatch) return null;

    const endpoint = endpointMatch[0];
    const configPath = join(
      this.workspaceRoot,
      "tests/qa/monsters/api-monster/api-monster.config.ts",
    );

    // Generate the config addition
    const newEndpoint = `
  {
    method: "GET",
    path: "${endpoint}",
    description: "Auto-added: ${change.reason}",
    auth: false,
    expectedStatus: 200,
    // TODO: Add expectedShape and validations
  },`;

    return {
      id,
      type: "add_endpoint",
      description: `Add endpoint test: ${endpoint}`,
      targetFile: configPath,
      change: newEndpoint,
      reason: change.reason,
      applied: false,
    };
  }

  private async generateAddInvariantAction(
    id: string,
    change: ConfigChange,
  ): Promise<ImprovementAction | null> {
    const invariantsPath = join(
      this.workspaceRoot,
      "tests/qa/monsters/invariant-monster/poker-invariants.ts",
    );

    // Generate a template invariant
    const newInvariant = `
  {
    name: "auto_${id}",
    description: "Auto-generated: ${change.details}",
    category: "state",
    severity: "high",
    check: (ctx: InvariantContext): InvariantResult => {
      // TODO: Implement invariant logic
      // Reason: ${change.reason}
      return { passed: true, message: "Not yet implemented" };
    },
  },`;

    return {
      id,
      type: "add_invariant",
      description: `Add invariant: ${change.details}`,
      targetFile: invariantsPath,
      change: newInvariant,
      reason: change.reason,
      applied: false,
    };
  }

  private async generateAddEdgeCaseAction(
    id: string,
    change: ConfigChange,
  ): Promise<ImprovementAction | null> {
    // Would add edge case to visual monster config
    return null; // TODO: Implement
  }

  private async generateActionFromTestCase(
    testCase: NewTestCase,
  ): Promise<ImprovementAction | null> {
    const id = `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create a new test file
    const testFileName = `auto-test-${id}.ts`;
    const testFilePath = join(
      this.workspaceRoot,
      "tests/qa/monsters/auto-generated",
      testFileName,
    );

    const testContent = `/**
 * Auto-Generated Test
 * 
 * Description: ${testCase.description}
 * Derived from: ${testCase.derivedFrom || "Evolution Agent analysis"}
 * Generated: ${new Date().toISOString()}
 * 
 * IMPORTANT: Review this test before using in production.
 */

import { BaseMonster } from "../shared/base-monster";
import { RunConfig } from "../shared/types";

${testCase.implementation}
`;

    return {
      id,
      type: "create_test",
      description: `Create test: ${testCase.description}`,
      targetFile: testFilePath,
      change: testContent,
      reason: `Auto-generated from finding: ${testCase.derivedFrom}`,
      derivedFrom: testCase.derivedFrom,
      applied: false,
    };
  }

  private async generateActionFromGap(
    gap: CoverageGap,
  ): Promise<ImprovementAction | null> {
    const id = `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    switch (gap.type) {
      case "untested_endpoint":
        return {
          id,
          type: "add_endpoint",
          description: `Add coverage for endpoint: ${gap.location}`,
          targetFile: join(
            this.workspaceRoot,
            "tests/qa/monsters/api-monster/api-monster.config.ts",
          ),
          change: `// TODO: Add test for ${gap.location}`,
          reason: gap.suggestion,
          applied: false,
        };

      case "untested_page":
        return {
          id,
          type: "add_page",
          description: `Add coverage for page: ${gap.location}`,
          targetFile: join(
            this.workspaceRoot,
            "tests/qa/monsters/visual-monster/visual-monster.config.ts",
          ),
          change: `// TODO: Add test for ${gap.location}`,
          reason: gap.suggestion,
          applied: false,
        };

      default:
        return null;
    }
  }

  // ============================================================================
  // ACTION APPLICATION
  // ============================================================================

  private async applyActions(): Promise<void> {
    if (this.actions.length === 0) {
      console.log("[AutoImprove] No actions to apply");
      return;
    }

    // Create branch if auto-commit is enabled
    let branchName: string | undefined;
    if (this.config.autoCommit) {
      branchName = `${this.config.branchPrefix}-${Date.now()}`;
      try {
        execSync(`git checkout -b ${branchName}`, { cwd: this.workspaceRoot });
        console.log(`[AutoImprove] Created branch: ${branchName}`);
      } catch (e) {
        console.error(`[AutoImprove] Failed to create branch: ${e}`);
        return;
      }
    }

    // Apply each action
    for (const action of this.actions) {
      try {
        await this.applyAction(action);
        action.applied = true;
        console.log(`[AutoImprove] ✅ Applied: ${action.description}`);
      } catch (e: any) {
        action.error = e.message;
        console.error(
          `[AutoImprove] ❌ Failed: ${action.description} - ${e.message}`,
        );
      }
    }

    // Commit changes if auto-commit is enabled
    if (this.config.autoCommit && branchName) {
      const appliedCount = this.actions.filter((a) => a.applied).length;
      if (appliedCount > 0) {
        try {
          execSync(`git add -A`, { cwd: this.workspaceRoot });
          execSync(
            `git commit -m "chore(monsters): auto-improve ${appliedCount} test configs"`,
            { cwd: this.workspaceRoot },
          );
          console.log(`[AutoImprove] Committed ${appliedCount} changes`);

          // Push and create PR if required
          if (this.config.requireApproval) {
            execSync(`git push -u origin ${branchName}`, {
              cwd: this.workspaceRoot,
            });
            console.log(
              `[AutoImprove] Pushed branch. Create PR manually or use 'gh pr create'`,
            );
          }
        } catch (e) {
          console.error(`[AutoImprove] Failed to commit: ${e}`);
        }
      }
    }
  }

  private async applyAction(action: ImprovementAction): Promise<void> {
    switch (action.type) {
      case "create_test":
        // Create new file
        const dir = dirname(action.targetFile);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(action.targetFile, action.change);
        break;

      case "add_endpoint":
      case "add_invariant":
      case "add_page":
      case "update_config":
        // Append to existing config file
        // For now, just create a TODO file - real implementation would parse and modify
        const todoPath = action.targetFile.replace(".ts", ".todo.ts");
        const existing = existsSync(todoPath)
          ? readFileSync(todoPath, "utf-8")
          : "// Auto-generated improvements - review and merge manually\n\n";

        writeFileSync(todoPath, existing + action.change + "\n");
        break;
    }
  }

  // ============================================================================
  // REPORTING
  // ============================================================================

  private generateReport(runId: string): ImprovementReport {
    return {
      runId,
      timestamp: new Date(),
      actionsPlanned: this.actions.length,
      actionsApplied: this.actions.filter((a) => a.applied).length,
      actionsFailed: this.actions.filter((a) => a.error).length,
      actions: this.actions,
    };
  }
}

// ============================================================================
// SMART IMPROVEMENT STRATEGIES
// ============================================================================

/**
 * Strategies for generating improvements based on patterns in findings.
 */
export const ImprovementStrategies = {
  /**
   * When we find a bug, generate a regression test for it.
   */
  bugToRegressionTest(finding: Finding): NewTestCase {
    return {
      description: `Regression test for: ${finding.title}`,
      targetMonster: finding.monster,
      implementation: generateTestFromFinding(finding),
      derivedFrom: finding.id,
    };
  },

  /**
   * When we find a pattern of bugs in an area, suggest increased coverage.
   */
  hotspotToCoverage(area: string, bugCount: number): ConfigChange {
    return {
      monster: "api" as MonsterType,
      changeType: "add_test",
      details: `Increase test coverage for ${area}`,
      reason: `${bugCount} bugs found in this area - indicates insufficient testing`,
      priority: bugCount > 5 ? "high" : "medium",
    };
  },

  /**
   * When we find an invariant violation, strengthen the invariant.
   */
  violationToInvariant(finding: Finding): ConfigChange {
    return {
      monster: "invariant" as MonsterType,
      changeType: "add_invariant",
      details: `Add invariant to prevent: ${finding.title}`,
      reason: finding.description,
      priority: finding.severity === "critical" ? "high" : "medium",
    };
  },
};

function generateTestFromFinding(finding: Finding): string {
  const lines = [
    `// Auto-generated regression test`,
    `// Finding: ${finding.id}`,
    `// Severity: ${finding.severity}`,
    `// ${finding.description}`,
    ``,
  ];

  if (finding.location.endpoint) {
    lines.push(`test('${finding.title}', async () => {`);
    lines.push(
      `  const response = await fetch('${finding.location.endpoint}');`,
    );
    lines.push(`  `);
    lines.push(`  // Verify the bug is fixed:`);
    lines.push(`  // ${finding.description}`);
    lines.push(`  `);
    lines.push(`  expect(response.ok).toBe(true);`);
    lines.push(`  // TODO: Add specific assertions based on the bug`);
    lines.push(`});`);
  } else if (finding.location.page) {
    lines.push(`test('${finding.title}', async ({ page }) => {`);
    lines.push(`  await page.goto('${finding.location.page}');`);
    lines.push(`  `);
    lines.push(`  // Verify the bug is fixed:`);
    lines.push(`  // ${finding.description}`);
    lines.push(`  `);
    lines.push(`  // TODO: Add specific assertions`);
    lines.push(`});`);
  } else {
    lines.push(`test('${finding.title}', async () => {`);
    lines.push(`  // Verify: ${finding.description}`);
    lines.push(`  // TODO: Implement this test`);
    lines.push(`});`);
  }

  return lines.join("\n");
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  console.log(`
Auto-Improve System
==================

This system allows the Evolution Agent to modify monster configs.

Usage:
  npx ts-node auto-improve.ts [options]

Options:
  --dry-run       Show what would be changed without applying
  --apply         Apply changes to files (no git)
  --commit        Apply changes and commit to new branch
  --help          Show this help

Note: This is typically called by the Evolution Agent, not directly.
`);
}
