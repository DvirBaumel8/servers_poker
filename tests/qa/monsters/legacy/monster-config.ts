/**
 * QA Monster Configuration
 *
 * The relentless critic that finds bugs, spots inconsistencies,
 * questions decisions, and raises opinions.
 */

export interface Finding {
  id: string;
  category: "BUG" | "ISSUE" | "CONCERN" | "OPINION";
  severity: "critical" | "high" | "medium" | "low" | "note";
  page: string;
  viewport?: string;
  screenshot?: string;
  title: string;
  description: string;
  expected?: string;
  actual?: string;
  opinion?: string;
  suggestion?: string;
  tags: string[];
}

export interface Viewport {
  name: string;
  width: number;
  height: number;
  type: "desktop" | "tablet" | "mobile" | "foldable";
  touch: boolean;
}

export interface PageConfig {
  path: string;
  name: string;
  requiresAuth: boolean;
  criticalFlows: string[];
  interactiveElements: string[];
  dataStates: string[];
}

export interface FlowConfig {
  name: string;
  description: string;
  steps: string[];
  expectedOutcome: string;
  edgeCases: string[];
}

// Every viewport the monster tests
export const VIEWPORTS: Viewport[] = [
  // Desktop
  {
    name: "Desktop 1920",
    width: 1920,
    height: 1080,
    type: "desktop",
    touch: false,
  },
  {
    name: "Desktop 1440",
    width: 1440,
    height: 900,
    type: "desktop",
    touch: false,
  },
  {
    name: "Desktop 1366",
    width: 1366,
    height: 768,
    type: "desktop",
    touch: false,
  },
  {
    name: "Desktop 1280",
    width: 1280,
    height: 800,
    type: "desktop",
    touch: false,
  },

  // Tablet
  { name: "iPad Pro", width: 1024, height: 1366, type: "tablet", touch: true },
  { name: "iPad", width: 768, height: 1024, type: "tablet", touch: true },
  { name: "iPad Mini", width: 744, height: 1133, type: "tablet", touch: true },
  {
    name: "Surface Pro",
    width: 912,
    height: 1368,
    type: "tablet",
    touch: true,
  },

  // Mobile
  {
    name: "iPhone 14 Pro Max",
    width: 430,
    height: 932,
    type: "mobile",
    touch: true,
  },
  { name: "iPhone 14", width: 390, height: 844, type: "mobile", touch: true },
  { name: "iPhone SE", width: 375, height: 667, type: "mobile", touch: true },
  { name: "Pixel 7", width: 412, height: 915, type: "mobile", touch: true },
  {
    name: "Samsung Galaxy S21",
    width: 360,
    height: 800,
    type: "mobile",
    touch: true,
  },

  // Foldable / Edge
  {
    name: "Galaxy Fold",
    width: 280,
    height: 653,
    type: "foldable",
    touch: true,
  },
  {
    name: "Galaxy Fold Open",
    width: 717,
    height: 512,
    type: "foldable",
    touch: true,
  },
];

