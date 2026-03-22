/**
 * Network Simulator
 *
 * Simulates various network conditions for testing:
 * - Offline mode
 * - Slow connections (2G, 3G, etc.)
 * - Intermittent connectivity
 * - API failures
 *
 * Used to test error states and loading indicators.
 */

export interface NetworkCondition {
  name: string;
  downloadKbps: number;
  uploadKbps: number;
  latencyMs: number;
  packetLoss: number; // 0-1
}

export interface NetworkSimulationResult {
  condition: string;
  page: string;
  expectedBehavior: string;
  actualBehavior: string;
  passed: boolean;
  screenshot?: string;
  notes: string[];
}

// Common network conditions
export const NETWORK_CONDITIONS: Record<string, NetworkCondition> = {
  offline: {
    name: "Offline",
    downloadKbps: 0,
    uploadKbps: 0,
    latencyMs: 0,
    packetLoss: 1,
  },
  slow2g: {
    name: "Slow 2G",
    downloadKbps: 35,
    uploadKbps: 35,
    latencyMs: 2000,
    packetLoss: 0,
  },
  "2g": {
    name: "Regular 2G",
    downloadKbps: 50,
    uploadKbps: 50,
    latencyMs: 1400,
    packetLoss: 0,
  },
  "3g": {
    name: "Good 3G",
    downloadKbps: 700,
    uploadKbps: 700,
    latencyMs: 150,
    packetLoss: 0,
  },
  "4g": {
    name: "4G LTE",
    downloadKbps: 4000,
    uploadKbps: 3000,
    latencyMs: 50,
    packetLoss: 0,
  },
  wifi: {
    name: "WiFi",
    downloadKbps: 30000,
    uploadKbps: 15000,
    latencyMs: 10,
    packetLoss: 0,
  },
  flaky: {
    name: "Flaky Connection",
    downloadKbps: 1000,
    uploadKbps: 500,
    latencyMs: 500,
    packetLoss: 0.1, // 10% packet loss
  },
};

// Expected behaviors for different network conditions
export interface ExpectedBehavior {
  page: string;
  offline: string;
  slow: string;
  flaky: string;
}

export const EXPECTED_BEHAVIORS: ExpectedBehavior[] = [
  {
    page: "/",
    offline: "Shows offline indicator or cached content",
    slow: "Shows loading skeleton or spinner",
    flaky: "Retries failed requests, shows partial content",
  },
  {
    page: "/tournaments",
    offline: "Shows 'Unable to load tournaments' message",
    slow: "Shows loading spinner, then content",
    flaky: "Shows content after retry, possibly with retry button",
  },
  {
    page: "/leaderboard",
    offline: "Shows cached leaderboard or error message",
    slow: "Shows skeleton loader",
    flaky: "Shows data with possible refresh option",
  },
  {
    page: "/game/:id",
    offline: "Shows disconnection warning, pauses game",
    slow: "Shows connection quality indicator",
    flaky: "Shows reconnecting state, buffers actions",
  },
];

export class NetworkSimulator {
  private currentCondition: NetworkCondition | null = null;
  private results: NetworkSimulationResult[] = [];

  /**
   * Set the network condition
   * In a real browser environment, this would use CDP or Playwright
   */
  setCondition(
    condition: keyof typeof NETWORK_CONDITIONS | NetworkCondition,
  ): void {
    if (typeof condition === "string") {
      this.currentCondition = NETWORK_CONDITIONS[condition];
    } else {
      this.currentCondition = condition;
    }
    console.log(
      `Network condition set to: ${this.currentCondition?.name || "normal"}`,
    );
  }

  /**
   * Clear network condition (restore normal)
   */
  clearCondition(): void {
    this.currentCondition = null;
    console.log("Network condition cleared (normal)");
  }

  /**
   * Simulate a fetch with current network conditions
   */
  async simulatedFetch(url: string, options?: RequestInit): Promise<Response> {
    if (!this.currentCondition) {
      return fetch(url, options);
    }

    const condition = this.currentCondition;

    // Simulate packet loss
    if (Math.random() < condition.packetLoss) {
      throw new Error(
        "NetworkError: Connection failed (simulated packet loss)",
      );
    }

    // Simulate latency
    await this.delay(condition.latencyMs);

    // If offline, throw
    if (condition.downloadKbps === 0) {
      throw new Error("NetworkError: net::ERR_INTERNET_DISCONNECTED");
    }

    // Perform actual fetch
    const response = await fetch(url, options);

    // Simulate slow download (simplified - just adds delay based on content size)
    const clone = response.clone();
    const text = await clone.text();
    const sizeKb = text.length / 1024;
    const downloadTimeMs = (sizeKb / condition.downloadKbps) * 1000;
    await this.delay(downloadTimeMs);

    return response;
  }

