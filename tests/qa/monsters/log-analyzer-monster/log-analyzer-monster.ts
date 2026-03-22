import { BaseMonster } from "../shared/base-monster";
import { RunConfig, Severity } from "../shared/types";
import { runMonsterCli } from "../shared/cli-runner";
import { findFiles, readTextSafe } from "../shared/fs-utils";
import { getEnv } from "../shared/env-config";
import * as fs from "fs";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";

/**
 * Log Analyzer Monster
 *
 * Two-phase analysis:
 *
 * Phase 1 — STATIC: Scan backend source code for logging anti-patterns:
 *   - Sensitive data in log statements (passwords, tokens, secrets)
 *   - Missing error context (logging error.message without stack trace)
 *   - Inconsistent logger usage (console.log instead of NestJS Logger)
 *   - Missing logger in services/controllers
 *   - Overly verbose info-level logging (logging full request/response bodies)
 *   - Swallowed errors (catch blocks that don't log)
 *   - Frontend logger misuse (console.log in production components)
 *
 * Phase 2 — LIVE: Start backend, capture stdout, trigger requests, analyze:
 *   - Error logs during normal operations
 *   - Warning frequency and patterns
 *   - Stack traces in responses (leaked to clients)
 *   - Unhandled promise rejections
 *   - Deprecation warnings
 *   - Slow query warnings
 *   - Repeated error patterns (same error N times = systemic issue)
 */
class LogAnalyzerMonster extends BaseMonster {
  private workspaceRoot = process.cwd();
  private backendProcess: ChildProcess | null = null;
  private capturedLogs: string[] = [];
  private livePhaseAvailable = false;

  constructor() {
    super({
      name: "Log Analyzer Monster",
      type: "log-analyzer",
      timeout: 120000,
      verbose: true,
    });
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("Log Analyzer Monster — analyzing app logging health");

    const env = getEnv();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(
        `${env.apiBaseUrl.replace(/\/api\/v1$/, "")}/api/v1/health`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      this.livePhaseAvailable = res.ok;
    } catch {
      this.livePhaseAvailable = false;
    }
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("\n=== PHASE 1: Static Log Analysis (Backend) ===");
    this.analyzeBackendLogging();

    this.log("\n=== PHASE 2: Static Log Analysis (Frontend) ===");
    this.analyzeFrontendLogging();

    if (this.livePhaseAvailable) {
      this.log("\n=== PHASE 3: Live Log Capture & Analysis ===");
      await this.runLiveLogAnalysis();
    } else {
      this.log("\n=== PHASE 3: SKIPPED (backend not running) ===");
    }
  }

  protected async teardown(): Promise<void> {
    if (this.backendProcess) {
      this.backendProcess.kill();
      this.backendProcess = null;
    }
  }

  // ============================================================================
  // PHASE 1: Backend Static Analysis
  // ============================================================================

  private analyzeBackendLogging(): void {
    const srcDir = path.join(this.workspaceRoot, "src");
    if (!fs.existsSync(srcDir)) {
      this.log("  Skipping: src/ directory not found");
      return;
    }

    const tsFiles = findFiles(srcDir, ".ts");
    const serviceFiles = tsFiles.filter(
      (f) =>
        (f.includes(".service.") ||
          f.includes(".controller.") ||
          f.includes(".gateway.")) &&
        !f.includes(".spec.") &&
        !f.includes(".test.") &&
        !f.includes("node_modules"),
    );

    this.log(`  Found ${serviceFiles.length} service/controller/gateway files`);

    for (const file of serviceFiles) {
      const content = readTextSafe(file);
      if (!content) continue;
      const relPath = path.relative(this.workspaceRoot, file);

      this.checkSensitiveDataInLogs(content, relPath);
      this.checkMissingLoggerDeclaration(content, relPath);
      this.checkConsoleLogUsage(content, relPath);
      this.checkMissingErrorContext(content, relPath);
      this.checkVerboseLogging(content, relPath);
      this.checkSilentCatchBlocks(content, relPath);
    }
  }