// Every page the monster inspects
export const PAGES: PageConfig[] = [
  {
    path: "/",
    name: "Home",
    requiresAuth: false,
    criticalFlows: ["view_stats", "navigate_to_section"],
    interactiveElements: ["nav_links", "stat_cards", "cta_buttons"],
    dataStates: ["loading", "loaded", "error", "empty"],
  },
  {
    path: "/register",
    name: "Registration",
    requiresAuth: false,
    criticalFlows: ["register_new_user", "navigate_to_login"],
    interactiveElements: [
      "email_input",
      "password_input",
      "name_input",
      "submit_button",
      "show_password_toggle",
    ],
    dataStates: [
      "empty",
      "filling",
      "validating",
      "submitting",
      "error",
      "success",
    ],
  },
  {
    path: "/login",
    name: "Login",
    requiresAuth: false,
    criticalFlows: ["login_user", "forgot_password", "navigate_to_register"],
    interactiveElements: [
      "email_input",
      "password_input",
      "submit_button",
      "forgot_password_link",
    ],
    dataStates: [
      "empty",
      "filling",
      "validating",
      "submitting",
      "error",
      "success",
    ],
  },
  {
    path: "/tournaments",
    name: "Tournaments",
    requiresAuth: false,
    criticalFlows: [
      "view_tournaments",
      "filter_tournaments",
      "view_tournament_details",
    ],
    interactiveElements: [
      "tournament_cards",
      "filter_buttons",
      "pagination",
      "sort_dropdown",
    ],
    dataStates: ["loading", "loaded", "empty", "error", "filtered"],
  },
  {
    path: "/tables",
    name: "Tables",
    requiresAuth: false,
    criticalFlows: ["view_tables", "join_table", "spectate_table"],
    interactiveElements: ["table_cards", "join_buttons", "filter_controls"],
    dataStates: ["loading", "loaded", "empty", "error"],
  },
  {
    path: "/bots",
    name: "Bots",
    requiresAuth: true,
    criticalFlows: ["view_bots", "create_bot", "edit_bot", "delete_bot"],
    interactiveElements: [
      "bot_cards",
      "create_button",
      "edit_buttons",
      "delete_buttons",
      "endpoint_input",
    ],
    dataStates: ["loading", "loaded", "empty", "error", "creating", "editing"],
  },
  {
    path: "/leaderboard",
    name: "Leaderboard",
    requiresAuth: false,
    criticalFlows: ["view_rankings", "filter_by_period", "view_bot_details"],
    interactiveElements: ["period_tabs", "bot_rows", "pagination"],
    dataStates: ["loading", "loaded", "empty", "error"],
  },
  {
    path: "/game/:id",
    name: "Game Table",
    requiresAuth: false,
    criticalFlows: ["view_game", "spectate_actions", "see_cards"],
    interactiveElements: [
      "player_seats",
      "action_buttons",
      "pot_display",
      "cards",
    ],
    dataStates: [
      "loading",
      "waiting",
      "playing",
      "showdown",
      "finished",
      "error",
    ],
  },
  {
    path: "/profile",
    name: "Profile",
    requiresAuth: true,
    criticalFlows: ["view_profile", "edit_profile", "regenerate_api_key"],
    interactiveElements: [
      "edit_button",
      "api_key_display",
      "regenerate_button",
      "save_button",
    ],
    dataStates: ["loading", "loaded", "editing", "saving", "error"],
  },
  {
    path: "/settings",
    name: "Settings",
    requiresAuth: true,
    criticalFlows: ["view_settings", "change_settings", "save_settings"],
    interactiveElements: ["setting_toggles", "save_button", "reset_button"],
    dataStates: ["loading", "loaded", "saving", "error"],
  },
  {
    path: "/admin/tournaments",
    name: "Admin Tournaments",
    requiresAuth: true,
    criticalFlows: [
      "view_all_tournaments",
      "create_rolling_tournament",
      "create_scheduled_tournament",
      "start_tournament",
      "cancel_tournament",
      "update_schedule",
      "configure_scheduler",
      "filter_tournaments",
    ],
    interactiveElements: [
      "create_tournament_button",
      "tournament_cards",
      "start_buttons",
      "cancel_buttons",
      "edit_schedule_buttons",
      "filter_tabs",
      "scheduler_cron_input",
      "scheduler_save_button",
      "create_form_name_input",
      "create_form_type_select",
      "create_form_buyin_input",
      "create_form_chips_input",
      "create_form_submit",
      "create_form_cancel",
      "datetime_picker",
    ],
    dataStates: [
      "loading",
      "loaded",
      "empty",
      "error",
      "creating",
      "submitting",
      "filtering",
    ],
  },
  {
    path: "/admin/analytics",
    name: "Admin Analytics",
    requiresAuth: true,
    criticalFlows: [
      "view_kpis",
      "view_charts",
      "change_time_period",
      "trigger_daily_summary",
    ],
    interactiveElements: [
      "period_tabs",
      "send_summary_button",
      "kpi_cards",
      "chart_containers",
    ],
    dataStates: ["loading", "loaded", "error", "sending_summary"],
  },
  {
    path: "http://localhost:3002/d/poker-overview",
    name: "Grafana Dashboard (External)",
    requiresAuth: true,
    criticalFlows: [
      "view_dashboard",
      "verify_panels_have_data",
      "change_time_range",
      "refresh_dashboard",
      "check_alerts",
    ],
    interactiveElements: [
      "time_picker",
      "refresh_button",
      "panel_titles",
      "panel_menus",
      "dashboard_settings",
      "alert_list",
    ],
    dataStates: ["loading", "loaded", "no_data", "error", "refreshing"],
  },
  {
    path: "http://localhost:9090/targets",
    name: "Prometheus Targets (External)",
    requiresAuth: false,
    criticalFlows: [
      "view_targets",
      "verify_poker_server_up",
      "check_scrape_errors",
    ],
    interactiveElements: ["target_cards", "filter_inputs", "expand_buttons"],
    dataStates: ["loading", "loaded", "error"],
  },
];

