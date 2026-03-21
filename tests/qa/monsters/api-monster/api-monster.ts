/**
 * API Monster
 *
 * Validates all backend API endpoints for:
 * - Correct response codes
 * - Response shape/contract validation
 * - Authentication and authorization
 * - Input validation (edge cases, invalid data)
 * - Rate limiting
 */

import { BaseMonster } from "../shared/base-monster";
import { RunConfig } from "../shared/types";
import {
  createAuthHelper,
  requireBackendHealthy,
  replacePathParams,
  validateResponseShape,
  runMonsterCli,
  AuthHelper,
} from "../shared";
import {
  API_MONSTER_CONFIG,
  EndpointConfig,
  getEndpointsByCategory,
} from "./api-monster.config";

export class ApiMonster extends BaseMonster {
  private authHelper: AuthHelper = createAuthHelper();
  private testTournamentId: string | null = null;
  private testGameId: string | null = null;

  constructor() {
    super({
      name: "API Monster",
      type: "api",
      timeout: 120000, // 2 minutes
      verbose: true,
    });
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("Setting up API Monster...");

    await requireBackendHealthy();
    this.log("✅ Backend is healthy");

    // Authenticate as admin
    await this.authenticate();

    // Find or create test data
    await this.setupTestData();
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("Starting API tests...");

    // Test endpoints by category
    const categories = getEndpointsByCategory();

    for (const [category, endpoints] of categories) {
      this.log(`\nTesting ${category} endpoints (${endpoints.length})...`);

      for (const endpoint of endpoints) {
        await this.testEndpoint(endpoint);
      }
    }

    // Test rate limiting
    await this.testRateLimiting();

    // Test authentication edge cases
    await this.testAuthEdgeCases();

    // Test public endpoints work without auth
    await this.testPublicEndpointsWithoutAuth();

    // Test admin endpoints reject regular users
    await this.testAdminEndpointsWithRegularUser();
  }

