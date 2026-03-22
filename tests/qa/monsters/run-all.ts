#!/usr/bin/env npx ts-node
/**
 * 🦸 RUN ALL MONSTERS - Parallel Execution
 *
 * Runs ALL 25 monsters in the army simultaneously for maximum coverage.
 * Automatically starts BE/FE servers if they aren't already running,
 * and tears them down when finished (only the ones it started).
 *
 * Usage:
 *   npm run monsters:all                      # Full suite, auto-start servers
 *   npm run monsters:all:fast                 # Fast monsters only
 *   npm run monsters:all -- --medium          # Fast + medium
 *   npm run monsters:all -- --static          # Static analysis only (no servers)
 *   npm run monsters:all -- --no-auto-start   # Skip auto-start, fail if servers down
 *   npm run monsters:all -- --no-browser      # Exclude browser-dependent monsters
 */

import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { readJsonSafe } from "./shared/fs-utils";
import {
  printSummary,
  generateReport,
  loadIssueDatabase,
  compactDatabase,
} from "./shared/issue-tracker";
import {
  parseResultFromOutput,
  MonsterResultEnvelope,
} from "./shared/cli-runner";

// ============================================================================
// SERVER MANAGEMENT — auto-start BE/FE if not already running
// ============================================================================

interface ManagedServer {
  name: string;
  process: ChildProcess | null;
  wasAlreadyRunning: boolean;
  port: number;
}

const BE_PORT = parseInt(process.env.BE_PORT || "3000", 10);
const FE_PORT = parseInt(process.env.FE_PORT || "3001", 10);
const SERVER_STARTUP_TIMEOUT_MS = 60_000;
const HEALTH_POLL_INTERVAL_MS = 1_000;

async function isPortResponding(port: number, pathStr = "/"): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://localhost:${port}${pathStr}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(
  port: number,
  healthPath: string,
  label: string,
  timeoutMs: number = SERVER_STARTUP_TIMEOUT_MS,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortResponding(port, healthPath)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
  console.error(
    `    ❌ ${label} did not become ready within ${timeoutMs / 1000}s`,
  );
  return false;
}

async function ensureBackend(): Promise<ManagedServer> {
  const server: ManagedServer = {
    name: "Backend",
    process: null,
    wasAlreadyRunning: false,
    port: BE_PORT,
  };

  if (await isPortResponding(BE_PORT, "/health")) {
    server.wasAlreadyRunning = true;
    console.log(`  ✅ Backend already running on port ${BE_PORT}`);
    return server;
  }

  console.log(`  🔄 Starting Backend on port ${BE_PORT}...`);

  const beProc = spawn("node", ["dist/src/main.js"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(BE_PORT) },
    detached: false,
  });

  server.process = beProc;

  beProc.stdout?.on("data", () => {});
  beProc.stderr?.on("data", () => {});

  beProc.on("error", (err) => {
    console.error(`    ❌ Backend process error: ${err.message}`);
  });

  beProc.on("exit", (code) => {
    if (code !== null && code !== 0 && server.process) {
      console.error(`    ❌ Backend exited with code ${code}`);
    }
  });

  const ready = await waitForServer(BE_PORT, "/health", "Backend");
  if (!ready) {
    beProc.kill();
    server.process = null;
    throw new Error(
      `Backend failed to start. Make sure you've run 'npx nest build' and PostgreSQL is running.`,
    );
  }

  console.log(`  ✅ Backend started successfully`);
  return server;
}

