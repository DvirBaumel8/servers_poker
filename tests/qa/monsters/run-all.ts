#!/usr/bin/env npx ts-node
/**
 * 🦸 RUN ALL MONSTERS - Parallel Execution
 *
 * Runs ALL 21 monsters in the army simultaneously for maximum coverage.
 *
 * Usage:
 *   npm run monsters:all          # Run ALL 21 monsters (default - full coverage)
 *   npm run monsters:all:fast     # Run only fast monsters (5) - quick validation
 *   npm run monsters:all -- --medium  # Run fast + medium (14) - faster iteration
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  printSummary,
  generateReport,
  loadIssueDatabase,
} from "./shared/issue-tracker";

// ============================================================================
// MONSTER DEFINITIONS - ALL 21 MONSTERS
// ============================================================================

interface MonsterDef {
  id: string;
  name: string;
  command: string;
  category: "fast" | "medium" | "slow";
  description: string;
}

const ALL_MONSTERS: MonsterDef[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // ⚡ FAST (< 10 seconds) - Quick validation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "quick-check",
    name: "Quick Check",
    command: "npx ts-node tests/qa/monsters/browser-monster/quick-check.ts",
    category: "fast",
    description: "Combined bugs + quality check",
  },
  {
    id: "fast-browser",
    name: "Fast Browser",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/fast-browser-monster.ts",
    category: "fast",
    description: "Fast bug detection",
  },
  {
    id: "fast-quality",
    name: "Fast Quality",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/fast-quality-monster.ts",
    category: "fast",
    description: "Fast quality score",
  },
  {
    id: "css-lint",
    name: "CSS Lint",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/css-lint-monster.ts",
    category: "fast",
    description: "CSS issues detection",
  },
  {
    id: "layout-lint",
    name: "Layout Lint",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/layout-lint-monster.ts",
    category: "fast",
    description: "Layout problems detection",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔶 MEDIUM (10s - 2 minutes) - Standard validation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "invariant",
    name: "Invariant Monster",
    command:
      "npx ts-node tests/qa/monsters/invariant-monster/invariant-monster.ts",
    category: "medium",
    description: "Poker rule validation",
  },
  {
    id: "api",
    name: "API Monster",
    command: "npx ts-node tests/qa/monsters/api-monster/api-monster.ts",
    category: "medium",
    description: "API endpoint testing",
  },
  {
    id: "contract",
    name: "Contract Monster",
    command:
      "npx ts-node tests/qa/monsters/contract-monster/contract-monster.ts",
    category: "medium",
    description: "API contract validation",
  },
  {
    id: "visual",
    name: "Visual Monster",
    command: "npx ts-node tests/qa/monsters/visual-monster/visual-monster.ts",
    category: "medium",
    description: "Visual regression",
  },
  {
    id: "guardian",
    name: "Guardian Monster",
    command:
      "npx ts-node tests/qa/monsters/guardian-monster/guardian-monster.ts",
    category: "medium",
    description: "Security checks",
  },
  {
    id: "code-quality",
    name: "Code Quality",
    command:
      "npx ts-node tests/qa/monsters/code-quality-monster/code-quality-monster.ts",
    category: "medium",
    description: "Code analysis",
  },
  {
    id: "design-critic",
    name: "Design Critic",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/design-critic-monster.ts",
    category: "medium",
    description: "UI/UX critique",
  },
  {
    id: "product-quality",
    name: "Product Quality",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/product-quality-monster.ts",
    category: "medium",
    description: "Full quality critique",
  },
  {
    id: "live-ui",
    name: "Live UI Monster",
    command: "npx ts-node tests/qa/monsters/browser-monster/live-ui-monster.ts",
    category: "medium",
    description: "Live UI interaction testing",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 SLOW (> 2 minutes) - Comprehensive validation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "browser-qa",
    name: "Browser QA",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/browser-qa-monster.ts",
    category: "slow",
    description: "Comprehensive 14-phase UI testing",
  },
  {
    id: "e2e",
    name: "E2E Monster",
    command: "npx ts-node tests/qa/monsters/e2e-monster/e2e-monster.ts",
    category: "slow",
    description: "End-to-end flows",
  },
  {
    id: "game-flow",
    name: "Game Flow",
    command: "npx ts-node tests/qa/monsters/flows/game-flow-monster.ts",
    category: "slow",
    description: "Complete game scenarios",
  },
  {
    id: "tournament-flow",
    name: "Tournament Flow",
    command: "npx ts-node tests/qa/monsters/flows/tournament-flow-monster.ts",
    category: "slow",
    description: "Tournament lifecycle",
  },
  {
    id: "chaos",
    name: "Chaos Monster",
    command: "npx ts-node tests/qa/monsters/chaos-monster/chaos-monster.ts",
    category: "slow",
    description: "Stress testing",
  },
  {
    id: "superhero",
    name: "Superhero Monster",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/superhero-monster.ts --quick",
    category: "slow",
    description: "Self-improving QA loop",
  },
  {
    id: "browser",
    name: "Browser Monster",
    command: "npx ts-node tests/qa/monsters/browser-monster/browser-monster.ts",
    category: "slow",
    description: "Browser interaction testing",
  },
];

// ============================================================================
// LIFETIME STATISTICS
// ============================================================================

interface MonsterStats {
  id: string;
  name: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalIssuesFound: number;
  lastRun: string | null;
  lastIssuesFound: number;
  avgDuration: number;
}

interface StatsDatabase {
  version: number;
  lastUpdated: string;
  monsters: Record<string, MonsterStats>;
}

const STATS_PATH = path.join(process.cwd(), "docs/monster_stats.json");

function loadStats(): StatsDatabase {
  if (fs.existsSync(STATS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(STATS_PATH, "utf-8"));
    } catch {
      console.warn("Stats database corrupted, starting fresh");
    }
  }
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    monsters: {},
  };
}

function saveStats(db: StatsDatabase): void {
  const dir = path.dirname(STATS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  db.lastUpdated = new Date().toISOString();
  fs.writeFileSync(STATS_PATH, JSON.stringify(db, null, 2));
}

function updateMonsterStats(
  monster: MonsterDef,
  success: boolean,
  duration: number,
  issuesFound: number,
): void {
  const db = loadStats();

  if (!db.monsters[monster.id]) {
    db.monsters[monster.id] = {
      id: monster.id,
      name: monster.name,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      totalIssuesFound: 0,
      lastRun: null,
      lastIssuesFound: 0,
      avgDuration: 0,
    };
  }

  const stats = db.monsters[monster.id];
  stats.totalRuns++;
  if (success) {
    stats.successfulRuns++;
  } else {
    stats.failedRuns++;
  }
  stats.totalIssuesFound += issuesFound;
  stats.lastRun = new Date().toISOString();
  stats.lastIssuesFound = issuesFound;
  stats.avgDuration = Math.round(
    (stats.avgDuration * (stats.totalRuns - 1) + duration) / stats.totalRuns,
  );

  saveStats(db);
}

function generateStatsReport(): string {
  const db = loadStats();
  const monsters = Object.values(db.monsters).sort(
    (a, b) => b.totalIssuesFound - a.totalIssuesFound,
  );

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatRate = (success: number, total: number): string => {
    if (total === 0) return "N/A";
    return `${Math.round((success / total) * 100)}%`;
  };

  let report = `# 📊 Monster Army Statistics

## Lifetime Performance

| Monster | Issues Found | Runs | Success Rate | Avg Duration | Last Run Issues |
|---------|--------------|------|--------------|--------------|-----------------|
`;

  for (const m of monsters) {
    report += `| ${m.name} | ${m.totalIssuesFound} | ${m.totalRuns} | ${formatRate(m.successfulRuns, m.totalRuns)} | ${formatDuration(m.avgDuration)} | ${m.lastIssuesFound} |\n`;
  }

  // Summary stats
  const totalIssues = monsters.reduce((sum, m) => sum + m.totalIssuesFound, 0);
  const totalRuns = monsters.reduce((sum, m) => sum + m.totalRuns, 0);
  const activeMonsters = monsters.filter((m) => m.totalIssuesFound > 0).length;
  const zeroIssueMonsters = monsters.filter((m) => m.totalIssuesFound === 0);

  report += `
## Summary

- **Total Issues Found:** ${totalIssues}
- **Total Monster Runs:** ${totalRuns}
- **Active Monsters:** ${activeMonsters}/${monsters.length} (finding issues)

`;

  if (zeroIssueMonsters.length > 0) {
    report += `## Monsters Needing Attention

These monsters have found 0 issues - they may need tuning:

`;
    for (const m of zeroIssueMonsters) {
      report += `- **${m.name}** (${m.totalRuns} runs, ${formatRate(m.successfulRuns, m.totalRuns)} success)\n`;
    }
  }

  report += `\n*Last Updated: ${new Date().toLocaleString()}*\n`;

  // Save report
  const reportPath = path.join(process.cwd(), "docs/monster_stats.md");
  fs.writeFileSync(reportPath, report);

  return report;
}

// ============================================================================
// PARALLEL RUNNER
// ============================================================================

interface MonsterResult {
  monster: MonsterDef;
  success: boolean;
  duration: number;
  output: string;
  issuesFound: number;
  error?: string;
}

function countIssuesInOutput(output: string): number {
  // Try to extract issue count from output
  const matches =
    output.match(/Issues?:\s*(\d+)/i) ||
    output.match(/Findings?:\s*(\d+)/i) ||
    output.match(/Found\s+(\d+)\s+issues?/i) ||
    output.match(/(\d+)\s+issues?\s+found/i);
  return matches ? parseInt(matches[1], 10) : 0;
}

async function runMonster(monster: MonsterDef): Promise<MonsterResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const output: string[] = [];
    const [cmd, ...args] = monster.command.split(" ");

    const proc = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    proc.stdout.on("data", (data) => {
      output.push(data.toString());
    });

    proc.stderr.on("data", (data) => {
      output.push(data.toString());
    });

    proc.on("close", (code) => {
      const outputText = output.join("");
      const duration = Date.now() - startTime;
      const issuesFound = countIssuesInOutput(outputText);

      const isSuccessfulRun =
        code === 0 ||
        outputText.includes("PASSED") ||
        outputText.includes("completed") ||
        outputText.includes("✅") ||
        (outputText.includes("Findings:") && !outputText.includes("crashed"));

      // Update lifetime stats
      updateMonsterStats(monster, isSuccessfulRun, duration, issuesFound);

      resolve({
        monster,
        success: isSuccessfulRun,
        duration,
        output: outputText,
        issuesFound,
      });
    });

    proc.on("error", (err) => {
      const duration = Date.now() - startTime;
      updateMonsterStats(monster, false, duration, 0);

      resolve({
        monster,
        success: false,
        duration,
        output: output.join(""),
        issuesFound: 0,
        error: err.message,
      });
    });

    // Different timeouts by category
    const timeoutMs =
      monster.category === "slow"
        ? 3 * 60 * 1000 // 3 minutes for slow (optimized monsters)
        : monster.category === "medium"
          ? 2 * 60 * 1000 // 2 minutes for medium
          : 30 * 1000; // 30 seconds for fast

    setTimeout(() => {
      proc.kill();
      const duration = Date.now() - startTime;
      updateMonsterStats(monster, false, duration, 0);

      resolve({
        monster,
        success: false,
        duration,
        output: output.join(""),
        issuesFound: 0,
        error: `Timeout (${timeoutMs / 60000} minutes)`,
      });
    }, timeoutMs);
  });
}

async function runMonstersParallel(
  monsters: MonsterDef[],
): Promise<MonsterResult[]> {
  console.log(`\n  🚀 Launching ${monsters.length} monsters in parallel...\n`);

  const promises = monsters.map((m) => {
    console.log(`    ⚡ Starting: ${m.name}`);
    return runMonster(m);
  });

  return Promise.all(promises);
}

// ============================================================================
// EVOLUTION ANALYSIS - Which monsters should evolve?
// ============================================================================

const CATEGORY_TO_MONSTERS: Record<string, string[]> = {
  BUG: ["quick-check", "browser-qa", "e2e"],
  QUALITY: ["product-quality", "design-critic", "fast-quality"],
  A11Y: ["browser-qa", "guardian"],
  SECURITY: ["guardian", "api"],
  CODE_QUALITY: ["code-quality"],
  INVARIANT: ["invariant"],
  PERFORMANCE: ["browser-qa"],
  API: ["api", "contract"],
};

interface EvolutionSuggestion {
  issueId: string;
  issueTitle: string;
  currentMonster: string;
  suggestedMonsters: string[];
  reason: string;
}

async function analyzeEvolution(): Promise<void> {
  const db = loadIssueDatabase();
  const openIssues = db.issues.filter((i) => i.status === "open");

  if (openIssues.length === 0) {
    return;
  }

  console.log("\n" + "─".repeat(56));
  console.log("  🧬 EVOLUTION ANALYSIS");
  console.log("─".repeat(56));

  const suggestions: EvolutionSuggestion[] = [];
  const monsterCoverage: Record<string, string[]> = {};

  for (const issue of openIssues) {
    const category = issue.category.toUpperCase();
    const expectedMonsters = CATEGORY_TO_MONSTERS[category] || [];
    const currentMonster = issue.source;

    // Track which issues each monster is finding
    if (!monsterCoverage[currentMonster]) {
      monsterCoverage[currentMonster] = [];
    }
    monsterCoverage[currentMonster].push(issue.category);

    // If the issue wasn't caught by expected monsters, suggest evolution
    const otherMonstersThatShouldCatch = expectedMonsters.filter(
      (m) => m !== currentMonster && !m.includes(currentMonster),
    );

    if (
      otherMonstersThatShouldCatch.length > 0 &&
      issue.severity === "critical"
    ) {
      suggestions.push({
        issueId: issue.id,
        issueTitle: issue.title.slice(0, 40),
        currentMonster,
        suggestedMonsters: otherMonstersThatShouldCatch,
        reason: `Critical ${category} issue - other monsters should also catch this`,
      });
    }
  }

  // Show suggestions
  if (suggestions.length > 0) {
    console.log(`\n  Found ${suggestions.length} evolution opportunities:\n`);
    for (const sug of suggestions.slice(0, 5)) {
      console.log(`  📈 ${sug.issueTitle}`);
      console.log(`     Found by: ${sug.currentMonster}`);
      console.log(`     Also add to: ${sug.suggestedMonsters.join(", ")}`);
      console.log(`     Reason: ${sug.reason}\n`);
    }
  } else {
    console.log(
      "\n  ✅ No immediate evolution needed - monsters are covering their domains.\n",
    );
  }

  // Show monster coverage stats
  console.log("  Monster Issue Coverage:");
  const sortedMonsters = Object.entries(monsterCoverage).sort(
    (a, b) => b[1].length - a[1].length,
  );

  for (const [monster, categories] of sortedMonsters.slice(0, 5)) {
    const uniqueCats = [...new Set(categories)];
    console.log(
      `    ${monster}: ${categories.length} issues (${uniqueCats.join(", ")})`,
    );
  }

  // Check for monsters that found nothing
  const activeMonsters = Object.keys(monsterCoverage);
  const silentMonsters = ALL_MONSTERS.map((m) => m.id).filter(
    (id) => !activeMonsters.some((am) => am.includes(id)),
  );

  if (silentMonsters.length > 0) {
    console.log(
      `\n  ⚠️  Monsters that found 0 issues: ${silentMonsters.length}`,
    );
    console.log(
      `     Consider reviewing: ${silentMonsters.slice(0, 5).join(", ")}`,
    );
  }

  // Save evolution report
  saveEvolutionReport(suggestions, monsterCoverage, silentMonsters);
}

function saveEvolutionReport(
  suggestions: EvolutionSuggestion[],
  coverage: Record<string, string[]>,
  silentMonsters: string[],
): void {
  const reportPath = path.join(process.cwd(), "docs/monster_evolution.md");

  const report = `# 🧬 Monster Evolution Report

**Generated:** ${new Date().toLocaleString()}

## Evolution Suggestions

${
  suggestions.length === 0
    ? "*No evolution needed right now.*"
    : suggestions
        .map(
          (s) => `
### ${s.issueId}: ${s.issueTitle}
- **Found by:** ${s.currentMonster}
- **Also add detection to:** ${s.suggestedMonsters.join(", ")}
- **Reason:** ${s.reason}
`,
        )
        .join("\n")
}

## Monster Coverage

| Monster | Issues Found | Categories |
|---------|--------------|------------|
${Object.entries(coverage)
  .sort((a, b) => b[1].length - a[1].length)
  .map(
    ([m, cats]) =>
      `| ${m} | ${cats.length} | ${[...new Set(cats)].join(", ")} |`,
  )
  .join("\n")}

## Silent Monsters (0 Issues Found)

${
  silentMonsters.length === 0
    ? "*All monsters are finding issues!*"
    : silentMonsters.map((m) => `- ${m}`).join("\n")
}

## Recommended Actions

1. **Review silent monsters** - Are they checking the right things?
2. **Add cross-detection** - Critical bugs should be caught by multiple monsters
3. **Run \`npm run monsters:learn\`** - Record any bugs found manually

---
*Use \`npm run monsters:learn\` to record bugs and improve detection.*
`;

  fs.writeFileSync(reportPath, report);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const startTime = Date.now();

  console.log("\n" + "═".repeat(60));
  console.log("  🦸 MONSTER ARMY - FULL DEPLOYMENT");
  console.log("═".repeat(60));

  // Determine which monsters to run
  let monstersToRun: MonsterDef[];

  if (args.includes("--fast")) {
    monstersToRun = ALL_MONSTERS.filter((m) => m.category === "fast");
    console.log("\n  Mode: ⚡ FAST ONLY");
  } else if (args.includes("--medium")) {
    monstersToRun = ALL_MONSTERS.filter(
      (m) => m.category === "fast" || m.category === "medium",
    );
    console.log("\n  Mode: 🔶 FAST + MEDIUM");
  } else if (args.includes("--full")) {
    monstersToRun = ALL_MONSTERS;
    console.log("\n  Mode: 🔴 FULL SUITE (all 21 monsters)");
  } else {
    // Default: run ALL monsters for comprehensive coverage
    monstersToRun = ALL_MONSTERS;
    console.log("\n  Mode: 🔴 FULL SUITE (all 21 monsters)");
  }

  console.log(`  Monsters: ${monstersToRun.length}/${ALL_MONSTERS.length}`);
  console.log(
    `  Categories: ${[...new Set(monstersToRun.map((m) => m.category))].join(", ")}`,
  );

  // Run all in parallel
  const results = await runMonstersParallel(monstersToRun);

  // Calculate stats
  const totalDuration = Date.now() - startTime;
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalIssues = results.reduce((sum, r) => sum + r.issuesFound, 0);

  // Print results
  console.log("\n" + "═".repeat(60));
  console.log("  📊 RESULTS");
  console.log("═".repeat(60));

  console.log(`\n  ⏱️  Total Time: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`  ✅ Passed: ${passed}/${results.length}`);
  console.log(`  ❌ Failed: ${failed}/${results.length}`);
  console.log(`  🔍 Issues Found This Run: ${totalIssues}`);

  console.log("\n  Monster Results:");
  console.log("  " + "─".repeat(56));

  for (const result of results.sort((a, b) => a.duration - b.duration)) {
    const icon = result.success ? "✅" : "❌";
    const time = (result.duration / 1000).toFixed(1).padStart(6);
    const name = result.monster.name.padEnd(20);
    const issues =
      result.issuesFound > 0 ? ` (${result.issuesFound} issues)` : "";
    console.log(`  ${icon} ${name} ${time}s${issues}`);
  }

  // Show failed monsters
  const failedMonsters = results.filter((r) => !r.success);
  if (failedMonsters.length > 0) {
    console.log("\n  " + "─".repeat(56));
    console.log("  ❌ FAILED MONSTERS:");
    for (const m of failedMonsters) {
      console.log(`\n  ${m.monster.name}:`);
      if (m.error) {
        console.log(`    Error: ${m.error}`);
      }
      const lines = m.output.split("\n").filter((l) => l.trim());
      const lastLines = lines.slice(-5);
      lastLines.forEach((l) => console.log(`    ${l.slice(0, 70)}`));
    }
  }

  // Show issue tracker summary
  console.log("\n");
  printSummary();

  // Generate reports
  generateReport();
  generateStatsReport();

  console.log("  📄 Issues Report: docs/MONSTERS_ISSUES.md");
  console.log("  📊 Stats Report: docs/monster_stats.md");

  // Evolution Analysis - analyze if monsters should have caught issues they didn't
  if (totalIssues > 0) {
    await analyzeEvolution();
  }

  console.log("\n" + "═".repeat(60) + "\n");

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Monster Army deployment failed:", err);
  process.exit(1);
});
