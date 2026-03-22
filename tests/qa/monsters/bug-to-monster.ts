#!/usr/bin/env npx ts-node
/**
 * 🐛➡️👾 BUG-TO-MONSTER WORKFLOW
 *
 * When a bug is found (by anyone, anywhere), this tool:
 * 1. Records the bug details
 * 2. Analyzes which monster SHOULD have caught it
 * 3. Generates the detection code to add to that monster
 * 4. Tracks that we've learned from this bug
 *
 * Usage:
 *   npm run monsters:learn               # Interactive mode
 *   npm run monsters:learn:from-file     # From bug report file
 *
 * The goal: EVERY bug makes our monsters smarter.
 * We should NEVER see the same type of bug twice.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ============================================================================
// TYPES
// ============================================================================

interface BugReport {
  id: string;
  title: string;
  description: string;
  category: BugCategory;
  severity: "critical" | "high" | "medium" | "low";
  location: string;
  foundBy: string; // "user", "manual-testing", "production", "code-review", etc.
  foundDate: string;
  rootCause?: string;
  fix?: string;
}

interface MonsterLearning {
  bugId: string;
  monster: string;
  detectionPattern: string;
  detectionCode: string;
  addedDate: string;
  verified: boolean;
}

interface LearningDatabase {
  version: number;
  lastUpdated: string;
  bugs: BugReport[];
  learnings: MonsterLearning[];
  stats: {
    totalBugsRecorded: number;
    totalLearningsAdded: number;
    bugsByCategory: Record<string, number>;
  };
}

type BugCategory =
  | "ui-crash"
  | "ui-visual"
  | "ui-ux"
  | "api-error"
  | "api-validation"
  | "api-security"
  | "game-logic"
  | "game-invariant"
  | "tournament"
  | "performance"
  | "accessibility"
  | "data-integrity"
  | "other";

// ============================================================================
// MONSTER MAPPING
// ============================================================================

const CATEGORY_TO_MONSTER: Record<BugCategory, string[]> = {
  "ui-crash": ["browser-qa", "quick-check"],
  "ui-visual": ["product-quality", "fast-quality", "design-critic"],
  "ui-ux": ["browser-qa", "product-quality"],
  "api-error": ["api-monster", "e2e"],
  "api-validation": ["api-monster", "contract-monster"],
  "api-security": ["guardian-monster", "api-monster"],
  "game-logic": ["invariant-monster", "game-flow"],
  "game-invariant": ["invariant-monster"],
  tournament: ["tournament-flow", "invariant-monster"],
  performance: ["browser-qa"],
  accessibility: ["browser-qa"],
  "data-integrity": ["invariant-monster", "game-flow"],
  other: ["code-quality"],
};

const MONSTER_FILES: Record<string, string> = {
  "browser-qa": "tests/qa/monsters/browser-monster/browser-qa-monster.ts",
  "quick-check": "tests/qa/monsters/browser-monster/quick-check.ts",
  "product-quality":
    "tests/qa/monsters/browser-monster/product-quality-monster.ts",
  "fast-quality": "tests/qa/monsters/browser-monster/fast-quality-monster.ts",
  "design-critic": "tests/qa/monsters/browser-monster/design-critic-monster.ts",
  "api-monster": "tests/qa/monsters/api-monster/api-monster.ts",
  "contract-monster": "tests/qa/monsters/contract-monster/contract-monster.ts",
  "guardian-monster": "tests/qa/monsters/guardian-monster/guardian-monster.ts",
  "invariant-monster":
    "tests/qa/monsters/invariant-monster/poker-invariants.ts",
  "game-flow": "tests/qa/monsters/flows/game-flow-monster.ts",
  "tournament-flow": "tests/qa/monsters/flows/tournament-flow-monster.ts",
  e2e: "tests/qa/monsters/e2e-monster/e2e-monster.ts",
  "code-quality":
    "tests/qa/monsters/code-quality-monster/code-quality-monster.ts",
};

// ============================================================================
// DATABASE
// ============================================================================

const DB_PATH = path.join(process.cwd(), "tests/qa/monsters/learnings.json");

function loadDatabase(): LearningDatabase {
  if (fs.existsSync(DB_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    } catch {
      console.warn("Learning database corrupted, starting fresh");
    }
  }
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    bugs: [],
    learnings: [],
    stats: {
      totalBugsRecorded: 0,
      totalLearningsAdded: 0,
      bugsByCategory: {},
    },
  };
}

function saveDatabase(db: LearningDatabase): void {
  db.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ============================================================================
// BUG ANALYSIS
// ============================================================================

function analyzeWhichMonsterShouldCatch(bug: BugReport): {
  primaryMonster: string;
  secondaryMonsters: string[];
  reason: string;
} {
  const monsters = CATEGORY_TO_MONSTER[bug.category] || ["code-quality"];

  return {
    primaryMonster: monsters[0],
    secondaryMonsters: monsters.slice(1),
    reason: getAnalysisReason(bug),
  };
}

function getAnalysisReason(bug: BugReport): string {
  const reasons: Record<BugCategory, string> = {
    "ui-crash":
      "UI crashes should be caught by browser console error monitoring",
    "ui-visual":
      "Visual issues should be caught by quality checks and design validation",
    "ui-ux":
      "UX issues should be caught by interaction testing and user flow validation",
    "api-error":
      "API errors should be caught by endpoint testing and response validation",
    "api-validation": "Validation issues should be caught by contract testing",
    "api-security":
      "Security issues should be caught by guardian monster's security scans",
    "game-logic":
      "Game logic bugs should be caught by invariant checks during gameplay",
    "game-invariant":
      "Invariant violations should be caught by the invariant monster",
    tournament:
      "Tournament bugs should be caught by tournament flow monitoring",
    performance:
      "Performance issues should be caught by load time and resource monitoring",
    accessibility: "A11Y issues should be caught by accessibility checks",
    "data-integrity":
      "Data integrity should be caught by invariant and consistency checks",
    other: "General code quality issues should be caught by static analysis",
  };

  return reasons[bug.category] || "This type of bug needs detection logic";
}

// ============================================================================
// DETECTION CODE GENERATION
// ============================================================================

function generateDetectionCode(bug: BugReport, monster: string): string {
  // Generate sample detection code based on bug type
  const templates: Record<string, (bug: BugReport) => string> = {
    "browser-qa": (b) => `
// Detection for: ${b.title}
// Added after bug ${b.id} was found by ${b.foundBy}
const check${sanitizeForCode(b.title)} = await page.evaluate(\`
  (() => {
    // TODO: Add specific check for "${b.description}"
    // Pattern to detect: ${b.rootCause || "unknown pattern"}
    return { found: false, details: null };
  })()
\`);
if (check${sanitizeForCode(b.title)}.found) {
  this.addFinding("BUG", "${b.severity}", "${b.title}", check${sanitizeForCode(b.title)}.details, page.url());
}
`,
    "invariant-monster": (b) => `
// Invariant for: ${b.title}
// Added after bug ${b.id} was found by ${b.foundBy}
{
  id: "${sanitizeForCode(b.title).toLowerCase()}",
  name: "${b.title}",
  category: "${b.category.includes("game") ? "state" : "money"}",
  severity: "${b.severity}",
  check: (ctx: InvariantContext) => {
    // TODO: Implement check for "${b.description}"
    // Root cause: ${b.rootCause || "unknown"}
    const violation = false; // Replace with actual check
    
    if (violation) {
      return {
        passed: false,
        message: "${b.title}",
        evidence: { /* relevant data */ },
      };
    }
    return { passed: true };
  },
},
`,
    "api-monster": (b) => `
