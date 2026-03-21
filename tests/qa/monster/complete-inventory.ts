/**
 * QA Monster - Complete System Inventory
 *
 * NOTHING ESCAPES. Every endpoint, every page, every component.
 */

// ============================================================================
// BACKEND ENDPOINTS (73 total)
// ============================================================================

export const BACKEND_ENDPOINTS = {
  auth: [
    { method: "POST", path: "/auth/register", auth: false, critical: true },
    {
      method: "POST",
      path: "/auth/register-developer",
      auth: false,
      critical: true,
    },
    { method: "POST", path: "/auth/verify-email", auth: false, critical: true },
    { method: "POST", path: "/auth/resend-verification", auth: false },
    { method: "POST", path: "/auth/forgot-password", auth: false },
    { method: "POST", path: "/auth/reset-password", auth: false },
    { method: "POST", path: "/auth/login", auth: false, critical: true },
    { method: "GET", path: "/auth/me", auth: true },
    { method: "POST", path: "/auth/regenerate-api-key", auth: true },
  ],

  bots: [
    { method: "GET", path: "/bots", auth: false },
    { method: "GET", path: "/bots/my", auth: true },
    { method: "GET", path: "/bots/my/activity", auth: true },
    { method: "GET", path: "/bots/active", auth: false },
    { method: "GET", path: "/bots/:id", auth: false },
    { method: "GET", path: "/bots/:id/profile", auth: false },
    { method: "GET", path: "/bots/:id/activity", auth: false },
    { method: "POST", path: "/bots", auth: true, critical: true },
    { method: "PUT", path: "/bots/:id", auth: true },
    { method: "POST", path: "/bots/:id/validate", auth: true },
    { method: "POST", path: "/bots/:id/activate", auth: true },
    { method: "DELETE", path: "/bots/:id", auth: true },
  ],

  botsConnectivity: [
    { method: "GET", path: "/bots/connectivity/health/summary", auth: true },
    { method: "GET", path: "/bots/connectivity/health/all", auth: true },
    { method: "GET", path: "/bots/connectivity/health/:botId", auth: true },
    {
      method: "POST",
      path: "/bots/connectivity/health/:botId/check",
      auth: true,
    },
    { method: "POST", path: "/bots/connectivity/health/check-all", auth: true },
    { method: "GET", path: "/bots/connectivity/validate/:botId", auth: true },
    {
      method: "GET",
      path: "/bots/connectivity/validate/:botId/quick",
      auth: true,
    },
    {
      method: "POST",
      path: "/bots/connectivity/circuit-breaker/:botId/reset",
      auth: true,
    },
    { method: "GET", path: "/bots/connectivity/latency/:botId", auth: true },
    { method: "POST", path: "/bots/connectivity/register/:botId", auth: true },
    {
      method: "POST",
      path: "/bots/connectivity/unregister/:botId",
      auth: true,
    },
  ],

  botsSubscriptions: [
    { method: "GET", path: "/bots/:botId/subscriptions", auth: true },
    { method: "GET", path: "/bots/:botId/subscriptions/stats", auth: true },
    { method: "GET", path: "/bots/:botId/subscriptions/:id", auth: true },
    { method: "POST", path: "/bots/:botId/subscriptions", auth: true },
    { method: "PUT", path: "/bots/:botId/subscriptions/:id", auth: true },
    { method: "DELETE", path: "/bots/:botId/subscriptions/:id", auth: true },
    {
      method: "POST",
      path: "/bots/:botId/subscriptions/:id/pause",
      auth: true,
    },
    {
      method: "POST",
      path: "/bots/:botId/subscriptions/:id/resume",
      auth: true,
    },
  ],

  tournaments: [
    { method: "GET", path: "/tournaments", auth: false },
    { method: "GET", path: "/tournaments/active", auth: false },
    { method: "GET", path: "/tournaments/:id", auth: false },
    { method: "GET", path: "/tournaments/:id/results", auth: false },
    { method: "GET", path: "/tournaments/:id/leaderboard", auth: false },
    { method: "GET", path: "/tournaments/:id/state", auth: false },
    { method: "POST", path: "/tournaments", auth: true, admin: true },
    {
      method: "POST",
      path: "/tournaments/:id/register",
      auth: true,
      critical: true,
    },
    { method: "DELETE", path: "/tournaments/:id/register/:botId", auth: true },
    { method: "POST", path: "/tournaments/:id/start", auth: true, admin: true },
    {
      method: "POST",
      path: "/tournaments/:id/cancel",
      auth: true,
      admin: true,
    },
  ],

  games: [
    { method: "GET", path: "/games", auth: false },
    { method: "GET", path: "/games/health", auth: false },
    { method: "GET", path: "/games/leaderboard", auth: false },
    { method: "GET", path: "/games/hands/:handId", auth: false },
    { method: "GET", path: "/games/table/:tableId", auth: false },
    { method: "GET", path: "/games/table/:tableId/history", auth: false },
    { method: "GET", path: "/games/tables/:id", auth: false },
    { method: "POST", path: "/games/tables", auth: true },
    { method: "GET", path: "/games/:id", auth: false },
    { method: "GET", path: "/games/:id/state", auth: false },
    { method: "POST", path: "/games/:id/join", auth: true },
    { method: "GET", path: "/games/:id/hands", auth: false },
    { method: "POST", path: "/games/verify-hand", auth: false },
    { method: "GET", path: "/games/provably-fair/info", auth: false },
    { method: "GET", path: "/games/:gameId/seeds", auth: false },
    { method: "GET", path: "/games/:gameId/seeds/:handNumber", auth: false },
  ],

  users: [
    { method: "GET", path: "/users", auth: true, admin: true },
    { method: "GET", path: "/users/:id", auth: true },
    { method: "PUT", path: "/users/:id", auth: true },
    { method: "PUT", path: "/users/:id/admin", auth: true, admin: true },
    { method: "DELETE", path: "/users/:id", auth: true, admin: true },
    { method: "POST", path: "/users/:id/rotate-api-key", auth: true },
    { method: "GET", path: "/users/:id/api-key-status", auth: true },
    {
      method: "POST",
      path: "/users/:id/revoke-api-keys",
      auth: true,
      admin: true,
    },
  ],

  analytics: [
    { method: "GET", path: "/analytics/platform/stats", auth: false },
    { method: "GET", path: "/analytics/admin/stats", auth: true, admin: true },
    {
      method: "POST",
      path: "/analytics/admin/trigger-summary",
      auth: true,
      admin: true,
    },
    {
      method: "POST",
      path: "/analytics/admin/save-metrics",
      auth: true,
      admin: true,
    },
    { method: "POST", path: "/analytics/events", auth: true },
    { method: "GET", path: "/analytics/events/summary", auth: true },
    { method: "GET", path: "/analytics/metrics/history", auth: true },
  ],

  preview: [
    { method: "GET", path: "/preview/stats", auth: false },
    { method: "GET", path: "/preview/tables", auth: false },
    { method: "GET", path: "/preview/tournaments", auth: false },
    { method: "GET", path: "/preview/leaderboard", auth: false },
  ],
};

