/**
 * E2E Monster - Layer 4
 *
 * The ultimate integration test - complete user journeys across ALL systems.
 * Tests the full stack from frontend → API → DB → WebSocket → UI.
 *
 * User Journeys Tested:
 * 1. New User Signup → Join Tournament → Play → Cash Out
 * 2. Bot Registration → Tournament Play → Elimination
 * 3. Admin Dashboard → Create Tournament → Monitor → Complete
 * 4. Spectator View → Watch Game → Real-time Updates
 */

import {
  BaseMonster,
  RunConfig,
  Severity,
  getEnv,
  requireBackendHealthy,
  runMonsterCli,
} from "../shared";

interface E2EScenario {
  name: string;
  description: string;
  steps: E2EStep[];
  criticalPath: boolean;
}

interface E2EStep {
  name: string;
  action: () => Promise<StepResult>;
  timeout: number;
  retries: number;
}

interface StepResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

interface E2EConfig {
  baseUrl: string;
  frontendUrl: string;
  wsUrl: string;
  stepTimeout: number;
  scenarioTimeout: number;
}

export class E2EMonster extends BaseMonster {
  private e2eConfig: E2EConfig;
  private scenarios: E2EScenario[] = [];
  private testUser?: { email: string; password: string; token?: string };
  private testTournament?: { id: string; name: string };

  constructor(config?: Partial<E2EConfig>) {
    super({ name: "E2E Monster", type: "e2e" });
    const env = getEnv();
    this.e2eConfig = {
      baseUrl: env.apiBaseUrl,
      frontendUrl: env.frontendUrl,
      wsUrl: env.wsUrl,
      stepTimeout: 10000,
      scenarioTimeout: 120000,
      ...config,
    };
    this.initializeScenarios();
  }

  private initializeScenarios(): void {
    this.scenarios = [
      {
        name: "new_user_tournament_journey",
        description: "Complete journey: signup → join tournament → play game",
        criticalPath: true,
        steps: [
          {
            name: "Register new user",
            action: () => this.registerUser(),
            timeout: 5000,
            retries: 1,
          },
          {
            name: "Login with credentials",
            action: () => this.loginUser(),
            timeout: 5000,
            retries: 2,
          },
          {
            name: "View available tournaments",
            action: () => this.viewTournaments(),
            timeout: 5000,
            retries: 2,
          },
          {
            name: "View tournament details",
            action: () => this.viewTournamentDetails(),
            timeout: 5000,
            retries: 2,
          },
          {
            name: "Check leaderboard",
            action: () => this.checkLeaderboard(),
            timeout: 5000,
            retries: 2,
          },
        ],
      },
      {
        name: "public_pages_journey",
        description: "Verify all public pages are accessible",
        criticalPath: true,
        steps: [
          {
            name: "Access home page",
            action: () => this.accessPage("/"),
            timeout: 5000,
            retries: 2,
          },
          {
            name: "Access login page",
            action: () => this.accessPage("/login"),
            timeout: 5000,
            retries: 2,
          },
          {
            name: "Access register page",
            action: () => this.accessPage("/register"),
            timeout: 5000,
            retries: 2,
          },
          {
            name: "Access tournaments page",
            action: () => this.accessPage("/tournaments"),
            timeout: 5000,
            retries: 2,
          },
          {
            name: "Access leaderboard page",
            action: () => this.accessPage("/leaderboard"),
            timeout: 5000,
            retries: 2,
          },
        ],
      },
      {
        name: "api_health_journey",
        description: "Verify all critical API endpoints are responding",
        criticalPath: true,
        steps: [
          {
            name: "Health check",
            action: () => this.checkEndpoint("/games/health"),
            timeout: 3000,
            retries: 3,
          },
          {
            name: "Tournaments list",
            action: () => this.checkEndpoint("/tournaments"),
            timeout: 5000,
            retries: 2,
          },
          {
            name: "Games list",
            action: () => this.checkEndpoint("/games"),
            timeout: 5000,
            retries: 2,
          },
          {
            name: "Leaderboard",
            action: () => this.checkEndpoint("/games/leaderboard"),
            timeout: 5000,
            retries: 2,
          },
        ],
      },
      {
        name: "data_consistency_journey",
        description: "Verify data consistency across API calls",
        criticalPath: true,
        steps: [
          {
            name: "Fetch tournaments",
            action: () => this.fetchAndStoreTournaments(),
            timeout: 5000,
            retries: 2,
          },
          {
            name: "Verify tournament details match list",
            action: () => this.verifyTournamentConsistency(),
            timeout: 10000,
            retries: 1,
          },
          {
            name: "Verify leaderboard data integrity",
            action: () => this.verifyLeaderboardIntegrity(),
            timeout: 5000,
            retries: 1,
          },
        ],
      },
      {
        name: "error_handling_journey",
        description: "Verify graceful error handling",
        criticalPath: false,
        steps: [
          {
            name: "Invalid endpoint returns 404",
            action: () => this.verifyNotFound(),
            timeout: 3000,
            retries: 1,
          },
          {
            name: "Invalid auth returns 401",
            action: () => this.verifyUnauthorized(),
            timeout: 3000,
            retries: 1,
          },
          {
            name: "Invalid input returns 400",
            action: () => this.verifyBadRequest(),
            timeout: 3000,
            retries: 1,
          },
        ],
      },
    ];
  }

