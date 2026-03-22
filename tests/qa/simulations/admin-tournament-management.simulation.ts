/**
 * Admin Tournament Management Simulation
 * ======================================
 *
 * Tests the admin tournament dashboard functionality:
 * - Tournament creation (rolling & scheduled)
 * - Tournament lifecycle management (start, cancel)
 * - Schedule updates
 * - Scheduler configuration
 * - API endpoint validation
 */

import * as http from "http";

interface SimulationResult {
  success: boolean;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  errors: string[];
  findings: Finding[];
  duration: number;
}

interface Finding {
  severity: "critical" | "high" | "medium" | "low";
  category: "bug" | "api" | "validation" | "security";
  title: string;
  description: string;
}

interface ApiResponse<T = unknown> {
  status: number;
  data?: T;
  error?: string;
}

class AdminTournamentSimulation {
  private baseUrl: string;
  private adminToken: string | null = null;
  private userToken: string | null = null;
  private findings: Finding[] = [];
  private errors: string[] = [];
  private testsRun = 0;
  private testsPassed = 0;

  constructor(baseUrl = "http://localhost:3000") {
    this.baseUrl = baseUrl;
  }

  // Log messages only include status codes and test names, not response bodies
  // lgtm[js/clear-text-logging]
  private log(message: string): void {
    console.log(`[AdminTournamentSim] ${message}`);
  }