// API check for: ${b.title}
// Added after bug ${b.id} was found by ${b.foundBy}
{
  name: "${b.title}",
  endpoint: "${b.location}",
  check: async (response: any) => {
    // TODO: Check for "${b.description}"
    // Root cause: ${b.rootCause || "unknown"}
    const hasIssue = false; // Replace with actual validation
    
    if (hasIssue) {
      return { 
        passed: false, 
        message: "${b.title}",
        severity: "${b.severity}",
      };
    }
    return { passed: true };
  },
},
`,
    "code-quality": (b) => `
// Pattern for: ${b.title}
// Added after bug ${b.id} was found by ${b.foundBy}
{
  id: "${sanitizeForCode(b.title).toLowerCase()}",
  name: "${b.title}",
  severity: "${b.severity}",
  pattern: /TODO_PATTERN_HERE/g,  // Add regex pattern
  message: "${b.description}",
  suggestion: "${b.fix || "Fix this issue"}",
},
`,
  };

  // Get template or use generic
  const templateFn = templates[monster] || templates["code-quality"];
  return templateFn(bug);
}

function sanitizeForCode(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, "").replace(/^[0-9]/, "_$&");
}

// ============================================================================
// LEARNING WORKFLOW
// ============================================================================

async function recordBugAndLearn(bug: BugReport): Promise<void> {
  const db = loadDatabase();

  // Check for duplicate
  const existing = db.bugs.find(
    (b) => b.title === bug.title || b.description === bug.description,
  );
  if (existing) {
    console.log(`\n⚠️  Similar bug already recorded: ${existing.id}`);
    return;
  }

  // Record the bug
  db.bugs.push(bug);
  db.stats.totalBugsRecorded++;
  db.stats.bugsByCategory[bug.category] =
    (db.stats.bugsByCategory[bug.category] || 0) + 1;

  // Analyze which monster should catch it
  const analysis = analyzeWhichMonsterShouldCatch(bug);

  console.log("\n" + "═".repeat(60));
  console.log("  🔍 BUG ANALYSIS");
  console.log("═".repeat(60));
  console.log(`\n  Bug: ${bug.title}`);
  console.log(`  Category: ${bug.category}`);
  console.log(`  Found by: ${bug.foundBy}`);
  console.log(`\n  📍 Should be caught by: ${analysis.primaryMonster}`);
  console.log(
    `  📍 Also consider: ${analysis.secondaryMonsters.join(", ") || "none"}`,
  );
  console.log(`\n  Reason: ${analysis.reason}`);

  // Generate detection code
  const detectionCode = generateDetectionCode(bug, analysis.primaryMonster);

  console.log("\n" + "═".repeat(60));
  console.log("  💡 SUGGESTED DETECTION CODE");
  console.log("═".repeat(60));
  console.log(detectionCode);

  // Record the learning
  const learning: MonsterLearning = {
    bugId: bug.id,
    monster: analysis.primaryMonster,
    detectionPattern: bug.rootCause || bug.description,
    detectionCode,
    addedDate: new Date().toISOString(),
    verified: false,
  };
  db.learnings.push(learning);
  db.stats.totalLearningsAdded++;

  // Show where to add the code
  const monsterFile = MONSTER_FILES[analysis.primaryMonster];
  console.log("\n" + "═".repeat(60));
  console.log("  📁 ADD TO FILE");
  console.log("═".repeat(60));
  console.log(`\n  File: ${monsterFile}`);
  console.log(`\n  After adding the detection code, run:`);
  console.log(`    npm run monsters:all:fast`);
  console.log(`  to verify the monster now catches this bug type.`);

  saveDatabase(db);

  // Also save a pending learnings file for easy tracking
  savePendingLearning(bug, learning, monsterFile);

  console.log("\n" + "═".repeat(60));
  console.log("  ✅ LEARNING RECORDED");
  console.log("═".repeat(60));
  console.log(`\n  Bug ID: ${bug.id}`);
  console.log(`  Pending file: tests/qa/monsters/pending-learnings.md`);
  console.log("\n");
}

function savePendingLearning(
  bug: BugReport,
  learning: MonsterLearning,
  monsterFile: string,
): void {
  const pendingPath = path.join(
    process.cwd(),
    "tests/qa/monsters/pending-learnings.md",
  );

  // Read existing content or use template for new file
  let content = "";
  try {
    content = fs.readFileSync(pendingPath, "utf-8");
  } catch {
    // File doesn't exist, start with template
    content = `# 📝 Pending Monster Learnings

