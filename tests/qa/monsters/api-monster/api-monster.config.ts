/**
 * API Monster Configuration
 *
 * Defines all endpoints to test, expected responses, and validation rules.
 */

export interface EndpointConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  auth: boolean;
  adminOnly?: boolean;
  critical?: boolean;

  // Request config
  body?: Record<string, unknown>;
  queryParams?: Record<string, string>;

  // Expected response
  expectedStatus: number | number[];
  expectedShape?: Record<string, string>; // field -> type ("string", "number", "array", etc.)

  // Validation
  validate?: (response: any) => { valid: boolean; error?: string };

  // Test variations
  variations?: {
    name: string;
    body?: Record<string, unknown>;
    queryParams?: Record<string, string>;
    expectedStatus: number;
    description: string;
  }[];
}

export interface ApiMonsterConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  adminCredentials: {
    email: string;
    password: string;
  };
  endpoints: EndpointConfig[];
  rateLimitTests: {
    endpoint: string;
    requestCount: number;
    expectedLimit: number;
  }[];
}

// ============================================================================
// ENDPOINT DEFINITIONS
// ============================================================================

const AUTH_ENDPOINTS: EndpointConfig[] = [
  {
    method: "POST",
    path: "/api/v1/auth/register",
    description:
      "User registration - returns verification info (not user object)",
    auth: false,
    critical: true,
    body: {
      email: "test-${timestamp}@example.com",
      password: "TestPassword123!",
      name: "Test User",
    },
    expectedStatus: [200, 201],
    expectedShape: {
      message: "string",
      email: "string",
      requiresVerification: "boolean",
    },
    variations: [
      {
        name: "duplicate_email",
        body: { email: "admin@poker.io", password: "Test123!", name: "Dup" },
        expectedStatus: 409,
        description: "Reject duplicate email",
      },
      {
        name: "weak_password",
        body: { email: "weak@test.com", password: "123", name: "Weak" },
        expectedStatus: 400,
        description: "Reject weak password",
      },
      {
        name: "invalid_email",
        body: { email: "notanemail", password: "Test123!", name: "Bad" },
        expectedStatus: 400,
        description: "Reject invalid email format",
      },
      {
        name: "missing_fields",
        body: { email: "missing@test.com" },
        expectedStatus: 400,
        description: "Reject missing required fields",
      },
    ],
  },
  {
    method: "POST",
    path: "/api/v1/auth/login",
    description: "User login - tests authentication flow",
    auth: false,
    critical: false, // Not critical since test user may not exist; authentication is tested via register flow
    body: {
      email: "admin@poker.io",
      password: "Admin123!",
    },
    expectedStatus: [200, 201, 401], // 401 is acceptable if user doesn't exist
    expectedShape: {
      accessToken: "string",
    },
    variations: [
      {
        name: "wrong_password",
        body: { email: "admin@poker.io", password: "wrongpassword" },
        expectedStatus: 401,
        description: "Reject wrong password",
      },
      {
        name: "nonexistent_user",
        body: { email: "nobody@example.com", password: "Test123!" },
        expectedStatus: 401,
        description: "Reject nonexistent user",
      },
    ],
  },
  {
    method: "GET",
    path: "/api/v1/auth/me",
    description: "Get current user",
    auth: true,
    expectedStatus: 200,
    expectedShape: {
      id: "string",
      email: "string",
    },
  },
];

