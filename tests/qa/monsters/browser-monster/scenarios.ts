/**
 * Browser Monster Scenarios
 *
 * Test scenarios organized by user role (guest, user, admin).
 * Each scenario represents a realistic user flow that should be tested.
 *
 * These scenarios test:
 * - Page accessibility per role
 * - UI element visibility per role
 * - Form interactions
 * - Error detection (console + UI)
 */

export type UserRole = "guest" | "user" | "admin";

export interface ScenarioStep {
  action:
    | "navigate"
    | "click"
    | "fill"
    | "verifyVisible"
    | "verifyNotVisible"
    | "checkNoErrors"
    | "checkConsole"
    | "wait";
  url?: string;
  text?: string;
  fields?: Record<string, string>;
  timeout?: number;
}

export interface BrowserScenario {
  name: string;
  description: string;
  role: UserRole;
  critical: boolean;
  steps: ScenarioStep[];
}

export const BROWSER_SCENARIOS: BrowserScenario[] = [
  // ============================================================================
  // GUEST SCENARIOS (unauthenticated user)
  // ============================================================================
  {
    name: "Guest views home page",
    description: "Verify home page loads without errors for guests",
    role: "guest",
    critical: true,
    steps: [
      { action: "navigate", url: "/" },
      { action: "checkNoErrors" },
      { action: "verifyVisible", text: "Poker" },
    ],
  },
  {
    name: "Guest views tournaments list",
    description: "Verify tournaments page loads and shows tournament list",
    role: "guest",
    critical: true,
    steps: [
      { action: "navigate", url: "/tournaments" },
      { action: "checkNoErrors" },
      { action: "verifyVisible", text: "Tournament" },
      { action: "verifyNotVisible", text: "Create tournament" },
      { action: "verifyNotVisible", text: "Create Tournament" },
    ],
  },
  {
    name: "Guest views bots list",
    description:
      "Verify bots page loads and shows bot list without auth errors",
    role: "guest",
    critical: true,
    steps: [
      { action: "navigate", url: "/bots" },
      { action: "checkNoErrors" },
      { action: "checkConsole" },
      { action: "verifyNotVisible", text: "Please sign in" },
      { action: "verifyNotVisible", text: "could not be refreshed" },
      { action: "verifyNotVisible", text: "is not a function" },
    ],
  },
  {
    name: "Guest cannot access bot builder",
    description: "Guest should be redirected when accessing bot builder",
    role: "guest",
    critical: true,
    steps: [
      { action: "navigate", url: "/bots/build" },
      { action: "checkNoErrors" },
      { action: "verifyVisible", text: "Sign in" },
    ],
  },
  {
    name: "Guest views tables list",
    description: "Verify tables page loads without errors",
    role: "guest",
    critical: true,
    steps: [
      { action: "navigate", url: "/tables" },
      { action: "checkNoErrors" },
      { action: "verifyNotVisible", text: "Create table" },
      { action: "verifyNotVisible", text: "Create Table" },
    ],
  },
  {
    name: "Guest views leaderboard",
    description: "Verify leaderboard page loads without errors",
    role: "guest",
    critical: false,
    steps: [
      { action: "navigate", url: "/leaderboard" },
      { action: "checkNoErrors" },
    ],
  },
  {
    name: "Guest cannot access profile",
    description: "Guest should be redirected when accessing profile",
    role: "guest",
    critical: false,
    steps: [
      { action: "navigate", url: "/profile" },
      { action: "checkNoErrors" },
      { action: "verifyVisible", text: "Sign in" },
    ],
  },
  {
    name: "Guest cannot access admin pages",
    description: "Guest should be redirected from admin pages",
    role: "guest",
    critical: true,
    steps: [
      { action: "navigate", url: "/admin" },
      { action: "checkNoErrors" },
      { action: "verifyNotVisible", text: "Admin Dashboard" },
    ],
  },
  {
    name: "Guest views login page",
    description: "Verify login page renders correctly",
    role: "guest",
    critical: true,
    steps: [
      { action: "navigate", url: "/login" },
      { action: "checkNoErrors" },
      { action: "verifyVisible", text: "Sign in" },
    ],
  },
  {
    name: "Guest views register page",
    description: "Verify register page renders correctly",
    role: "guest",
    critical: true,
    steps: [
      { action: "navigate", url: "/register" },
      { action: "checkNoErrors" },
      { action: "verifyVisible", text: "Create" },
    ],
  },

  // ============================================================================
  // USER SCENARIOS (authenticated regular user)
  // ============================================================================
  {
    name: "User views dashboard",
    description: "Logged in user can view dashboard without errors",
    role: "user",
    critical: true,
    steps: [{ action: "navigate", url: "/" }, { action: "checkNoErrors" }],
  },
  {
    name: "User views tournaments - no create button",
    description: "Regular user should NOT see Create Tournament button",
    role: "user",
    critical: true,
    steps: [
      { action: "navigate", url: "/tournaments" },
      { action: "checkNoErrors" },
      { action: "verifyNotVisible", text: "Create tournament" },
      { action: "verifyNotVisible", text: "Create Tournament" },
    ],
  },
  {
    name: "User views tables - no create button",
    description: "Regular user should NOT see Create Table button",
    role: "user",
    critical: true,
    steps: [
      { action: "navigate", url: "/tables" },
      { action: "checkNoErrors" },
      { action: "verifyNotVisible", text: "Create table" },
      { action: "verifyNotVisible", text: "Create Table" },
    ],
  },
  {
    name: "User views bots page",
    description: "User can view bots page without errors",
    role: "user",
    critical: true,
    steps: [
      { action: "navigate", url: "/bots" },
      { action: "checkNoErrors" },
      { action: "checkConsole" },
      { action: "verifyNotVisible", text: "is not a function" },
    ],
  },
  {
    name: "User can access bot builder",
    description: "Authenticated user can access the bot builder page",
    role: "user",
    critical: true,
    steps: [
      { action: "navigate", url: "/bots/build" },
      { action: "checkNoErrors" },
      { action: "checkConsole" },
      { action: "verifyNotVisible", text: "is not a function" },
    ],
  },
  {
    name: "User can access profile",
    description: "Logged in user can access their profile",
    role: "user",
    critical: false,
    steps: [
      { action: "navigate", url: "/profile" },
      { action: "checkNoErrors" },
      { action: "verifyVisible", text: "Profile" },
    ],
  },
  {
    name: "User cannot access admin pages",
    description: "Regular user should not see admin content",
    role: "user",
    critical: true,
    steps: [
      { action: "navigate", url: "/admin" },
      { action: "checkNoErrors" },
      { action: "verifyNotVisible", text: "Admin Dashboard" },
    ],
  },
  {
    name: "User views tournament detail",
    description: "User can view tournament detail page without stuck loading",
    role: "user",
    critical: true,
    steps: [
      { action: "navigate", url: "/tournaments" },
      { action: "checkNoErrors" },
      { action: "wait", timeout: 2000 },
      { action: "checkNoErrors" },
      { action: "verifyNotVisible", text: "Loading player data" },
    ],
  },
  {
    name: "User views leaderboard",
    description: "User can view leaderboard without errors",
    role: "user",
    critical: false,
    steps: [
      { action: "navigate", url: "/leaderboard" },
      { action: "checkNoErrors" },
    ],
  },

  // ============================================================================
  // ADMIN SCENARIOS (authenticated admin user)
  // ============================================================================
  {
    name: "Admin views dashboard",
    description: "Admin can view dashboard without errors",
    role: "admin",
    critical: true,
    steps: [{ action: "navigate", url: "/" }, { action: "checkNoErrors" }],
  },
  {
    name: "Admin sees Create Tournament button",
    description: "Admin should see the Create Tournament button",
    role: "admin",
    critical: true,
    steps: [
      { action: "navigate", url: "/tournaments" },
      { action: "checkNoErrors" },
      { action: "verifyVisible", text: "Create" },
    ],
  },
  {
    name: "Admin sees Create Table button",
    description: "Admin should see the Create Table button",
    role: "admin",
    critical: true,
    steps: [
      { action: "navigate", url: "/tables" },
      { action: "checkNoErrors" },
      { action: "verifyVisible", text: "Create" },
    ],
  },
  {
    name: "Admin can access admin pages",
    description: "Admin can access admin dashboard",
    role: "admin",
    critical: true,
    steps: [{ action: "navigate", url: "/admin" }, { action: "checkNoErrors" }],
  },
  {
    name: "Admin views analytics",
    description: "Admin can view analytics page",
    role: "admin",
    critical: false,
    steps: [
      { action: "navigate", url: "/admin/analytics" },
      { action: "checkNoErrors" },
    ],
  },
  {
    name: "Admin views bots page",
    description: "Admin views bots page without errors",
    role: "admin",
    critical: true,
    steps: [
      { action: "navigate", url: "/bots" },
      { action: "checkNoErrors" },
      { action: "checkConsole" },
    ],
  },
  {
    name: "Admin can access bot builder",
    description: "Admin can access the bot builder page without errors",
    role: "admin",
    critical: true,
    steps: [
      { action: "navigate", url: "/bots/build" },
      { action: "checkNoErrors" },
      { action: "checkConsole" },
    ],
  },
  {
    name: "Admin creates tournament form",
    description: "Admin can open tournament creation form",
    role: "admin",
    critical: true,
    steps: [
      { action: "navigate", url: "/tournaments" },
      { action: "checkNoErrors" },
      { action: "click", text: "Create" },
      { action: "wait", timeout: 500 },
      { action: "checkNoErrors" },
    ],
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getScenariosByRole(role: UserRole): BrowserScenario[] {
  return BROWSER_SCENARIOS.filter((s) => s.role === role);
}

export function getCriticalScenarios(): BrowserScenario[] {
  return BROWSER_SCENARIOS.filter((s) => s.critical);
}

export function getQuickScenarios(): BrowserScenario[] {
  return BROWSER_SCENARIOS.filter(
    (s) =>
      s.critical &&
      s.steps.length <= 4 &&
      !s.steps.some(
        (step) => step.action === "click" || step.action === "fill",
      ),
  );
}

// Pages to explore per role (for exhaustive exploration)
export const PAGES_BY_ROLE: Record<UserRole, string[]> = {
  guest: [
    "/",
    "/login",
    "/register",
    "/tournaments",
    "/bots",
    "/bots/build",
    "/tables",
    "/leaderboard",
  ],
  user: [
    "/",
    "/tournaments",
    "/bots",
    "/bots/build",
    "/tables",
    "/leaderboard",
    "/profile",
  ],
  admin: [
    "/",
    "/tournaments",
    "/bots",
    "/bots/build",
    "/tables",
    "/leaderboard",
    "/profile",
    "/admin",
    "/admin/analytics",
    "/admin/tournaments",
  ],
};

// Elements that should NEVER be visible to certain roles
export const FORBIDDEN_ELEMENTS: Record<UserRole, string[]> = {
  guest: [
    "Create tournament",
    "Create Tournament",
    "Create table",
    "Create Table",
    "Admin Dashboard",
    "Admin Settings",
  ],
  user: [
    "Create tournament",
    "Create Tournament",
    "Create table",
    "Create Table",
    "Admin Dashboard",
    "Admin Settings",
  ],
  admin: [],
};

// Error patterns that should NEVER appear in console
export const CRITICAL_CONSOLE_ERRORS = [
  /is not a function/i,
  /is not defined/i,
  /cannot read propert/i,
  /undefined is not/i,
  /null is not/i,
  /failed to fetch/i,
  /network error/i,
  /syntax error/i,
  /unexpected token/i,
];

// UI error indicators that should NEVER appear
export const UI_ERROR_INDICATORS = [
  "Something went wrong",
  "Error:",
  "could not be refreshed",
  "Please sign in to continue",
  "raw.map is not a function",
  "TypeError",
  "ReferenceError",
];