  private checkSensitiveDataInLogs(content: string, filePath: string): void {
    const lines = content.split("\n");

    const sensitivePatterns: Array<{
      pattern: RegExp;
      field: string;
      severity: Severity;
      falsePositives?: string[];
    }> = [
      {
        pattern: /logger\.\w+\(.*password/i,
        field: "password",
        severity: "critical",
        falsePositives: [
          "password reset",
          "password has been",
          "password changed",
          "password updated",
          "password must",
          "password is required",
          "password strength",
          "credential reset",
          "reset code sent",
        ],
      },
      {
        pattern: /logger\.\w+\(.*secret/i,
        field: "secret",
        severity: "critical",
      },
      {
        pattern: /logger\.\w+\(.*token(?!ize|Expir|Valid|Type)/i,
        field: "token",
        severity: "high",
      },
      {
        pattern: /logger\.\w+\(.*credentials/i,
        field: "credentials",
        severity: "critical",
      },
      {
        pattern: /logger\.\w+\(.*api[_-]?key/i,
        field: "api_key",
        severity: "critical",
      },
      {
        pattern: /logger\.\w+\(.*\bcookie\b/i,
        field: "cookie",
        severity: "high",
      },
      {
        pattern: /logger\.\w+\(.*authorization\b/i,
        field: "authorization header",
        severity: "high",
      },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const {
        pattern,
        field,
        severity,
        falsePositives,
      } of sensitivePatterns) {
        this.recordCheck();
        if (pattern.test(line)) {
          const lower = line.toLowerCase();

          // Generic false positive phrases
          const genericFP = [
            "validation",
            "required",
            "missing",
            "invalid",
            "expir",
          ];
          const allFP = [...genericFP, ...(falsePositives || [])];

          if (allFP.some((fp) => lower.includes(fp))) {
            this.recordTest(true);
            continue;
          }

          this.addFinding({
            category: "SECURITY",
            severity,
            title: `Potential "${field}" logged at ${filePath}:${i + 1}`,
            description:
              `A log statement appears to include ${field} data. ` +
              `If this logs actual secret values, it's a security risk — ` +
              `secrets in logs can be captured by log aggregators, CI output, or terminal history.`,
            location: { file: filePath, line: i + 1 },
            reproducible: true,
            tags: ["log-analyzer", "security", "sensitive-data"],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }
      }
    }
  }

  private checkMissingLoggerDeclaration(
    content: string,
    filePath: string,
  ): void {
    this.recordCheck();

    // Only check Injectable services and controllers
    if (!content.includes("@Injectable") && !content.includes("@Controller")) {
      this.recordTest(true);
      return;
    }

    const hasLogger =
      content.includes("private readonly logger") ||
      content.includes("private logger") ||
      content.includes("protected readonly logger") ||
      content.includes("new Logger(");

    if (!hasLogger) {
      // Only flag if the class has methods that do error-prone work
      const hasAsyncWork =
        content.includes("async ") &&
        (content.includes("try") ||
          content.includes("await") ||
          content.includes(".catch("));

      if (hasAsyncWork) {
        this.addFinding({
          category: "CODE_QUALITY",
          severity: "medium",
          title: `Service/controller without logger: ${filePath}`,
          description:
            `This file has @Injectable/@Controller with async operations but no Logger. ` +
            `Errors in this service will be invisible. Add: ` +
            `private readonly logger = new Logger(ClassName.name);`,
          location: { file: filePath },
          reproducible: true,
          tags: ["log-analyzer", "missing-logger", "observability"],
        });
        this.recordTest(false);
        return;
      }
    }

    this.recordTest(true);
  }

  private checkConsoleLogUsage(content: string, filePath: string): void {
    // Skip files that are expected to use console (CLI scripts, workers with parentPort)
    if (
      filePath.includes("main.ts") ||
      filePath.includes("cli") ||
      filePath.includes("migration") ||
      filePath.includes("seed")
    ) {
      return;
    }

    const lines = content.split("\n");
    let consoleUseCount = 0;

    for (let i = 0; i < lines.length; i++) {
      this.recordCheck();
      const line = lines[i].trim();

      if (
        /^console\.(log|debug|info|warn|error)\s*\(/.test(line) ||
        /[^/]console\.(log|debug|info|warn|error)\s*\(/.test(line)
      ) {
        // Ignore if it's in a comment
        if (line.startsWith("//") || line.startsWith("*")) {
          this.recordTest(true);
          continue;
        }
        consoleUseCount++;
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }

    if (consoleUseCount > 0) {
      this.addFinding({
        category: "CODE_QUALITY",
        severity: "low",
        title: `${consoleUseCount} console.* calls in ${filePath}`,
        description:
          `Backend services should use the NestJS Logger (this.logger.*) instead of console.*. ` +
          `Console calls bypass the Pino transport, lose structured context, ` +
          `and won't appear in production JSON logs.`,
        location: { file: filePath },
        reproducible: true,
        tags: ["log-analyzer", "console-usage", "observability"],
      });
    }
  }

  private checkMissingErrorContext(content: string, filePath: string): void {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      this.recordCheck();
      const line = lines[i];

      // Pattern: this.logger.error("message") without a second arg (stack trace)
      const errorLogMatch = line.match(/this\.logger\.error\(\s*`[^`]*`\s*\)/);
      if (errorLogMatch) {
        // Check if the error message interpolates an error's message but not its stack
        if (
          line.includes(".message") &&
          !line.includes(".stack") &&
          !lines[i + 1]?.includes(".stack")
        ) {
          this.addFinding({
            category: "CODE_QUALITY",
            severity: "medium",
            title: `Error logged without stack trace: ${filePath}:${i + 1}`,
            description:
              `this.logger.error() logs error.message but not the stack trace. ` +
              `Pass the stack as the second argument: this.logger.error(message, error.stack). ` +
              `Without the stack, debugging production issues requires guesswork.`,
            location: { file: filePath, line: i + 1 },
            reproducible: true,
            tags: ["log-analyzer", "error-context", "debugging"],
          });
          this.recordTest(false);
          continue;
        }
      }
      this.recordTest(true);
    }
  }

  private checkVerboseLogging(content: string, filePath: string): void {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      this.recordCheck();
      const line = lines[i];

      // Pattern: logging full request/response bodies at info level
      if (
        /this\.logger\.log\(.*JSON\.stringify/.test(line) ||
        /this\.logger\.log\(.*\breq\.body\b/.test(line) ||
        /this\.logger\.log\(.*\bresponse\.data\b/.test(line)
      ) {
        this.addFinding({
          category: "CODE_QUALITY",
          severity: "low",
          title: `Verbose info-level log at ${filePath}:${i + 1}`,
          description:
            `Logging full request/response bodies at info level creates excessive log volume. ` +
            `Use debug level for detailed payloads, or log only relevant fields.`,
          location: { file: filePath, line: i + 1 },
          reproducible: true,
          tags: ["log-analyzer", "verbose", "log-volume"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  private checkSilentCatchBlocks(content: string, filePath: string): void {
    // Skip test files and monster files
    if (filePath.includes("spec") || filePath.includes("test")) return;

    const catchRegex = /catch\s*\(\s*(\w+)?\s*\)\s*\{([^}]*)\}/g;
    let match;

    while ((match = catchRegex.exec(content)) !== null) {
      this.recordCheck();
      const catchBody = match[2].trim();
      const errorVar = match[1];

      // Truly empty catch block
      if (!catchBody) {
        const lineNum = content.slice(0, match.index).split("\n").length;
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: `Silent catch block at ${filePath}:${lineNum}`,
          description:
            `Empty catch block silently swallows errors. In a backend service, this means ` +
            `failures are invisible — no log, no alert, no way to know something went wrong. ` +
            `At minimum, log the error.`,
          location: { file: filePath, line: lineNum },
          reproducible: true,
          tags: ["log-analyzer", "silent-catch", "error-swallowing"],
        });
        this.recordTest(false);
        continue;
      }

      // Catch that has the error variable but never references it
      if (errorVar && !catchBody.includes(errorVar)) {
        const lineNum = content.slice(0, match.index).split("\n").length;
        // Exclude intentional ignores (error variable starting with _)
        if (!errorVar.startsWith("_")) {
          this.addFinding({
            category: "CODE_QUALITY",
            severity: "medium",
            title: `Catch block ignores error variable at ${filePath}:${lineNum}`,
            description:
              `The catch block declares '${errorVar}' but never uses it. ` +
              `The error details are discarded. Either log the error or prefix ` +
              `the variable with underscore (_${errorVar}) to indicate intentional ignoring.`,
            location: { file: filePath, line: lineNum },
            reproducible: true,
            tags: ["log-analyzer", "unused-error", "observability"],
          });
          this.recordTest(false);
          continue;
        }
      }

      this.recordTest(true);
    }
  }

  // ============================================================================
  // PHASE 2: Frontend Static Analysis
  // ============================================================================

  private analyzeFrontendLogging(): void {
    const frontendSrc = path.join(this.workspaceRoot, "frontend/src");
    if (!fs.existsSync(frontendSrc)) {
      this.log("  Skipping: frontend/src/ not found");
      return;
    }

    const tsxFiles = findFiles(frontendSrc, ".tsx").filter(
      (f) => !f.includes("node_modules") && !f.includes(".test."),
    );
    const tsFiles = findFiles(frontendSrc, ".ts").filter(
      (f) =>
        !f.includes("node_modules") &&
        !f.includes(".test.") &&
        !f.includes("logger.ts"),
    );

    const allFiles = [...tsxFiles, ...tsFiles];
    this.log(`  Found ${allFiles.length} frontend source files`);

    let totalConsoleUse = 0;
    const filesWithConsole: string[] = [];

    for (const file of allFiles) {
      const content = readTextSafe(file);
      if (!content) continue;
      const relPath = path.relative(this.workspaceRoot, file);

      const lines = content.split("\n");
      let fileConsoleCount = 0;

      for (let i = 0; i < lines.length; i++) {
        this.recordCheck();
        const line = lines[i].trim();

        if (line.startsWith("//") || line.startsWith("*")) {
          this.recordTest(true);
          continue;
        }

        if (/console\.(log|debug|info)\s*\(/.test(line)) {
          fileConsoleCount++;
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }
      }

      if (fileConsoleCount > 0) {
        totalConsoleUse += fileConsoleCount;
        filesWithConsole.push(`${relPath} (${fileConsoleCount})`);
      }

      // Check for error boundaries without logging
      this.recordCheck();
      const definesErrorBoundary = content.includes("componentDidCatch");
      const usesErrorBoundary =
        content.includes("ErrorBoundary") && !definesErrorBoundary;
      if (definesErrorBoundary) {
        if (
          !content.includes("logger.error") &&
          !content.includes("console.error")
        ) {
          this.addFinding({
            category: "CODE_QUALITY",
            severity: "medium",
            title: `ErrorBoundary without error logging: ${relPath}`,
            description:
              `This file has an ErrorBoundary but doesn't log caught errors. ` +
              `React crashes caught by the boundary will be invisible.`,
            location: { file: relPath },
            reproducible: true,
            tags: ["log-analyzer", "frontend", "error-boundary"],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }
      } else if (usesErrorBoundary) {
        this.recordTest(true);
      } else {
        this.recordTest(true);
      }
    }

    if (totalConsoleUse > 3) {
      this.addFinding({
        category: "CODE_QUALITY",
        severity: "low",
        title: `${totalConsoleUse} console.log/debug/info calls across ${filesWithConsole.length} frontend files`,
        description:
          `Frontend components should use the logger utility (import { logger } from "utils/logger") ` +
          `instead of console.*. The logger utility respects environment settings and ` +
          `can be wired to Sentry in production. Files: ${filesWithConsole.slice(0, 5).join(", ")}${filesWithConsole.length > 5 ? ` and ${filesWithConsole.length - 5} more` : ""}`,
        location: { file: "frontend/src/" },
        reproducible: true,
        tags: ["log-analyzer", "frontend", "console-usage"],
      });
    }
  }

  // ============================================================================
  // PHASE 3: Live Log Capture & Analysis
  // ============================================================================

  private async runLiveLogAnalysis(): Promise<void> {
    const env = getEnv();
    const baseUrl = env.apiBaseUrl.replace(/\/api\/v1$/, "");

    this.log("  Capturing live backend logs during API calls...");

    // Trigger a variety of API requests and capture any error logs
    const testRequests = [
      // Normal operations — should produce clean logs
      { method: "GET", path: "/api/v1/health", label: "health check" },
      { method: "GET", path: "/api/v1/tournaments", label: "list tournaments" },
      { method: "GET", path: "/api/v1/bots", label: "list bots" },

      // Edge cases — should produce controlled error responses, NOT stack traces
      {
        method: "GET",
        path: "/api/v1/games/nonexistent-id-12345",
        label: "invalid game ID",
      },
      {
        method: "GET",
        path: "/api/v1/tournaments/nonexistent-id-12345",
        label: "invalid tournament ID",
      },
      {
        method: "POST",
        path: "/api/v1/auth/login",
        label: "login with bad creds",
        body: JSON.stringify({ email: "bad@bad.com", password: "bad" }),
      },
      {
        method: "POST",
        path: "/api/v1/auth/login",
        label: "login with malformed body",
        body: "not-json{{{",
      },
      {
        method: "GET",
        path: "/api/v1/users/me",
        label: "unauthenticated user access",
      },

      // Injection attempts — should be rejected cleanly
      {
        method: "GET",
        path: "/api/v1/tournaments?status=<script>alert(1)</script>",
        label: "XSS in query param",
      },
      {
        method: "GET",
        path: "/api/v1/games/' OR 1=1--",
        label: "SQL injection attempt",
      },
    ];

    const responseAnalysis: Array<{
      label: string;
      status: number;
      hasStackTrace: boolean;
      hasInternalInfo: boolean;
      responseTime: number;
      body: string;
    }> = [];

    for (const req of testRequests) {
      this.recordCheck();

      try {
        const start = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const fetchOptions: RequestInit = {
          method: req.method,
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
        };
        if (req.body) {
          fetchOptions.body = req.body;
        }

        const response = await fetch(`${baseUrl}${req.path}`, fetchOptions);
        clearTimeout(timeout);
        const responseTime = Date.now() - start;
        const body = await response.text();

        const hasStackTrace =
          body.includes("at Function") ||
          body.includes("at Object") ||
          body.includes("at Module") ||
          body.includes("at process") ||
          /\.ts:\d+:\d+/.test(body) ||
          /\.js:\d+:\d+/.test(body);

        const hasInternalInfo =
          body.includes("node_modules") ||
          body.includes("/home/") ||
          body.includes("/var/") ||
          body.includes("/Users/") ||
          body.includes("dist/src/") ||
          (body.includes("password") &&
            !body.includes("password must") &&
            !body.includes("password is") &&
            !body.includes("password should"));

        responseAnalysis.push({
          label: req.label,
          status: response.status,
          hasStackTrace,
          hasInternalInfo,
          responseTime,
          body: body.slice(0, 500),
        });

        if (hasStackTrace) {
          this.addFinding({
            category: "SECURITY",
            severity: "high",
            title: `Stack trace leaked in response: ${req.label}`,
            description:
              `The response to "${req.label}" (${req.method} ${req.path}) includes a stack trace. ` +
              `Stack traces reveal internal file paths, framework versions, and code structure ` +
              `to potential attackers. Use an exception filter to sanitize error responses.`,
            location: { endpoint: req.path },
            reproducible: true,
            tags: ["log-analyzer", "live", "stack-trace-leak"],
          });
          this.recordTest(false);
        } else if (hasInternalInfo) {
          this.addFinding({
            category: "SECURITY",
            severity: "medium",
            title: `Internal info leaked in response: ${req.label}`,
            description:
              `The response to "${req.label}" contains internal paths or sensitive field names. ` +
              `Error responses should only contain user-friendly messages.`,
            location: { endpoint: req.path },
            reproducible: true,
            tags: ["log-analyzer", "live", "info-leak"],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }

        // Check for suspiciously slow responses
        this.recordCheck();
        if (responseTime > 5000) {
          this.addFinding({
            category: "CONCERN",
            severity: "medium",
            title: `Slow response (${responseTime}ms): ${req.label}`,
            description:
              `${req.method} ${req.path} took ${responseTime}ms. ` +
              `Responses over 5s indicate potential performance issues ` +
              `(slow queries, missing indexes, or blocking operations).`,
            location: { endpoint: req.path },
            reproducible: true,
            tags: ["log-analyzer", "live", "slow-response"],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }
      } catch (err: any) {
        // Connection errors are expected for some edge-case requests
        if (!err.message?.includes("abort")) {
          this.recordTest(true);
        }
      }
    }

    // Analyze response patterns
    this.analyzeResponsePatterns(responseAnalysis);
  }

  private analyzeResponsePatterns(
    responses: Array<{
      label: string;
      status: number;
      hasStackTrace: boolean;
      hasInternalInfo: boolean;
      responseTime: number;
      body: string;
    }>,
  ): void {
    // Check: do error responses use consistent format?
    this.recordCheck();
    const errorResponses = responses.filter(
      (r) => r.status >= 400 && r.body.length > 0,
    );

    if (errorResponses.length > 0) {
      let hasJsonErrors = 0;
      let hasPlainTextErrors = 0;

      for (const r of errorResponses) {
        try {
          JSON.parse(r.body);
          hasJsonErrors++;
        } catch {
          hasPlainTextErrors++;
        }
      }

      if (hasJsonErrors > 0 && hasPlainTextErrors > 0) {
        this.addFinding({
          category: "CODE_QUALITY",
          severity: "medium",
          title: "Inconsistent error response format",
          description:
            `Of ${errorResponses.length} error responses, ${hasJsonErrors} are JSON ` +
            `and ${hasPlainTextErrors} are plain text. Error responses should use a ` +
            `consistent format (preferably JSON with { statusCode, message, error }).`,
          location: { endpoint: "/api/v1/*" },
          reproducible: true,
          tags: ["log-analyzer", "live", "error-format"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    } else {
      this.recordTest(true);
    }

    // Check: do 5xx errors expose details?
    this.recordCheck();
    const serverErrors = responses.filter((r) => r.status >= 500);
    if (serverErrors.length > 0) {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: `${serverErrors.length} server errors (5xx) during normal test requests`,
        description:
          `Requests that should produce controlled errors (4xx) instead caused server errors: ` +
          `${serverErrors.map((r) => `${r.label} (${r.status})`).join(", ")}. ` +
          `These indicate unhandled exceptions in the backend.`,
        location: { endpoint: "/api/v1/*" },
        reproducible: true,
        tags: ["log-analyzer", "live", "5xx", "unhandled-exception"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }

    // Check: are error response times reasonable?
    this.recordCheck();
    const avgResponseTime =
      responses.reduce((sum, r) => sum + r.responseTime, 0) /
      (responses.length || 1);
    if (avgResponseTime > 2000) {
      this.addFinding({
        category: "CONCERN",
        severity: "medium",
        title: `High average response time: ${Math.round(avgResponseTime)}ms`,
        description:
          `Average response time across ${responses.length} test requests is ` +
          `${Math.round(avgResponseTime)}ms. Target is under 500ms for simple endpoints.`,
        location: { endpoint: "/api/v1/*" },
        reproducible: true,
        tags: ["log-analyzer", "live", "performance"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================
}

runMonsterCli(new LogAnalyzerMonster(), "log-analyzer");