// Count total endpoints
export const TOTAL_ENDPOINTS = Object.values(BACKEND_ENDPOINTS).flat().length; // 73

// ============================================================================
// FRONTEND PAGES (15 total)
// ============================================================================

export const FRONTEND_PAGES = [
  { path: "/", component: "Home.tsx", auth: false, critical: true },
  { path: "/login", component: "Login.tsx", auth: false, critical: true },
  { path: "/register", component: "Register.tsx", auth: false, critical: true },
  { path: "/verify-email", component: "VerifyEmail.tsx", auth: false },
  { path: "/forgot-password", component: "ForgotPassword.tsx", auth: false },
  { path: "/reset-password", component: "ResetPassword.tsx", auth: false },
  { path: "/tables", component: "Tables.tsx", auth: true },
  { path: "/tournaments", component: "Tournaments.tsx", auth: true },
  { path: "/tournaments/:id", component: "TournamentDetail.tsx", auth: true },
  { path: "/bots", component: "Bots.tsx", auth: true },
  { path: "/bots/:id", component: "BotProfile.tsx", auth: true },
  { path: "/leaderboard", component: "Leaderboard.tsx", auth: true },
  { path: "/profile", component: "Profile.tsx", auth: true },
  {
    path: "/admin/analytics",
    component: "AdminAnalytics.tsx",
    auth: true,
    admin: true,
  },
  {
    path: "/game/:tableId",
    component: "GameView.tsx",
    auth: true,
    critical: true,
  },
];

export const TOTAL_PAGES = FRONTEND_PAGES.length; // 15

// ============================================================================
// FRONTEND COMPONENTS (20 total, 5 with stories)
// ============================================================================

