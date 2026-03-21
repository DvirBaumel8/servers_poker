/**
 * Visual Test Runner
 * ==================
 *
 * AI-powered visual testing framework that uses browser automation
 * to detect UI issues like:
 * - Element overlaps (cards hiding names)
 * - Layout breaking at different screen sizes
 * - Visual regressions
 * - Missing elements
 * - Accessibility issues
 *
 * This runner is designed to be used with the browser MCP tools.
 */

export interface VisualTestConfig {
  name: string;
  baseUrl: string;
  viewports: Viewport[];
  screenshotDir: string;
  compareWithBaseline: boolean;
}

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

export interface VisualTestResult {
  testName: string;
  viewport: Viewport;
  passed: boolean;
  issues: VisualIssue[];
  screenshotPath?: string;
  duration: number;
}

export interface VisualIssue {
  type:
    | "overlap"
    | "missing"
    | "layout"
    | "accessibility"
    | "visual_regression"
    | "responsive";
  severity: "critical" | "major" | "minor";
  element?: string;
  description: string;
  location?: { x: number; y: number; width: number; height: number };
  screenshot?: string;
}

export interface ElementBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Standard viewports for testing
export const STANDARD_VIEWPORTS: Viewport[] = [
  { name: "desktop-lg", width: 1920, height: 1080 },
  { name: "desktop", width: 1366, height: 768 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "mobile-lg", width: 428, height: 926 },
  { name: "mobile", width: 375, height: 667 },
  { name: "mobile-sm", width: 320, height: 568 },
];

// Game-specific viewports (poker table needs wider screens)
export const GAME_VIEWPORTS: Viewport[] = [
  { name: "desktop-lg", width: 1920, height: 1080 },
  { name: "desktop", width: 1366, height: 768 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet-landscape", width: 1024, height: 768 },
];

/**
 * Check if two bounding boxes overlap
 */
export function checkOverlap(
  box1: ElementBoundingBox,
  box2: ElementBoundingBox,
): boolean {
  return !(
    box1.x + box1.width < box2.x ||
    box2.x + box2.width < box1.x ||
    box1.y + box1.height < box2.y ||
    box2.y + box2.height < box1.y
  );
}

/**
 * Calculate overlap area between two boxes
 */
export function getOverlapArea(
  box1: ElementBoundingBox,
  box2: ElementBoundingBox,
): number {
  const xOverlap = Math.max(
    0,
    Math.min(box1.x + box1.width, box2.x + box2.width) -
      Math.max(box1.x, box2.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(box1.y + box1.height, box2.y + box2.height) -
      Math.max(box1.y, box2.y),
  );
  return xOverlap * yOverlap;
}

/**
 * Calculate overlap percentage relative to the smaller element
 */
export function getOverlapPercentage(
  box1: ElementBoundingBox,
  box2: ElementBoundingBox,
): number {
  const overlapArea = getOverlapArea(box1, box2);
  const smallerArea = Math.min(
    box1.width * box1.height,
    box2.width * box2.height,
  );
  return smallerArea > 0 ? (overlapArea / smallerArea) * 100 : 0;
}

/**
 * Test scenarios for visual testing
 */
export const VISUAL_TEST_SCENARIOS = {
  // Game table scenarios
  GAME_TABLE_2_PLAYERS: {
    name: "Game Table - 2 Players",
    description: "Heads-up game with 2 players",
    checks: [
      "player_overlap",
      "card_visibility",
      "name_visibility",
      "pot_display",
    ],
  },
  GAME_TABLE_6_PLAYERS: {
    name: "Game Table - 6 Players",
    description: "6-handed game",
    checks: [
      "player_overlap",
      "card_visibility",
      "name_visibility",
      "bet_display",
    ],
  },
  GAME_TABLE_9_PLAYERS: {
    name: "Game Table - 9 Players (Full)",
    description: "Full ring 9-player game",
    checks: [
      "player_overlap",
      "card_visibility",
      "name_visibility",
      "crowding",
    ],
  },
  TOURNAMENT_LOBBY: {
    name: "Tournament Lobby",
    description: "Tournament list and details",
    checks: ["table_layout", "button_visibility", "responsive_cards"],
  },
  LEADERBOARD: {
    name: "Leaderboard",
    description: "Player rankings display",
    checks: ["table_layout", "scroll_behavior", "data_visibility"],
  },
  ERROR_STATES: {
    name: "Error States",
    description: "Error messages and fallbacks",
    checks: ["error_visibility", "retry_buttons", "helpful_messages"],
  },
};

/**
 * CSS selectors for key game elements
 */
export const GAME_SELECTORS = {
  // Table component
  TABLE_CONTAINER: "[class*='aspect-[16/10]']",
  FELT_SURFACE: "[class*='rounded-[50%]']",

  // Player elements
  PLAYER_SEAT: "[class*='PlayerSeat']",
  PLAYER_AVATAR: "[class*='w-14'][class*='h-14'][class*='rounded-full']",
  PLAYER_NAME: "[class*='truncate'][class*='max-w-']",
  PLAYER_CHIPS: "[class*='font-bold'][class*='text-sm']",
  PLAYER_CARDS: "[class*='MiniPlayingCard']",

  // Game elements
  COMMUNITY_CARDS: "[class*='CommunityCards']",
  POT_DISPLAY: "[class*='Main pot']",
  HAND_INFO: "[class*='Hand #']",

  // Badges
  DEALER_BUTTON: "text=D",
  ALL_IN_BADGE: "text=ALL IN",
  FOLD_BADGE: "text=FOLD",
  ACTION_BADGE: "[class*='ActionBadge']",
};

/**
 * Format test results as markdown report
 */
export function formatVisualTestReport(results: VisualTestResult[]): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  let report = `# Visual Test Report\n\n`;
  report += `**Date:** ${new Date().toISOString()}\n`;
  report += `**Tests:** ${results.length} total, ${passed} passed, ${failed} failed\n\n`;

  if (failed > 0) {
    report += `## ❌ Failed Tests\n\n`;
    for (const result of results.filter((r) => !r.passed)) {
      report += `### ${result.testName} (${result.viewport.name})\n\n`;
      for (const issue of result.issues) {
        report += `- **[${issue.severity.toUpperCase()}]** ${issue.type}: ${issue.description}\n`;
        if (issue.element) {
          report += `  - Element: \`${issue.element}\`\n`;
        }
        if (issue.location) {
          report += `  - Location: (${issue.location.x}, ${issue.location.y}) ${issue.location.width}x${issue.location.height}\n`;
        }
      }
      report += `\n`;
    }
  }

  report += `## ✅ Passed Tests\n\n`;
  for (const result of results.filter((r) => r.passed)) {
    report += `- ${result.testName} (${result.viewport.name}) - ${result.duration}ms\n`;
  }

  return report;
}

/**
 * AI-friendly issue description generator
 */
export function describeIssueForAI(issue: VisualIssue): string {
  const severityEmoji = {
    critical: "🔴",
    major: "🟠",
    minor: "🟡",
  };

  return `${severityEmoji[issue.severity]} ${issue.type.toUpperCase()}: ${issue.description}`;
}
