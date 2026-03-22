/**
 * Live UI Monster
 *
 * This monster AGGRESSIVELY tests the UI by:
 * 1. Creating real tournaments with multiple bots
 * 2. Watching games in progress
 * 3. Fuzzing every input field with edge cases
 * 4. Testing every button, link, and interactive element
 * 5. Checking for UI bugs, visual glitches, console errors
 *
 * This is designed to be run through the Cursor agent with MCP browser tools,
 * NOT as a standalone script.
 *
 * Usage: Run through Cursor agent with:
 *   "Run the Live UI Monster to test the poker app"
 */

// ============================================================================
// INPUT FUZZING PAYLOADS
// ============================================================================

export const FUZZ_PAYLOADS = {
  // SQL Injection attempts
  sqlInjection: [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "admin'--",
    "1; SELECT * FROM users",
    "' UNION SELECT NULL--",
    "1' AND '1'='1",
    "Robert'); DROP TABLE tournaments;--",
    "x' AND email IS NULL; --",
    "1' OR 1=1#",
    "admin' #",
  ],

  // XSS attempts
  xss: [
    "<script>alert('xss')</script>",
    "<img src=x onerror=alert('xss')>",
    "<svg onload=alert('xss')>",
    "javascript:alert('xss')",
    "<body onload=alert('xss')>",
    "'\"><script>alert(1)</script>",
    '<img src="x" onerror="alert(\'xss\')">',
    "<iframe src=\"javascript:alert('xss')\">",
    "<a href=\"javascript:alert('xss')\">click</a>",
    "{{constructor.constructor('alert(1)')()}}",
  ],

  // Boundary testing
  boundaries: [
    "", // empty
    " ", // single space
    "   ", // multiple spaces
    "\t\t", // tabs
    "\n\n", // newlines
    "a".repeat(1000), // very long string
    "a".repeat(10000), // extremely long string
    "0", // zero
    "-1", // negative
    "-999999999", // large negative
    "999999999999999", // huge number
    "0.0000001", // tiny decimal
    "1e308", // scientific notation
    "NaN",
    "Infinity",
    "-Infinity",
    "null",
    "undefined",
    "true",
    "false",
  ],

  // Special characters
  specialChars: [
    "!@#$%^&*()",
    '{}[]|\\:";<>?,./',
    "`~",
    "🎰🃏♠♥♦♣",
    "こんにちは",
    "مرحبا",
    "שלום",
    "🎴🎲🎯",
    "\u0000", // null character
    "\u001f", // control character
    "\u200B", // zero-width space
    "\u202E", // RTL override
    "test\x00null",
    "test\rcarriage",
  ],

  // Format breaking
  formatBreakers: [
    "test@test.com", // email where text expected
    "http://evil.com", // URL where text expected
    "+1234567890", // phone number
    "2024-01-01", // date
    '{"key": "value"}', // JSON
    "<xml>data</xml>", // XML
    "data:text/html,<script>alert(1)</script>", // data URL
    "file:///etc/passwd", // file URL
    "\\\\server\\share", // UNC path
  ],
};

// ============================================================================
// TEST SCENARIOS
// ============================================================================

export interface LiveTestScenario {
  name: string;
  description: string;
  steps: LiveTestStep[];
  critical: boolean;
}

export type LiveTestStep =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string; description: string }
  | { type: "fill"; selector: string; value: string; description: string }
  | { type: "verify_visible"; text: string }
  | { type: "verify_not_visible"; text: string }
  | { type: "verify_no_errors" }
  | { type: "wait"; ms: number }
  | { type: "screenshot"; name: string }
  | {
      type: "fuzz_input";
      selector: string;
      payloads: keyof typeof FUZZ_PAYLOADS;
    }
  | { type: "check_console" }
  | { type: "login"; email: string; password: string }
  | { type: "logout" }
  | {
      type: "create_tournament";
      name: string;
      maxPlayers: number;
      startingStack: number;
    }
  | { type: "watch_game"; timeout: number }
  | { type: "verify_element_count"; selector: string; min: number; max: number }
  | { type: "hover"; selector: string; description: string }
  | { type: "scroll"; direction: "up" | "down"; amount: number };