// Critical user flows to test end-to-end
export const FLOWS: FlowConfig[] = [
  {
    name: "New User Registration",
    description: "Complete registration flow from landing to verified account",
    steps: [
      "Visit home page",
      "Click register link",
      "Fill registration form",
      "Submit form",
      "See verification prompt",
      "Enter verification code",
      "See success state",
      "Navigate to dashboard",
    ],
    expectedOutcome: "User is registered, verified, and logged in",
    edgeCases: [
      "Duplicate email",
      "Weak password",
      "Invalid email format",
      "Empty fields",
      "Very long name",
      "Special characters in name",
      "Back button during flow",
      "Refresh during flow",
    ],
  },
  {
    name: "Bot Creation",
    description: "Create a new bot from the bots dashboard",
    steps: [
      "Login as user",
      "Navigate to bots page",
      "Click create bot",
      "Fill bot details",
      "Enter endpoint URL",
      "Submit form",
      "See bot in list",
    ],
    expectedOutcome: "Bot is created and appears in the list",
    edgeCases: [
      "Duplicate bot name",
      "Invalid endpoint URL",
      "Endpoint that times out",
      "Endpoint that returns error",
      "Very long bot name",
      "Bot name with special characters",
      "No endpoint provided",
    ],
  },
  {
    name: "Tournament Spectating",
    description: "Find and watch a live tournament",
    steps: [
      "Visit tournaments page",
      "Find running tournament",
      "Click to view",
      "See tournament details",
      "Click spectate table",
      "See live game",
    ],
    expectedOutcome: "User can watch live game action",
    edgeCases: [
      "Tournament ends while watching",
      "Table closes while watching",
      "Network disconnect",
      "Multiple tables open",
    ],
  },
  {
    name: "Leaderboard Exploration",
    description: "Browse leaderboard and view bot details",
    steps: [
      "Visit leaderboard",
      "See rankings load",
      "Switch time period",
      "Click on bot name",
      "See bot details",
    ],
    expectedOutcome: "User can explore rankings and bot stats",
    edgeCases: [
      "Empty leaderboard",
      "Bot with no games",
      "Very long bot names",
      "Negative winnings",
    ],
  },
  {
    name: "Admin Tournament Creation",
    description: "Admin creates a new tournament via dashboard",
    steps: [
      "Login as admin",
      "Navigate to /admin/tournaments",
      "Click 'Create Tournament' button",
      "Fill tournament name",
      "Select tournament type (rolling/scheduled)",
      "Set buy-in and starting chips",
      "Configure player limits",
      "For scheduled: set date/time",
      "Submit form",
      "See tournament in list",
    ],
    expectedOutcome: "Tournament appears in list with correct details",
    edgeCases: [
      "Duplicate tournament name",
      "Very long tournament name",
      "Special characters in name",
      "Past date for scheduled tournament",
      "Min players > max players",
      "Zero buy-in",
      "Negative values",
      "Empty required fields",
      "Submit during loading",
      "Network error on submit",
    ],
  },
  {
    name: "Admin Tournament Lifecycle",
    description: "Admin manages tournament through its lifecycle",
    steps: [
      "Login as admin",
      "Find tournament in registering state",
      "Verify start button disabled (no players)",
      "Wait for bot registrations",
      "Start tournament",
      "Verify status change to running",
      "Monitor tournament progress",
      "Or: Cancel tournament if needed",
    ],
    expectedOutcome: "Tournament lifecycle managed correctly",
    edgeCases: [
      "Start with exactly min players",
      "Cancel while players registering",
      "Cancel running tournament",
      "Network disconnect during action",
      "Multiple admins managing same tournament",
    ],
  },
  {
    name: "Admin Schedule Management",
    description: "Admin updates scheduled tournament times",
    steps: [
      "Login as admin",
      "Navigate to /admin/tournaments",
      "Find scheduled tournament",
      "Click edit schedule",
      "Change datetime",
      "Save changes",
      "Verify new time displayed",
    ],
    expectedOutcome: "Schedule updated and reflected in UI",
    edgeCases: [
      "Set to time in the past",
      "Set to very far future",
      "Clear schedule entirely",
      "Change during auto-start window",
      "Invalid datetime format",
    ],
  },
  {
    name: "Admin Scheduler Configuration",
    description: "Admin configures the tournament auto-start scheduler",
    steps: [
      "Login as admin",
      "Navigate to /admin/tournaments",
      "Find scheduler status panel",
      "Click edit cron expression",
      "Enter new cron expression",
      "Save configuration",
      "Verify next run time updates",
    ],
    expectedOutcome: "Scheduler runs on new schedule",
    edgeCases: [
      "Invalid cron expression",
      "Very frequent cron (every second)",
      "Very infrequent cron (yearly)",
      "Disable scheduler",
      "Re-enable scheduler",
    ],
  },
  {
    name: "Monitoring Dashboard Verification",
    description:
      "Verify Grafana dashboard shows live metrics from poker server",
    steps: [
      "Ensure monitoring stack is running (docker compose --profile monitoring up -d)",
      "Generate API traffic to poker server (health checks, tournament queries)",
      "Wait for Prometheus scrape interval (15-30 seconds)",
      "Navigate to Grafana at localhost:3002",
      "Login with admin credentials",
      "Open Poker Server Overview dashboard (/d/poker-overview)",
      "Verify Overview row shows gauges (active games, tournaments, bots)",
      "Verify HTTP Metrics row shows request rate graph",
      "Verify Response Time Percentiles panel has data",
      "Check no panels show 'No data' error",
      "Navigate to Prometheus targets page (localhost:9090/targets)",
      "Verify poker-server target shows UP status",
    ],
    expectedOutcome:
      "All dashboard panels display live metrics from poker server",
    edgeCases: [
      "Prometheus container not running",
      "Grafana container not running",
      "Poker server not exposing /api/v1/metrics",
      "Network issues between Docker containers",
      "Dashboard provisioning failed",
      "Prometheus cannot reach poker-server hostname",
      "Metrics endpoint returns empty response",
      "Grafana datasource misconfigured",
      "Alert rules syntax errors",
      "Dashboard JSON invalid",
    ],
  },
  {
    name: "Chaos Engineering - System Resilience",
    description: "Test system resilience through controlled failure injection",
    steps: [
      "Start poker server and verify health",
      "Run chaos:light to verify basic resilience",
      "Run chaos:medium for comprehensive testing",
      "Monitor Prometheus metrics during chaos",
      "Verify circuit breakers activate on bot failures",
      "Verify fallback actions are used when bots crash",
      "Verify system health remains OK despite failures",
      "Verify recovery mechanisms work after failures",
      "Run chaos:heavy for extreme stress testing",
      "Review chaos simulation report",
    ],
    expectedOutcome: "System gracefully handles all failure scenarios",
    edgeCases: [
      "All bots crash simultaneously",
      "Multiple bots timeout in cascade",
      "Bots return invalid JSON responses",
      "Intermittent bot failures (50% failure rate)",
      "High latency bot responses (5+ seconds)",
      "Request burst / load spike",
      "Bot crashes mid-hand",
      "Server restart during active game",
      "Redis connection lost and restored",
      "Database pool exhaustion",
    ],
  },
];