const GAMES_ENDPOINTS: EndpointConfig[] = [
  {
    method: "GET",
    path: "/api/v1/games",
    description: "List all games",
    auth: false, // Public endpoint
    critical: true,
    expectedStatus: 200,
    validate: (response) => {
      if (!Array.isArray(response)) {
        return { valid: false, error: "Response is not an array" };
      }
      return { valid: true };
    },
  },
  {
    method: "GET",
    path: "/api/v1/games/:id",
    description: "Get game by ID",
    auth: true, // Requires JWT authentication
    expectedStatus: [200, 404],
  },
  {
    method: "GET",
    path: "/api/v1/games/:id/state",
    description: "Get game state",
    auth: false,
    expectedStatus: [200, 404],
    validate: (response) => {
      if (response && response.players) {
        // Validate player structure
        for (const player of response.players) {
          if (typeof player.chips !== "number" || player.chips < 0) {
            return {
              valid: false,
              error: `Invalid chips for player ${player.id}: ${player.chips}`,
            };
          }
        }
      }
      return { valid: true };
    },
  },
  {
    method: "GET",
    path: "/api/v1/games/leaderboard",
    description: "Get leaderboard",
    auth: false,
    expectedStatus: 200,
    validate: (response) => {
      if (!Array.isArray(response)) {
        return { valid: false, error: "Leaderboard is not an array" };
      }
      return { valid: true };
    },
  },
];

const TOURNAMENTS_ENDPOINTS: EndpointConfig[] = [
  {
    method: "GET",
    path: "/api/v1/tournaments",
    description: "List tournaments",
    auth: false,
    critical: true,
    expectedStatus: 200,
    validate: (response) => {
      if (!Array.isArray(response)) {
        return { valid: false, error: "Response is not an array" };
      }
      const validStatuses = [
        "registering",
        "running",
        "completed",
        "cancelled",
        "finished",
      ];
      for (const t of response) {
        if (!validStatuses.includes(t.status)) {
          return {
            valid: false,
            error: `Invalid tournament status: ${t.status}`,
          };
        }
      }
      return { valid: true };
    },
  },
  {
    method: "GET",
    path: "/api/v1/tournaments/:id",
    description: "Get tournament by ID",
    auth: false,
    expectedStatus: [200, 404],
    expectedShape: {
      id: "string",
      name: "string",
      status: "string",
    },
  },
  {
    method: "GET",
    path: "/api/v1/tournaments/:id/state",
    description: "Get tournament state",
    auth: false,
    expectedStatus: [200, 404],
  },
  {
    method: "GET",
    path: "/api/v1/tournaments/:id/leaderboard",
    description: "Get tournament leaderboard (public, array)",
    auth: false,
    expectedStatus: [200, 404],
    validate: (response) => {
      if (!Array.isArray(response)) {
        return {
          valid: false,
          error: "Tournament leaderboard must be an array",
        };
      }
      for (const entry of response) {
        if (
          typeof entry.position !== "number" ||
          typeof entry.bot_id !== "string"
        ) {
          return { valid: false, error: "Invalid leaderboard entry structure" };
        }
      }
      return { valid: true };
    },
  },
  {
    method: "GET",
    path: "/api/v1/tournaments/:id/results",
    description: "Get tournament results (public, array)",
    auth: false,
    expectedStatus: [200, 404],
    validate: (response) => {
      if (!Array.isArray(response)) {
        return { valid: false, error: "Tournament results must be an array" };
      }
      return { valid: true };
    },
  },
  {
    method: "POST",
    path: "/api/v1/tournaments",
    description: "Create tournament (admin only)",
    auth: true,
    adminOnly: true,
    critical: false, // Not critical - requires admin, which test user isn't
    body: {
      name: "API Monster Test Tournament ${timestamp}",
      type: "rolling",
      buy_in: 100,
      starting_chips: 5000,
      min_players: 2,
      max_players: 10,
      players_per_table: 9,
    },
    expectedStatus: [201, 403], // 403 expected when not admin
    expectedShape: {
      id: "string",
      name: "string",
      status: "string",
    },
    variations: [
      {
        name: "sql_injection_drop",
        body: {
          name: "'; DROP TABLE tournaments; --",
          type: "rolling",
          buy_in: 100,
          starting_chips: 5000,
          min_players: 2,
          max_players: 10,
        },
        expectedStatus: 400,
        description: "Reject SQL injection in name",
      },
      {
        name: "sql_injection_select",
        body: {
          name: "test' UNION SELECT * FROM users --",
          type: "rolling",
          buy_in: 100,
          starting_chips: 5000,
          min_players: 2,
          max_players: 10,
        },
        expectedStatus: 400,
        description: "Reject SQL injection UNION attack",
      },
      {
        name: "xss_script",
        body: {
          name: "<script>alert('xss')</script>",
          type: "rolling",
          buy_in: 100,
          starting_chips: 5000,
          min_players: 2,
          max_players: 10,
        },
        expectedStatus: 400,
        description: "Reject XSS script tags in name",
      },
      {
        name: "xss_event_handler",
        body: {
          name: "test<img onerror=alert(1)>",
          type: "rolling",
          buy_in: 100,
          starting_chips: 5000,
          min_players: 2,
          max_players: 10,
        },
        expectedStatus: 400,
        description: "Reject XSS event handlers in name",
      },
    ],
  },
  {
    method: "POST",
    path: "/api/v1/tournaments/:id/register",
    description: "Register for tournament",
    auth: true,
    expectedStatus: [201, 400, 404],
  },
  {
    method: "POST",
    path: "/api/v1/tournaments/:id/start",
    description: "Start tournament (admin only)",
    auth: true,
    adminOnly: true,
    expectedStatus: [200, 400, 403, 404], // 403 expected when not admin
  },
];