async function ensureFrontend(): Promise<ManagedServer> {
  const server: ManagedServer = {
    name: "Frontend",
    process: null,
    wasAlreadyRunning: false,
    port: FE_PORT,
  };

  if (await isPortResponding(FE_PORT, "/")) {
    server.wasAlreadyRunning = true;
    console.log(`  ✅ Frontend already running on port ${FE_PORT}`);
    return server;
  }

  console.log(`  🔄 Starting Frontend on port ${FE_PORT}...`);

  const feProc = spawn(
    "npx",
    ["vite", "--host", "0.0.0.0", "--port", String(FE_PORT)],
    {
      cwd: path.join(process.cwd(), "frontend"),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      detached: false,
      shell: true,
    },
  );

  server.process = feProc;

  feProc.stdout?.on("data", () => {});
  feProc.stderr?.on("data", () => {});

  feProc.on("error", (err) => {
    console.error(`    ❌ Frontend process error: ${err.message}`);
  });

  feProc.on("exit", (code) => {
    if (code !== null && code !== 0 && server.process) {
      console.error(`    ❌ Frontend exited with code ${code}`);
    }
  });

  const ready = await waitForServer(FE_PORT, "/", "Frontend");
  if (!ready) {
    feProc.kill();
    server.process = null;
    throw new Error(
      `Frontend failed to start. Make sure frontend dependencies are installed (cd frontend && npm install).`,
    );
  }

  console.log(`  ✅ Frontend started successfully`);
  return server;
}

function killManagedServer(server: ManagedServer): void {
  if (server.process && !server.wasAlreadyRunning) {
    console.log(`  🛑 Stopping ${server.name} (pid ${server.process.pid})...`);
    try {
      server.process.kill("SIGTERM");
    } catch {
      try {
        server.process.kill("SIGKILL");
      } catch {
        // Already dead
      }
    }
    server.process = null;
  }
}

async function ensureServers(
  needsServer: boolean,
  needsBrowser: boolean,
): Promise<ManagedServer[]> {
  const servers: ManagedServer[] = [];

  if (needsServer || needsBrowser) {
    servers.push(await ensureBackend());
  }

  if (needsBrowser) {
    servers.push(await ensureFrontend());
  }

  return servers;
}

function teardownServers(servers: ManagedServer[]): void {
  for (const server of servers) {
    killManagedServer(server);
  }
}

// ============================================================================
// MONSTER DEFINITIONS - ALL 25 MONSTERS
// ============================================================================