// Stress test inputs
export const STRESS_INPUTS = {
  longText: "A".repeat(500),
  veryLongText: "B".repeat(10000),
  specialChars: "!@#$%^&*()_+-=[]{}|;:'\",.<>?/`~",
  unicode: "你好世界🎰🃏♠♣♥♦🏆💰",
  sql: "'; DROP TABLE users; --",
  xss: '<script>alert("xss")</script>',
  html: '<b>bold</b><i>italic</i><a href="evil.com">link</a>',
  emoji: "🎰🃏🎲🎯🏆🥇🥈🥉💰💵💎🔥⭐",
  rtl: "مرحبا بالعالم",
  numbers: "12345678901234567890",
  negativeNumbers: "-999999999",
  floats: "123.456789012345",
  spaces: "   lots   of   spaces   ",
  newlines: "line1\nline2\nline3",
  tabs: "col1\tcol2\tcol3",
  empty: "",
  whitespaceOnly: "   \t\n   ",
};

// Visual consistency checks
export const VISUAL_CHECKS = {
  typography: [
    "Font families consistent across similar elements",
    "Font sizes follow hierarchy (h1 > h2 > h3 > body)",
    "Line heights readable (1.4-1.6 for body)",
    "Letter spacing appropriate",
    "No orphaned words at line breaks",
  ],
  colors: [
    "Primary color used consistently",
    "Error states use same red",
    "Success states use same green",
    "Disabled states visually distinct",
    "Sufficient contrast ratios (WCAG AA)",
    "Dark mode consistency (if applicable)",
  ],
  spacing: [
    "Consistent padding within cards",
    "Consistent margins between sections",
    "Consistent gaps in grids/flexbox",
    "Touch targets minimum 44x44px on mobile",
    "No elements touching edges without padding",
  ],
  alignment: [
    "Text alignment consistent within sections",
    "Icons vertically centered with text",
    "Form labels aligned with inputs",
    "Buttons aligned within groups",
    "Cards aligned in grids",
  ],
  animations: [
    "Transitions smooth (no jarring jumps)",
    "Loading states have indicators",
    "Hover states provide feedback",
    "Focus states visible for keyboard nav",
    "No infinite loading spinners",
  ],
};

