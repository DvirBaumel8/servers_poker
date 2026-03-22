/**
 * Traffic Generator for Monitoring Verification
 *
 * Generates realistic API traffic to populate Prometheus metrics
 */

export interface TrafficGeneratorConfig {
  baseUrl: string;
  verbose?: boolean;
}

export interface TrafficStats {
  requestsMade: number;
  successfulRequests: number;
  failedRequests: number;
  endpoints: Record<string, number>;
}

export class TrafficGenerator {
  private baseUrl: string;
  private stats: TrafficStats;
  private verbose: boolean;

  constructor(config: TrafficGeneratorConfig) {
    this.baseUrl = config.baseUrl;
    this.verbose = config.verbose ?? false;
    this.stats = {
      requestsMade: 0,
      successfulRequests: 0,
      failedRequests: 0,
      endpoints: {},
    };
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`  [Traffic] ${message}`);
    }
  }

  private async makeRequest(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    data?: unknown,
  ): Promise<boolean> {
    const endpoint = `${method} ${path}`;
    this.stats.endpoints[endpoint] = (this.stats.endpoints[endpoint] || 0) + 1;
    this.stats.requestsMade++;

    try {
      const url = `${this.baseUrl}${path}`;
      const options: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      if (data && (method === "POST" || method === "PUT")) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);

      if (response.status >= 200 && response.status < 500) {
        this.stats.successfulRequests++;
        this.log(`${endpoint} -> ${response.status}`);
        return true;
      } else {
        this.stats.failedRequests++;
        this.log(`${endpoint} -> ${response.status} (error)`);
        return false;
      }
    } catch (error) {
      this.stats.failedRequests++;
      this.log(`${endpoint} -> FAILED (${(error as Error).message})`);
      return false;
    }
  }

  async generateHealthTraffic(count: number = 5): Promise<void> {
    this.log(`Generating ${count} health check requests...`);
    for (let i = 0; i < count; i++) {
      await this.makeRequest("GET", "/api/v1/health");
      await this.makeRequest("GET", "/api/v1/health/ready");
      await this.makeRequest("GET", "/api/v1/health/live");
    }
  }

  async generateTournamentTraffic(): Promise<void> {
    this.log("Generating tournament traffic...");

    await this.makeRequest("GET", "/api/v1/tournaments");
    await this.makeRequest("GET", "/api/v1/tournaments?status=registering");
    await this.makeRequest("GET", "/api/v1/tournaments?status=running");
    await this.makeRequest("GET", "/api/v1/tournaments?status=completed");

    // Try to get a specific tournament (will 404 but generates metrics)
    await this.makeRequest(
      "GET",
      "/api/v1/tournaments/00000000-0000-0000-0000-000000000000",
    );
  }

  async generateGameTraffic(): Promise<void> {
    this.log("Generating game traffic...");

    await this.makeRequest("GET", "/api/v1/games");

    // Try to get a specific game (will 404 but generates metrics)
    await this.makeRequest(
      "GET",
      "/api/v1/games/00000000-0000-0000-0000-000000000000",
    );
  }

  async generateBotTraffic(): Promise<void> {
    this.log("Generating bot traffic...");

    // These will require auth and fail, but still generate HTTP metrics
    await this.makeRequest("GET", "/api/v1/bots");
    await this.makeRequest("GET", "/api/v1/bots/me");
  }

  async generateLeaderboardTraffic(): Promise<void> {
    this.log("Generating leaderboard traffic...");

    // Leaderboard is under /games/leaderboard
    await this.makeRequest("GET", "/api/v1/games/leaderboard");
    await this.makeRequest("GET", "/api/v1/games/leaderboard?period=daily");
    await this.makeRequest("GET", "/api/v1/games/leaderboard?period=weekly");
    await this.makeRequest("GET", "/api/v1/games/leaderboard?period=monthly");
    await this.makeRequest("GET", "/api/v1/games/leaderboard?period=all");
  }

  async generateMetricsTraffic(): Promise<void> {
    this.log("Generating metrics endpoint traffic...");

    await this.makeRequest("GET", "/api/v1/metrics");
  }

  async generateErrorTraffic(): Promise<void> {
    this.log("Generating error traffic (404s, 400s)...");

    // 404 errors
    await this.makeRequest("GET", "/api/v1/nonexistent");
    await this.makeRequest("GET", "/api/v1/tournaments/invalid-uuid");

    // 400 errors (invalid data)
    await this.makeRequest("POST", "/api/v1/auth/login", {
      email: "invalid",
      password: "",
    });
  }

  async generateAllTraffic(): Promise<void> {
    this.log("Generating comprehensive traffic...");

    await this.generateHealthTraffic(3);
    await this.generateTournamentTraffic();
    await this.generateGameTraffic();
    await this.generateBotTraffic();
    await this.generateLeaderboardTraffic();
    await this.generateMetricsTraffic();
    await this.generateErrorTraffic();

    // Extra round of health checks
    await this.generateHealthTraffic(2);
  }

  async generateQuickTraffic(): Promise<void> {
    this.log("Generating quick traffic burst...");

    await this.generateHealthTraffic(2);
    await this.makeRequest("GET", "/api/v1/tournaments");
    await this.makeRequest("GET", "/api/v1/leaderboard");
    await this.makeRequest("GET", "/api/v1/metrics");
  }

  getStats(): TrafficStats {
    return { ...this.stats };
  }

  printStats(): void {
    console.log("\n📊 Traffic Statistics:");
    console.log(`   Total requests: ${this.stats.requestsMade}`);
    console.log(`   Successful: ${this.stats.successfulRequests}`);
    console.log(`   Failed: ${this.stats.failedRequests}`);
    console.log("   Endpoints hit:");
    for (const [endpoint, count] of Object.entries(this.stats.endpoints)) {
      console.log(`     ${endpoint}: ${count}`);
    }
  }
}