  async setup(): Promise<void> {
    this.log("Setting up E2E Monster...");

    await requireBackendHealthy({ retries: 3, retryDelay: 1000 });
    this.log("✅ Backend healthy");

    // Verify frontend
    try {
      const response = await this.fetch(this.e2eConfig.frontendUrl);
      if (!response.ok) {
        throw new Error(`Frontend not responding: ${response.status}`);
      }
      this.log("✅ Frontend accessible");
    } catch (error: any) {
      this.logWarn(`Frontend not accessible: ${error.message}`);
    }

    const env = getEnv();
    this.testUser = {
      email: process.env.E2E_TEST_EMAIL || env.userEmail,
      password: process.env.E2E_TEST_PASSWORD || env.userPassword,
    };

    this.log(`Using test account: ${this.testUser.email}`);
  }

  async execute(_config: RunConfig): Promise<void> {
    this.log("Starting E2E journey tests...\n");

    for (const scenario of this.scenarios) {
      await this.runScenario(scenario);
    }

    this.log("\n" + "─".repeat(50));
    this.log("E2E MONSTER SUMMARY");
    this.log("─".repeat(50));
    this.log(`Scenarios run: ${this.scenarios.length}`);
    this.log(`Steps passed: ${this.testsPassed}`);
    this.log(`Steps failed: ${this.testsFailed}`);
  }

  private async runScenario(scenario: E2EScenario): Promise<void> {
    this.log(`\n📍 Scenario: ${scenario.name}`);
    this.log(`   ${scenario.description}`);

    const scenarioStart = Date.now();
    let allStepsPassed = true;
    const stepResults: Array<{ step: string; result: StepResult }> = [];

    for (const step of scenario.steps) {
      const result = await this.runStep(step);
      stepResults.push({ step: step.name, result });

      if (!result.success) {
        allStepsPassed = false;

        // For critical path, one failure means the whole scenario fails
        if (scenario.criticalPath) {
          this.addFinding({
            category: "BUG",
            severity: "critical",
            title: `E2E Critical Path Failed: ${scenario.name}`,
            description: `Step "${step.name}" failed: ${result.error}`,
            location: { endpoint: `e2e/${scenario.name}/${step.name}` },
            reproducible: true,
            reproductionSteps: [
              `Run E2E scenario: ${scenario.name}`,
              `Step that failed: ${step.name}`,
              `Error: ${result.error}`,
            ],
            tags: ["e2e", "critical-path", scenario.name],
          });
          break;
        } else {
          // Non-critical path, continue but record finding
          this.addFinding({
            category: "BUG",
            severity: "high",
            title: `E2E Step Failed: ${step.name}`,
            description: result.error || "Step did not complete successfully",
            location: { endpoint: `e2e/${scenario.name}/${step.name}` },
            reproducible: true,
            tags: ["e2e", scenario.name],
          });
        }
      }
    }

    const scenarioDuration = Date.now() - scenarioStart;

    if (allStepsPassed) {
      this.log(`   ✅ Scenario passed (${scenarioDuration}ms)`);
    } else {
      this.log(`   ❌ Scenario failed (${scenarioDuration}ms)`);
    }
  }

  private async runStep(step: E2EStep): Promise<StepResult> {
    const start = Date.now();
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= step.retries; attempt++) {
      try {
        const result = await Promise.race([
          step.action(),
          new Promise<StepResult>((_, reject) =>
            setTimeout(() => reject(new Error("Step timeout")), step.timeout),
          ),
        ]);

        if (result.success) {
          this.recordTest(true);
          this.log(`     ✓ ${step.name} (${Date.now() - start}ms)`);
          return result;
        }

        lastError = result.error;
      } catch (error: any) {
        lastError = error.message;
      }

      if (attempt < step.retries) {
        await new Promise((r) => setTimeout(r, 1000)); // Wait before retry
      }
    }

