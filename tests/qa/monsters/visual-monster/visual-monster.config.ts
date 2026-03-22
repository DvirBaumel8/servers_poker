/**
 * Visual Monster Configuration
 *
 * Defines pages, viewports, and visual checks to perform.
 */

export interface Viewport {
  name: string;
  width: number;
  height: number;
  deviceType: "desktop" | "tablet" | "mobile";
  touch: boolean;
}

export interface PageConfig {
  path: string;
  name: string;
  requiresAuth: boolean;
  critical?: boolean;
  waitForSelector?: string;
  dataStates?: string[];
  interactiveElements?: string[];
}

export interface VisualCheck {
  name: string;
  selector: string;
  check:
    | "no-overflow"
    | "visible"
    | "accessible-name"
    | "min-contrast"
    | "touch-target";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
}

export interface VisualMonsterConfig {
  baseUrl: string;
  screenshotDir: string;
  viewports: Viewport[];
  pages: PageConfig[];
  checks: VisualCheck[];
  consoleErrorPatterns: {
    pattern: RegExp;
    severity: "critical" | "high" | "medium" | "low";
  }[];
}

// ============================================================================
// VIEWPORTS
// ============================================================================

const VIEWPORTS: Viewport[] = [
  // Desktop
  {
    name: "Desktop 1920",
    width: 1920,
    height: 1080,
    deviceType: "desktop",
    touch: false,
  },
  {
    name: "Desktop 1440",
    width: 1440,
    height: 900,
    deviceType: "desktop",
    touch: false,
  },
  {
    name: "Desktop 1280",
    width: 1280,
    height: 800,
    deviceType: "desktop",
    touch: false,
  },

  // Tablet
  {
    name: "iPad Pro",
    width: 1024,
    height: 1366,
    deviceType: "tablet",
    touch: true,
  },
  { name: "iPad", width: 768, height: 1024, deviceType: "tablet", touch: true },

  // Mobile
  {
    name: "iPhone 14 Pro",
    width: 393,
    height: 852,
    deviceType: "mobile",
    touch: true,
  },
  {
    name: "iPhone SE",
    width: 375,
    height: 667,
    deviceType: "mobile",
    touch: true,
  },
  {
    name: "Pixel 7",
    width: 412,
    height: 915,
    deviceType: "mobile",
    touch: true,
  },
  {
    name: "Galaxy S21",
    width: 360,
    height: 800,
    deviceType: "mobile",
    touch: true,
  },

  // Edge cases
  {
    name: "Galaxy Fold",
    width: 280,
    height: 653,
    deviceType: "mobile",
    touch: true,
  },
];

// ============================================================================
// PAGES
// ============================================================================

const PAGES: PageConfig[] = [
  {
    path: "/",
    name: "Home",
    requiresAuth: false,
    critical: true,
    waitForSelector: "main",
    dataStates: ["loaded"],
  },
  {
    path: "/login",
    name: "Login",
    requiresAuth: false,
    critical: true,
    waitForSelector: "form",
    dataStates: ["empty", "error", "submitting"],
    interactiveElements: [
      "input[type='email']",
      "input[type='password']",
      "button[type='submit']",
    ],
  },
  {
    path: "/register",
    name: "Register",
    requiresAuth: false,
    waitForSelector: "form",
    dataStates: ["empty", "error", "submitting"],
  },
  {
    path: "/tournaments",
    name: "Tournaments",
    requiresAuth: false,
    critical: true,
    waitForSelector: "[data-testid='tournament-list'], .tournament-card, main",
    dataStates: ["loading", "loaded", "empty"],
  },
  {
    path: "/leaderboard",
    name: "Leaderboard",
    requiresAuth: false,
    waitForSelector: "table, [data-testid='leaderboard'], main",
    dataStates: ["loading", "loaded", "empty"],
  },
  {
    path: "/tables",
    name: "Tables",
    requiresAuth: false,
    waitForSelector: "[data-testid='table-list'], main",
    dataStates: ["loading", "loaded", "empty"],
  },
  {
    path: "/bots",
    name: "Bots",
    requiresAuth: true,
    waitForSelector: "[data-testid='bot-list'], main",
    dataStates: ["loading", "loaded", "empty"],
  },
  {
    path: "/bots/build",
    name: "Bot Builder",
    requiresAuth: true,
    waitForSelector: "[data-testid='bot-builder'], main",
    dataStates: ["loading", "loaded"],
    interactiveElements: [
      "input[name='name']",
      "button[type='submit']",
      "[data-testid='tier-selector']",
    ],
  },
  {
    path: "/profile",
    name: "Profile",
    requiresAuth: true,
    waitForSelector: "[data-testid='profile'], main",
  },
  {
    path: "/admin/tournaments",
    name: "Admin Tournaments",
    requiresAuth: true,
    waitForSelector: "[data-testid='admin-tournaments'], main",
  },
  {
    path: "/admin/analytics",
    name: "Admin Analytics",
    requiresAuth: true,
    waitForSelector: "[data-testid='analytics'], main",
  },
];

