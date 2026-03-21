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