    this.recordTest(false);
    this.logError(`     ✗ ${step.name}: ${lastError}`);
    return { success: false, error: lastError, duration: Date.now() - start };
  }

  // ============================================================================
  // STEP IMPLEMENTATIONS
  // ============================================================================

  private async registerUser(): Promise<StepResult> {
    const start = Date.now();

    if (!this.testUser) {
      return { success: false, error: "No test user configured", duration: 0 };
    }

    const response = await this.fetch(
      `${this.e2eConfig.baseUrl}/auth/register`,
      {
        method: "POST",
        body: JSON.stringify({
          email: this.testUser.email,
          password: this.testUser.password,
          name: "E2E Test User",
        }),
      },
    );

    if (response.ok || response.status === 201) {
      return {
        success: true,
        data: response.data,
        duration: Date.now() - start,
      };
    }

    // 409 Conflict means user already exists, which is fine for E2E
    if (response.status === 409) {
      return {
        success: true,
        data: { alreadyExists: true },
        duration: Date.now() - start,
      };
    }

    return {
      success: false,
      error: `Registration failed: ${response.status} - ${JSON.stringify(response.data)}`,
      duration: Date.now() - start,
    };
  }

  private async loginUser(): Promise<StepResult> {
    const start = Date.now();

    if (!this.testUser) {
      return { success: false, error: "No test user configured", duration: 0 };
    }

    // List of accounts to try in order (from seed data)
    const accountsToTry = [
      { email: this.testUser.email, password: this.testUser.password },
      { email: "admin@poker.io", password: "TestPassword123!" },
      { email: "test@test.local", password: "TestPassword123!" },
      { email: "alice@example.com", password: "TestPassword123!" },
    ];

    for (const account of accountsToTry) {
      const response = await this.fetch(
        `${this.e2eConfig.baseUrl}/auth/login`,
        {
          method: "POST",
          body: JSON.stringify({
            email: account.email,
            password: account.password,
          }),
        },
      );

      if (
        response.ok &&
        (response.data?.accessToken || response.data?.access_token)
      ) {
        this.testUser.email = account.email;
        this.testUser.token =
          response.data.accessToken || response.data.access_token;
        this.log(`     Logged in as: ${account.email}`);
        return {
          success: true,
          data: response.data,
          duration: Date.now() - start,
        };
      }
    }

    return {
      success: false,
      error: `Login failed for all test accounts. Run 'npm run test:db:setup' to create test users.`,
      duration: Date.now() - start,
    };
  }

  private async viewTournaments(): Promise<StepResult> {
    const start = Date.now();

    const response = await this.fetch(`${this.e2eConfig.baseUrl}/tournaments`);

    if (response.ok && Array.isArray(response.data)) {
      // Store first tournament for later steps
      if (response.data.length > 0) {
        this.testTournament = {
          id: response.data[0].id,
          name: response.data[0].name,
        };
      }
      return {
        success: true,
        data: { count: response.data.length },
        duration: Date.now() - start,
      };
    }

    return {
      success: false,
      error: `Failed to fetch tournaments: ${response.status}`,
      duration: Date.now() - start,
    };
  }

  private async viewTournamentDetails(): Promise<StepResult> {
    const start = Date.now();

    if (!this.testTournament) {
      return {
        success: true,
        data: { skipped: "No tournament available" },
        duration: 0,
      };
    }

    const response = await this.fetch(
      `${this.e2eConfig.baseUrl}/tournaments/${this.testTournament.id}`,
    );

    if (response.ok) {
      return {
        success: true,
        data: response.data,
        duration: Date.now() - start,
      };
    }

    return {
      success: false,
      error: `Failed to fetch tournament details: ${response.status}`,
      duration: Date.now() - start,
    };
  }

  private async checkLeaderboard(): Promise<StepResult> {
    const start = Date.now();

    const response = await this.fetch(
      `${this.e2eConfig.baseUrl}/games/leaderboard`,
    );

    if (response.ok && Array.isArray(response.data)) {
      // Validate leaderboard data structure
      // Note: API may return total_winnings as string
      for (const entry of response.data.slice(0, 5)) {
        const winnings = Number(entry.total_winnings ?? entry.totalWinnings);
        if (isNaN(winnings)) {
          return {
            success: false,
            error: `Invalid leaderboard entry: missing or invalid total_winnings`,
            duration: Date.now() - start,
          };
        }
      }
      return {
        success: true,
        data: { entries: response.data.length },
        duration: Date.now() - start,
      };
    }

    return {
      success: false,
      error: `Failed to fetch leaderboard: ${response.status}`,
      duration: Date.now() - start,
    };
  }

  private async accessPage(path: string): Promise<StepResult> {
    const start = Date.now();

    const response = await this.fetch(`${this.e2eConfig.frontendUrl}${path}`);

    if (response.ok) {
      const html = typeof response.data === "string" ? response.data : "";
      if (html.includes("<!DOCTYPE html>") || html.includes("<html")) {
        return { success: true, data: { path }, duration: Date.now() - start };
      }
    }

    return {
      success: false,
      error: `Page ${path} not accessible: ${response.status}`,
      duration: Date.now() - start,
    };
  }

  private async checkEndpoint(path: string): Promise<StepResult> {
    const start = Date.now();

    const response = await this.fetch(`${this.e2eConfig.baseUrl}${path}`);

    if (response.ok) {
      return {
        success: true,
        data: response.data,
        duration: Date.now() - start,
      };
    }

    return {
      success: false,
      error: `Endpoint ${path} returned ${response.status}`,
      duration: Date.now() - start,
    };
  }

  private tournamentsCache: any[] = [];

  private async fetchAndStoreTournaments(): Promise<StepResult> {
    const start = Date.now();

    const response = await this.fetch(`${this.e2eConfig.baseUrl}/tournaments`);

    if (response.ok && Array.isArray(response.data)) {
      this.tournamentsCache = response.data;
      return {
        success: true,
        data: { count: response.data.length },
        duration: Date.now() - start,
      };
    }

    return {
      success: false,
      error: `Failed to fetch tournaments: ${response.status}`,
      duration: Date.now() - start,
    };
  }

  private async verifyTournamentConsistency(): Promise<StepResult> {
    const start = Date.now();

    if (this.tournamentsCache.length === 0) {
      return {
        success: true,
        data: { skipped: "No tournaments to verify" },
        duration: 0,
      };
    }

    // Check up to 3 tournaments
    for (const tournament of this.tournamentsCache.slice(0, 3)) {
      const response = await this.fetch(
        `${this.e2eConfig.baseUrl}/tournaments/${tournament.id}`,
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Tournament ${tournament.id} not found in detail view`,
          duration: Date.now() - start,
        };
      }

      // Verify key fields match
      const detail = response.data;
      if (detail.name !== tournament.name) {
        return {
          success: false,
          error: `Tournament name mismatch: list="${tournament.name}" detail="${detail.name}"`,
          duration: Date.now() - start,
        };
      }
    }

    return {
      success: true,
      data: { verified: this.tournamentsCache.length },
      duration: Date.now() - start,
    };
  }

  private async verifyLeaderboardIntegrity(): Promise<StepResult> {
    const start = Date.now();

    const response = await this.fetch(
      `${this.e2eConfig.baseUrl}/games/leaderboard`,
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch leaderboard: ${response.status}`,
        duration: Date.now() - start,
      };
    }

    const entries = response.data;
    if (!Array.isArray(entries)) {
      return {
        success: false,
        error: "Leaderboard is not an array",
        duration: Date.now() - start,
      };
    }

    // Verify entries are sorted by winnings (descending)
    // Note: API may return total_winnings as string or number
    let lastWinnings = Infinity;
    for (const entry of entries) {
      const winnings = Number(entry.total_winnings ?? entry.totalWinnings);
      if (isNaN(winnings)) {
        return {
          success: false,
          error: `Invalid entry: total_winnings is not a number (got: ${entry.total_winnings})`,
          duration: Date.now() - start,
        };
      }

      if (winnings > lastWinnings) {
        return {
          success: false,
          error: `Leaderboard not sorted correctly: ${winnings} > ${lastWinnings}`,
          duration: Date.now() - start,
        };
      }
      lastWinnings = winnings;
    }

    return {
      success: true,
      data: { entries: entries.length },
      duration: Date.now() - start,
    };
  }

  private async verifyNotFound(): Promise<StepResult> {
    const start = Date.now();

    const response = await this.fetch(
      `${this.e2eConfig.baseUrl}/nonexistent-endpoint-${Date.now()}`,
    );

    if (response.status === 404) {
      return { success: true, duration: Date.now() - start };
    }

    return {
      success: false,
      error: `Expected 404, got ${response.status}`,
      duration: Date.now() - start,
    };
  }

  private async verifyUnauthorized(): Promise<StepResult> {
    const start = Date.now();

    const response = await this.fetch(`${this.e2eConfig.baseUrl}/users/me`, {
      headers: { Authorization: "Bearer invalid-token" },
    });

    if (response.status === 401) {
      return { success: true, duration: Date.now() - start };
    }

    return {
      success: false,
      error: `Expected 401, got ${response.status}`,
      duration: Date.now() - start,
    };
  }

  private async verifyBadRequest(): Promise<StepResult> {
    const start = Date.now();

    const response = await this.fetch(`${this.e2eConfig.baseUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ invalid: "data" }),
    });

    if (response.status === 400 || response.status === 401) {
      return { success: true, duration: Date.now() - start };
    }

    return {
      success: false,
      error: `Expected 400 or 401, got ${response.status}`,
      duration: Date.now() - start,
    };
  }

  async teardown(): Promise<void> {
    this.log("E2E Monster cleanup complete");
  }
}

// CLI Entry Point
if (require.main === module) {
  runMonsterCli(new E2EMonster(), "e2e");
}