// UX friction points to look for
export const UX_FRICTION_CHECKS = [
  "Actions require too many clicks",
  "Important actions hard to find",
  "No confirmation for destructive actions",
  "No undo capability",
  "Error messages unclear or missing",
  "Success feedback unclear or missing",
  "Loading states unclear",
  "Empty states unhelpful",
  "Forms require too much info",
  "Forms lose data on error",
  "Navigation confusing",
  "Back button behavior unexpected",
  "Scroll position lost on navigation",
  "Keyboard navigation broken",
  "Tab order illogical",
  "Focus traps",
  "Auto-focus missing where expected",
  "Copy not user-friendly",
  "Jargon used without explanation",
  "Dates/times in wrong timezone",
  "Numbers not formatted for locale",
  "Currency display inconsistent",
];

// Accessibility checks
export const A11Y_CHECKS = [
  "All images have alt text",
  "Form inputs have labels",
  "Buttons have accessible names",
  'Links are descriptive (not "click here")',
  "Color is not only indicator",
  "Focus visible on all interactive elements",
  "Skip navigation link present",
  "Headings follow hierarchy",
  "ARIA labels where needed",
  "Error announcements for screen readers",
  "Sufficient color contrast",
  "Text resizable without breaking layout",
  "No content in title attributes only",
  "Tables have headers",
  "Modals trap focus correctly",
];