export const FRONTEND_COMPONENTS = [
  // Game components
  {
    name: "Table",
    path: "components/game/Table.tsx",
    hasStory: true,
    critical: true,
  },
  {
    name: "PlayerSeat",
    path: "components/game/PlayerSeat.tsx",
    hasStory: true,
    critical: true,
  },
  {
    name: "CommunityCards",
    path: "components/game/CommunityCards.tsx",
    hasStory: false,
  },
  {
    name: "ActionFeed",
    path: "components/game/ActionFeed.tsx",
    hasStory: false,
  },
  {
    name: "WinnerAnimation",
    path: "components/game/WinnerAnimation.tsx",
    hasStory: false,
  },
  {
    name: "HandResultToast",
    path: "components/game/HandResultToast.tsx",
    hasStory: false,
  },
  {
    name: "ProvablyFairInfo",
    path: "components/game/ProvablyFairInfo.tsx",
    hasStory: false,
  },

  // Common components
  { name: "Card", path: "components/common/Card.tsx", hasStory: false },
  {
    name: "PlayingCard",
    path: "components/common/PlayingCard.tsx",
    hasStory: true,
  },
  {
    name: "ChipStack",
    path: "components/common/ChipStack.tsx",
    hasStory: false,
  },
  {
    name: "PokerChipStack",
    path: "components/common/PokerChipStack.tsx",
    hasStory: true,
  },
  { name: "Timer", path: "components/common/Timer.tsx", hasStory: false },

  // Layout components
  { name: "Layout", path: "components/layout/Layout.tsx", hasStory: false },
  {
    name: "GameLayout",
    path: "components/layout/GameLayout.tsx",
    hasStory: false,
  },
  {
    name: "MarketingLayout",
    path: "components/layout/MarketingLayout.tsx",
    hasStory: false,
  },
  {
    name: "AuthLayout",
    path: "components/layout/AuthLayout.tsx",
    hasStory: false,
  },

  // Auth components
  { name: "AuthGate", path: "components/auth/AuthGate.tsx", hasStory: false },

  // Tournament components
  {
    name: "TournamentCard",
    path: "components/tournament/TournamentCard.tsx",
    hasStory: false,
  },
  {
    name: "LeaderboardTable",
    path: "components/tournament/LeaderboardTable.tsx",
    hasStory: false,
  },

  // UI primitives (multiple in one file)
  {
    name: "primitives",
    path: "components/ui/primitives.tsx",
    hasStory: true,
    includes: [
      "PageShell",
      "SurfaceCard",
      "PageHeader",
      "Button",
      "AlertBanner",
      "EmptyState",
      "LoadingBlock",
      "MetricCard",
      "TextField",
      "PasswordField",
      "SegmentedTabs",
      "StatusPill",
      "AppModal",
      "ConfirmDialog",
    ],
  },
];

export const TOTAL_COMPONENTS = FRONTEND_COMPONENTS.length; // 20
export const COMPONENTS_WITH_STORIES = FRONTEND_COMPONENTS.filter(
  (c) => c.hasStory,
).length; // 5
export const COMPONENTS_WITHOUT_STORIES =
  TOTAL_COMPONENTS - COMPONENTS_WITH_STORIES; // 15

// ============================================================================
// USER FLOWS (Critical paths through the system)
// ============================================================================

export const USER_FLOWS = [
  // Auth flows
  { name: "Register new user", category: "auth", critical: true },
  { name: "Login existing user", category: "auth", critical: true },
  { name: "Email verification", category: "auth", critical: true },
  { name: "Password reset", category: "auth" },
  { name: "Session timeout", category: "auth" },

  // Bot flows
  { name: "Create new bot", category: "bots", critical: true },
  { name: "Edit bot endpoint", category: "bots" },
  { name: "Validate bot", category: "bots" },
  { name: "Delete bot", category: "bots" },
  { name: "View bot profile", category: "bots" },
  { name: "View bot activity", category: "bots" },

  // Tournament flows
  { name: "Browse tournaments", category: "tournaments" },
  {
    name: "Register bot for tournament",
    category: "tournaments",
    critical: true,
  },
  { name: "Unregister bot", category: "tournaments" },
  { name: "View tournament results", category: "tournaments" },
  { name: "Watch tournament table", category: "tournaments", critical: true },

  // Game flows
  { name: "Browse tables", category: "games" },
  { name: "Watch live game", category: "games", critical: true },
  { name: "See real-time updates", category: "games", critical: true },
  { name: "View hand history", category: "games" },
  { name: "Verify provably fair", category: "games" },

  // Leaderboard flows
  { name: "View leaderboard", category: "leaderboard" },
  { name: "Filter by time period", category: "leaderboard" },
  { name: "Click bot to see profile", category: "leaderboard" },

  // Admin flows
  { name: "Create tournament", category: "admin" },
  { name: "Start tournament", category: "admin" },
  { name: "Cancel tournament", category: "admin" },
  { name: "View analytics", category: "admin" },
];

