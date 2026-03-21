/**
 * Visual QA Orchestrator
 * ======================
 *
 * The "monster" that coordinates all visual testing engines
 * to find 200+ bugs per release cycle.
 *
 * Test Types:
 * 1. Visual Regression (screenshot comparison)
 * 2. DOM Overlap Detection (bounding box analysis)
 * 3. Responsive Layout (16 viewports)
 * 4. State Combinations (pairwise testing)
 * 5. User Flows (critical paths)
 * 6. Error States (fault injection)
 * 7. Accessibility (WCAG 2.1 AA)
 * 8. Performance (Core Web Vitals)
 * 9. Data Integrity (UI vs API)
 * 10. Real-time Updates (WebSocket)
 * 11. Edge Case Data (boundaries)
 * 12. Stability (memory leaks)
 */

export interface Bug {
  id: string;
  type: BugType;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  page: string;
  viewport?: Viewport;
  screenshot?: string;
  element?: string;
  expected: string;
  actual: string;
  timestamp: Date;
  reproducible: boolean;
  metadata?: Record<string, any>;
}

export type BugType =
  | "visual_regression"
  | "overlap"
  | "responsive"
  | "state"
  | "flow"
  | "error_handling"
  | "accessibility"
  | "performance"
  | "data_integrity"
  | "realtime"
  | "edge_case"
  | "stability";

export interface Viewport {
  name: string;
  width: number;
  height: number;
  deviceType: "desktop" | "tablet" | "mobile";
  touch?: boolean;
}

export interface TestConfig {
  baseUrl: string;
  viewports: Viewport[];
  pages: PageConfig[];
  flows: FlowConfig[];
  errorScenarios: ErrorScenario[];
  edgeCases: EdgeCaseConfig;
  thresholds: ThresholdConfig;
}

export interface PageConfig {
  path: string;
  name: string;
  requiresAuth: boolean;
  criticalElements: string[];
  states?: string[];
}

export interface FlowConfig {
  name: string;
  steps: FlowStep[];
}

export interface FlowStep {
  action: "navigate" | "click" | "type" | "wait" | "assert";
  target?: string;
  value?: string;
  timeout?: number;
}

export interface ErrorScenario {
  type: string;
  trigger: string;
  expectedUI: string[];
}

export interface EdgeCaseConfig {
  playerNames: string[];
  chipCounts: number[];
  playerCounts: number[];
}

export interface ThresholdConfig {
  overlapPercentage: number;
  minTouchTarget: number;
  minContrast: number;
  maxLCP: number;
  maxFID: number;
  maxCLS: number;
}

export interface TestResult {
  testType: BugType;
  page: string;
  viewport?: Viewport;
  passed: boolean;
  bugs: Bug[];
  duration: number;
  timestamp: Date;
}

export interface OrchestratorReport {
  startTime: Date;
  endTime: Date;
  duration: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  bugs: Bug[];
  bugsByType: Record<BugType, number>;
  bugsBySeverity: Record<string, number>;
  coverage: CoverageReport;
}

export interface CoverageReport {
  pagesTotal: number;
  pagesTested: number;
  viewportsTotal: number;
  viewportsTested: number;
  flowsTotal: number;
  flowsTested: number;
}

// Standard viewports (16 devices)
export const STANDARD_VIEWPORTS: Viewport[] = [
  // Desktop
  { name: "4K", width: 3840, height: 2160, deviceType: "desktop" },
  { name: "1440p", width: 2560, height: 1440, deviceType: "desktop" },
  { name: "1080p", width: 1920, height: 1080, deviceType: "desktop" },
  { name: "laptop", width: 1366, height: 768, deviceType: "desktop" },
  { name: "laptop-sm", width: 1280, height: 800, deviceType: "desktop" },
  // Tablet
  {
    name: "iPad-Pro-12",
    width: 1024,
    height: 1366,
    deviceType: "tablet",
    touch: true,
  },
  {
    name: "iPad-Air",
    width: 820,
    height: 1180,
    deviceType: "tablet",
    touch: true,
  },
  {
    name: "Surface-Pro",
    width: 912,
    height: 1368,
    deviceType: "tablet",
    touch: true,
  },
  // Mobile
  {
    name: "iPhone-14-Pro-Max",
    width: 430,
    height: 932,
    deviceType: "mobile",
    touch: true,
  },
  {
    name: "iPhone-14",
    width: 390,
    height: 844,
    deviceType: "mobile",
    touch: true,
  },
  {
    name: "iPhone-SE",
    width: 375,
    height: 667,
    deviceType: "mobile",
    touch: true,
  },
  {
    name: "Pixel-7",
    width: 412,
    height: 915,
    deviceType: "mobile",
    touch: true,
  },
  {
    name: "Galaxy-S21",
    width: 360,
    height: 800,
    deviceType: "mobile",
    touch: true,
  },
  {
    name: "Galaxy-Fold",
    width: 280,
    height: 653,
    deviceType: "mobile",
    touch: true,
  },
  // Edge cases
  { name: "ultra-wide", width: 3440, height: 1440, deviceType: "desktop" },
  { name: "tiny", width: 320, height: 480, deviceType: "mobile", touch: true },
];