interface MonsterDef {
  id: string;
  name: string;
  command: string;
  category: "fast" | "medium" | "slow";
  description: string;
  needsBrowser?: boolean;
  needsServer?: boolean;
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
    needsBrowser: true,
  },
  {
    id: "fast-browser",
    name: "Fast Browser",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/fast-browser-monster.ts",
    category: "fast",
    description: "Fast bug detection",
    needsBrowser: true,
  },
  {
    id: "fast-quality",
    name: "Fast Quality",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/fast-quality-monster.ts",
    category: "fast",
    description: "Fast quality score",
    needsBrowser: true,
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
    needsServer: true,
  },
  {
    id: "api",
    name: "API Monster",
    command: "npx ts-node tests/qa/monsters/api-monster/api-monster.ts",
    category: "medium",
    description: "API endpoint testing",
    needsServer: true,
  },
  {
    id: "contract",
    name: "Contract Monster",
    command:
      "npx ts-node tests/qa/monsters/contract-monster/contract-monster.ts",
    category: "medium",
    description: "API contract validation",
    needsServer: true,
  },
  {
    id: "visual",
    name: "Visual Monster",
    command: "npx ts-node tests/qa/monsters/visual-monster/visual-monster.ts",
    category: "medium",
    description: "Visual regression",
    needsServer: true,
  },
  {
    id: "guardian",
    name: "Guardian Monster",
    command:
      "npx ts-node tests/qa/monsters/guardian-monster/guardian-monster.ts",
    category: "medium",
    description: "Security checks",
    needsServer: true,
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
    id: "data-integrity",
    name: "Data Integrity Monster",
    command:
      "npx ts-node tests/qa/monsters/data-integrity-monster/data-integrity-monster.ts",
    category: "medium",
    description: "Data layer integrity validation",
  },
  {
    id: "data-analytics",
    name: "Data Analytics Monster",
    command:
      "npx ts-node tests/qa/monsters/data-analytics-monster/data-analytics-monster.ts",
    category: "medium",
    description: "Analytics pipeline verification per DATA.md",
  },
  {
    id: "regression-check",
    name: "Regression Monster",
    command:
      "npx ts-node tests/qa/monsters/regression-monster/regression-monster.ts",
    category: "medium",
    description: "Verifies historical bugs stay fixed",
  },
  {
    id: "log-analyzer",
    name: "Log Analyzer Monster",
    command:
      "npx ts-node tests/qa/monsters/log-analyzer-monster/log-analyzer-monster.ts",
    category: "medium",
    description: "Backend/frontend log health analysis",
  },
  {
    id: "design-critic",
    name: "Design Critic",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/design-critic-monster.ts",
    category: "medium",
    description: "UI/UX critique",
    needsBrowser: true,
  },
  {
    id: "product-quality",
    name: "Product Quality",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/product-quality-monster.ts",
    category: "medium",
    description: "Full quality critique",
    needsBrowser: true,
  },
  {
    id: "explorer",
    name: "Explorer Monster",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/explorer-monster.ts",
    category: "medium",
    description: "Autonomous UI exploration",
    needsBrowser: true,
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
    needsBrowser: true,
  },
  {
    id: "e2e",
    name: "E2E Monster",
    command: "npx ts-node tests/qa/monsters/e2e-monster/e2e-monster.ts",
    category: "slow",
    description: "End-to-end flows",
    needsServer: true,
  },
  {
    id: "game-flow",
    name: "Game Flow",
    command: "npx ts-node tests/qa/monsters/flows/game-flow-monster.ts",
    category: "slow",
    description: "Complete game scenarios",
    needsServer: true,
  },
  {
    id: "tournament-flow",
    name: "Tournament Flow",
    command: "npx ts-node tests/qa/monsters/flows/tournament-flow-monster.ts",
    category: "slow",
    description: "Tournament lifecycle",
    needsServer: true,
  },
  {
    id: "chaos",
    name: "Chaos Monster",
    command: "npx ts-node tests/qa/monsters/chaos-monster/chaos-monster.ts",
    category: "slow",
    description: "Stress testing",
    needsServer: true,
  },
  {
    id: "superhero",
    name: "Superhero Monster",
    command:
      "npx ts-node tests/qa/monsters/browser-monster/superhero-monster.ts --quick",
    category: "slow",
    description: "Self-improving QA loop",
    needsBrowser: true,
  },
  // Browser Monster removed: MCP always unavailable, HTTP-only fallback
  // can't detect JS errors or UI bugs. Use browser-qa or explorer instead.
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

const STATS_PATH = path.join(process.cwd(), "docs/MONSTER_STATS.json");

function loadStats(): StatsDatabase {
  return (
    readJsonSafe<StatsDatabase>(STATS_PATH) ?? {
      version: 1,
      lastUpdated: new Date().toISOString(),
      monsters: {},
    }
  );
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
  const reportPath = path.join(process.cwd(), "docs/MONSTER_STATS.md");
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
  checksPerformed: number;
  envelope: MonsterResultEnvelope | null;
  error?: string;
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

      const envelope = parseResultFromOutput(outputText);

      const success = envelope ? envelope.passed : code === 0;
      const issuesFound = envelope ? envelope.findings : 0;
      const checksPerformed = envelope ? envelope.checks : 0;

      updateMonsterStats(monster, success, duration, issuesFound);

      resolve({
        monster,
        success,
        duration,
        output: outputText,
        issuesFound,
        checksPerformed,
        envelope,
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
        checksPerformed: 0,
        envelope: null,
        error: err.message,
      });
    });

    const timeoutMs =
      monster.category === "slow"
        ? 3 * 60 * 1000
        : monster.category === "medium"
          ? 2 * 60 * 1000
          : 30 * 1000;

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
        checksPerformed: 0,
        envelope: null,
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
  CODE_QUALITY: [
    "code-quality",
    "product-quality",
    "design-critic",
    "fast-quality",
  ],
  A11Y: ["browser-qa", "guardian"],
  SECURITY: ["guardian", "api"],
  BROWSER: ["browser-qa", "quick-check", "fast-browser"],
  VISUAL: ["visual", "design-critic"],
  UX: ["design-critic", "product-quality"],
  REGRESSION: ["regression-check"],
  CONCERN: ["code-quality", "data-integrity", "log-analyzer"],
  OBSERVATION: ["data-analytics", "log-analyzer"],
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
  const reportPath = path.join(process.cwd(), "docs/MONSTER_EVOLUTION.md");

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

