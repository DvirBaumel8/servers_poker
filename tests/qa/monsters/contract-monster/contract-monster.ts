/**
 * Contract Monster
 *
 * Validates that backend API responses match what frontend code expects.
 * Catches mismatches like:
 * - Backend returns paginated {data:[]} but frontend expects raw array
 * - Backend returns different field names than frontend expects
 * - Backend requires auth but frontend calls without token
 */

import { BaseMonster } from "../shared/base-monster";
import { RunConfig } from "../shared/types";
import {
  getEnv,
  createAuthHelper,
  requireBackendHealthy,
  replacePathParams,
  parseEndpoint,
  runMonsterCli,
} from "../shared";
import {
  validateContract,
  getPublicContracts,
  getAuthRequiredContracts,
  ContractDefinition,
} from "./contracts";
import * as fs from "fs";
import * as path from "path";

interface ContractTestResult {
  endpoint: string;
  passed: boolean;
  errors: string[];
  responseType: string;
  statusCode: number;
}

export class ContractMonster extends BaseMonster {
  private baseUrl: string;
  private authHelper = createAuthHelper();
  private results: ContractTestResult[] = [];
  private workspaceRoot = process.cwd();

  constructor() {
    super({
      name: "Contract Monster",
      type: "contract",
      timeout: 60000,
      verbose: true,
    });
    const env = getEnv();
    this.baseUrl = env.apiBaseUrl.replace("/api/v1", "");
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("Setting up Contract Monster...");

    await requireBackendHealthy();
    this.log("✅ Backend is healthy");

    // Authenticate for protected endpoint tests
    const token = await this.authHelper.authenticateAsAdmin();
    if (token) {
      this.log("✅ Authenticated for protected endpoint tests");
    } else {
      this.logWarn(
        "Could not authenticate - will skip protected endpoint tests",
      );
    }
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("Starting contract validation...\n");

    // Test public endpoints (no auth required)
    this.log("Testing public endpoint contracts...");
    for (const { endpoint, contract } of getPublicContracts()) {
      await this.testContract(endpoint, contract, false);
    }

    // Test authenticated endpoints
    if (this.authHelper.adminToken) {
      this.log("\nTesting authenticated endpoint contracts...");
      for (const { endpoint, contract } of getAuthRequiredContracts()) {
        await this.testContract(endpoint, contract, true);
      }
    } else {
      this.logWarn("Skipping authenticated endpoint tests - no auth token");
    }

    // Test that public endpoints actually work WITHOUT auth
    this.log("\nVerifying public endpoints don't require auth...");
    await this.testPublicEndpointsWithoutAuth();

    // Static analysis: compare frontend API types vs backend DTOs
    this.log("\nRunning static contract analysis...");
    this.checkStaticContracts();

    // Summary
    this.printSummary();
  }

  protected async teardown(): Promise<void> {
    this.log("Contract Monster cleanup complete");
  }