// Pre-flight checks to run before monster testing
export interface PreFlightCheck {
  name: string;
  endpoint?: string;
  description: string;
  required: boolean;
  autoFix?: string;
}

export const PRE_FLIGHT_CHECKS: PreFlightCheck[] = [
  {
    name: "backend_health",
    endpoint: "http://localhost:3000/api/v1/games",
    description: "Backend API is responding",
    required: true,
  },
  {
    name: "frontend_health",
    endpoint: "http://localhost:3001",
    description: "Frontend dev server is responding",
    required: true,
  },
  {
    name: "database_has_games",
    endpoint: "http://localhost:3000/api/v1/games",
    description: "At least one game exists in database",
    required: false,
    autoFix: "npm run qa:monster:seed",
  },
  {
    name: "tables_have_players",
    endpoint: "http://localhost:3000/api/v1/games",
    description: "At least one table has active players for UI testing",
    required: false,
    autoFix: "npm run qa:monster:live-tournament",
  },
  {
    name: "tournaments_exist",
    endpoint: "http://localhost:3000/api/v1/tournaments",
    description: "Tournaments exist for testing tournament flows",
    required: false,
  },
];

// Automated DOM checks to run on each page
export interface AutomatedDOMCheck {
  name: string;
  selector: string;
  check:
    | "no-horizontal-overflow"
    | "no-vertical-overflow"
    | "visible"
    | "has-accessible-name"
    | "no-console-errors";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
}

export const AUTOMATED_DOM_CHECKS: AutomatedDOMCheck[] = [
  {
    name: "tables_no_overflow",
    selector: "table",
    check: "no-horizontal-overflow",
    severity: "high",
    description:
      "Tables should not have horizontal overflow that clips content",
  },
  {
    name: "cards_no_overflow",
    selector: "[class*='card'], [class*='Card']",
    check: "no-horizontal-overflow",
    severity: "medium",
    description: "Cards should not have content overflow",
  },
  {
    name: "buttons_accessible",
    selector: "button",
    check: "has-accessible-name",
    severity: "critical",
    description: "All buttons must have accessible names for screen readers",
  },
  {
    name: "links_accessible",
    selector: "a",
    check: "has-accessible-name",
    severity: "critical",
    description: "All links must have accessible names",
  },
  {
    name: "inputs_have_labels",
    selector: "input, textarea, select",
    check: "has-accessible-name",
    severity: "high",
    description: "Form inputs must have associated labels",
  },
];

// Console message categories to flag
export const CONSOLE_ERROR_ALLOWLIST = [
  "Download the React DevTools", // Expected React warning
  "[CursorBrowser]", // Browser automation messages
  "[vite]", // Vite HMR messages
];

export const CONSOLE_PATTERNS_TO_FLAG = [
  {
    pattern: /No routes matched/,
    severity: "critical" as const,
    description: "Missing route - page will be blank",
  },
  {
    pattern: /TypeError/,
    severity: "high" as const,
    description: "JavaScript type error",
  },
  {
    pattern: /ReferenceError/,
    severity: "high" as const,
    description: "JavaScript reference error",
  },
  {
    pattern: /NetworkError/,
    severity: "medium" as const,
    description: "Network request failed",
  },
  {
    pattern: /Failed to fetch/,
    severity: "medium" as const,
    description: "API request failed",
  },
  {
    pattern: /401|403/,
    severity: "low" as const,
    description: "Auth error (may be expected)",
  },
];

// Screenshot naming convention
export function generateScreenshotName(
  page: string,
  viewport: string,
  state: string = "default",
  timestamp: boolean = true,
): string {
  const sanitize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-");
  const parts = [sanitize(page), sanitize(viewport), sanitize(state)];
  if (timestamp) {
    parts.push(new Date().toISOString().slice(0, 19).replace(/[:-]/g, ""));
  }
  return parts.join("-") + ".png";
}

