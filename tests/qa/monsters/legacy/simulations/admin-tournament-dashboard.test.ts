/**
 * QA Monster Test: Admin Tournament Dashboard
 * ============================================
 *
 * Comprehensive tests for the admin tournament management UI.
 * Covers creation, lifecycle, scheduling, and edge cases.
 */

import * as http from "http";

interface Finding {
  id: string;
  category: "BUG" | "ISSUE" | "CONCERN" | "OPINION";
  severity: "critical" | "high" | "medium" | "low" | "note";
  page: string;
  title: string;
  description: string;
  expected?: string;
  actual?: string;
  suggestion?: string;
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  findings: Finding[];
}

interface ApiResponse<T = unknown> {
  status: number;
  data?: T;
  error?: string;
}

let findingCounter = 0;
function generateFindingId(category: string): string {
  findingCounter++;
  const prefix =
    { BUG: "BUG", ISSUE: "ISS", CONCERN: "CON", OPINION: "OPN" }[category] ||
    "MON";
  return `ADMIN-${prefix}-${String(findingCounter).padStart(3, "0")}`;
}

async function httpRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<ApiResponse<T>> {
  return new Promise((resolve) => {
    const url = new URL(path, "http://localhost:3000");
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

    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, error: "Request timeout" });
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Test Suite: API Endpoint Tests
 */
async function testApiEndpoints(adminToken: string): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test: Get tournaments list
  {
    const findings: Finding[] = [];
    const res = await httpRequest("GET", "/api/v1/tournaments");

    if (res.status !== 200) {
      findings.push({
        id: generateFindingId("BUG"),
        category: "BUG",
        severity: "critical",
        page: "/admin/tournaments",
        title: "Tournaments list endpoint failed",
        description: `GET /api/v1/tournaments returned ${res.status}`,
        expected: "200 OK",
        actual: `${res.status} ${res.error || ""}`,
      });
    }

    results.push({
      name: "GET /api/v1/tournaments",
      passed: res.status === 200,
      findings,
    });
  }

  // Test: Create tournament validation
  {
    const findings: Finding[] = [];

    // Empty name should fail
    const emptyName = await httpRequest(
      "POST",
      "/api/v1/tournaments",
      {
        name: "",
        type: "rolling",
        buy_in: 100,
        starting_chips: 5000,
        min_players: 2,
        max_players: 50,
      },
      adminToken,
    );

    if (emptyName.status === 201) {
      findings.push({
        id: generateFindingId("BUG"),
        category: "BUG",
        severity: "high",
        page: "/admin/tournaments",
        title: "Empty tournament name accepted",
        description: "Server accepted tournament creation with empty name",
        expected: "400 Bad Request",
        actual: "201 Created",
        suggestion: "Add validation for required name field",
      });
    }

    // Negative buy-in should fail
    const negativeBuyIn = await httpRequest(
      "POST",
      "/api/v1/tournaments",
      {
        name: "Test",
        type: "rolling",
        buy_in: -100,
        starting_chips: 5000,
        min_players: 2,
        max_players: 50,
      },
      adminToken,
    );

    if (negativeBuyIn.status === 201) {
      findings.push({
        id: generateFindingId("BUG"),
        category: "BUG",
        severity: "high",
        page: "/admin/tournaments",
        title: "Negative buy-in accepted",
        description: "Server accepted tournament with negative buy-in",
        expected: "400 Bad Request",
        actual: "201 Created",
      });
    }

    // Min > Max should fail
    const minMaxInvalid = await httpRequest(
      "POST",
      "/api/v1/tournaments",
      {
        name: "Test",
        type: "rolling",
        buy_in: 100,
        starting_chips: 5000,
        min_players: 100,
        max_players: 10,
      },
      adminToken,
    );

    if (minMaxInvalid.status === 201) {
      findings.push({
        id: generateFindingId("BUG"),
        category: "BUG",
        severity: "medium",
        page: "/admin/tournaments",
        title: "Min players > max players accepted",
        description:
          "Server accepted tournament where min_players exceeds max_players",
        expected: "400 Bad Request",
        actual: "201 Created",
      });
    }

    results.push({
      name: "Tournament creation validation",
      passed: findings.length === 0,
      findings,
    });
  }

  // Test: Admin-only endpoints
  {
    const findings: Finding[] = [];

    // Scheduler status without auth
    const noAuth = await httpRequest(
      "GET",
      "/api/v1/tournaments/admin/scheduler",
    );
    if (noAuth.status !== 401) {
      findings.push({
        id: generateFindingId("BUG"),
        category: "BUG",
        severity: "critical",
        page: "/admin/tournaments",
        title: "Admin endpoint accessible without auth",
        description:
          "Scheduler status endpoint accessible without authentication",
        expected: "401 Unauthorized",
        actual: `${noAuth.status}`,
      });
    }

    results.push({
      name: "Admin endpoint protection",
      passed: findings.length === 0,
      findings,
    });
  }

  // Test: Schedule update
  {
    const findings: Finding[] = [];

    // Create a scheduled tournament first
    const create = await httpRequest<{ id: string }>(
      "POST",
      "/api/v1/tournaments",
      {
        name: `QA Test ${Date.now()}`,
        type: "scheduled",
        buy_in: 100,
        starting_chips: 5000,
        min_players: 2,
        max_players: 50,
        scheduled_start_at: new Date(Date.now() + 3600000).toISOString(),
      },
      adminToken,
    );

    if (create.status === 201 && create.data?.id) {
      const tournamentId = create.data.id;

      // Update to past time
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const updatePast = await httpRequest(
        "PATCH",
        `/api/v1/tournaments/${tournamentId}/schedule`,
        { scheduled_start_at: pastTime },
        adminToken,
      );

      if (updatePast.status === 200) {
        findings.push({
          id: generateFindingId("CONCERN"),
          category: "CONCERN",
          severity: "medium",
          page: "/admin/tournaments",
          title: "Past schedule time accepted",
          description: "Server allowed setting schedule to a time in the past",
          suggestion:
            "Consider validating that scheduled_start_at is in the future",
        });
      }

      // Clean up - cancel the test tournament
      await httpRequest(
        "POST",
        `/api/v1/tournaments/${tournamentId}/cancel`,
        undefined,
        adminToken,
      );
    }

    results.push({
      name: "Schedule update validation",
      passed: true, // This is informational
      findings,
    });
  }

  // Test: Scheduler cron validation
  {
    const findings: Finding[] = [];

    const invalidCron = await httpRequest(
      "PATCH",
      "/api/v1/tournaments/admin/scheduler",
      { cron_expression: "not a valid cron" },
      adminToken,
    );

    if (invalidCron.status === 200) {
      findings.push({
        id: generateFindingId("BUG"),
        category: "BUG",
        severity: "high",
        page: "/admin/tournaments",
        title: "Invalid cron expression accepted",
        description:
          "Server accepted invalid cron expression without validation",
        expected: "400 Bad Request",
        actual: "200 OK",
      });
    }

    results.push({
      name: "Scheduler cron validation",
      passed: findings.length === 0,
      findings,
    });
  }

  return results;
}