These bugs have been analyzed but the detection code hasn't been added yet.
After adding each detection, mark it as done and run the monsters to verify.

---

`;
  }

  content += `
## ${bug.id}: ${bug.title}

- **Category:** ${bug.category}
- **Severity:** ${bug.severity}
- **Found by:** ${bug.foundBy}
- **Date:** ${bug.foundDate}
- **Monster to update:** ${learning.monster}
- **File:** \`${monsterFile}\`

### Description
${bug.description}

### Root Cause
${bug.rootCause || "Not specified"}

### Detection Code to Add
\`\`\`typescript
${learning.detectionCode}
\`\`\`

### Verification
- [ ] Code added to monster
- [ ] Monster runs successfully
- [ ] Similar test case added
- [ ] Bug type now detected

---
`;

  fs.writeFileSync(pendingPath, content);
}

// ============================================================================
// INTERACTIVE MODE
// ============================================================================

async function interactiveMode(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.log("\n" + "═".repeat(60));
  console.log("  🐛➡️👾 BUG-TO-MONSTER LEARNING");
  console.log("═".repeat(60));
  console.log("\n  Recording a new bug to improve our monsters.\n");

  const title = await question("  Bug title: ");
  const description = await question("  Description: ");

  console.log("\n  Categories:");
  const categories = Object.keys(CATEGORY_TO_MONSTER);
  categories.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
  const catIndex = parseInt(await question("\n  Category number: ")) - 1;
  const category = categories[catIndex] as BugCategory;

  console.log("\n  Severity: 1=critical, 2=high, 3=medium, 4=low");
  const sevIndex = parseInt(await question("  Severity number: "));
  const severities: Array<"critical" | "high" | "medium" | "low"> = [
    "critical",
    "high",
    "medium",
    "low",
  ];
  const severity = severities[sevIndex - 1] || "medium";

  const location = await question("  Location (file/URL): ");
  const foundBy = await question("  Found by (user/testing/production/etc): ");
  const rootCause = await question("  Root cause (if known): ");
  const fix = await question("  Fix applied (if any): ");

  rl.close();

  const bug: BugReport = {
    id: `BUG-${Date.now().toString(36).toUpperCase()}`,
    title,
    description,
    category,
    severity,
    location,
    foundBy,
    foundDate: new Date().toISOString(),
    rootCause: rootCause || undefined,
    fix: fix || undefined,
  };

  await recordBugAndLearn(bug);
}

// ============================================================================
// STATS
// ============================================================================

function showStats(): void {
  const db = loadDatabase();

  console.log("\n" + "═".repeat(60));
  console.log("  📊 LEARNING STATISTICS");
  console.log("═".repeat(60));
  console.log(`\n  Total Bugs Recorded: ${db.stats.totalBugsRecorded}`);
  console.log(`  Total Learnings Added: ${db.stats.totalLearningsAdded}`);
  console.log(`\n  Bugs by Category:`);

  for (const [cat, count] of Object.entries(db.stats.bugsByCategory)) {
    console.log(`    ${cat}: ${count}`);
  }

  const pending = db.learnings.filter((l) => !l.verified).length;
  console.log(`\n  Pending Learnings (not verified): ${pending}`);
  console.log("\n");
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--stats")) {
    showStats();
    return;
  }

  if (args.includes("--help")) {
    console.log(`
Bug-to-Monster Learning System

Usage:
  npm run monsters:learn           Interactive bug recording
  npm run monsters:learn -- --stats Show learning statistics
  npm run monsters:learn -- --help  Show this help

Every bug we find should make our monsters smarter!
`);
    return;
  }

  await interactiveMode();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