// ============================================================================
// VISUAL CHECKS
// ============================================================================

const VISUAL_CHECKS: VisualCheck[] = [
  // Overflow checks
  {
    name: "tables_no_horizontal_overflow",
    selector: "table",
    check: "no-overflow",
    severity: "high",
    description:
      "Tables should not have horizontal overflow that clips content",
  },
  {
    name: "cards_no_overflow",
    selector: "[class*='card'], [class*='Card']",
    check: "no-overflow",
    severity: "medium",
    description: "Cards should not have content overflow",
  },
  {
    name: "text_no_overflow",
    selector: "h1, h2, h3, p, span, td",
    check: "no-overflow",
    severity: "medium",
    description: "Text elements should not overflow their containers",
  },

  // Accessibility checks
  {
    name: "buttons_accessible",
    selector: "button",
    check: "accessible-name",
    severity: "critical",
    description: "All buttons must have accessible names for screen readers",
  },
  {
    name: "links_accessible",
    selector: "a",
    check: "accessible-name",
    severity: "critical",
    description: "All links must have accessible names",
  },
  {
    name: "inputs_labeled",
    selector: "input, textarea, select",
    check: "accessible-name",
    severity: "high",
    description: "Form inputs must have associated labels",
  },

  // Touch targets
  {
    name: "mobile_touch_targets",
    selector: "button, a, [role='button'], input[type='submit']",
    check: "touch-target",
    severity: "medium",
    description: "Interactive elements must be at least 44x44px on mobile",
  },
];

// ============================================================================
// CONSOLE ERROR PATTERNS
// ============================================================================

const CONSOLE_ERROR_PATTERNS = [
  { pattern: /No routes matched/, severity: "critical" as const },
  { pattern: /TypeError/, severity: "high" as const },
  { pattern: /ReferenceError/, severity: "high" as const },
  { pattern: /SyntaxError/, severity: "high" as const },
  { pattern: /NetworkError/, severity: "medium" as const },
  { pattern: /Failed to fetch/, severity: "medium" as const },
  { pattern: /ChunkLoadError/, severity: "high" as const },
  { pattern: /Uncaught/, severity: "high" as const },
  { pattern: /React error/, severity: "high" as const },
];

// ============================================================================
// EXPORT
// ============================================================================

export const VISUAL_MONSTER_CONFIG: VisualMonsterConfig = {
  baseUrl: process.env.FRONTEND_URL || "http://localhost:3001",
  screenshotDir: "tests/qa/monsters/screenshots",
  viewports: VIEWPORTS,
  pages: PAGES,
  checks: VISUAL_CHECKS,
  consoleErrorPatterns: CONSOLE_ERROR_PATTERNS,
};

// Helpers
export function getDesktopViewports(): Viewport[] {
  return VISUAL_MONSTER_CONFIG.viewports.filter(
    (v) => v.deviceType === "desktop",
  );
}

export function getMobileViewports(): Viewport[] {
  return VISUAL_MONSTER_CONFIG.viewports.filter(
    (v) => v.deviceType === "mobile",
  );
}

export function getCriticalPages(): PageConfig[] {
  return VISUAL_MONSTER_CONFIG.pages.filter((p) => p.critical);
}

export function getPublicPages(): PageConfig[] {
  return VISUAL_MONSTER_CONFIG.pages.filter((p) => !p.requiresAuth);
}