/**
 * Test Suite: UI/UX Concerns
 *
 * NOTE: Most UX improvements have been implemented:
 * - [DONE] Progressive disclosure for create form (Advanced Options collapsible)
 * - [DONE] Confirmation dialog for cancel tournament
 * - [DONE] Real-time WebSocket updates for tournament list
 * - [DONE] Cron expression presets (every 30s, 1m, 5m, 15m, 1h)
 * - [DONE] Mobile responsive design (responsive grid, collapsible sections)
 */
function generateUxFindings(): Finding[] {
  const findings: Finding[] = [];

  // UX Opinion: Bulk actions - still not implemented (lower priority)
  findings.push({
    id: generateFindingId("OPINION"),
    category: "OPINION",
    severity: "low",
    page: "/admin/tournaments",
    title: "No bulk actions available",
    description:
      "Admin might want to cancel multiple tournaments at once or update schedules in bulk.",
    suggestion: "Add checkbox selection and bulk action dropdown",
  });

  return findings;
}

/**
 * Test Suite: Accessibility
 *
 * NOTE: A11y improvements that have been implemented:
 * - [DONE] react-datepicker library with proper ARIA labels
 * - [DONE] aria-live regions for form errors with assertive announcements
 * - [DONE] Proper focus management on form errors
 * - [DONE] aria-expanded on collapsible Advanced Options section
 * - [DONE] Status pill contrast using standard Tailwind colors
 * - [DONE] Screen reader only status announcements
 */
