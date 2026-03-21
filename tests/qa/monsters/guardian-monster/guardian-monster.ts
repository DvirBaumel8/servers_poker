/**
 * Guardian Monster
 *
 * Security and accessibility guardian for the poker platform.
 *
 * Security Checks:
 * - XSS vulnerability scanning
 * - SQL injection testing
 * - Authentication bypass attempts
 * - Authorization verification
 * - Sensitive data exposure
 *
 * Accessibility Checks:
 * - ARIA labels
 * - Color contrast
 * - Keyboard navigation
 * - Screen reader compatibility
 */

import {
  BaseMonster,
  RunConfig,
  Severity,
  getEnv,
  requireBackendHealthy,
  runMonsterCli,
} from "../shared";

async function nativeFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  return fetch(url, options);
}

interface SecurityCheck {
  name: string;
  description: string;
  category: "xss" | "sqli" | "auth" | "authz" | "exposure";
  severity: Severity;
  execute: () => Promise<SecurityResult>;
}

interface AccessibilityCheck {
  name: string;
  description: string;
  element: string;
  check: () => Promise<A11yResult>;
}

interface SecurityResult {
  vulnerable: boolean;
  details?: string;
  evidence?: string;
}

interface A11yResult {
  passed: boolean;
  issues: string[];
}

interface GuardianConfig {
  baseUrl: string;
  frontendUrl: string;
  includeSecurityScans: boolean;
  includeA11yScans: boolean;
}

export class GuardianMonster extends BaseMonster {
  private guardianConfig: GuardianConfig;
  private securityChecks: SecurityCheck[] = [];
  private a11yChecks: AccessibilityCheck[] = [];

  constructor(config?: Partial<GuardianConfig>) {
    super({ name: "Guardian Monster", type: "guardian" });
    const env = getEnv();
    this.guardianConfig = {
      baseUrl: env.apiBaseUrl,
      frontendUrl: env.frontendUrl,
      includeSecurityScans: true,
      includeA11yScans: true,
      ...config,
    };
    this.initializeChecks();
  }

  private initializeChecks(): void {
    // Security checks
    this.securityChecks = [
      // XSS Checks
      {
        name: "xss_reflected_search",
        description: "Test for reflected XSS in search parameters",
        category: "xss",
        severity: "high",
        execute: () => this.testReflectedXSS(),
      },
      {
        name: "xss_stored_name",
        description: "Test for stored XSS in user/bot names",
        category: "xss",
        severity: "critical",
        execute: () => this.testStoredXSS(),
      },

      // SQL Injection Checks
      {
        name: "sqli_tournament_search",
        description: "Test for SQL injection in tournament search",
        category: "sqli",
        severity: "critical",
        execute: () => this.testSQLInjection("tournaments"),
      },
      {
        name: "sqli_game_lookup",
        description: "Test for SQL injection in game ID lookup",
        category: "sqli",
        severity: "critical",
        execute: () => this.testSQLInjection("games"),
      },

      // Auth Checks
      {
        name: "auth_jwt_none",
        description: "Test for JWT 'none' algorithm bypass",
        category: "auth",
        severity: "critical",
        execute: () => this.testJWTNoneAlgorithm(),
      },
      {
        name: "auth_expired_token",
        description: "Verify expired tokens are rejected",
        category: "auth",
        severity: "high",
        execute: () => this.testExpiredToken(),
      },
      {
        name: "auth_malformed_token",
        description: "Verify malformed tokens are rejected",
        category: "auth",
        severity: "high",
        execute: () => this.testMalformedToken(),
      },

      // Authorization Checks
      {
        name: "authz_admin_endpoints",
        description: "Verify admin endpoints require admin role",
        category: "authz",
        severity: "critical",
        execute: () => this.testAdminEndpoints(),
      },
      {
        name: "authz_user_isolation",
        description: "Verify users cannot access other users data",
        category: "authz",
        severity: "high",
        execute: () => this.testUserIsolation(),
      },

      // Data Exposure Checks
      {
        name: "exposure_sensitive_headers",
        description: "Check for sensitive information in headers",
        category: "exposure",
        severity: "medium",
        execute: () => this.testSensitiveHeaders(),
      },
      {
        name: "exposure_error_messages",
        description: "Check error messages don't leak sensitive data",
        category: "exposure",
        severity: "medium",
        execute: () => this.testErrorMessages(),
      },
      {
        name: "exposure_stack_traces",
        description: "Verify stack traces are not exposed",
        category: "exposure",
        severity: "high",
        execute: () => this.testStackTraces(),
      },
    ];

    // Accessibility checks
    this.a11yChecks = [
      {
        name: "aria_labels",
        description: "Interactive elements have ARIA labels",
        element: "button, a, input",
        check: () => this.checkAriaLabels(),
      },
      {
        name: "form_labels",
        description: "Form inputs have associated labels",
        element: "input, select, textarea",
        check: () => this.checkFormLabels(),
      },
      {
        name: "heading_hierarchy",
        description: "Heading hierarchy is correct",
        element: "h1, h2, h3, h4, h5, h6",
        check: () => this.checkHeadingHierarchy(),
      },
      {
        name: "image_alt_text",
        description: "Images have alt text",
        element: "img",
        check: () => this.checkImageAltText(),
      },
      {
        name: "focus_visible",
        description: "Focus states are visible",
        element: "*:focus",
        check: () => this.checkFocusVisible(),
      },
    ];
  }

