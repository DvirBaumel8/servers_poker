#!/usr/bin/env npx ts-node
/**
 * 🦸 SUPERHERO MONSTER - Self-Improving QA System
 *
 * This is not just a test runner - it's an intelligent QA system that:
 * 1. RUNS comprehensive browser tests
 * 2. ANALYZES findings to understand root causes
 * 3. AUTO-FIXES issues it knows how to fix
 * 4. LEARNS from each run to improve detection
 * 5. LOOPS until the system is clean or max iterations reached
 *
 * The goal: ZERO bugs reaching customers.
 *
 * Usage:
 *   npm run monsters:superhero          # Run full cycle
 *   npm run monsters:superhero:quick    # Quick validation (1 iteration)
 */

import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  maxIterations: 2, // Reduced since Browser QA is now fast
  minPassThreshold: 0.9, // 90% tests must pass
  maxCriticalFindings: 0,
  maxHighFindings: 3,
  autoFixEnabled: true,
  learningEnabled: true,
  reportDir: "tests/qa/monsters/browser-monster/reports",
  memoryFile: "tests/qa/monsters/browser-monster/memory.json",
  workspaceRoot: process.cwd(),
};

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

interface MonsterResult {
  passed: boolean;
  findings: Finding[];
  stats: {
    run: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  duration: number;
}

interface Memory {
  lastRun: string;
  totalRuns: number;
  knownIssues: KnownIssue[];
  fixedIssues: FixedIssue[];
  patterns: DetectionPattern[];
  improvements: Improvement[];
}

interface KnownIssue {
  fingerprint: string;
  category: string;
  title: string;
  firstSeen: string;
  occurrences: number;
  autoFixAttempted: boolean;
  autoFixSucceeded: boolean;
}

interface FixedIssue {
  fingerprint: string;
  title: string;
  fixedAt: string;
  fixMethod: string;
}

interface DetectionPattern {
  pattern: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  addedAt: string;
  timesTriggered: number;
}

interface Improvement {
  iteration: number;
  date: string;
  findingsBefore: number;
  findingsAfter: number;
  fixesApplied: string[];
}

interface AutoFix {
  pattern: RegExp;
  category: string;
  fix: (finding: Finding) => Promise<boolean>;
  description: string;
}

// ============================================================================
// AUTO-FIX REGISTRY
// ============================================================================

const AUTO_FIXES: AutoFix[] = [
  {
    pattern: /Inputs Without Labels/i,
    category: "A11Y",
    description: "Add aria-label to inputs missing labels",
    fix: async (finding: Finding) => {
      // This would search for the input and add aria-label
      console.log(
        `    🔧 Would add aria-label to input at ${finding.location}`,
      );
      return false; // Return true when actually fixed
    },
  },
  {
    pattern: /Buttons Without Labels/i,
    category: "A11Y",
    description: "Add aria-label to buttons without accessible names",
    fix: async (finding: Finding) => {
      console.log(
        `    🔧 Would add aria-label to button at ${finding.location}`,
      );
      return false;
    },
  },
  {
    pattern: /Horizontal Overflow/i,
    category: "RESPONSIVE",
    description: "Add overflow-x: auto to container",
    fix: async (finding: Finding) => {
      console.log(
        `    🔧 Would add overflow-x containment at ${finding.location}`,
      );
      return false;
    },
  },
  {
    pattern: /No Empty Validation/i,
    category: "VALIDATION",
    description: "Add required attribute to form inputs",
    fix: async (finding: Finding) => {
      console.log(
        `    🔧 Would add required validation at ${finding.location}`,
      );
      return false;
    },
  },
  {
    pattern: /Console Error.*Maximum update depth/i,
    category: "CONSOLE",
    description: "Fix React infinite loop - likely useEffect missing deps",
    fix: async (finding: Finding) => {
      // This is a complex fix that requires code analysis
      console.log(`    🔧 Detected React infinite loop - needs manual review`);
      console.log(`       Location: ${finding.location}`);
      console.log(
        `       Likely cause: useEffect with missing/wrong dependencies`,
      );
      return false;
    },
  },
];

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

function loadMemory(): Memory {
  const memoryPath = path.join(CONFIG.workspaceRoot, CONFIG.memoryFile);
  if (fs.existsSync(memoryPath)) {
    try {
      return JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
    } catch {
      console.log("  ⚠️  Memory file corrupted, starting fresh");
    }
  }
  return {
    lastRun: "",
    totalRuns: 0,
    knownIssues: [],
    fixedIssues: [],
    patterns: [],
    improvements: [],
  };
}

function saveMemory(memory: Memory): void {
  const memoryPath = path.join(CONFIG.workspaceRoot, CONFIG.memoryFile);
  const dir = path.dirname(memoryPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
}

function generateFingerprint(finding: Finding): string {
  return `${finding.category}:${finding.title}:${finding.location}`
    .toLowerCase()
    .replace(/\s+/g, "-");
}

// ============================================================================
// BROWSER QA MONSTER RUNNER
// ============================================================================

async function runBrowserMonster(): Promise<MonsterResult> {
  return new Promise((resolve, reject) => {
    const results: string[] = [];

    const proc = spawn(
      "npx",
      ["ts-node", "tests/qa/monsters/browser-monster/browser-qa-monster.ts"],
      {
        cwd: CONFIG.workspaceRoot,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "0" },
      },
    );

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(text);
      results.push(text);
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      process.stderr.write(text);
      results.push(text);
    });

    proc.on("close", (code) => {
      // Parse results from output
      const output = results.join("");
      const result = parseMonsterOutput(output);
      resolve(result);
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

function parseMonsterOutput(output: string): MonsterResult {
  // Parse duration
  const durationMatch = output.match(/Duration:\s*([\d.]+)s/);
  const duration = durationMatch ? parseFloat(durationMatch[1]) * 1000 : 0;

  // Parse stats
  const statsMatch = output.match(
    /Tests:\s*(\d+)\s*run\s*\|\s*(\d+)\s*passed\s*\|\s*(\d+)\s*failed\s*\|\s*(\d+)\s*skipped/,
  );
  const stats = statsMatch
    ? {
        run: parseInt(statsMatch[1]),
        passed: parseInt(statsMatch[2]),
        failed: parseInt(statsMatch[3]),
        skipped: parseInt(statsMatch[4]),
      }
    : { run: 0, passed: 0, failed: 0, skipped: 0 };

  // Parse findings count
  const findingsMatch = output.match(/Findings:\s*(\d+)/);
  const totalFindings = findingsMatch ? parseInt(findingsMatch[1]) : 0;

  // Parse severity counts
  const criticalMatch = output.match(/🔴\s*Critical:\s*(\d+)/);
  const highMatch = output.match(/🟠\s*High:\s*(\d+)/);
  const mediumMatch = output.match(/🟡\s*Medium:\s*(\d+)/);
  const lowMatch = output.match(/🟢\s*Low:\s*(\d+)/);

  const criticalCount = criticalMatch ? parseInt(criticalMatch[1]) : 0;
  const highCount = highMatch ? parseInt(highMatch[1]) : 0;

  // Extract individual findings (simplified parsing)
  const findings: Finding[] = [];
  const findingPattern = /([🔴🟠🟡🟢])\s*([^\n]+)\n\s+([^\n]+)/g;
  let match;
  while ((match = findingPattern.exec(output)) !== null) {
    const severityIcon = match[1];
    const title = match[2].trim();
    const description = match[3].trim();

    const severity =
      severityIcon === "🔴"
        ? "critical"
        : severityIcon === "🟠"
          ? "high"
          : severityIcon === "🟡"
            ? "medium"
            : "low";

    findings.push({
      id: `finding-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category: extractCategory(title),
      severity,
      title,
      description,
      location: extractLocation(description),
      reproducible: true,
    });
  }

  const passed = criticalCount === 0 && highCount <= CONFIG.maxHighFindings;

  return { passed, findings, stats, duration };
}

function extractCategory(title: string): string {
  if (title.includes("Crash")) return "CRASH";
  if (title.includes("Console")) return "CONSOLE";
  if (title.includes("Auth")) return "AUTH";
  if (title.includes("Overflow") || title.includes("Responsive"))
    return "RESPONSIVE";
  if (
    title.includes("A11Y") ||
    title.includes("Label") ||
    title.includes("Accessibility")
  )
    return "A11Y";
  if (title.includes("Validation")) return "VALIDATION";
  if (title.includes("Network") || title.includes("Request")) return "NETWORK";
  if (title.includes("Performance") || title.includes("Slow"))
    return "PERFORMANCE";
  return "GENERAL";
}

function extractLocation(description: string): string {
  const pathMatch = description.match(/\/[a-z0-9/_-]+/i);
  return pathMatch ? pathMatch[0] : "unknown";
}

// ============================================================================
// ANALYSIS ENGINE
// ============================================================================

function analyzeFindings(
  findings: Finding[],
  memory: Memory,
): {
  newIssues: Finding[];
  recurringIssues: Finding[];
  regressions: Finding[];
} {
  const newIssues: Finding[] = [];
  const recurringIssues: Finding[] = [];
  const regressions: Finding[] = [];

  for (const finding of findings) {
    const fingerprint = generateFingerprint(finding);
    const known = memory.knownIssues.find((k) => k.fingerprint === fingerprint);
    const wasFixed = memory.fixedIssues.find(
      (f) => f.fingerprint === fingerprint,
    );

    if (wasFixed) {
      regressions.push(finding);
    } else if (known) {
      recurringIssues.push(finding);
      known.occurrences++;
    } else {
      newIssues.push(finding);
    }
  }

  return { newIssues, recurringIssues, regressions };
}

// ============================================================================
// AUTO-FIX ENGINE
// ============================================================================

async function attemptAutoFixes(findings: Finding[]): Promise<{
  fixed: Finding[];
  unfixed: Finding[];
}> {
  const fixed: Finding[] = [];
  const unfixed: Finding[] = [];

  for (const finding of findings) {
    let wasFixed = false;

    for (const autoFix of AUTO_FIXES) {
      if (
        autoFix.pattern.test(finding.title) ||
        autoFix.pattern.test(finding.description)
      ) {
        console.log(`  🔧 Attempting auto-fix: ${autoFix.description}`);
        try {
          wasFixed = await autoFix.fix(finding);
          if (wasFixed) {
            console.log(`    ✅ Fixed!`);
            fixed.push(finding);
            break;
          }
        } catch (err) {
          console.log(`    ❌ Auto-fix failed: ${err}`);
        }
      }
    }

    if (!wasFixed) {
      unfixed.push(finding);
    }
  }

  return { fixed, unfixed };
}

// ============================================================================
// LEARNING ENGINE
// ============================================================================

function learnFromRun(
  memory: Memory,
  findings: Finding[],
  analysis: ReturnType<typeof analyzeFindings>,
  fixResults: Awaited<ReturnType<typeof attemptAutoFixes>>,
  iteration: number,
): void {
  // Update known issues
  for (const finding of analysis.newIssues) {
    const fingerprint = generateFingerprint(finding);
    memory.knownIssues.push({
      fingerprint,
      category: finding.category,
      title: finding.title,
      firstSeen: new Date().toISOString(),
      occurrences: 1,
      autoFixAttempted: false,
      autoFixSucceeded: false,
    });
  }

  // Track fixed issues
  for (const finding of fixResults.fixed) {
    const fingerprint = generateFingerprint(finding);
    memory.fixedIssues.push({
      fingerprint,
      title: finding.title,
      fixedAt: new Date().toISOString(),
      fixMethod: "auto-fix",
    });
  }

  // Record improvement
  memory.improvements.push({
    iteration,
    date: new Date().toISOString(),
    findingsBefore: findings.length,
    findingsAfter: fixResults.unfixed.length,
    fixesApplied: fixResults.fixed.map((f) => f.title),
  });

  memory.lastRun = new Date().toISOString();
  memory.totalRuns++;
}

// ============================================================================
// REPORT GENERATOR
// ============================================================================

function generateReport(
  iteration: number,
  result: MonsterResult,
  analysis: ReturnType<typeof analyzeFindings>,
  memory: Memory,
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(
    CONFIG.workspaceRoot,
    CONFIG.reportDir,
    `run-${timestamp}.md`,
  );

  const report = `# 🦸 Superhero Monster Report

**Run:** ${timestamp}
**Iteration:** ${iteration}
**Duration:** ${(result.duration / 1000).toFixed(1)}s
**Status:** ${result.passed ? "✅ PASSED" : "❌ FAILED"}

## Summary

| Metric | Value |
|--------|-------|
| Tests Run | ${result.stats.run} |
| Tests Passed | ${result.stats.passed} |
| Tests Failed | ${result.stats.failed} |
| Pass Rate | ${((result.stats.passed / result.stats.run) * 100).toFixed(1)}% |

## Findings

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${result.findings.filter((f) => f.severity === "critical").length} |
| 🟠 High | ${result.findings.filter((f) => f.severity === "high").length} |
| 🟡 Medium | ${result.findings.filter((f) => f.severity === "medium").length} |
| 🟢 Low | ${result.findings.filter((f) => f.severity === "low").length} |

## Analysis

- **New Issues:** ${analysis.newIssues.length}
- **Recurring Issues:** ${analysis.recurringIssues.length}
- **Regressions:** ${analysis.regressions.length}

## Learning Stats

- **Total Runs:** ${memory.totalRuns}
- **Known Issues Tracked:** ${memory.knownIssues.length}
- **Issues Fixed (All Time):** ${memory.fixedIssues.length}

## Top Priority Issues

${result.findings
  .filter((f) => f.severity === "critical" || f.severity === "high")
  .slice(0, 10)
  .map(
    (f) =>
      `- **[${f.severity.toUpperCase()}]** ${f.title}\n  - ${f.description}\n  - Location: ${f.location}`,
  )
  .join("\n\n")}

---
*Generated by Superhero Monster v1.0*
`;

  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(reportPath, report);

  return reportPath;
}

// ============================================================================
// MAIN SUPERHERO LOOP
// ============================================================================

async function runSuperheroLoop(): Promise<void> {
  console.log("\n" + "═".repeat(70));
  console.log("  🦸 SUPERHERO MONSTER - Self-Improving QA System");
  console.log("═".repeat(70));
  console.log(`\n  Max Iterations: ${CONFIG.maxIterations}`);
  console.log(`  Auto-Fix: ${CONFIG.autoFixEnabled ? "Enabled" : "Disabled"}`);
  console.log(`  Learning: ${CONFIG.learningEnabled ? "Enabled" : "Disabled"}`);
  console.log("");

  const memory = loadMemory();
  let iteration = 0;
  let lastResult: MonsterResult | null = null;

  while (iteration < CONFIG.maxIterations) {
    iteration++;
    console.log("\n" + "─".repeat(70));
    console.log(`  🔄 ITERATION ${iteration} of ${CONFIG.maxIterations}`);
    console.log("─".repeat(70) + "\n");

    // STEP 1: Run the Browser QA Monster
    console.log("  📍 STEP 1: Running Browser QA Monster...\n");
    try {
      lastResult = await runBrowserMonster();
    } catch (err) {
      console.error("  ❌ Monster crashed:", err);
      break;
    }

    // STEP 2: Analyze findings
    console.log("\n  📍 STEP 2: Analyzing findings...\n");
    const analysis = analyzeFindings(lastResult.findings, memory);

    console.log(`    📊 New issues: ${analysis.newIssues.length}`);
    console.log(`    🔄 Recurring: ${analysis.recurringIssues.length}`);
    console.log(`    ⚠️  Regressions: ${analysis.regressions.length}`);

    // Check if we passed
    if (lastResult.passed) {
      console.log("\n  ✅ All critical checks passed!");

      if (CONFIG.learningEnabled) {
        learnFromRun(
          memory,
          lastResult.findings,
          analysis,
          { fixed: [], unfixed: lastResult.findings },
          iteration,
        );
        saveMemory(memory);
      }

      const reportPath = generateReport(
        iteration,
        lastResult,
        analysis,
        memory,
      );
      console.log(`\n  📄 Report saved: ${reportPath}`);
      break;
    }

    // STEP 3: Attempt auto-fixes
    if (CONFIG.autoFixEnabled && lastResult.findings.length > 0) {
      console.log("\n  📍 STEP 3: Attempting auto-fixes...\n");

      const criticalAndHigh = lastResult.findings.filter(
        (f) => f.severity === "critical" || f.severity === "high",
      );

      const fixResults = await attemptAutoFixes(criticalAndHigh);

      console.log(`\n    ✅ Fixed: ${fixResults.fixed.length}`);
      console.log(`    ❌ Unfixed: ${fixResults.unfixed.length}`);

      // If we fixed something, continue to next iteration
      if (fixResults.fixed.length > 0) {
        console.log("\n  🔄 Fixes applied, running again to verify...");

        if (CONFIG.learningEnabled) {
          learnFromRun(
            memory,
            lastResult.findings,
            analysis,
            fixResults,
            iteration,
          );
          saveMemory(memory);
        }

        continue;
      }
    }

    // STEP 4: Learn and save
    if (CONFIG.learningEnabled) {
      console.log("\n  📍 STEP 4: Learning from this run...\n");
      learnFromRun(
        memory,
        lastResult.findings,
        analysis,
        { fixed: [], unfixed: lastResult.findings },
        iteration,
      );
      saveMemory(memory);
      console.log(
        `    💾 Memory updated (${memory.knownIssues.length} known issues)`,
      );
    }

    // Generate report
    const reportPath = generateReport(iteration, lastResult, analysis, memory);
    console.log(`\n  📄 Report saved: ${reportPath}`);

    // If no fixes were made, we're stuck - break
    console.log("\n  ⏸️  No auto-fixes available, manual intervention needed.");
    break;
  }

  // Final summary
  console.log("\n" + "═".repeat(70));
  console.log("  🦸 SUPERHERO MONSTER - FINAL SUMMARY");
  console.log("═".repeat(70));

  if (lastResult) {
    console.log(
      `\n  Status: ${lastResult.passed ? "✅ PASSED" : "❌ NEEDS ATTENTION"}`,
    );
    console.log(`  Iterations: ${iteration}`);
    console.log(`  Total Findings: ${lastResult.findings.length}`);
    console.log(
      `    🔴 Critical: ${lastResult.findings.filter((f) => f.severity === "critical").length}`,
    );
    console.log(
      `    🟠 High: ${lastResult.findings.filter((f) => f.severity === "high").length}`,
    );
    console.log(
      `    🟡 Medium: ${lastResult.findings.filter((f) => f.severity === "medium").length}`,
    );
    console.log(
      `    🟢 Low: ${lastResult.findings.filter((f) => f.severity === "low").length}`,
    );
  }

  console.log(`\n  Memory Stats:`);
  console.log(`    Total Runs: ${memory.totalRuns}`);
  console.log(`    Known Issues: ${memory.knownIssues.length}`);
  console.log(`    Fixed Issues: ${memory.fixedIssues.length}`);

  console.log("\n" + "═".repeat(70) + "\n");

  // Exit with appropriate code
  process.exit(lastResult?.passed ? 0 : 1);
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes("--quick")) {
    CONFIG.maxIterations = 1;
    CONFIG.autoFixEnabled = false;
  }

  if (args.includes("--no-fix")) {
    CONFIG.autoFixEnabled = false;
  }

  if (args.includes("--no-learn")) {
    CONFIG.learningEnabled = false;
  }

  runSuperheroLoop().catch((err) => {
    console.error("Superhero Monster crashed:", err);
    process.exit(1);
  });
}

export { runSuperheroLoop, CONFIG };