function generateA11yFindings(): Finding[] {
  const findings: Finding[] = [];

  // Remaining low-priority accessibility suggestion
  findings.push({
    id: generateFindingId("OPINION"),
    category: "OPINION",
    severity: "low",
    page: "/admin/tournaments",
    title: "Consider visual contrast audit",
    description:
      "Run automated contrast checker (axe, WAVE) to verify WCAG AA compliance.",
    suggestion: "Schedule periodic accessibility audits",
  });

  return findings;
}

/**
 * Run all QA Monster tests
 */
async function runQaMonsterTests(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  QA MONSTER: Admin Tournament Dashboard Tests              ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");

  // Authenticate
  console.log("Authenticating as admin...");
  const loginRes = await httpRequest<{ accessToken: string }>(
    "POST",
    "/api/v1/auth/login",
    { email: "admin@poker.io", password: "admin123" },
  );

  if (loginRes.status !== 200 || !loginRes.data?.accessToken) {
    console.log("❌ Admin authentication failed. Some tests will be skipped.");
    console.log(
      `   Status: ${loginRes.status}, Error: ${loginRes.error || "No token"}`,
    );
  }

  const adminToken = loginRes.data?.accessToken || "";

  // Run API tests
  console.log("\n━━━ API Endpoint Tests ━━━");
  const apiResults = await testApiEndpoints(adminToken);

  for (const result of apiResults) {
    const icon = result.passed ? "✓" : "✗";
    console.log(`${icon} ${result.name}`);
    for (const finding of result.findings) {
      console.log(`  └─ [${finding.severity.toUpperCase()}] ${finding.title}`);
    }
  }

  // UX findings
  console.log("\n━━━ UX/Design Concerns ━━━");
  const uxFindings = generateUxFindings();
  for (const finding of uxFindings) {
    console.log(`[${finding.category}] ${finding.title}`);
    console.log(`  └─ ${finding.description}`);
  }

  // A11y findings
  console.log("\n━━━ Accessibility Concerns ━━━");
  const a11yFindings = generateA11yFindings();
  for (const finding of a11yFindings) {
    console.log(`[${finding.severity.toUpperCase()}] ${finding.title}`);
    console.log(`  └─ ${finding.description}`);
  }

  // Summary
  const allFindings = [
    ...apiResults.flatMap((r) => r.findings),
    ...uxFindings,
    ...a11yFindings,
  ];

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("────────────────────────────────────────────────────────────");
  console.log(`Total findings: ${allFindings.length}`);
  console.log(
    `  CRITICAL: ${allFindings.filter((f) => f.severity === "critical").length}`,
  );
  console.log(
    `  HIGH:     ${allFindings.filter((f) => f.severity === "high").length}`,
  );
  console.log(
    `  MEDIUM:   ${allFindings.filter((f) => f.severity === "medium").length}`,
  );
  console.log(
    `  LOW:      ${allFindings.filter((f) => f.severity === "low").length}`,
  );
  console.log(
    `  NOTE:     ${allFindings.filter((f) => f.severity === "note").length}`,
  );
  console.log("");
  console.log("Categories:");
  console.log(
    `  BUG:     ${allFindings.filter((f) => f.category === "BUG").length}`,
  );
  console.log(
    `  ISSUE:   ${allFindings.filter((f) => f.category === "ISSUE").length}`,
  );
  console.log(
    `  CONCERN: ${allFindings.filter((f) => f.category === "CONCERN").length}`,
  );
  console.log(
    `  OPINION: ${allFindings.filter((f) => f.category === "OPINION").length}`,
  );
  console.log("════════════════════════════════════════════════════════════");

  // Exit code based on critical/high bugs
  const criticalBugs = allFindings.filter(
    (f) =>
      f.category === "BUG" &&
      (f.severity === "critical" || f.severity === "high"),
  );

  if (criticalBugs.length > 0) {
    console.log("\n🚨 CRITICAL/HIGH BUGS FOUND - FAILING");
    process.exit(1);
  } else {
    console.log("\n✅ No critical bugs found");
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  runQaMonsterTests().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export {
  runQaMonsterTests,
  testApiEndpoints,
  generateUxFindings,
  generateA11yFindings,
};
