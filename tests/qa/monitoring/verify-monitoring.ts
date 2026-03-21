#!/usr/bin/env npx ts-node
/**
 * Monitoring Verification Script
 *
 * Verifies the full monitoring pipeline:
 * 1. Poker server exposes metrics
 * 2. Prometheus scrapes metrics successfully
 * 3. Grafana dashboard panels have data
 *
 * Usage:
 *   npm run test:monitoring          # Full verification
 *   npm run test:monitoring:quick    # Quick check (metrics endpoint only)
 */

import { TrafficGenerator } from "./traffic-generator";

interface VerificationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

interface PrometheusTarget {
  labels: { job: string; instance: string };
  health: "up" | "down" | "unknown";
  lastScrape: string;
}

interface PrometheusQueryResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value: [number, string];
    }>;
  };
}

interface GrafanaDashboard {
  dashboard: {
    panels: Array<{
      id: number;
      title: string;
      type: string;
    }>;
  };
}

class MonitoringVerifier {
  private results: VerificationResult[] = [];
  private verbose: boolean;

  constructor(
    private config: {
      pokerUrl: string;
      prometheusUrl: string;
      grafanaUrl: string;
      grafanaUser: string;
      grafanaPassword: string;
      verbose?: boolean;
    },
  ) {
    this.verbose = config.verbose ?? false;
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`  ${message}`);
    }
  }

  private addResult(
    name: string,
    passed: boolean,
    message: string,
    details?: string,
  ): void {
    this.results.push({ name, passed, message, details });
    const icon = passed ? "✅" : "❌";
    console.log(`${icon} ${name}: ${message}`);
    if (details && !passed) {
      console.log(`   Details: ${details}`);
    }
  }

  private async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    return response.json() as Promise<T>;
  }

  private async fetchText(url: string, options?: RequestInit): Promise<string> {
    const response = await fetch(url, options);
    return response.text();
  }

  private getGrafanaHeaders(): Record<string, string> {
    const auth = Buffer.from(
      `${this.config.grafanaUser}:${this.config.grafanaPassword}`,
    ).toString("base64");
    return {
      Authorization: `Basic ${auth}`,
    };
  }

  async verifyMetricsEndpoint(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.pokerUrl}/api/v1/metrics`);

      if (response.status !== 200) {
        this.addResult(
          "Metrics Endpoint",
          false,
          `HTTP ${response.status}`,
          "Endpoint not returning 200",
        );
        return false;
      }

      const metricsText = await response.text();
      const hasProcessMetrics = metricsText.includes("process_cpu");
      const hasPokerMetrics = metricsText.includes("poker_");

      if (!hasProcessMetrics) {
        this.addResult(
          "Metrics Endpoint",
          false,
          "Missing process metrics",
          "Default Prometheus metrics not found",
        );
        return false;
      }

      if (!hasPokerMetrics) {
        this.addResult(
          "Metrics Endpoint",
          false,
          "Missing poker metrics",
          "Custom poker_* metrics not found",
        );
        return false;
      }

      const metricCount = (metricsText.match(/^poker_/gm) || []).length;
      this.addResult(
        "Metrics Endpoint",
        true,
        `Exposing ${metricCount} poker metrics`,
      );
      return true;
    } catch (error) {
      this.addResult(
        "Metrics Endpoint",
        false,
        "Connection failed",
        (error as Error).message,
      );
      return false;
    }
  }

  async verifyPrometheusTargets(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.prometheusUrl}/api/v1/targets`,
      );

      if (response.status !== 200) {
        this.addResult(
          "Prometheus Targets",
          false,
          `HTTP ${response.status}`,
          "Prometheus API not responding",
        );
        return false;
      }

      const data = (await response.json()) as {
        data: { activeTargets: PrometheusTarget[] };
      };
      const targets = data.data.activeTargets;
      const pokerTarget = targets.find((t) => t.labels.job === "poker-server");

      if (!pokerTarget) {
        this.addResult(
          "Prometheus Targets",
          false,
          "poker-server target not found",
          `Found targets: ${targets.map((t) => t.labels.job).join(", ")}`,
        );
        return false;
      }

      if (pokerTarget.health !== "up") {
        this.addResult(
          "Prometheus Targets",
          false,
          `Target health: ${pokerTarget.health}`,
          `Last scrape: ${pokerTarget.lastScrape}`,
        );
        return false;
      }

      this.addResult("Prometheus Targets", true, `poker-server target is UP`);
      return true;
    } catch (error) {
      this.addResult(
        "Prometheus Targets",
        false,
        "Connection failed",
        (error as Error).message,
      );
      return false;
    }
  }

  async verifyPrometheusMetrics(): Promise<boolean> {
    const metricsToCheck = [
      { name: "poker_http_requests_total", type: "counter" },
      { name: "poker_active_games", type: "gauge" },
      { name: "poker_active_tournaments", type: "gauge" },
      { name: "poker_websocket_connections", type: "gauge" },
    ];

    let allFound = true;
    const found: string[] = [];
    const missing: string[] = [];

    for (const metric of metricsToCheck) {
      try {
        const url = `${this.config.prometheusUrl}/api/v1/query?query=${encodeURIComponent(metric.name)}`;
        const response = await fetch(url);
        const data = (await response.json()) as PrometheusQueryResult;

        if (data.status === "success" && data.data.result.length > 0) {
          found.push(metric.name);
          this.log(`Found: ${metric.name}`);
        } else {
          missing.push(metric.name);
          allFound = false;
          this.log(`Missing: ${metric.name}`);
        }
      } catch {
        missing.push(metric.name);
        allFound = false;
      }
    }

    if (allFound) {
      this.addResult(
        "Prometheus Metrics",
        true,
        `All ${found.length} metrics found`,
      );
    } else {
      this.addResult(
        "Prometheus Metrics",
        false,
        `${found.length}/${metricsToCheck.length} metrics found`,
        `Missing: ${missing.join(", ")}`,
      );
    }

    return allFound;
  }

  async verifyHttpMetricsWithData(): Promise<boolean> {
    try {
      const url = `${this.config.prometheusUrl}/api/v1/query?query=${encodeURIComponent("sum(poker_http_requests_total)")}`;
      const response = await fetch(url);
      const data = (await response.json()) as PrometheusQueryResult;

      if (data.status !== "success" || data.data.result.length === 0) {
        this.addResult(
          "HTTP Request Metrics",
          false,
          "No data found",
          "poker_http_requests_total has no values",
        );
        return false;
      }

      const value = parseFloat(data.data.result[0].value[1]);

      if (value === 0) {
        this.addResult(
          "HTTP Request Metrics",
          false,
          "Counter is zero",
          "No HTTP requests have been recorded",
        );
        return false;
      }

      this.addResult(
        "HTTP Request Metrics",
        true,
        `${value.toFixed(0)} total requests recorded`,
      );
      return true;
    } catch (error) {
      this.addResult(
        "HTTP Request Metrics",
        false,
        "Query failed",
        (error as Error).message,
      );
      return false;
    }
  }

  async verifyGrafanaHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.grafanaUrl}/api/health`);

      if (response.status !== 200) {
        this.addResult(
          "Grafana Health",
          false,
          `HTTP ${response.status}`,
          "Grafana not responding",
        );
        return false;
      }

      this.addResult("Grafana Health", true, "Grafana is healthy");
      return true;
    } catch (error) {
      this.addResult(
        "Grafana Health",
        false,
        "Connection failed",
        (error as Error).message,
      );
      return false;
    }
  }

  async verifyGrafanaDatasource(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.grafanaUrl}/api/datasources`,
        {
          headers: this.getGrafanaHeaders(),
        },
      );

      if (response.status !== 200) {
        this.addResult(
          "Grafana Datasource",
          false,
          `HTTP ${response.status}`,
          "Could not fetch datasources",
        );
        return false;
      }

      const datasources = (await response.json()) as Array<{
        name: string;
        type: string;
      }>;
      const promDs = datasources.find(
        (ds) => ds.type === "prometheus" && ds.name === "Prometheus",
      );

      if (!promDs) {
        this.addResult(
          "Grafana Datasource",
          false,
          "Prometheus datasource not found",
          `Found: ${datasources.map((ds) => ds.name).join(", ") || "none"}`,
        );
        return false;
      }

      this.addResult(
        "Grafana Datasource",
        true,
        "Prometheus datasource configured",
      );
      return true;
    } catch (error) {
      this.addResult(
        "Grafana Datasource",
        false,
        "Query failed",
        (error as Error).message,
      );
      return false;
    }
  }

  async verifyGrafanaDashboard(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.grafanaUrl}/api/dashboards/uid/poker-overview`,
        { headers: this.getGrafanaHeaders() },
      );

      if (response.status !== 200) {
        this.addResult(
          "Grafana Dashboard",
          false,
          `HTTP ${response.status}`,
          "Dashboard not found",
        );
        return false;
      }

      const data = (await response.json()) as GrafanaDashboard;
      const panels = data.dashboard.panels || [];
      const panelCount = panels.filter((p) => p.type !== "row").length;

      if (panelCount === 0) {
        this.addResult(
          "Grafana Dashboard",
          false,
          "No panels found",
          "Dashboard exists but has no panels",
        );
        return false;
      }

      this.addResult(
        "Grafana Dashboard",
        true,
        `Dashboard loaded with ${panelCount} panels`,
      );
      return true;
    } catch (error) {
      this.addResult(
        "Grafana Dashboard",
        false,
        "Query failed",
        (error as Error).message,
      );
      return false;
    }
  }

  async runQuickVerification(): Promise<boolean> {
    console.log("\n🔍 Quick Monitoring Verification\n");

    const metricsOk = await this.verifyMetricsEndpoint();

    this.printSummary();
    return metricsOk;
  }

  async runFullVerification(): Promise<boolean> {
    console.log("\n🔍 Full Monitoring Stack Verification\n");

    console.log("─── Step 1: Generate Traffic ───");
    const generator = new TrafficGenerator({
      baseUrl: this.config.pokerUrl,
      verbose: this.verbose,
    });
    await generator.generateAllTraffic();
    generator.printStats();

    console.log("\n─── Step 2: Wait for Scrape ───");
    console.log("   Waiting 20 seconds for Prometheus to scrape metrics...");
    await this.sleep(20000);

    console.log("\n─── Step 3: Verify Poker Server ───");
    await this.verifyMetricsEndpoint();

    console.log("\n─── Step 4: Verify Prometheus ───");
    await this.verifyPrometheusTargets();
    await this.verifyPrometheusMetrics();
    await this.verifyHttpMetricsWithData();

    console.log("\n─── Step 5: Verify Grafana ───");
    await this.verifyGrafanaHealth();
    await this.verifyGrafanaDatasource();
    await this.verifyGrafanaDashboard();

    this.printSummary();

    return this.results.every((r) => r.passed);
  }

  private printSummary(): void {
    const passed = this.results.filter((r) => r.passed).length;
    const total = this.results.length;
    const allPassed = passed === total;

    console.log("\n" + "═".repeat(50));
    console.log(
      allPassed
        ? `✅ PASSED: All ${total} checks passed`
        : `❌ FAILED: ${passed}/${total} checks passed`,
    );
    console.log("═".repeat(50));

    if (!allPassed) {
      console.log("\nFailed checks:");
      for (const result of this.results.filter((r) => !r.passed)) {
        console.log(`  - ${result.name}: ${result.message}`);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isQuick = args.includes("--quick");
  const isVerbose = args.includes("--verbose") || args.includes("-v");

  const config = {
    pokerUrl: process.env.POKER_URL || "http://localhost:3000",
    prometheusUrl: process.env.PROMETHEUS_URL || "http://localhost:9090",
    grafanaUrl: process.env.GRAFANA_URL || "http://localhost:3002",
    grafanaUser: process.env.GRAFANA_USER || "admin",
    grafanaPassword: process.env.GRAFANA_PASSWORD || "admin",
    verbose: isVerbose,
  };

  console.log("📊 Monitoring Verification Tool");
  console.log("─".repeat(40));
  console.log(`Poker Server:  ${config.pokerUrl}`);
  console.log(`Prometheus:    ${config.prometheusUrl}`);
  console.log(`Grafana:       ${config.grafanaUrl}`);
  console.log(`Mode:          ${isQuick ? "Quick" : "Full"}`);

  const verifier = new MonitoringVerifier(config);

  try {
    const success = isQuick
      ? await verifier.runQuickVerification()
      : await verifier.runFullVerification();

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error("\n❌ Verification failed with error:", error);
    process.exit(1);
  }
}

main();