  private async httpRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<ApiResponse<T>> {
    return new Promise((resolve) => {
      const url = new URL(path, this.baseUrl);
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 3000,
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 10000,
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode || 500, data: parsed as T });
          } catch {
            resolve({ status: res.statusCode || 500, error: data });
          }
        });
      });

      req.on("error", (e) => {
        resolve({ status: 0, error: e.message });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({ status: 0, error: "Request timeout" });
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  private addFinding(finding: Finding): void {
    this.findings.push(finding);
    this.log(`[${finding.severity.toUpperCase()}] ${finding.title}`);
  }

  private assert(
    condition: boolean,
    testName: string,
    failureMessage?: string,
  ): boolean {
    this.testsRun++;
    if (condition) {
      this.testsPassed++;
      this.log(`✓ ${testName}`);
      return true;
    } else {
      this.errors.push(failureMessage || `Failed: ${testName}`);
      this.log(`✗ ${testName}: ${failureMessage || "Assertion failed"}`);
      return false;
    }
  }

  /**
   * Phase 1: Authentication setup
   */
  private async setupAuth(): Promise<boolean> {
    this.log("=== Phase 1: Authentication Setup ===");

    // Try to login as admin
    const adminLogin = await this.httpRequest<{ accessToken: string }>(
      "POST",
      "/api/v1/auth/login",
      { email: "admin@poker.io", password: "admin123" },
    );

    if (adminLogin.status === 200 && adminLogin.data?.accessToken) {
      this.adminToken = adminLogin.data.accessToken;
      this.log("Admin login successful");
    } else {
      this.addFinding({
        severity: "high",
        category: "api",
        title: "Admin login failed",
        description: `Could not login as admin: ${adminLogin.error || adminLogin.status}`,
      });
      return false;
    }

    // Try to login as regular user
    const userLogin = await this.httpRequest<{ accessToken: string }>(
      "POST",
      "/api/v1/auth/login",
      { email: "test@example.com", password: "test123" },
    );

    if (userLogin.status === 200 && userLogin.data?.accessToken) {
      this.userToken = userLogin.data.accessToken;
      this.log("User login successful");
    } else {
      this.log("No test user available (expected in fresh DB)");
    }

    return true;
  }

  /**
   * Phase 2: Test tournament creation
   */
  private async testTournamentCreation(): Promise<void> {
    this.log("\n=== Phase 2: Tournament Creation ===");

    // Test 1: Create rolling tournament
    const rollingTournament = {
      name: `Rolling Test ${Date.now()}`,
      type: "rolling",
      buy_in: 100,
      starting_chips: 5000,
      min_players: 2,
      max_players: 50,
      players_per_table: 9,
      turn_timeout_ms: 10000,
      late_reg_ends_level: 4,
      rebuys_allowed: true,
    };

    const createRolling = await this.httpRequest<{ id: string }>(
      "POST",
      "/api/v1/tournaments",
      rollingTournament,
      this.adminToken!,
    );

    this.assert(
      createRolling.status === 201,
      "Create rolling tournament",
      `Expected 201, got ${createRolling.status}`,
    );

    if (createRolling.data?.id) {
      this.log(`Created rolling tournament: ${createRolling.data.id}`);
    }

    // Test 2: Create scheduled tournament
    const futureTime = new Date(Date.now() + 3600000).toISOString();
    const scheduledTournament = {
      name: `Scheduled Test ${Date.now()}`,
      type: "scheduled",
      buy_in: 200,
      starting_chips: 10000,
      min_players: 4,
      max_players: 100,
      players_per_table: 9,
      scheduled_start_at: futureTime,
    };

    const createScheduled = await this.httpRequest<{ id: string }>(
      "POST",
      "/api/v1/tournaments",
      scheduledTournament,
      this.adminToken!,
    );

    this.assert(
      createScheduled.status === 201,
      "Create scheduled tournament",
      `Expected 201, got ${createScheduled.status}`,
    );

    // Test 3: Create tournament without auth (should fail)
    const createNoAuth = await this.httpRequest(
      "POST",
      "/api/v1/tournaments",
      rollingTournament,
    );

    this.assert(
      createNoAuth.status === 401,
      "Tournament creation requires auth",
      `Expected 401, got ${createNoAuth.status}`,
    );

    // Test 4: Create tournament as non-admin (should fail or succeed based on permissions)
    if (this.userToken) {
      const createAsUser = await this.httpRequest(
        "POST",
        "/api/v1/tournaments",
        rollingTournament,
        this.userToken,
      );

      // This might be 201 or 403 depending on your permission model
      this.log(
        `Create as user returned: ${createAsUser.status} (may be allowed)`,
      );
    }

    // Test 5: Create with invalid data
    const invalidTournament = {
      name: "", // Empty name
      type: "invalid_type",
      buy_in: -100, // Negative buy-in
    };

    const createInvalid = await this.httpRequest(
      "POST",
      "/api/v1/tournaments",
      invalidTournament,
      this.adminToken!,
    );

    this.assert(
      createInvalid.status === 400,
      "Invalid tournament data rejected",
      `Expected 400, got ${createInvalid.status}`,
    );

    if (createInvalid.status !== 400) {
      this.addFinding({
        severity: "high",
        category: "validation",
        title: "Invalid tournament data not rejected",
        description:
          "Server accepted tournament with empty name, invalid type, or negative buy-in",
      });
    }

    // Test 6: Create with very long name (boundary test)
    const longNameTournament = {
      ...rollingTournament,
      name: "A".repeat(500),
    };

    const createLongName = await this.httpRequest(
      "POST",
      "/api/v1/tournaments",
      longNameTournament,
      this.adminToken!,
    );

    if (createLongName.status === 201) {
      this.addFinding({
        severity: "medium",
        category: "validation",
        title: "Very long tournament name accepted",
        description:
          "500+ character tournament name was accepted without truncation",
      });
    }
  }

  /**
   * Phase 3: Test tournament lifecycle
   */
  private async testTournamentLifecycle(): Promise<void> {
    this.log("\n=== Phase 3: Tournament Lifecycle ===");

    // Create a tournament for lifecycle tests
    const tournament = {
      name: `Lifecycle Test ${Date.now()}`,
      type: "rolling",
      buy_in: 50,
      starting_chips: 3000,
      min_players: 2,
      max_players: 20,
    };

    const create = await this.httpRequest<{ id: string }>(
      "POST",
      "/api/v1/tournaments",
      tournament,
      this.adminToken!,
    );

    if (create.status !== 201 || !create.data?.id) {
      this.errors.push("Could not create tournament for lifecycle tests");
      return;
    }

    const tournamentId = create.data.id;
    this.log(`Created tournament for lifecycle tests: ${tournamentId}`);

    // Test 1: Get tournament details
    const getDetails = await this.httpRequest<{ id: string; status: string }>(
      "GET",
      `/api/v1/tournaments/${tournamentId}`,
    );

    this.assert(
      getDetails.status === 200,
      "Get tournament details",
      `Expected 200, got ${getDetails.status}`,
    );

    this.assert(
      getDetails.data?.status === "registering",
      "New tournament status is registering",
      `Expected 'registering', got '${getDetails.data?.status}'`,
    );

    // Test 2: Try to start without enough players (should fail)
    const startNoPlayers = await this.httpRequest(
      "POST",
      `/api/v1/tournaments/${tournamentId}/start`,
      undefined,
      this.adminToken!,
    );

    this.assert(
      startNoPlayers.status === 400,
      "Cannot start tournament without min players",
      `Expected 400, got ${startNoPlayers.status}`,
    );

    // Test 3: Cancel tournament
    const cancel = await this.httpRequest(
      "POST",
      `/api/v1/tournaments/${tournamentId}/cancel`,
      undefined,
      this.adminToken!,
    );

    this.assert(
      cancel.status === 200 || cancel.status === 201,
      "Cancel tournament",
      `Expected 200/201, got ${cancel.status}`,
    );

    // Test 4: Verify cancelled status
    const getAfterCancel = await this.httpRequest<{ status: string }>(
      "GET",
      `/api/v1/tournaments/${tournamentId}`,
    );

    this.assert(
      getAfterCancel.data?.status === "cancelled",
      "Tournament status is cancelled",
      `Expected 'cancelled', got '${getAfterCancel.data?.status}'`,
    );

    // Test 5: Try to start cancelled tournament (should fail)
    const startCancelled = await this.httpRequest(
      "POST",
      `/api/v1/tournaments/${tournamentId}/start`,
      undefined,
      this.adminToken!,
    );

    this.assert(
      startCancelled.status === 400,
      "Cannot start cancelled tournament",
      `Expected 400, got ${startCancelled.status}`,
    );
  }

  /**
   * Phase 4: Test schedule management
   */
  private async testScheduleManagement(): Promise<void> {
    this.log("\n=== Phase 4: Schedule Management ===");

    // Create a scheduled tournament
    const futureTime = new Date(Date.now() + 7200000).toISOString();
    const tournament = {
      name: `Schedule Test ${Date.now()}`,
      type: "scheduled",
      buy_in: 100,
      starting_chips: 5000,
      min_players: 2,
      max_players: 50,
      scheduled_start_at: futureTime,
    };

    const create = await this.httpRequest<{ id: string }>(
      "POST",
      "/api/v1/tournaments",
      tournament,
      this.adminToken!,
    );

    if (create.status !== 201 || !create.data?.id) {
      this.errors.push("Could not create scheduled tournament for tests");
      return;
    }

    const tournamentId = create.data.id;

    // Test 1: Update schedule to new time
    const newTime = new Date(Date.now() + 86400000).toISOString();
    const updateSchedule = await this.httpRequest(
      "PATCH",
      `/api/v1/tournaments/${tournamentId}/schedule`,
      { scheduled_start_at: newTime },
      this.adminToken!,
    );

    this.assert(
      updateSchedule.status === 200,
      "Update tournament schedule",
      `Expected 200, got ${updateSchedule.status}`,
    );

    // Test 2: Update schedule without auth (should fail)
    const updateNoAuth = await this.httpRequest(
      "PATCH",
      `/api/v1/tournaments/${tournamentId}/schedule`,
      { scheduled_start_at: newTime },
    );

    this.assert(
      updateNoAuth.status === 401,
      "Schedule update requires auth",
      `Expected 401, got ${updateNoAuth.status}`,
    );

    // Test 3: Update schedule as non-admin (should fail)
    if (this.userToken) {
      const updateAsUser = await this.httpRequest(
        "PATCH",
        `/api/v1/tournaments/${tournamentId}/schedule`,
        { scheduled_start_at: newTime },
        this.userToken,
      );

      this.assert(
        updateAsUser.status === 403,
        "Schedule update requires admin",
        `Expected 403, got ${updateAsUser.status}`,
      );
    }

    // Test 4: Update schedule to past time
    const pastTime = new Date(Date.now() - 3600000).toISOString();
    const updatePast = await this.httpRequest(
      "PATCH",
      `/api/v1/tournaments/${tournamentId}/schedule`,
      { scheduled_start_at: pastTime },
      this.adminToken!,
    );

    // Should either reject or accept (depends on implementation)
    this.log(`Update to past time returned: ${updatePast.status}`);
    if (updatePast.status === 200) {
      this.addFinding({
        severity: "medium",
        category: "validation",
        title: "Schedule accepts past time",
        description: "Tournament schedule can be set to a time in the past",
      });
    }

    // Test 5: Clear schedule (set to null)
    const clearSchedule = await this.httpRequest(
      "PATCH",
      `/api/v1/tournaments/${tournamentId}/schedule`,
      { scheduled_start_at: null },
      this.adminToken!,
    );

    this.assert(
      clearSchedule.status === 200,
      "Clear tournament schedule",
      `Expected 200, got ${clearSchedule.status}`,
    );
  }

  /**
   * Phase 5: Test scheduler configuration
   */
  private async testSchedulerConfig(): Promise<void> {
    this.log("\n=== Phase 5: Scheduler Configuration ===");

    // Test 1: Get scheduler status
    const getStatus = await this.httpRequest<{
      enabled: boolean;
      cronExpression: string;
    }>(
      "GET",
      "/api/v1/tournaments/admin/scheduler",
      undefined,
      this.adminToken!,
    );

    this.assert(
      getStatus.status === 200,
      "Get scheduler status",
      `Expected 200, got ${getStatus.status}`,
    );

    if (getStatus.data) {
      this.log(`Scheduler enabled: ${getStatus.data.enabled}`);
      this.log(`Cron expression: ${getStatus.data.cronExpression}`);
    }

    // Test 2: Get status without auth (should fail)
    const getNoAuth = await this.httpRequest(
      "GET",
      "/api/v1/tournaments/admin/scheduler",
    );

    this.assert(
      getNoAuth.status === 401,
      "Scheduler status requires auth",
      `Expected 401, got ${getNoAuth.status}`,
    );

    // Test 3: Get status as non-admin (should fail)
    if (this.userToken) {
      const getAsUser = await this.httpRequest(
        "GET",
        "/api/v1/tournaments/admin/scheduler",
        undefined,
        this.userToken,
      );

      this.assert(
        getAsUser.status === 403,
        "Scheduler status requires admin",
        `Expected 403, got ${getAsUser.status}`,
      );
    }

    // Test 4: Update cron expression
    const updateCron = await this.httpRequest(
      "PATCH",
      "/api/v1/tournaments/admin/scheduler",
      { cron_expression: "0 */5 * * * *" }, // Every 5 minutes
      this.adminToken!,
    );

    this.assert(
      updateCron.status === 200,
      "Update scheduler cron expression",
      `Expected 200, got ${updateCron.status}`,
    );

    // Test 5: Invalid cron expression
    const invalidCron = await this.httpRequest(
      "PATCH",
      "/api/v1/tournaments/admin/scheduler",
      { cron_expression: "invalid cron" },
      this.adminToken!,
    );

    this.assert(
      invalidCron.status === 400,
      "Invalid cron expression rejected",
      `Expected 400, got ${invalidCron.status}`,
    );

    if (invalidCron.status !== 400) {
      this.addFinding({
        severity: "high",
        category: "validation",
        title: "Invalid cron expression accepted",
        description:
          "Server accepted invalid cron expression without validation",
      });
    }

    // Restore original cron
    await this.httpRequest(
      "PATCH",
      "/api/v1/tournaments/admin/scheduler",
      { cron_expression: "*/30 * * * * *" },
      this.adminToken!,
    );
  }

  /**
   * Phase 6: Test public endpoints
   */
  private async testPublicEndpoints(): Promise<void> {
    this.log("\n=== Phase 6: Public Endpoints ===");

    // Test 1: Get all tournaments (public)
    const getAllTournaments = await this.httpRequest<unknown[]>(
      "GET",
      "/api/v1/tournaments",
    );

    this.assert(
      getAllTournaments.status === 200,
      "Get all tournaments is public",
      `Expected 200, got ${getAllTournaments.status}`,
    );

    // Test 2: Get upcoming scheduled tournaments
    const getUpcoming = await this.httpRequest<unknown[]>(
      "GET",
      "/api/v1/tournaments/scheduled/upcoming",
    );

    this.assert(
      getUpcoming.status === 200,
      "Get upcoming scheduled is public",
      `Expected 200, got ${getUpcoming.status}`,
    );

    // Test 3: Filter tournaments by status
    const getRegistering = await this.httpRequest<unknown[]>(
      "GET",
      "/api/v1/tournaments?status=registering",
    );

    this.assert(
      getRegistering.status === 200,
      "Filter tournaments by status",
      `Expected 200, got ${getRegistering.status}`,
    );

    // Test 4: Invalid status filter
    const getInvalidStatus = await this.httpRequest(
      "GET",
      "/api/v1/tournaments?status=invalid_status",
    );

    // Should either return empty or 400
    this.log(`Invalid status filter returned: ${getInvalidStatus.status}`);
  }

  /**
   * Phase 7: Security tests
   */
  private async testSecurity(): Promise<void> {
    this.log("\n=== Phase 7: Security Tests ===");

    // Test 1: SQL injection in tournament name
    const sqlInjection = {
      name: "'; DROP TABLE tournaments; --",
      type: "rolling",
      buy_in: 100,
      starting_chips: 5000,
      min_players: 2,
      max_players: 50,
    };

    const sqlResult = await this.httpRequest(
      "POST",
      "/api/v1/tournaments",
      sqlInjection,
      this.adminToken!,
    );

    // Should either sanitize or create safely
    this.log(`SQL injection test returned: ${sqlResult.status}`);

    // Verify tournaments table still exists
    const verifyTable = await this.httpRequest("GET", "/api/v1/tournaments");

    this.assert(
      verifyTable.status === 200,
      "Database intact after SQL injection attempt",
      "Tournaments endpoint failed after SQL test",
    );

    // Test 2: XSS in tournament name
    const xssPayload = {
      name: '<script>alert("xss")</script>',
      type: "rolling",
      buy_in: 100,
      starting_chips: 5000,
      min_players: 2,
      max_players: 50,
    };

    const xssResult = await this.httpRequest<{ name?: string }>(
      "POST",
      "/api/v1/tournaments",
      xssPayload,
      this.adminToken!,
    );

    if (
      xssResult.status === 201 &&
      xssResult.data?.name?.includes("<script>")
    ) {
      this.addFinding({
        severity: "high",
        category: "security",
        title: "XSS payload stored unsanitized",
        description:
          "Tournament name with script tags was stored without sanitization",
      });
    }

    // Test 3: Extremely large buy-in (overflow test)
    const overflowPayload = {
      name: "Overflow Test",
      type: "rolling",
      buy_in: Number.MAX_SAFE_INTEGER + 1,
      starting_chips: 5000,
      min_players: 2,
      max_players: 50,
    };

    const overflowResult = await this.httpRequest(
      "POST",
      "/api/v1/tournaments",
      overflowPayload,
      this.adminToken!,
    );

    if (overflowResult.status === 201) {
      this.addFinding({
        severity: "medium",
        category: "validation",
        title: "Extremely large buy-in accepted",
        description: "Buy-in value larger than MAX_SAFE_INTEGER was accepted",
      });
    }
  }

  /**
   * Run the complete simulation
   */
  async run(): Promise<SimulationResult> {
    const startTime = Date.now();
    this.log("Starting Admin Tournament Management Simulation");
    this.log("=".repeat(50));

    try {
      // Setup
      const authSuccess = await this.setupAuth();
      if (!authSuccess) {
        return {
          success: false,
          testsRun: this.testsRun,
          testsPassed: this.testsPassed,
          testsFailed: this.testsRun - this.testsPassed,
          errors: ["Authentication setup failed"],
          findings: this.findings,
          duration: Date.now() - startTime,
        };
      }

      // Run all test phases
      await this.testTournamentCreation();
      await this.testTournamentLifecycle();
      await this.testScheduleManagement();
      await this.testSchedulerConfig();
      await this.testPublicEndpoints();
      await this.testSecurity();
    } catch (error) {
      this.errors.push(`Simulation error: ${error}`);
    }

    const duration = Date.now() - startTime;
    const testsFailed = this.testsRun - this.testsPassed;
    const success =
      testsFailed === 0 &&
      this.findings.filter((f) => f.severity === "critical").length === 0;

    this.log("\n" + "=".repeat(50));
    this.log("SIMULATION COMPLETE");
    this.log(`Duration: ${duration}ms`);
    this.log(`Tests: ${this.testsPassed}/${this.testsRun} passed`);
    this.log(`Findings: ${this.findings.length}`);
    this.log(
      `  Critical: ${this.findings.filter((f) => f.severity === "critical").length}`,
    );
    this.log(
      `  High: ${this.findings.filter((f) => f.severity === "high").length}`,
    );
    this.log(
      `  Medium: ${this.findings.filter((f) => f.severity === "medium").length}`,
    );
    this.log(
      `  Low: ${this.findings.filter((f) => f.severity === "low").length}`,
    );

    if (this.findings.length > 0) {
      this.log("\nFindings Summary:");
      for (const finding of this.findings) {
        this.log(`  [${finding.severity.toUpperCase()}] ${finding.title}`);
      }
    }

    return {
      success,
      testsRun: this.testsRun,
      testsPassed: this.testsPassed,
      testsFailed,
      errors: this.errors,
      findings: this.findings,
      duration,
    };
  }
}

// Run simulation if executed directly
if (require.main === module) {
  const simulation = new AdminTournamentSimulation();
  simulation
    .run()
    .then((result) => {
      console.log("\n" + JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { AdminTournamentSimulation };