  private async testContract(
    endpoint: string,
    contract: ContractDefinition,
    useAuth: boolean,
  ): Promise<void> {
    // Parse method and path from endpoint
    const { method, path } = parseEndpoint(endpoint);
    const resolvedPath = replacePathParams(path);
    const url = `${this.baseUrl}/api/v1${resolvedPath}`;

    const headers: Record<string, string> = {};
    if (useAuth) {
      Object.assign(headers, this.authHelper.getAdminHeaders());
    }

    // For POST endpoints, we need to provide test data
    const fetchOptions: RequestInit = { method, headers };
    if (method === "POST") {
      const testBody = this.getTestBodyForEndpoint(endpoint);
      if (testBody) {
        fetchOptions.body = JSON.stringify(testBody);
      }
    }

    const response = await this.fetch(url, fetchOptions);

    // Skip 404s for endpoints with path params (we don't have real IDs)
    if (response.status === 404 && endpoint.includes(":id")) {
      this.log(`  ⏭️  ${endpoint} - skipped (no test data)`);
      this.recordTest(true, true); // Skip
      return;
    }

    // Skip POST endpoints that return 400 or 401 - we're testing contracts, not validation/auth
    if (
      method === "POST" &&
      (response.status === 400 || response.status === 401)
    ) {
      this.log(
        `  ⏭️  ${endpoint} - skipped (expected ${response.status} for test data)`,
      );
      this.recordTest(true, true); // Skip
      return;
    }

    if (!response.ok) {
      this.addFinding({
        category: "BUG",
        severity: contract.auth ? "medium" : "critical",
        title: `Contract test failed: ${endpoint}`,
        description: `Endpoint returned ${response.status} instead of success`,
        location: { endpoint },
        evidence: {
          request: { url, useAuth },
          response: { status: response.status, body: response.data },
        },
        reproducible: true,
        tags: ["contract", "api", "status-code"],
      });
      this.recordTest(false);
      this.results.push({
        endpoint,
        passed: false,
        errors: [`HTTP ${response.status}`],
        responseType: "error",
        statusCode: response.status,
      });
      return;
    }

    // Validate response against contract
    const validation = validateContract(endpoint, response.data);

    if (validation.valid) {
      this.log(`  ✅ ${endpoint} - contract valid`);
      this.recordTest(true);
      this.results.push({
        endpoint,
        passed: true,
        errors: [],
        responseType: contract.responseType,
        statusCode: response.status,
      });
    } else {
      this.log(`  ❌ ${endpoint} - contract violation`);
      for (const error of validation.errors) {
        this.log(`     - ${error}`);
      }

      this.addFinding({
        category: "BUG",
        severity: "critical",
        title: `Contract violation: ${endpoint}`,
        description: `Response does not match frontend expectations:\n${validation.errors.join("\n")}`,
        location: { endpoint },
        evidence: {
          contract: {
            expectedType: contract.responseType,
            expectedShape: contract.shape,
          },
          actualResponse: this.summarizeResponse(response.data),
        },
        reproducible: true,
        reproductionSteps: [
          `Call ${endpoint}`,
          `Compare response against contract in contracts.ts`,
        ],
        tags: ["contract", "api", "response-format"],
      });
      this.recordTest(false);
      this.results.push({
        endpoint,
        passed: false,
        errors: validation.errors,
        responseType: contract.responseType,
        statusCode: response.status,
      });
    }
  }