  /**
   * Test a page under different network conditions
   */
  async testPageNetworkResilience(
    baseUrl: string,
    page: string,
    testConditions: Array<keyof typeof NETWORK_CONDITIONS> = [
      "offline",
      "slow2g",
      "flaky",
    ],
  ): Promise<NetworkSimulationResult[]> {
    const results: NetworkSimulationResult[] = [];
    const expected = EXPECTED_BEHAVIORS.find((e) => e.page === page);

    for (const conditionKey of testConditions) {
      this.setCondition(conditionKey);
      const condition = NETWORK_CONDITIONS[conditionKey];

      const result: NetworkSimulationResult = {
        condition: condition.name,
        page,
        expectedBehavior: this.getExpectedBehavior(expected, conditionKey),
        actualBehavior: "",
        passed: false,
        notes: [],
      };

      try {
        const startTime = Date.now();
        const response = await this.simulatedFetch(`${baseUrl}${page}`);
        const loadTime = Date.now() - startTime;

        if (response.ok) {
          result.actualBehavior = `Page loaded in ${loadTime}ms`;
          result.passed = true;
          result.notes.push(`Load time: ${loadTime}ms`);
        } else {
          result.actualBehavior = `HTTP ${response.status}`;
          result.notes.push(`Status: ${response.status}`);
        }
      } catch (error: any) {
        result.actualBehavior = error.message;

        // Offline should fail - that's expected
        if (conditionKey === "offline") {
          result.passed = true;
          result.notes.push("Correctly failed when offline");
        } else {
          result.notes.push("Unexpected failure");
        }
      }

      results.push(result);
      this.results.push(result);
    }

    this.clearCondition();
    return results;
  }

  /**
   * Generate network resilience report
   */
  generateReport(): {
    totalTests: number;
    passed: number;
    failed: number;
    resultsByCondition: Record<string, { passed: number; failed: number }>;
    resultsByPage: Record<string, { passed: number; failed: number }>;
  } {
    const resultsByCondition: Record<
      string,
      { passed: number; failed: number }
    > = {};
    const resultsByPage: Record<string, { passed: number; failed: number }> =
      {};

    for (const result of this.results) {
      // By condition
      if (!resultsByCondition[result.condition]) {
        resultsByCondition[result.condition] = { passed: 0, failed: 0 };
      }
      if (result.passed) {
        resultsByCondition[result.condition].passed++;
      } else {
        resultsByCondition[result.condition].failed++;
      }

      // By page
      if (!resultsByPage[result.page]) {
        resultsByPage[result.page] = { passed: 0, failed: 0 };
      }
      if (result.passed) {
        resultsByPage[result.page].passed++;
      } else {
        resultsByPage[result.page].failed++;
      }
    }

    return {
      totalTests: this.results.length,
      passed: this.results.filter((r) => r.passed).length,
      failed: this.results.filter((r) => !r.passed).length,
      resultsByCondition,
      resultsByPage,
    };
  }

  private getExpectedBehavior(
    expected: ExpectedBehavior | undefined,
    condition: keyof typeof NETWORK_CONDITIONS,
  ): string {
    if (!expected) return "Page should handle gracefully";

    if (condition === "offline") return expected.offline;
    if (condition === "slow2g" || condition === "2g" || condition === "3g")
      return expected.slow;
    if (condition === "flaky") return expected.flaky;
    return "Page should load normally";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear recorded results
   */
  clear(): void {
    this.results = [];
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const baseUrl = args[0] || "http://localhost:3001";

  const pages = ["/", "/tournaments", "/leaderboard"];

  const simulator = new NetworkSimulator();

  console.log("Network Simulator");
  console.log("=".repeat(60));
  console.log(`Testing ${pages.length} pages at ${baseUrl}`);
  console.log("Conditions: offline, slow2g, flaky");
  console.log();

  (async () => {
    for (const page of pages) {
      console.log(`\nTesting ${page}:`);
      console.log("-".repeat(40));

      const results = await simulator.testPageNetworkResilience(baseUrl, page);

      for (const result of results) {
        const status = result.passed ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
        console.log(
          `  ${status} ${result.condition}: ${result.actualBehavior}`,
        );
        for (const note of result.notes) {
          console.log(`      ${note}`);
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("Summary:");
    const report = simulator.generateReport();
    console.log(`Total: ${report.totalTests}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);

    process.exit(report.failed > 0 ? 1 : 0);
  })();
}

export default NetworkSimulator;