// Pages to test
export const STANDARD_PAGES: PageConfig[] = [
  {
    path: "/",
    name: "Home",
    requiresAuth: false,
    criticalElements: ["nav", "hero", "cta-buttons"],
  },
  {
    path: "/tables",
    name: "Tables",
    requiresAuth: false,
    criticalElements: ["table-list", "stats"],
  },
  {
    path: "/tournaments",
    name: "Tournaments",
    requiresAuth: false,
    criticalElements: ["tournament-list", "filters"],
  },
  {
    path: "/bots",
    name: "Bots",
    requiresAuth: false,
    criticalElements: ["bot-list", "stats"],
  },
  {
    path: "/leaderboard",
    name: "Leaderboard",
    requiresAuth: false,
    criticalElements: ["ranking-table"],
  },
  {
    path: "/login",
    name: "Login",
    requiresAuth: false,
    criticalElements: ["email-input", "password-input", "submit"],
  },
  {
    path: "/register",
    name: "Register",
    requiresAuth: false,
    criticalElements: ["form", "submit"],
  },
  {
    path: "/game/:id",
    name: "Game Table",
    requiresAuth: false,
    criticalElements: ["poker-table", "player-seats"],
  },
  {
    path: "/tournament/:id",
    name: "Tournament View",
    requiresAuth: false,
    criticalElements: ["tournament-info", "tables"],
  },
  {
    path: "/bot/:id",
    name: "Bot Profile",
    requiresAuth: false,
    criticalElements: ["bot-info", "stats"],
  },
];

// Default thresholds
export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  overlapPercentage: 10, // Max 10% overlap before flagging
  minTouchTarget: 44, // Minimum 44x44px for touch targets
  minContrast: 4.5, // WCAG AA contrast ratio
  maxLCP: 2500, // Largest Contentful Paint (ms)
  maxFID: 100, // First Input Delay (ms)
  maxCLS: 0.1, // Cumulative Layout Shift
};

// Edge case test data
export const EDGE_CASE_DATA: EdgeCaseConfig = {
  playerNames: [
    "", // Empty
    "A", // Single char
    "PlayerWithVeryLongNameThatShouldTruncate",
    "🎰🃏♠️♥️♦️♣️", // Emoji
    "<script>alert('xss')</script>", // XSS attempt
    'Player "Nickname" Name', // Quotes
    "   SpacePadded   ", // Whitespace
    "John O'Connor", // Apostrophe
    "名前テスト", // Unicode
  ],
  chipCounts: [
    0,
    1,
    100,
    9999,
    10000, // 10K formatting
    100000, // 100K formatting
    1000000, // 1M formatting
    999999999, // Very large
  ],
  playerCounts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
};

/**
 * Generate unique bug ID
 */
export function generateBugId(type: BugType, page: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${type.substring(0, 3).toUpperCase()}-${timestamp}-${random}`;
}

/**
 * Classify bug severity based on type and impact
 */
export function classifySeverity(
  type: BugType,
  impact: { blocksUser?: boolean; dataLoss?: boolean; securityRisk?: boolean },
): Bug["severity"] {
  if (impact.securityRisk || impact.dataLoss) return "critical";
  if (impact.blocksUser) return "high";

  const highSeverityTypes: BugType[] = [
    "error_handling",
    "data_integrity",
    "flow",
  ];
  if (highSeverityTypes.includes(type)) return "high";

  const mediumSeverityTypes: BugType[] = [
    "responsive",
    "accessibility",
    "realtime",
  ];
  if (mediumSeverityTypes.includes(type)) return "medium";

  return "low";
}

/**
 * Format bug report as markdown
 */
export function formatBugReport(bugs: Bug[]): string {
  const critical = bugs.filter((b) => b.severity === "critical");
  const high = bugs.filter((b) => b.severity === "high");
  const medium = bugs.filter((b) => b.severity === "medium");
  const low = bugs.filter((b) => b.severity === "low");

  let report = `# Visual QA Bug Report\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Total Bugs:** ${bugs.length}\n\n`;

  report += `## Summary\n\n`;
  report += `| Severity | Count |\n|----------|-------|\n`;
  report += `| 🔴 Critical | ${critical.length} |\n`;
  report += `| 🟠 High | ${high.length} |\n`;
  report += `| 🟡 Medium | ${medium.length} |\n`;
  report += `| ⚪ Low | ${low.length} |\n\n`;

  if (critical.length > 0) {
    report += `## 🔴 Critical Bugs\n\n`;
    for (const bug of critical) {
      report += formatSingleBug(bug);
    }
  }

  if (high.length > 0) {
    report += `## 🟠 High Severity Bugs\n\n`;
    for (const bug of high) {
      report += formatSingleBug(bug);
    }
  }

  if (medium.length > 0) {
    report += `## 🟡 Medium Severity Bugs\n\n`;
    for (const bug of medium) {
      report += formatSingleBug(bug);
    }
  }

  if (low.length > 0) {
    report += `## ⚪ Low Severity Bugs\n\n`;
    for (const bug of low) {
      report += formatSingleBug(bug);
    }
  }

  return report;
}