  protected async teardown(): Promise<void> {
    this.log("Cleaning up...");
    // No cleanup needed for read operations
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  private async authenticate(): Promise<void> {
    const token = await this.authHelper.authenticateAsAdmin();
    if (token) {
      this.log("✅ Authenticated as admin");
    } else {
      this.logWarn("Could not authenticate as admin");
    }
  }

  private async authenticateAsRegularUser(): Promise<string | null> {
    const token = await this.authHelper.authenticateAsUser();
    if (token) {
      this.log("✅ Authenticated as regular user");
    } else {
      this.logWarn("Could not authenticate as regular user");
    }
    return token;
  }

  private getAuthHeaders(): Record<string, string> {
    return this.authHelper.getAdminHeaders();
  }

  // ============================================================================
  // TEST DATA SETUP
  // ============================================================================

  private async setupTestData(): Promise<void> {
    // Find existing tournament
    const tournaments = await this.fetch(
      `${API_MONSTER_CONFIG.baseUrl}/api/v1/tournaments`,
    );
    if (
      tournaments.ok &&
      Array.isArray(tournaments.data) &&
      tournaments.data.length > 0
    ) {
      this.testTournamentId = tournaments.data[0].id;
      this.log(`Using existing tournament: ${this.testTournamentId}`);
    }

    // Find existing game
    const games = await this.fetch(
      `${API_MONSTER_CONFIG.baseUrl}/api/v1/games`,
    );
    if (games.ok && Array.isArray(games.data) && games.data.length > 0) {
      this.testGameId = games.data[0].id;
      this.log(`Using existing game: ${this.testGameId}`);
    }
  }

  // ============================================================================
  // ENDPOINT TESTING
  // ============================================================================

  private async testEndpoint(config: EndpointConfig): Promise<void> {
    // Build path params - only include defined values so DEFAULT_TEST_IDS are used for missing ones
    const pathParams: Record<string, string> = {};

    if (config.path.includes("/tournaments/") && this.testTournamentId) {
      pathParams.id = this.testTournamentId;
    } else if (config.path.includes("/games/") && this.testGameId) {
      pathParams.id = this.testGameId;
    }
    // For /bots/:id, we let DEFAULT_TEST_IDS provide a valid UUID

    if (this.testTournamentId) {
      pathParams.tournamentId = this.testTournamentId;
    }
    if (this.testGameId) {
      pathParams.gameId = this.testGameId;
    }

    const path = replacePathParams(config.path, pathParams);

    // Replace dynamic values in body
    let body = config.body;
    if (body) {
      const timestamp = Date.now();
      body = JSON.parse(
        JSON.stringify(body).replace(/\$\{timestamp\}/g, timestamp.toString()),
      );
    }

    // Skip auth-required endpoints if not authenticated
    if (config.auth && !this.authHelper.adminToken) {
      this.recordTest(true, true); // Skip
      return;
    }

    // Make the request
    const url = `${API_MONSTER_CONFIG.baseUrl}${path}`;
    const headers = config.auth ? this.getAuthHeaders() : {};

    const response = await this.fetch(url, {
      method: config.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Check status code
    const expectedStatuses = Array.isArray(config.expectedStatus)
      ? config.expectedStatus
      : [config.expectedStatus];

    if (!expectedStatuses.includes(response.status)) {
      this.addFinding({
        category: "BUG",
        severity: config.critical ? "critical" : "high",
        title: `${config.method} ${config.path} returned unexpected status`,
        description: `Expected ${expectedStatuses.join(" or ")}, got ${response.status}`,
        location: { endpoint: config.path },
        evidence: {
          request: { method: config.method, url, body },
          response: { status: response.status, body: response.data },
        },
        reproducible: true,
        reproductionSteps: [
          `Send ${config.method} request to ${url}`,
          body ? `With body: ${JSON.stringify(body)}` : "Without body",
        ],
        tags: ["api", "status-code", config.method.toLowerCase()],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }

    // Validate response shape
    if (response.ok && config.expectedShape) {
      const shapeErrors = this.validateShape(
        response.data,
        config.expectedShape,
      );
      if (shapeErrors.length > 0) {
        this.addFinding({
          category: "BUG",
          severity: "medium",
          title: `${config.method} ${config.path} response shape mismatch`,
          description: `Response does not match expected shape:\n${shapeErrors.join("\n")}`,
          location: { endpoint: config.path },
          evidence: {
            response: { status: response.status, body: response.data },
            diff: {
              expected: config.expectedShape,
              actual: typeof response.data,
            },
          },
          reproducible: true,
          tags: ["api", "contract", "shape"],
        });
        this.recordTest(false);
      }
    }

    // Run custom validator
    if (response.ok && config.validate) {
      const validation = config.validate(response.data);
      if (!validation.valid) {
        this.addFinding({
          category: "BUG",
          severity: config.critical ? "high" : "medium",
          title: `${config.method} ${config.path} validation failed`,
          description: validation.error || "Custom validation failed",
          location: { endpoint: config.path },
          evidence: {
            response: { status: response.status, body: response.data },
          },
          reproducible: true,
          tags: ["api", "validation"],
        });
        this.recordTest(false);
      }
    }

    // Test variations (error cases)
    if (config.variations) {
      for (const variation of config.variations) {
        await this.testVariation(config, variation);
      }
    }
  }

  private async testVariation(
    config: EndpointConfig,
    variation: NonNullable<EndpointConfig["variations"]>[0],
  ): Promise<void> {
    const url = `${API_MONSTER_CONFIG.baseUrl}${config.path}`;
    const headers = config.auth ? this.getAuthHeaders() : {};

    const response = await this.fetch(url, {
      method: config.method,
      headers,
      body: variation.body ? JSON.stringify(variation.body) : undefined,
    });

    if (response.status !== variation.expectedStatus) {
      this.addFinding({
        category: "BUG",
        severity: "medium",
        title: `${config.path} - ${variation.name}: wrong status`,
        description: `${variation.description}\nExpected ${variation.expectedStatus}, got ${response.status}`,
        location: { endpoint: config.path },
        evidence: {
          request: { method: config.method, url, body: variation.body },
          response: { status: response.status, body: response.data },
        },
        reproducible: true,
        tags: ["api", "validation", variation.name],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }
  }

  private validateShape(
    data: unknown,
    expected: Record<string, string>,
  ): string[] {
    const result = validateResponseShape(
      data,
      expected as Record<
        string,
        "string" | "number" | "boolean" | "object" | "array"
      >,
    );
    return result.errors.map(
      (e) => `Field ${e.field}: expected ${e.expected}, got ${e.actual}`,
    );
  }

  // ============================================================================
  // RATE LIMITING TESTS
  // ============================================================================

  private async testRateLimiting(): Promise<void> {
    this.log("\nTesting rate limiting...");

    for (const test of API_MONSTER_CONFIG.rateLimitTests) {
      const url = `${API_MONSTER_CONFIG.baseUrl}${test.endpoint}`;
      let rateLimitHit = false;
      let requestsMade = 0;

      for (let i = 0; i < test.requestCount; i++) {
        const response = await this.fetch(url, {
          method: "POST",
          body: JSON.stringify({
            email: "ratelimit@test.com",
            password: "test",
          }),
        });

        requestsMade++;

        if (response.status === 429) {
          rateLimitHit = true;
          break;
        }
      }

      if (!rateLimitHit) {
        this.addFinding({
          category: "SECURITY",
          severity: "high",
          title: `Rate limiting not enforced on ${test.endpoint}`,
          description: `Made ${requestsMade} requests without hitting rate limit. Expected limit at ~${test.expectedLimit} requests.`,
          location: { endpoint: test.endpoint },
          reproducible: true,
          reproductionSteps: [
            `Send ${test.requestCount} rapid requests to ${test.endpoint}`,
            "Observe no 429 status returned",
          ],
          tags: ["security", "rate-limit"],
        });
        this.recordTest(false);
      } else if (requestsMade > test.expectedLimit * 2) {
        this.addFinding({
          category: "CONCERN",
          severity: "medium",
          title: `Rate limit too lenient on ${test.endpoint}`,
          description: `Rate limit hit after ${requestsMade} requests, expected ~${test.expectedLimit}`,
          location: { endpoint: test.endpoint },
          reproducible: true,
          tags: ["security", "rate-limit"],
        });
        this.recordTest(false);
      } else {
        this.log(
          `  ✅ ${test.endpoint}: Rate limited after ${requestsMade} requests`,
        );
        this.recordTest(true);
      }
    }
  }

  // ============================================================================
  // AUTH EDGE CASES
  // ============================================================================

  private async testAuthEdgeCases(): Promise<void> {
    this.log("\nTesting auth edge cases...");

    // Test accessing protected endpoint without token
    const protectedEndpoints = API_MONSTER_CONFIG.endpoints.filter(
      (e) => e.auth && !e.adminOnly,
    );

    for (const endpoint of protectedEndpoints.slice(0, 3)) {
      const url = `${API_MONSTER_CONFIG.baseUrl}${endpoint.path.replace(":id", "test")}`;

      const response = await this.fetch(url, {
        method: endpoint.method,
        // No auth header
      });

      if (response.status !== 401 && response.status !== 403) {
        this.addFinding({
          category: "SECURITY",
          severity: "critical",
          title: `Protected endpoint accessible without auth: ${endpoint.path}`,
          description: `${endpoint.method} ${endpoint.path} returned ${response.status} without authentication. Expected 401 or 403.`,
          location: { endpoint: endpoint.path },
          evidence: {
            request: { method: endpoint.method, url },
            response: { status: response.status, body: response.data },
          },
          reproducible: true,
          tags: ["security", "auth-bypass"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }

    // Test with invalid token (jwt.io example token - NOT a real secret)
    // gitleaks:allow
    const invalidToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

    const meEndpoint = `${API_MONSTER_CONFIG.baseUrl}/api/v1/auth/me`;
    const response = await this.fetch(meEndpoint, {
      headers: { Authorization: `Bearer ${invalidToken}` },
    });

    if (response.status !== 401 && response.status !== 403) {
      this.addFinding({
        category: "SECURITY",
        severity: "critical",
        title: "Invalid JWT token accepted",
        description: `/api/v1/auth/me accepted an invalid JWT token and returned ${response.status}`,
        location: { endpoint: "/api/v1/auth/me" },
        evidence: {
          request: { method: "GET", url: meEndpoint },
          response: { status: response.status, body: response.data },
        },
        reproducible: true,
        tags: ["security", "jwt", "auth-bypass"],
      });
      this.recordTest(false);
    } else {
      this.log("  ✅ Invalid JWT correctly rejected");
      this.recordTest(true);
    }
  }

  // ============================================================================
  // PUBLIC ENDPOINT TESTS
  // ============================================================================

  private async testPublicEndpointsWithoutAuth(): Promise<void> {
    this.log("\nTesting public endpoints work without auth...");

    const publicEndpoints = API_MONSTER_CONFIG.endpoints.filter((e) => !e.auth);

    for (const endpoint of publicEndpoints) {
      // Replace path parameters
      let path = endpoint.path;
      if (path.includes(":id")) {
        if (path.includes("/tournaments/")) {
          path = path.replace(
            ":id",
            this.testTournamentId || "00000000-0000-0000-0000-000000000000",
          );
        } else if (path.includes("/games/")) {
          path = path.replace(
            ":id",
            this.testGameId || "00000000-0000-0000-0000-000000000000",
          );
        } else {
          path = path.replace(":id", "00000000-0000-0000-0000-000000000000");
        }
      }

      const url = `${API_MONSTER_CONFIG.baseUrl}${path}`;

      // Call WITHOUT auth token
      const response = await this.fetch(url, {
        method: endpoint.method,
        // No Authorization header
      });

      // Skip 404s for endpoints with path params
      if (response.status === 404 && endpoint.path.includes(":id")) {
        this.recordTest(true, true); // Skip
        continue;
      }

      // A public endpoint should NOT return 401 or 403
      if (response.status === 401 || response.status === 403) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: `Public endpoint requires auth: ${endpoint.path}`,
          description: `${endpoint.method} ${endpoint.path} returned ${response.status} without authentication. This endpoint is marked as public but requires auth.`,
          location: { endpoint: endpoint.path },
          evidence: {
            request: { method: endpoint.method, url },
            response: { status: response.status, body: response.data },
            config: { auth: endpoint.auth },
          },
          reproducible: true,
          reproductionSteps: [
            `Call ${endpoint.method} ${url} without Authorization header`,
            `Observe ${response.status} error`,
          ],
          tags: ["api", "auth", "public-endpoint"],
        });
        this.recordTest(false);
        this.log(`  ❌ ${endpoint.path} - requires auth but marked as public`);
      } else {
        this.recordTest(true);
        this.log(`  ✅ ${endpoint.path} - accessible without auth`);
      }
    }
  }

  // ============================================================================
  // ADMIN ENDPOINT TESTS
  // ============================================================================

  private async testAdminEndpointsWithRegularUser(): Promise<void> {
    this.log("\nTesting admin endpoints reject regular users...");

    // Get a regular user token
    const userToken = await this.authenticateAsRegularUser();
    if (!userToken) {
      this.log("  ⏭️  Skipping admin endpoint tests - no regular user token");
      return;
    }

    const adminEndpoints = API_MONSTER_CONFIG.endpoints.filter(
      (e) => e.adminOnly,
    );

    for (const endpoint of adminEndpoints) {
      // Replace path parameters
      let path = endpoint.path;
      if (path.includes(":id")) {
        if (path.includes("/tournaments/")) {
          path = path.replace(
            ":id",
            this.testTournamentId || "00000000-0000-0000-0000-000000000000",
          );
        } else {
          path = path.replace(":id", "00000000-0000-0000-0000-000000000000");
        }
      }

      const url = `${API_MONSTER_CONFIG.baseUrl}${path}`;

      // Call WITH regular user token (not admin)
      const response = await this.fetch(url, {
        method: endpoint.method,
        headers: { Authorization: `Bearer ${userToken}` },
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      });

      // Admin endpoints should return 403 Forbidden for regular users
      if (response.status !== 403) {
        // 404 is acceptable if resource doesn't exist
        if (response.status === 404 && endpoint.path.includes(":id")) {
          this.recordTest(true, true); // Skip
          continue;
        }

        // 401 is also acceptable (means auth is required, which is correct)
        if (response.status === 401) {
          this.recordTest(true);
          this.log(`  ✅ ${endpoint.path} - requires auth (401)`);
          continue;
        }

        this.addFinding({
          category: "SECURITY",
          severity: "critical",
          title: `Admin endpoint accessible to regular user: ${endpoint.path}`,
          description: `${endpoint.method} ${endpoint.path} returned ${response.status} for a regular user. Admin-only endpoints should return 403.`,
          location: { endpoint: endpoint.path },
          evidence: {
            request: { method: endpoint.method, url },
            response: { status: response.status, body: response.data },
            config: { adminOnly: true },
          },
          reproducible: true,
          reproductionSteps: [
            `Login as a regular user (non-admin)`,
            `Call ${endpoint.method} ${endpoint.path}`,
            `Observe ${response.status} instead of 403`,
          ],
          tags: ["security", "authorization", "admin-bypass"],
        });
        this.recordTest(false);
        this.log(
          `  ❌ ${endpoint.path} - accessible to regular user (${response.status})`,
        );
      } else {
        this.recordTest(true);
        this.log(
          `  ✅ ${endpoint.path} - correctly rejected regular user (403)`,
        );
      }
    }
  }
}

// ============================================================================
// CLI RUNNER
// ============================================================================

if (require.main === module) {
  runMonsterCli(new ApiMonster(), "api");
}