  private async testPublicEndpointsWithoutAuth(): Promise<void> {
    for (const { endpoint, contract } of getPublicContracts()) {
      if (contract.auth) continue; // Skip auth-required endpoints

      const url = this.endpointToUrl(endpoint);

      // Call WITHOUT auth token
      const response = await this.fetch(url);

      // Skip 404s for endpoints with path params
      if (response.status === 404 && endpoint.includes(":id")) {
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: `Public endpoint requires auth: ${endpoint}`,
          description: `Endpoint is marked as public in frontend but returns ${response.status} without authentication`,
          location: { endpoint },
          evidence: {
            contract: { auth: false },
            response: { status: response.status },
          },
          reproducible: true,
          reproductionSteps: [
            `Call ${endpoint} without Authorization header`,
            `Observe ${response.status} error`,
          ],
          tags: ["contract", "auth", "public-endpoint"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  private endpointToUrl(endpoint: string): string {
    const { path } = parseEndpoint(endpoint);
    const resolvedPath = replacePathParams(path);
    return `${this.baseUrl}/api/v1${resolvedPath}`;
  }

  private getTestBodyForEndpoint(
    endpoint: string,
  ): Record<string, unknown> | null {
    // Provide test data for POST endpoints
    const testBodies: Record<string, Record<string, unknown>> = {
      "POST /auth/login": {
        email: "monster-test@example.com",
        password: "TestPassword123!",
      },
      "POST /auth/register": {
        email: `monster-test-${Date.now()}@example.com`,
        password: "TestPassword123!",
      },
    };
    return testBodies[endpoint] || null;
  }

  private summarizeResponse(data: unknown): unknown {
    if (Array.isArray(data)) {
      return {
        type: "array",
        length: data.length,
        sample: data.length > 0 ? data[0] : null,
      };
    }
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      const summary: Record<string, string> = {};
      for (const [key, value] of Object.entries(obj)) {
        summary[key] = Array.isArray(value)
          ? `array[${value.length}]`
          : typeof value;
      }
      return { type: "object", fields: summary };
    }
    return { type: typeof data, value: data };
  }

  private checkStaticContracts(): void {
    const frontendApiDir = path.join(this.workspaceRoot, "frontend/src/api");
    if (!fs.existsSync(frontendApiDir)) {
      this.log("No frontend/src/api directory found, skipping static check");
      return;
    }

    const apiFiles = fs
      .readdirSync(frontendApiDir)
      .filter((f) => f.endsWith(".ts"));

    for (const file of apiFiles) {
      this.recordCheck();
      const content = fs.readFileSync(path.join(frontendApiDir, file), "utf-8");

      const fetchCalls = [
        ...content.matchAll(
          /(?:get|post|put|delete|patch)\s*(?:<[^>]+>)?\s*\(\s*[`"']([^`"']+)[`"']/gi,
        ),
      ];

      for (const match of fetchCalls) {
        this.recordCheck();
        const endpoint = match[1];
        const lineIndex = content.indexOf(match[0]);
        const surroundingCode = content.slice(lineIndex, lineIndex + 500);

        if (
          surroundingCode.match(/\.map\s*\(/) &&
          !surroundingCode.match(/\.data\s*\.\s*map/)
        ) {
          this.recordTest(true);
        }
      }
    }

    this.checkResponseTypeMismatches();
  }

  private checkResponseTypeMismatches(): void {
    const backendDir = path.join(this.workspaceRoot, "src/modules");
    if (!fs.existsSync(backendDir)) return;

    const controllerFiles = this.findFiles(backendDir, /\.controller\.ts$/);
    const paginatedEndpoints: string[] = [];

    for (const file of controllerFiles) {
      this.recordCheck();
      const content = fs.readFileSync(file, "utf-8");

      if (
        content.includes("PaginatedResponse") ||
        content.includes("paginate") ||
        content.includes("{ data:") ||
        (content.includes("offset") && content.includes("limit"))
      ) {
        const endpoints = [
          ...content.matchAll(
            /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"]([^'"]*)['"]\s*\)/g,
          ),
        ];
        for (const ep of endpoints) {
          const epIndex = content.indexOf(ep[0]);
          const methodBlock = content.slice(
            epIndex,
            Math.min(epIndex + 1000, content.length),
          );
          if (
            methodBlock.includes("paginate") ||
            methodBlock.includes("PaginatedResponse") ||
            methodBlock.includes("offset") ||
            methodBlock.includes("{ data")
          ) {
            paginatedEndpoints.push(ep[2]);
          }
        }
      }
    }

    const frontendApiDir = path.join(this.workspaceRoot, "frontend/src/api");
    if (!fs.existsSync(frontendApiDir)) return;

    const apiFiles = fs
      .readdirSync(frontendApiDir)
      .filter((f) => f.endsWith(".ts"));

    for (const file of apiFiles) {
      const content = fs.readFileSync(path.join(frontendApiDir, file), "utf-8");

      for (const endpoint of paginatedEndpoints) {
        this.recordCheck();
        if (content.includes(endpoint)) {
          const epIndex = content.indexOf(endpoint);
          const surroundingCode = content.slice(
            Math.max(0, epIndex - 200),
            epIndex + 500,
          );

          if (
            surroundingCode.match(/\.map\s*\(/) &&
            !surroundingCode.match(/\.data/)
          ) {
            this.addFinding({
              category: "BUG",
              severity: "high",
              title: `Frontend calls .map() on paginated endpoint ${endpoint}`,
              description: `The backend endpoint ${endpoint} returns a paginated response (with .data array), but the frontend appears to call .map() directly without accessing .data first. This will cause "X.map is not a function" at runtime.`,
              location: { file: `frontend/src/api/${file}`, endpoint },
              reproducible: true,
              tags: ["contract", "pagination", "type-mismatch"],
            });
            this.recordTest(false);
          } else {
            this.recordTest(true);
          }
        }
      }
    }
  }

  private findFiles(dir: string, pattern: RegExp): string[] {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          results.push(...this.findFiles(fullPath, pattern));
        } else if (entry.isFile() && pattern.test(entry.name)) {
          results.push(fullPath);
        }
      }
    } catch {
      /* skip inaccessible directories */
    }
    return results;
  }

  private printSummary(): void {
    this.log("\n" + "─".repeat(60));
    this.log("CONTRACT MONSTER SUMMARY");
    this.log("─".repeat(60));

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;

    this.log(`Contracts tested: ${this.results.length}`);
    this.log(`Passed: ${passed}`);
    this.log(`Failed: ${failed}`);

    if (failed > 0) {
      this.log("\nFailed contracts:");
      for (const result of this.results.filter((r) => !r.passed)) {
        this.log(`  - ${result.endpoint}`);
        for (const error of result.errors) {
          this.log(`    ${error}`);
        }
      }
    }
  }
}

// CLI Entry Point
if (require.main === module) {
  runMonsterCli(new ContractMonster(), "contract");
}