function formatSingleBug(bug: Bug): string {
  let text = `### ${bug.id}: ${bug.title}\n\n`;
  text += `**Type:** ${bug.type}\n`;
  text += `**Page:** ${bug.page}\n`;
  if (bug.viewport) {
    text += `**Viewport:** ${bug.viewport.name} (${bug.viewport.width}x${bug.viewport.height})\n`;
  }
  if (bug.element) {
    text += `**Element:** \`${bug.element}\`\n`;
  }
  text += `\n**Description:** ${bug.description}\n\n`;
  text += `**Expected:** ${bug.expected}\n\n`;
  text += `**Actual:** ${bug.actual}\n\n`;
  if (bug.screenshot) {
    text += `**Screenshot:** \`${bug.screenshot}\`\n\n`;
  }
  text += `---\n\n`;
  return text;
}

/**
 * Generate orchestrator report
 */
export function generateOrchestratorReport(
  results: TestResult[],
  startTime: Date,
  endTime: Date,
): OrchestratorReport {
  const bugs = results.flatMap((r) => r.bugs);

  const bugsByType: Record<BugType, number> = {
    visual_regression: 0,
    overlap: 0,
    responsive: 0,
    state: 0,
    flow: 0,
    error_handling: 0,
    accessibility: 0,
    performance: 0,
    data_integrity: 0,
    realtime: 0,
    edge_case: 0,
    stability: 0,
  };

  const bugsBySeverity: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const bug of bugs) {
    bugsByType[bug.type]++;
    bugsBySeverity[bug.severity]++;
  }

  return {
    startTime,
    endTime,
    duration: endTime.getTime() - startTime.getTime(),
    totalTests: results.length,
    passedTests: results.filter((r) => r.passed).length,
    failedTests: results.filter((r) => !r.passed).length,
    bugs,
    bugsByType,
    bugsBySeverity,
    coverage: {
      pagesTotal: STANDARD_PAGES.length,
      pagesTested: new Set(results.map((r) => r.page)).size,
      viewportsTotal: STANDARD_VIEWPORTS.length,
      viewportsTested: new Set(
        results.filter((r) => r.viewport).map((r) => r.viewport!.name),
      ).size,
      flowsTotal: 0,
      flowsTested: 0,
    },
  };
}

/**
 * AI Instructions Generator
 * Generates step-by-step instructions for AI to execute tests
 */
export function generateAIInstructions(config: TestConfig): string {
  return `
# Visual QA Monster - AI Execution Instructions

## Overview
Run comprehensive visual testing across ${config.pages.length} pages and ${config.viewports.length} viewports.

## Execution Steps

### Phase 1: Setup
1. Verify frontend is running at ${config.baseUrl}
2. Verify backend is running
3. Lock the browser for automated testing

### Phase 2: Page-by-Page Testing

For EACH page in this list:
${config.pages.map((p, i) => `${i + 1}. ${p.name} (${p.path})`).join("\n")}

Do the following:

#### A. Navigate and Screenshot
\`\`\`
browser_navigate to: ${config.baseUrl}{path}
Wait for page load (loading indicators gone)
browser_take_screenshot with filename: {page}-desktop.png
\`\`\`

#### B. Check Critical Elements
For each page, verify these elements are visible:
${config.pages.map((p) => `- ${p.name}: ${p.criticalElements.join(", ")}`).join("\n")}

#### C. Viewport Loop
For EACH viewport:
${config.viewports
  .slice(0, 5)
  .map((v) => `- ${v.name}: ${v.width}x${v.height}`)
  .join("\n")}
... and ${config.viewports.length - 5} more

Do:
1. browser_resize to width x height
2. browser_snapshot to check DOM
3. browser_take_screenshot
4. Check for:
   - Horizontal overflow
   - Text truncation
   - Element visibility
   - Touch target size (if mobile)

#### D. Error State Testing
Navigate to invalid URLs:
- /game/fake-id-12345
- /tournament/fake-id
- /bot/fake-id

Verify proper error handling.

### Phase 3: Overlap Detection (Game Tables)

For game table with players:
1. Get bounding boxes of all player elements
2. Check for overlaps > ${config.thresholds.overlapPercentage}%
3. Report any overlaps found

### Phase 4: Generate Report

Compile all bugs found into markdown report.

## Bug Classification

| Type | Severity |
|------|----------|
| Page won't load | Critical |
| Data mismatch | Critical |
| Navigation broken | Critical |
| Element overlap | High |
| Responsive broken | High |
| Text truncated | Medium |
| Accessibility issue | Medium |
| Performance slow | Low |
| Cosmetic issue | Low |

## Output Format

For each bug found, report:
\`\`\`markdown
### BUG-XXX: [Title]
**Type:** [type]
**Severity:** [critical/high/medium/low]
**Page:** [page]
**Viewport:** [viewport]
**Description:** [what happened]
**Expected:** [what should happen]
**Actual:** [what actually happened]
**Screenshot:** [filename]
\`\`\`
`;
}