// Generate unique finding ID
let findingCounter = 0;
export function generateFindingId(category: string): string {
  findingCounter++;
  const prefix =
    {
      BUG: "BUG",
      ISSUE: "ISS",
      CONCERN: "CON",
      OPINION: "OPN",
    }[category] || "MON";
  return `MON-${prefix}-${String(findingCounter).padStart(3, "0")}`;
}

// Reset counter (for new runs)
export function resetFindingCounter(): void {
  findingCounter = 0;
}

// Monster run metadata
export interface MonsterRunConfig {
  version: number;
  runId: string;
  startTime: Date;
  viewports: Viewport[];
  pages: PageConfig[];
  skipAuth: boolean;
  screenshotDir: string;
  performanceProfiling: boolean;
  consoleErrorChecking: boolean;
  overflowDetection: boolean;
}

export function createRunConfig(
  overrides: Partial<MonsterRunConfig> = {},
): MonsterRunConfig {
  const version = 6; // Increment for each major monster improvement
  return {
    version,
    runId: `monster-v${version}-${Date.now()}`,
    startTime: new Date(),
    viewports: VIEWPORTS,
    pages: PAGES,
    skipAuth: false,
    screenshotDir: `screenshots/v${version}`,
    performanceProfiling: true,
    consoleErrorChecking: true,
    overflowDetection: true,
    ...overrides,
  };
}

// Post-run improvement checklist - review after each monster run
export const POST_RUN_CHECKLIST = [
  {
    question: "Were there pages/features we couldn't test due to missing data?",
    action: "Add pre-flight checks or seed data commands",
    example: "No active players → Add qa:monster:live-tournament seed",
  },
  {
    question: "Did we catch bugs through console errors?",
    action: "Add pattern to CONSOLE_PATTERNS_TO_FLAG if new error type",
    example:
      "New error pattern like 'ChunkLoadError' for code splitting issues",
  },
  {
    question: "Were there visual bugs only visible in screenshots?",
    action: "Add automated DOM check if pattern is detectable",
    example: "Text truncation → Add overflow detection for that selector",
  },
  {
    question: "Did we test all viewports systematically?",
    action: "Ensure automated viewport cycling is used",
    example: "Add missing viewport to VIEWPORTS array",
  },
  {
    question: "Were there performance issues?",
    action: "Add performance profiling to slow pages",
    example: "Leaderboard slow → Add to performance monitoring",
  },
  {
    question: "Did we find accessibility issues?",
    action: "Add to A11Y_CHECKS or AUTOMATED_DOM_CHECKS",
    example: "Missing button labels → Add selector to accessible name check",
  },
  {
    question: "Were there state-dependent bugs?",
    action: "Add to page's dataStates in PAGES config",
    example: "Empty state not tested → Add 'empty' to dataStates",
  },
  {
    question: "Did navigation/routing work correctly?",
    action: "Verify all routes in App.tsx are tested",
    example: "Wrong route → Add correct path to PAGES",
  },
];

// Lessons learned from previous runs (append after each run)
export const LESSONS_LEARNED = [
  {
    runVersion: 5,
    date: "2026-03-21",
    lesson: "No live players available prevented testing PlayerSeat fixes",
    resolution: "Added pre-flight check for tables_have_players",
  },
  {
    runVersion: 5,
    date: "2026-03-21",
    lesson: "Console error 'No routes matched' caught wrong URL navigation",
    resolution: "Added CONSOLE_PATTERNS_TO_FLAG with route matching pattern",
  },
  {
    runVersion: 5,
    date: "2026-03-21",
    lesson: "Leaderboard table column truncation only visible in screenshot",
    resolution: "Added AUTOMATED_DOM_CHECKS for horizontal overflow detection",
  },
  {
    runVersion: 5,
    date: "2026-03-21",
    lesson: "Tournament Players tab empty - unclear if bug or no data",
    resolution: "Need to test with known data states",
  },
];