## Dead-Weight Analysis

${(() => {
  const statsDb = loadStats();
  const allMonsters = Object.values(statsDb.monsters);
  const deadWeightMonsters = allMonsters.filter(
    (m) => m.totalRuns >= 5 && m.totalIssuesFound === 0,
  );
  if (deadWeightMonsters.length === 0) return "*All monsters are productive!*";
  return deadWeightMonsters
    .map((m) => {
      const rate =
        m.totalRuns > 0
          ? Math.round((m.successfulRuns / m.totalRuns) * 100)
          : 0;
      return `- **${m.name}** — ${m.totalRuns} runs, ${rate}% success, 0 issues found`;
    })
    .join("\n");
})()}

## Recommended Actions

1. **Review silent monsters** - Are they checking the right things?
2. **Add cross-detection** - Critical bugs should be caught by multiple monsters
3. **Run \`npm run monsters:learn\`** - Record any bugs found manually

---
*Use \`npm run monsters:learn\` to record bugs and improve detection.*
`;

  fs.writeFileSync(reportPath, report);
}

function analyzeDeadWeight(): void {
  const db = loadStats();
  const activeIds = new Set(ALL_MONSTERS.map((m) => m.id));
  const monsters = Object.values(db.monsters).filter((m) =>
    activeIds.has(m.id),
  );

  if (monsters.length === 0) return;

  const deadWeight: MonsterStats[] = [];

  for (const m of monsters) {
    if (m.totalRuns >= 5 && m.totalIssuesFound === 0) {
      deadWeight.push(m);
    }
  }

  if (deadWeight.length === 0) return;

  console.log("\n" + "─".repeat(56));
  console.log("  ⚖️  DEAD-WEIGHT ANALYSIS");
  console.log("─".repeat(56));
  console.log(
    `\n  ${deadWeight.length} monster(s) have found 0 issues across ${deadWeight.reduce((s, m) => s + m.totalRuns, 0)} total runs:\n`,
  );

  for (const m of deadWeight) {
    const successRate =
      m.totalRuns > 0 ? Math.round((m.successfulRuns / m.totalRuns) * 100) : 0;

    let recommendation: string;
    if (m.failedRuns > m.successfulRuns) {
      recommendation = "BROKEN — crashes more than it succeeds. Fix or remove.";
    } else if (m.totalRuns >= 10) {
      recommendation =
        "INEFFECTIVE — 10+ runs, 0 findings. Needs stronger checks or removal.";
    } else {
      recommendation = "WATCH — may need tuning to detect real issues.";
    }

    console.log(`    ${m.name}`);
    console.log(
      `      Runs: ${m.totalRuns} | Success: ${successRate}% | Avg: ${(m.avgDuration / 1000).toFixed(1)}s`,
    );
    console.log(`      → ${recommendation}`);
  }
  console.log("");
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const startTime = Date.now();
  let managedServers: ManagedServer[] = [];

  console.log("\n" + "═".repeat(60));
  console.log("  🦸 MONSTER ARMY - FULL DEPLOYMENT");
  console.log("═".repeat(60));

  // Determine which monsters to run
  let monstersToRun: MonsterDef[];
  const noBrowser = args.includes("--no-browser");
  const staticOnly = args.includes("--static");
  const noAutoStart = args.includes("--no-auto-start");

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
    console.log("\n  Mode: 🔴 FULL SUITE (all 25 monsters)");
  } else {
    monstersToRun = ALL_MONSTERS;
    console.log("\n  Mode: 🔴 FULL SUITE (all 25 monsters)");
  }

  if (staticOnly) {
    monstersToRun = monstersToRun.filter(
      (m) => !m.needsBrowser && !m.needsServer,
    );
    console.log(
      "  Filter: 📦 Static analysis only (no browser/server required)",
    );
  } else if (noBrowser) {
    monstersToRun = monstersToRun.filter((m) => !m.needsBrowser);
    console.log("  Filter: 🚫 Excluding browser-dependent monsters");
  }

  console.log(`  Monsters: ${monstersToRun.length}/${ALL_MONSTERS.length}`);
  console.log(
    `  Categories: ${[...new Set(monstersToRun.map((m) => m.category))].join(", ")}`,
  );

  // Auto-start BE/FE if needed (unless --static or --no-auto-start)
  if (!staticOnly && !noAutoStart) {
    const needsServer = monstersToRun.some((m) => m.needsServer);
    const needsBrowser = monstersToRun.some((m) => m.needsBrowser);

    if (needsServer || needsBrowser) {
      console.log("\n  " + "─".repeat(56));
      console.log("  🖥️  SERVER MANAGEMENT");
      console.log("  " + "─".repeat(56));

      try {
        managedServers = await ensureServers(needsServer, needsBrowser);
        activeServers = managedServers;
      } catch (err: any) {
        console.error(`\n  ❌ Server startup failed: ${err.message}`);
        console.error(
          "  Use --static to skip server-dependent monsters, or --no-auto-start to disable auto-start.",
        );
        process.exit(1);
      }
    }
  }

  // Run all in parallel
  let results: MonsterResult[];
  try {
    results = await runMonstersParallel(monstersToRun);
  } finally {
    teardownServers(managedServers);
  }

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
    const checksInfo =
      result.checksPerformed > 0 ? ` [${result.checksPerformed} checks]` : "";
    const issues =
      result.issuesFound > 0 ? ` (${result.issuesFound} issues)` : "";
    const source = result.envelope ? "" : " [no envelope]";
    console.log(`  ${icon} ${name} ${time}s${checksInfo}${issues}${source}`);
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

  // Compact old issues before reporting
  const compactResult = compactDatabase();
  if (compactResult.expired > 0 || compactResult.autoResolved > 0) {
    console.log(
      `\n  🧹 Compacted: ${compactResult.expired} expired, ${compactResult.autoResolved} auto-resolved ` +
        `(${compactResult.beforeSize} → ${compactResult.afterSize} issues)`,
    );
  }

  // Show issue tracker summary
  console.log("\n");
  printSummary();

  // Generate reports
  generateReport();
  generateStatsReport();

  console.log("  📄 Issues Report: docs/MONSTERS_ISSUES.md");
  console.log("  📊 Stats Report: docs/MONSTER_STATS.md");

  // Evolution Analysis - analyze if monsters should have caught issues they didn't
  if (totalIssues > 0) {
    await analyzeEvolution();
  }

  analyzeDeadWeight();

  console.log("\n" + "═".repeat(60) + "\n");

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Ensure servers are cleaned up on unexpected exits
let activeServers: ManagedServer[] = [];

function cleanupOnExit(): void {
  teardownServers(activeServers);
}

process.on("SIGINT", () => {
  console.log("\n  Received SIGINT, cleaning up...");
  cleanupOnExit();
  process.exit(130);
});
process.on("SIGTERM", () => {
  console.log("\n  Received SIGTERM, cleaning up...");
  cleanupOnExit();
  process.exit(143);
});

main().catch((err) => {
  cleanupOnExit();
  console.error("Monster Army deployment failed:", err);
  process.exit(1);
});