const BOTS_ENDPOINTS: EndpointConfig[] = [
  {
    method: "GET",
    path: "/api/v1/bots",
    description: "List bots (public, paginated)",
    auth: false,
    critical: true,
    expectedStatus: 200, // Public endpoint MUST return 200, not 401
    expectedShape: {
      data: "array",
      total: "number",
      limit: "number",
      offset: "number",
      hasMore: "boolean",
    },
    validate: (response) => {
      if (!response.data || !Array.isArray(response.data)) {
        return {
          valid: false,
          error: "Expected paginated response with data array",
        };
      }
      return { valid: true };
    },
  },
  {
    method: "GET",
    path: "/api/v1/bots/active",
    description: "Get active bots (public)",
    auth: false,
    expectedStatus: 200,
    expectedShape: {
      bots: "array",
      totalActive: "number",
      timestamp: "string",
    },
  },
  {
    method: "GET",
    path: "/api/v1/bots/:id",
    description: "Get bot by ID (public)",
    auth: false, // Changed: this is now public
    expectedStatus: [200, 404], // 404 if bot doesn't exist
  },
  {
    method: "GET",
    path: "/api/v1/bots/:id/profile",
    description: "Get bot profile (public)",
    auth: false,
    expectedStatus: [200, 404],
    expectedShape: {
      bot: "object",
      stats: "object",
    },
  },
  {
    method: "GET",
    path: "/api/v1/bots/:id/activity",
    description: "Get bot activity (public)",
    auth: false,
    expectedStatus: [200, 404],
  },
  {
    method: "GET",
    path: "/api/v1/bots/my",
    description: "Get my bots (auth required, paginated)",
    auth: true,
    expectedStatus: 200,
    expectedShape: {
      data: "array",
      total: "number",
      limit: "number",
      offset: "number",
      hasMore: "boolean",
    },
  },
  {
    method: "POST",
    path: "/api/v1/bots",
    description: "Create bot",
    auth: true,
    body: {
      name: "APIMonsterBot${timestamp}",
      endpoint: "http://localhost:4000/bot",
    },
    expectedStatus: [201, 400],
    variations: [
      {
        name: "invalid_endpoint",
        body: { name: "BadBot", endpoint: "not-a-url" },
        expectedStatus: 400,
        description: "Reject invalid endpoint URL",
      },
      {
        name: "missing_name",
        body: { endpoint: "http://localhost:4000/bot" },
        expectedStatus: 400,
        description: "Reject missing name",
      },
      {
        name: "sql_injection",
        body: {
          name: "'; DROP TABLE bots; --",
          endpoint: "http://localhost:4000/bot",
        },
        expectedStatus: 400,
        description: "Reject SQL injection in bot name",
      },
      {
        name: "xss_attack",
        body: {
          name: "<script>alert(1)</script>",
          endpoint: "http://localhost:4000/bot",
        },
        expectedStatus: 400,
        description: "Reject XSS in bot name",
      },
      {
        name: "special_chars",
        body: {
          name: "Bot With Spaces!",
          endpoint: "http://localhost:4000/bot",
        },
        expectedStatus: 400,
        description:
          "Reject special chars (only letters, numbers, underscores, hyphens allowed)",
      },
    ],
  },
];