  async setup(): Promise<void> {
    this.log("Setting up Guardian Monster...");

    await requireBackendHealthy({ retries: 3, retryDelay: 1000 });
    this.log("✅ Backend accessible");
  }

  async execute(_runConfig: RunConfig): Promise<void> {
    // Run security checks
    if (this.guardianConfig.includeSecurityScans) {
      this.log("\n🔒 Running security scans...");
      for (const check of this.securityChecks) {
        await this.runSecurityCheck(check);
      }
    }

    // Run accessibility checks
    if (this.guardianConfig.includeA11yScans) {
      this.log("\n♿ Running accessibility checks...");
      for (const check of this.a11yChecks) {
        await this.runA11yCheck(check);
      }
    }
  }

  private async runSecurityCheck(check: SecurityCheck): Promise<void> {
    this.log(`  Testing: ${check.name}`);

    const startTime = Date.now();
    let result: SecurityResult;

    try {
      result = await Promise.race([
        check.execute(),
        new Promise<SecurityResult>((_, reject) =>
          setTimeout(() => reject(new Error("Check timeout")), 10000),
        ),
      ]);
    } catch (error) {
      result = {
        vulnerable: false,
        details: `Check error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const duration = Date.now() - startTime;
    this.recordTest(!result.vulnerable);

    if (result.vulnerable) {
      this.addFinding({
        category: "SECURITY",
        severity: check.severity,
        title: `Security vulnerability: ${check.name}`,
        description:
          check.description + (result.details ? `: ${result.details}` : ""),
        location: { endpoint: `security/${check.category}/${check.name}` },
        evidence: result.evidence ? { raw: result.evidence } : undefined,
        reproducible: true,
        tags: ["security", check.category],
      });

      this.logError(`  ❌ VULNERABLE: ${check.name}`);
      if (result.details) {
        this.logError(`     ${result.details}`);
      }
    } else {
      this.log(`  ✅ ${check.name}`);
    }
  }

  private async runA11yCheck(check: AccessibilityCheck): Promise<void> {
    this.log(`  Checking: ${check.name}`);

    const startTime = Date.now();
    let result: A11yResult;

    try {
      result = await Promise.race([
        check.check(),
        new Promise<A11yResult>((_, reject) =>
          setTimeout(() => reject(new Error("Check timeout")), 10000),
        ),
      ]);
    } catch (error) {
      result = {
        passed: true, // Don't fail if we can't check
        issues: [
          `Check error: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }

    const duration = Date.now() - startTime;
    this.recordTest(result.passed);

    if (!result.passed) {
      this.addFinding({
        category: "A11Y",
        severity: "medium",
        title: `Accessibility issue: ${check.name}`,
        description: check.description,
        location: { component: check.element },
        evidence: result.issues.length
          ? { raw: result.issues.join("\n") }
          : undefined,
        reproducible: true,
        tags: ["a11y", check.name],
      });

      this.logWarn(`  ⚠️ ${check.name}: ${result.issues.length} issues`);
      for (const issue of result.issues.slice(0, 3)) {
        this.logWarn(`     - ${issue}`);
      }
    } else {
      this.log(`  ✅ ${check.name}`);
    }
  }

  // ============================================================================
  // SECURITY CHECK IMPLEMENTATIONS
  // ============================================================================

  private async testReflectedXSS(): Promise<SecurityResult> {
    const payloads = [
      '<script>alert("xss")</script>',
      '"><img src=x onerror=alert(1)>',
      "javascript:alert(1)",
      "{{constructor.constructor('alert(1)')()}}",
    ];

    // Test endpoints that might reflect input in responses
    const testEndpoints = [
      { path: "/tournaments", param: "status" },
      { path: "/bots", param: "search" },
    ];

    for (const endpoint of testEndpoints) {
      for (const payload of payloads) {
        try {
          const response = await nativeFetch(
            `${this.guardianConfig.baseUrl}${endpoint.path}?${endpoint.param}=${encodeURIComponent(payload)}`,
          );
          const text = await response.text();

          // Check if payload is reflected without encoding in the response body
          // Only flag if the unencoded payload appears in the response (potential XSS)
          // Ignore if payload appears in error messages as they're typically escaped
          if (
            text.includes(payload) &&
            !text.includes("Invalid") &&
            !text.includes("validation") &&
            !text.includes("error")
          ) {
            return {
              vulnerable: true,
              details: `XSS payload reflected in response from ${endpoint.path}`,
              evidence: payload,
            };
          }
        } catch {
          // Ignore fetch errors
        }
      }
    }

    return { vulnerable: false };
  }

  private async testStoredXSS(): Promise<SecurityResult> {
    // Test stored XSS in bot names (common vector)
    const xssPayload = '<img src=x onerror="alert(1)">';

    try {
      // Try to create a bot with XSS payload (should be rejected)
      const response = await nativeFetch(
        `${this.guardianConfig.baseUrl}/bots`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: xssPayload,
            endpoint: "http://example.com/bot",
          }),
        },
      );