export const TOTAL_FLOWS = USER_FLOWS.length; // 28
export const CRITICAL_FLOWS = USER_FLOWS.filter((f) => f.critical).length; // 8

// ============================================================================
// DATA STATES (What states can data be in?)
// ============================================================================

export const DATA_STATES = [
  "loading",
  "loaded",
  "empty",
  "error",
  "partial", // Some data loaded, some failed
  "stale", // Cached but outdated
  "updating", // Optimistic update in progress
];

// ============================================================================
// VIEWPORTS
// ============================================================================

export const VIEWPORTS = [
  // Desktop
  { name: "Desktop 1920", width: 1920, height: 1080, type: "desktop" },
  { name: "Desktop 1440", width: 1440, height: 900, type: "desktop" },
  { name: "Desktop 1366", width: 1366, height: 768, type: "desktop" },
  { name: "Desktop 1280", width: 1280, height: 800, type: "desktop" },

  // Tablet
  { name: "iPad Pro", width: 1024, height: 1366, type: "tablet" },
  { name: "iPad", width: 768, height: 1024, type: "tablet" },
  { name: "Surface Pro", width: 912, height: 1368, type: "tablet" },

  // Mobile
  { name: "iPhone 14 Pro Max", width: 430, height: 932, type: "mobile" },
  { name: "iPhone 14", width: 390, height: 844, type: "mobile" },
  { name: "iPhone SE", width: 375, height: 667, type: "mobile" },
  { name: "Pixel 7", width: 412, height: 915, type: "mobile" },
  { name: "Samsung Galaxy", width: 360, height: 800, type: "mobile" },

  // Foldable
  { name: "Galaxy Fold Closed", width: 280, height: 653, type: "foldable" },
  { name: "Galaxy Fold Open", width: 717, height: 512, type: "foldable" },
];

export const TOTAL_VIEWPORTS = VIEWPORTS.length; // 14

// ============================================================================
// COVERAGE SUMMARY
// ============================================================================

export const COVERAGE_SUMMARY = {
  backend: {
    endpoints: TOTAL_ENDPOINTS, // 73
    modules: Object.keys(BACKEND_ENDPOINTS).length, // 10
  },
  frontend: {
    pages: TOTAL_PAGES, // 15
    components: TOTAL_COMPONENTS, // 20
    componentsWithStories: COMPONENTS_WITH_STORIES, // 5
    componentsCoverage: `${Math.round((COMPONENTS_WITH_STORIES / TOTAL_COMPONENTS) * 100)}%`, // 25%
  },
  flows: {
    total: TOTAL_FLOWS, // 28
    critical: CRITICAL_FLOWS, // 8
  },
  viewports: TOTAL_VIEWPORTS, // 14

  // Total test combinations
  visualTests: TOTAL_PAGES * TOTAL_VIEWPORTS * DATA_STATES.length, // 15 * 14 * 7 = 1470
  apiTests: TOTAL_ENDPOINTS * 3, // 73 * 3 (success, error, auth) = 219
  flowTests: TOTAL_FLOWS, // 28

  totalTestCases: function () {
    return this.visualTests + this.apiTests + this.flowTests;
  },
};

// Print summary (only when run directly)
export function printInventorySummary(): void {
  console.log("=== QA MONSTER COMPLETE INVENTORY ===");
  console.log(`Backend Endpoints: ${COVERAGE_SUMMARY.backend.endpoints}`);
  console.log(`Frontend Pages: ${COVERAGE_SUMMARY.frontend.pages}`);
  console.log(
    `Frontend Components: ${COVERAGE_SUMMARY.frontend.components} (${COVERAGE_SUMMARY.frontend.componentsCoverage} have stories)`,
  );
  console.log(
    `User Flows: ${COVERAGE_SUMMARY.flows.total} (${COVERAGE_SUMMARY.flows.critical} critical)`,
  );
  console.log(`Viewports: ${COVERAGE_SUMMARY.viewports}`);
  console.log(`---`);
  console.log(`Visual Test Combinations: ${COVERAGE_SUMMARY.visualTests}`);
  console.log(`API Test Cases: ${COVERAGE_SUMMARY.apiTests}`);
  console.log(`Flow Test Cases: ${COVERAGE_SUMMARY.flowTests}`);
  console.log(`TOTAL: ${COVERAGE_SUMMARY.totalTestCases()} test cases`);
}

// Run if executed directly
if (require.main === module) {
  printInventorySummary();
}