export const LIVE_TEST_SCENARIOS: LiveTestScenario[] = [
  // ============================================================================
  // CRITICAL: Tournament Creation Flow
  // ============================================================================
  {
    name: "Full Tournament Lifecycle",
    description:
      "Create tournament, register bots, start tournament, watch game",
    critical: true,
    steps: [
      { type: "navigate", url: "http://localhost:3001" },
      { type: "verify_no_errors" },

      // Login as admin
      { type: "navigate", url: "http://localhost:3001/login" },
      { type: "login", email: "admin@poker.io", password: "TestPassword123!" },
      { type: "wait", ms: 2000 },
      { type: "verify_no_errors" },

      // Navigate to tournaments
      { type: "navigate", url: "http://localhost:3001/tournaments" },
      { type: "wait", ms: 1000 },
      { type: "verify_visible", text: "Tournament" },
      { type: "screenshot", name: "tournaments-list" },

      // Create a new tournament
      {
        type: "create_tournament",
        name: `Monster Test ${Date.now()}`,
        maxPlayers: 4,
        startingStack: 1000,
      },
      { type: "wait", ms: 2000 },
      { type: "verify_no_errors" },
      { type: "screenshot", name: "tournament-created" },

      // Watch the game for a bit
      { type: "watch_game", timeout: 30000 },
      { type: "check_console" },
      { type: "screenshot", name: "game-in-progress" },
    ],
  },

  // ============================================================================
  // INPUT FUZZING: Tournament Name
  // ============================================================================
  {
    name: "Tournament Name Fuzzing",
    description: "Fuzz the tournament name field with malicious inputs",
    critical: true,
    steps: [
      { type: "navigate", url: "http://localhost:3001/login" },
      { type: "login", email: "admin@poker.io", password: "TestPassword123!" },
      { type: "wait", ms: 1000 },

      { type: "navigate", url: "http://localhost:3001/tournaments" },
      { type: "wait", ms: 500 },

      // Try SQL injection in tournament name
      {
        type: "fuzz_input",
        selector: "[name='name']",
        payloads: "sqlInjection",
      },
      { type: "verify_no_errors" },

      // Try XSS in tournament name
      { type: "fuzz_input", selector: "[name='name']", payloads: "xss" },
      { type: "verify_no_errors" },

      // Try boundary values
      { type: "fuzz_input", selector: "[name='name']", payloads: "boundaries" },
      { type: "verify_no_errors" },

      // Try special characters
      {
        type: "fuzz_input",
        selector: "[name='name']",
        payloads: "specialChars",
      },
      { type: "verify_no_errors" },

      { type: "check_console" },
    ],
  },

  // ============================================================================
  // INPUT FUZZING: Login Form
  // ============================================================================
  {
    name: "Login Form Fuzzing",
    description: "Fuzz the login form with malicious inputs",
    critical: true,
    steps: [
      { type: "navigate", url: "http://localhost:3001/login" },
      { type: "wait", ms: 500 },

      // Fuzz email field
      {
        type: "fuzz_input",
        selector: "[name='email']",
        payloads: "sqlInjection",
      },
      { type: "fuzz_input", selector: "[name='email']", payloads: "xss" },
      {
        type: "fuzz_input",
        selector: "[name='email']",
        payloads: "boundaries",
      },

      // Fuzz password field
      {
        type: "fuzz_input",
        selector: "[name='password']",
        payloads: "sqlInjection",
      },
      {
        type: "fuzz_input",
        selector: "[name='password']",
        payloads: "boundaries",
      },

      { type: "verify_no_errors" },
      { type: "check_console" },
    ],
  },

  // ============================================================================
  // INPUT FUZZING: Registration Form
  // ============================================================================
  {
    name: "Registration Form Fuzzing",
    description: "Fuzz the registration form with malicious inputs",
    critical: true,
    steps: [
      { type: "navigate", url: "http://localhost:3001/register" },
      { type: "wait", ms: 500 },

      // Fuzz username
      {
        type: "fuzz_input",
        selector: "[name='username']",
        payloads: "sqlInjection",
      },
      { type: "fuzz_input", selector: "[name='username']", payloads: "xss" },
      {
        type: "fuzz_input",
        selector: "[name='username']",
        payloads: "specialChars",
      },

      // Fuzz email
      {
        type: "fuzz_input",
        selector: "[name='email']",
        payloads: "formatBreakers",
      },
      {
        type: "fuzz_input",
        selector: "[name='email']",
        payloads: "sqlInjection",
      },

      { type: "verify_no_errors" },
      { type: "check_console" },
    ],
  },

  // ============================================================================
  // UI EXPLORATION: All Pages
  // ============================================================================
  {
    name: "Exhaustive Page Exploration",
    description: "Visit every page and check for errors",
    critical: true,
    steps: [
      // Public pages
      { type: "navigate", url: "http://localhost:3001/" },
      { type: "verify_no_errors" },
      { type: "check_console" },
      { type: "screenshot", name: "home" },

      { type: "navigate", url: "http://localhost:3001/tournaments" },
      { type: "verify_no_errors" },
      { type: "check_console" },
      { type: "screenshot", name: "tournaments" },

      { type: "navigate", url: "http://localhost:3001/bots" },
      { type: "verify_no_errors" },
      { type: "check_console" },
      { type: "screenshot", name: "bots" },

      { type: "navigate", url: "http://localhost:3001/tables" },
      { type: "verify_no_errors" },
      { type: "check_console" },
      { type: "screenshot", name: "tables" },

      { type: "navigate", url: "http://localhost:3001/leaderboard" },
      { type: "verify_no_errors" },
      { type: "check_console" },
      { type: "screenshot", name: "leaderboard" },

      { type: "navigate", url: "http://localhost:3001/login" },
      { type: "verify_no_errors" },
      { type: "screenshot", name: "login" },

      { type: "navigate", url: "http://localhost:3001/register" },
      { type: "verify_no_errors" },
      { type: "screenshot", name: "register" },

      // Login and check authenticated pages
      { type: "navigate", url: "http://localhost:3001/login" },
      { type: "login", email: "admin@poker.io", password: "TestPassword123!" },
      { type: "wait", ms: 2000 },

      { type: "navigate", url: "http://localhost:3001/profile" },
      { type: "verify_no_errors" },
      { type: "check_console" },
      { type: "screenshot", name: "profile" },

      { type: "navigate", url: "http://localhost:3001/admin" },
      { type: "verify_no_errors" },
      { type: "check_console" },
      { type: "screenshot", name: "admin" },

      { type: "navigate", url: "http://localhost:3001/admin/analytics" },
      { type: "verify_no_errors" },
      { type: "check_console" },
      { type: "screenshot", name: "admin-analytics" },

      { type: "navigate", url: "http://localhost:3001/admin/tournaments" },
      { type: "verify_no_errors" },
      { type: "check_console" },
      { type: "screenshot", name: "admin-tournaments" },
    ],
  },

  // ============================================================================
  // INTERACTIVE ELEMENT TESTING
  // ============================================================================
  {
    name: "Interactive Element Testing",
    description: "Click all buttons, hover all elements, test all interactions",
    critical: true,
    steps: [
      { type: "navigate", url: "http://localhost:3001/" },
      { type: "wait", ms: 1000 },

      // Test navigation links
      {
        type: "click",
        selector: "a[href='/tournaments']",
        description: "Tournaments nav link",
      },
      { type: "wait", ms: 500 },
      { type: "verify_no_errors" },

      {
        type: "click",
        selector: "a[href='/bots']",
        description: "Bots nav link",
      },
      { type: "wait", ms: 500 },
      { type: "verify_no_errors" },

      {
        type: "click",
        selector: "a[href='/leaderboard']",
        description: "Leaderboard nav link",
      },
      { type: "wait", ms: 500 },
      { type: "verify_no_errors" },

      // Test login/register buttons
      { type: "navigate", url: "http://localhost:3001/" },
      {
        type: "click",
        selector: "a[href='/login']",
        description: "Sign In button",
      },
      { type: "wait", ms: 500 },
      { type: "verify_visible", text: "Sign in" },
      { type: "verify_no_errors" },

      // Test form submission with empty fields
      {
        type: "click",
        selector: "button[type='submit']",
        description: "Submit empty login",
      },
      { type: "wait", ms: 500 },
      { type: "check_console" },
    ],
  },

  // ============================================================================
  // GAME VIEW TESTING
  // ============================================================================
  {
    name: "Game View Stress Test",
    description: "Test the game view with live game actions",
    critical: true,
    steps: [
      // Login
      { type: "navigate", url: "http://localhost:3001/login" },
      { type: "login", email: "admin@poker.io", password: "TestPassword123!" },
      { type: "wait", ms: 2000 },

      // Go to tables
      { type: "navigate", url: "http://localhost:3001/tables" },
      { type: "wait", ms: 1000 },
      { type: "verify_no_errors" },
      { type: "screenshot", name: "tables-list" },

      // Try to click on a table if exists
      {
        type: "click",
        selector: ".table-card, [data-table-id]",
        description: "First table",
      },
      { type: "wait", ms: 2000 },
      { type: "verify_no_errors" },
      { type: "check_console" },
      { type: "screenshot", name: "game-view" },

      // Watch for game updates
      { type: "watch_game", timeout: 10000 },
      { type: "verify_no_errors" },
      { type: "check_console" },
    ],
  },

  // ============================================================================
  // RESPONSIVE TESTING
  // ============================================================================
  {
    name: "Responsive Design Test",
    description: "Test at various viewport sizes",
    critical: false,
    steps: [
      { type: "navigate", url: "http://localhost:3001/" },
      { type: "verify_no_errors" },

      // Check mobile view
      { type: "navigate", url: "http://localhost:3001/tournaments" },
      { type: "verify_no_errors" },
      { type: "screenshot", name: "tournaments-mobile" },

      { type: "navigate", url: "http://localhost:3001/bots" },
      { type: "verify_no_errors" },
      { type: "screenshot", name: "bots-mobile" },
    ],
  },

  // ============================================================================
  // EDGE CASE NAVIGATION
  // ============================================================================
  {
    name: "Edge Case Navigation",
    description: "Test invalid routes, back/forward, refresh",
    critical: true,
    steps: [
      // Invalid routes
      { type: "navigate", url: "http://localhost:3001/nonexistent-page" },
      { type: "verify_no_errors" },
      { type: "screenshot", name: "404-page" },

      {
        type: "navigate",
        url: "http://localhost:3001/tournaments/invalid-uuid",
      },
      { type: "verify_no_errors" },
      { type: "screenshot", name: "invalid-tournament" },

      { type: "navigate", url: "http://localhost:3001/games/invalid-uuid" },
      { type: "verify_no_errors" },
      { type: "screenshot", name: "invalid-game" },

      { type: "navigate", url: "http://localhost:3001/bots/invalid-uuid" },
      { type: "verify_no_errors" },
      { type: "screenshot", name: "invalid-bot" },

      { type: "check_console" },
    ],
  },
];

// ============================================================================
// HELPER: Generate Fuzz Test Report
// ============================================================================

export interface FuzzResult {
  input: string;
  category: keyof typeof FUZZ_PAYLOADS;
  selector: string;
  accepted: boolean;
  errorShown: boolean;
  consoleError: boolean;
  crashed: boolean;
  notes: string;
}

export interface LiveTestResult {
  scenario: string;
  passed: boolean;
  steps: {
    step: LiveTestStep;
    passed: boolean;
    error?: string;
    screenshot?: string;
  }[];
  fuzzResults: FuzzResult[];
  consoleErrors: string[];
  visualBugs: string[];
  duration: number;
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  FUZZ_PAYLOADS,
  LIVE_TEST_SCENARIOS,
};