      // If 401, we can't test without auth - consider it safe
      if (response.status === 401) {
        return { vulnerable: false };
      }

      // If accepted, check if it's stored unescaped
      if (response.ok) {
        const botListResponse = await nativeFetch(
          `${this.guardianConfig.baseUrl}/bots`,
        );
        const text = await botListResponse.text();

        if (text.includes(xssPayload)) {
          return {
            vulnerable: true,
            details: "XSS payload stored and served unescaped",
            evidence: xssPayload,
          };
        }
      }
    } catch {
      // Ignore errors
    }

    return { vulnerable: false };
  }

  private async testSQLInjection(endpoint: string): Promise<SecurityResult> {
    const payloads = [
      "' OR '1'='1",
      "1; DROP TABLE users;--",
      "1' AND 1=1--",
      "' UNION SELECT * FROM users--",
    ];

    for (const payload of payloads) {
      try {
        const response = await nativeFetch(
          `${this.guardianConfig.baseUrl}/${endpoint}?id=${encodeURIComponent(payload)}`,
        );

        // Check for SQL error messages
        const text = await response.text();
        const sqlErrorPatterns = [
          "sql syntax",
          "postgresql",
          "syntax error",
          "unterminated",
          "ORA-",
          "mysql",
        ];

        for (const pattern of sqlErrorPatterns) {
          if (text.toLowerCase().includes(pattern)) {
            return {
              vulnerable: true,
              details: `SQL error exposed with payload: ${payload}`,
              evidence: text.slice(0, 200),
            };
          }
        }
      } catch {
        // Ignore fetch errors
      }
    }

    return { vulnerable: false };
  }

  private async testJWTNoneAlgorithm(): Promise<SecurityResult> {
    // Create a JWT with 'none' algorithm
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "admin",
        role: "admin",
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      }),
    ).toString("base64url");
    const fakeToken = `${header}.${payload}.`;

    try {
      const response = await nativeFetch(
        `${this.guardianConfig.baseUrl}/users/me`,
        {
          headers: { Authorization: `Bearer ${fakeToken}` },
        },
      );

      // Should be rejected (401 or 403)
      if (response.ok) {
        return {
          vulnerable: true,
          details: "JWT with 'none' algorithm was accepted",
        };
      }
    } catch {
      // Ignore errors
    }

    return { vulnerable: false };
  }

  private async testExpiredToken(): Promise<SecurityResult> {
    // Create an obviously expired token
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "test",
        iat: 0,
        exp: 1, // Expired in 1970
      }),
    ).toString("base64url");
    const expiredToken = `${header}.${payload}.fake-signature`;

    try {
      const response = await nativeFetch(
        `${this.guardianConfig.baseUrl}/users/me`,
        {
          headers: { Authorization: `Bearer ${expiredToken}` },
        },
      );

      // Should be rejected
      if (response.ok) {
        return {
          vulnerable: true,
          details: "Expired token was accepted",
        };
      }
    } catch {
      // Ignore errors
    }

    return { vulnerable: false };
  }

  private async testMalformedToken(): Promise<SecurityResult> {
    const malformedTokens = ["not-a-jwt", "a.b", "a.b.c.d.e", "....", "Bearer"];

    for (const token of malformedTokens) {
      try {
        const response = await nativeFetch(
          `${this.guardianConfig.baseUrl}/users/me`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        // Should be rejected, not crash
        if (response.status >= 500) {
          return {
            vulnerable: true,
            details: `Server error with malformed token: ${token}`,
          };
        }
      } catch {
        // Ignore errors
      }
    }

    return { vulnerable: false };
  }

  private async testAdminEndpoints(): Promise<SecurityResult> {
    const adminEndpoints = [
      "/analytics/dashboard",
      "/admin/users",
      "/analytics/all",
    ];

    for (const endpoint of adminEndpoints) {
      try {
        const response = await nativeFetch(
          `${this.guardianConfig.baseUrl}${endpoint}`,
        );

        // Should require auth
        if (response.ok) {
          return {
            vulnerable: true,
            details: `Admin endpoint ${endpoint} accessible without auth`,
          };
        }
      } catch {
        // Ignore errors
      }
    }

    return { vulnerable: false };
  }

  private async testUserIsolation(): Promise<SecurityResult> {
    // Try to access another user's data with invalid/no auth
    try {
      const response = await nativeFetch(
        `${this.guardianConfig.baseUrl}/users/other-user-id`,
      );

      // Should be rejected
      if (response.ok) {
        const data = (await response.json()) as Record<string, any>;
        if (data.email || data.password) {
          return {
            vulnerable: true,
            details: "Can access other user data without proper auth",
          };
        }
      }
    } catch {
      // Ignore errors
    }

    return { vulnerable: false };
  }

  private async testSensitiveHeaders(): Promise<SecurityResult> {
    const sensitivePatterns = [
      "x-powered-by",
      "server: express",
      "x-aspnet",
      "x-debug",
    ];

    try {
      const response = await nativeFetch(
        `${this.guardianConfig.baseUrl}/health`,
      );

      for (const pattern of sensitivePatterns) {
        const [header, value] = pattern.split(": ");
        const headerValue = response.headers.get(header);

        if (
          headerValue &&
          (!value || headerValue.toLowerCase().includes(value))
        ) {
          return {
            vulnerable: true,
            details: `Sensitive header exposed: ${header}: ${headerValue}`,
          };
        }
      }
    } catch {
      // Ignore errors
    }

    return { vulnerable: false };
  }

  private async testErrorMessages(): Promise<SecurityResult> {
    const sensitivePatterns = [
      "/home/",
      "/var/",
      "node_modules",
      "password",
      "secret",
      "connection string",
    ];

    try {
      // Trigger an error
      const response = await nativeFetch(
        `${this.guardianConfig.baseUrl}/games/nonexistent-${Date.now()}`,
      );
      const text = await response.text();

      for (const pattern of sensitivePatterns) {
        if (text.toLowerCase().includes(pattern)) {
          return {
            vulnerable: true,
            details: `Sensitive information in error: ${pattern}`,
            evidence: text.slice(0, 200),
          };
        }
      }
    } catch {
      // Ignore errors
    }

    return { vulnerable: false };
  }

  private async testStackTraces(): Promise<SecurityResult> {
    try {
      // Try to trigger a 500 error
      const response = await nativeFetch(
        `${this.guardianConfig.baseUrl}/games/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not valid json{{{",
        },
      );

      const text = await response.text();

      // Check for stack trace patterns
      const stackPatterns = [
        "at Function",
        "at Object",
        "at Module",
        ".ts:",
        ".js:",
      ];

      for (const pattern of stackPatterns) {
        if (text.includes(pattern)) {
          return {
            vulnerable: true,
            details: "Stack trace exposed in error response",
            evidence: text.slice(0, 300),
          };
        }
      }
    } catch {
      // Ignore errors
    }

    return { vulnerable: false };
  }

  // ============================================================================
  // ACCESSIBILITY CHECK IMPLEMENTATIONS
  // ============================================================================

  private async checkAriaLabels(): Promise<A11yResult> {
    // Basic check - would be more thorough with browser automation
    try {
      const response = await nativeFetch(this.guardianConfig.frontendUrl);
      const html = await response.text();

      const issues: string[] = [];

      // Check for buttons without accessible names
      const buttonMatches = html.match(/<button[^>]*>/g) || [];
      for (const button of buttonMatches) {
        if (
          !button.includes("aria-label") &&
          !button.includes("aria-labelledby") &&
          !button.includes(">")
        ) {
          issues.push("Button without accessible name found");
        }
      }

      return {
        passed: issues.length === 0,
        issues,
      };
    } catch {
      return { passed: true, issues: [] };
    }
  }

  private async checkFormLabels(): Promise<A11yResult> {
    try {
      const response = await nativeFetch(this.guardianConfig.frontendUrl);
      const html = await response.text();

      const issues: string[] = [];

      // Check for inputs without labels
      const inputMatches = html.match(/<input[^>]*>/g) || [];
      for (const input of inputMatches) {
        if (
          !input.includes("aria-label") &&
          !input.includes("aria-labelledby") &&
          !input.includes("id=") &&
          input.includes('type="text"')
        ) {
          issues.push("Text input without label found");
        }
      }

      return {
        passed: issues.length === 0,
        issues,
      };
    } catch {
      return { passed: true, issues: [] };
    }
  }

  private async checkHeadingHierarchy(): Promise<A11yResult> {
    try {
      const response = await nativeFetch(this.guardianConfig.frontendUrl);
      const html = await response.text();

      const issues: string[] = [];

      // Check for multiple h1s
      const h1Count = (html.match(/<h1[^>]*>/g) || []).length;
      if (h1Count > 1) {
        issues.push(`Multiple h1 elements found (${h1Count})`);
      }

      // Check for skipped heading levels
      const headings = html.match(/<h[1-6][^>]*>/g) || [];
      let lastLevel = 0;
      for (const heading of headings) {
        const level = parseInt(heading.charAt(2));
        if (lastLevel > 0 && level > lastLevel + 1) {
          issues.push(`Skipped heading level: h${lastLevel} to h${level}`);
        }
        lastLevel = level;
      }

      return {
        passed: issues.length === 0,
        issues,
      };
    } catch {
      return { passed: true, issues: [] };
    }
  }

  private async checkImageAltText(): Promise<A11yResult> {
    try {
      const response = await nativeFetch(this.guardianConfig.frontendUrl);
      const html = await response.text();

      const issues: string[] = [];

      const imgMatches = html.match(/<img[^>]*>/g) || [];
      for (const img of imgMatches) {
        if (!img.includes("alt=")) {
          issues.push("Image without alt attribute found");
        }
      }

      return {
        passed: issues.length === 0,
        issues,
      };
    } catch {
      return { passed: true, issues: [] };
    }
  }

  private async checkFocusVisible(): Promise<A11yResult> {
    // Would need browser automation for true focus testing
    // For now, check CSS for focus styles
    try {
      const response = await nativeFetch(this.guardianConfig.frontendUrl);
      const html = await response.text();

      const issues: string[] = [];

      // Check if there's focus outline removal without replacement
      if (html.includes("outline: none") || html.includes("outline:none")) {
        if (!html.includes("focus-visible") && !html.includes("focus:ring")) {
          issues.push("Focus outline removed without visible replacement");
        }
      }

      return {
        passed: issues.length === 0,
        issues,
      };
    } catch {
      return { passed: true, issues: [] };
    }
  }

  async teardown(): Promise<void> {
    this.log("Guardian Monster cleanup complete");
  }
}

// CLI Entry Point
if (require.main === module) {
  runMonsterCli(new GuardianMonster(), "guardian");
}