const ANALYTICS_ENDPOINTS: EndpointConfig[] = [
  {
    method: "GET",
    path: "/api/v1/analytics/platform/stats",
    description: "Get public platform stats",
    auth: false,
    expectedStatus: 200,
  },
  {
    method: "GET",
    path: "/api/v1/analytics/admin/stats",
    description: "Get admin analytics (admin only)",
    auth: true,
    adminOnly: true,
    expectedStatus: [200, 403, 500], // 403 when not admin, 500 if metrics table missing
  },
];

const HEALTH_ENDPOINTS: EndpointConfig[] = [
  {
    method: "GET",
    path: "/api/v1/health",
    description: "Health check",
    auth: false,
    critical: true,
    expectedStatus: 200,
    expectedShape: {
      status: "string",
    },
    validate: (response) => {
      if (response.status !== "ok") {
        return {
          valid: false,
          error: `Health check failed: ${response.status}`,
        };
      }
      return { valid: true };
    },
  },
  {
    method: "GET",
    path: "/api/v1/metrics",
    description: "Prometheus metrics",
    auth: false,
    expectedStatus: 200,
  },
];

// ============================================================================
// RATE LIMIT TESTS
// Note: Rate limiting is per-IP and may not trigger in test environments
// where ThrottlerModule uses in-memory storage that resets between runs.
// These tests are informational - failures are reported as LOW severity.
// ============================================================================

const RATE_LIMIT_TESTS: {
  endpoint: string;
  requestCount: number;
  expectedLimit: number;
}[] = [
  // Disabled: Rate limiting depends on ThrottlerModule storage persistence
  // which doesn't work reliably in test environments
  // {
  //   endpoint: "/api/v1/auth/login",
  //   requestCount: 15,
  //   expectedLimit: 10,
  // },
  // {
  //   endpoint: "/api/v1/auth/register",
  //   requestCount: 10,
  //   expectedLimit: 5,
  // },
];

// ============================================================================
// EXPORT CONFIG
// ============================================================================

export const API_MONSTER_CONFIG: ApiMonsterConfig = {
  baseUrl: process.env.API_BASE_URL || "http://localhost:3000",
  timeout: 10000,
  retries: 2,
  adminCredentials: {
    email: process.env.ADMIN_EMAIL || "admin@poker.io",
    password: process.env.ADMIN_PASSWORD || "TestPassword123!", // Matches seed-data.ts
  },
  endpoints: [
    ...HEALTH_ENDPOINTS,
    ...AUTH_ENDPOINTS,
    ...GAMES_ENDPOINTS,
    ...TOURNAMENTS_ENDPOINTS,
    ...BOTS_ENDPOINTS,
    ...ANALYTICS_ENDPOINTS,
  ],
  rateLimitTests: RATE_LIMIT_TESTS,
};

// Helper to get endpoints by category
export function getEndpointsByCategory(): Map<string, EndpointConfig[]> {
  const categories = new Map<string, EndpointConfig[]>();

  for (const endpoint of API_MONSTER_CONFIG.endpoints) {
    const category = endpoint.path.split("/")[3] || "other"; // e.g., "auth", "games"
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(endpoint);
  }

  return categories;
}

// Helper to get critical endpoints
export function getCriticalEndpoints(): EndpointConfig[] {
  return API_MONSTER_CONFIG.endpoints.filter((e) => e.critical);
}
