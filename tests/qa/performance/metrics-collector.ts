/**
 * Metrics Collector
 * =================
 *
 * Collects and aggregates performance metrics during load tests.
 * Uses HDR histogram-style percentile calculation for accurate latency tracking.
 */

import { LoadTestMetrics, LoadTestError } from "./load-config";

export interface LatencyBucket {
  min: number;
  max: number;
  count: number;
}

export class MetricsCollector {
  private httpLatencies: number[] = [];
  private wsLatencies: number[] = [];
  private httpRequests = { total: 0, successful: 0, failed: 0 };
  private wsStats = {
    messagesSent: 0,
    messagesReceived: 0,
    disconnects: 0,
    activeConnections: 0,
  };
  private tournamentStats = {
    started: 0,
    completed: 0,
    failed: 0,
    handsPlayed: 0,
  };
  private errors: LoadTestError[] = [];
  private startTime: number;
  private memoryStart: number;
  private memoryPeak: number;
  private cpuSamples: number[] = [];

  // Snapshot history for time-series analysis
  private snapshots: MetricsSnapshot[] = [];
  private snapshotInterval: number;
  private lastSnapshotTime: number;

  constructor(snapshotIntervalMs = 5000) {
    this.startTime = Date.now();
    this.memoryStart = process.memoryUsage().heapUsed / 1024 / 1024;
    this.memoryPeak = this.memoryStart;
    this.snapshotInterval = snapshotIntervalMs;
    this.lastSnapshotTime = this.startTime;
  }

  /**
   * Record an HTTP request latency
   */
  recordHttpLatency(latencyMs: number, success: boolean): void {
    this.httpLatencies.push(latencyMs);
    this.httpRequests.total++;
    if (success) {
      this.httpRequests.successful++;
    } else {
      this.httpRequests.failed++;
    }
    this.maybeSnapshot();
  }

  /**
   * Record a WebSocket message latency
   */
  recordWsLatency(latencyMs: number): void {
    this.wsLatencies.push(latencyMs);
    this.maybeSnapshot();
  }

  /**
   * Record WebSocket activity
   */
  recordWsMessage(sent: boolean): void {
    if (sent) {
      this.wsStats.messagesSent++;
    } else {
      this.wsStats.messagesReceived++;
    }
  }

  /**
   * Record WebSocket connection change
   */
  recordWsConnection(connected: boolean): void {
    if (connected) {
      this.wsStats.activeConnections++;
    } else {
      this.wsStats.activeConnections--;
      this.wsStats.disconnects++;
    }
  }

  /**
   * Record tournament lifecycle events
   */
  recordTournamentStarted(): void {
    this.tournamentStats.started++;
  }

  recordTournamentCompleted(): void {
    this.tournamentStats.completed++;
  }

  recordTournamentFailed(): void {
    this.tournamentStats.failed++;
  }

  recordHandPlayed(): void {
    this.tournamentStats.handsPlayed++;
  }

  /**
   * Record an error
   */
  recordError(error: LoadTestError): void {
    this.errors.push(error);
  }

  /**
   * Sample current CPU and memory usage
   */
  sampleResources(): void {
    const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    if (currentMemory > this.memoryPeak) {
      this.memoryPeak = currentMemory;
    }

    // CPU sampling - using process.cpuUsage() delta
    // For load tests, we estimate based on event loop delay
    const cpuUsage = process.cpuUsage();
    const totalCpu = (cpuUsage.user + cpuUsage.system) / 1000000; // seconds
    const elapsed = (Date.now() - this.startTime) / 1000;
    const cpuPercent = elapsed > 0 ? (totalCpu / elapsed) * 100 : 0;
    this.cpuSamples.push(Math.min(cpuPercent, 100));
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }

  /**
   * Get current aggregated metrics
   */
  getMetrics(): LoadTestMetrics {
    const now = Date.now();
    const elapsedSeconds = Math.max(1, (now - this.startTime) / 1000);
    const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    // Sort latencies for percentile calculation
    const sortedHttp = [...this.httpLatencies].sort((a, b) => a - b);
    const sortedWs = [...this.wsLatencies].sort((a, b) => a - b);

    return {
      httpLatency: {
        p50: this.percentile(sortedHttp, 50),
        p95: this.percentile(sortedHttp, 95),
        p99: this.percentile(sortedHttp, 99),
        max: sortedHttp.length > 0 ? sortedHttp[sortedHttp.length - 1] : 0,
        avg:
          sortedHttp.length > 0
            ? sortedHttp.reduce((a, b) => a + b, 0) / sortedHttp.length
            : 0,
      },
      wsLatency: {
        p50: this.percentile(sortedWs, 50),
        p95: this.percentile(sortedWs, 95),
        p99: this.percentile(sortedWs, 99),
        max: sortedWs.length > 0 ? sortedWs[sortedWs.length - 1] : 0,
      },
      requests: {
        total: this.httpRequests.total,
        successful: this.httpRequests.successful,
        failed: this.httpRequests.failed,
        perSecond: this.httpRequests.total / elapsedSeconds,
      },
      websocket: {
        ...this.wsStats,
      },
      tournaments: {
        ...this.tournamentStats,
      },
      memory: {
        startMB: this.memoryStart,
        currentMB: currentMemory,
        peakMB: this.memoryPeak,
        growthMB: currentMemory - this.memoryStart,
      },
      cpu: {
        avgPercent:
          this.cpuSamples.length > 0
            ? this.cpuSamples.reduce((a, b) => a + b, 0) /
              this.cpuSamples.length
            : 0,
        peakPercent:
          this.cpuSamples.length > 0 ? Math.max(...this.cpuSamples) : 0,
      },
    };
  }

  /**
   * Get all recorded errors
   */
  getErrors(): LoadTestError[] {
    return [...this.errors];
  }

  /**
   * Get metric snapshots for time-series analysis
   */
  getSnapshots(): MetricsSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Maybe take a snapshot based on interval
   */
  private maybeSnapshot(): void {
    const now = Date.now();
    if (now - this.lastSnapshotTime >= this.snapshotInterval) {
      this.takeSnapshot();
      this.lastSnapshotTime = now;
    }
  }

  /**
   * Take a metrics snapshot
   */
  takeSnapshot(): void {
    const metrics = this.getMetrics();
    this.snapshots.push({
      timestamp: Date.now(),
      elapsedMs: Date.now() - this.startTime,
      metrics,
    });
  }

  /**
   * Get latency distribution buckets for histogram visualization
   */
  getLatencyDistribution(type: "http" | "ws"): LatencyBucket[] {
    const latencies = type === "http" ? this.httpLatencies : this.wsLatencies;
    if (latencies.length === 0) return [];

    const buckets: LatencyBucket[] = [
      { min: 0, max: 10, count: 0 },
      { min: 10, max: 25, count: 0 },
      { min: 25, max: 50, count: 0 },
      { min: 50, max: 100, count: 0 },
      { min: 100, max: 200, count: 0 },
      { min: 200, max: 500, count: 0 },
      { min: 500, max: 1000, count: 0 },
      { min: 1000, max: Infinity, count: 0 },
    ];

    for (const latency of latencies) {
      for (const bucket of buckets) {
        if (latency >= bucket.min && latency < bucket.max) {
          bucket.count++;
          break;
        }
      }
    }

    return buckets;
  }

  /**
   * Generate a summary report
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const elapsedMs = Date.now() - this.startTime;
    const httpDist = this.getLatencyDistribution("http");

    const errorRate =
      metrics.requests.total > 0
        ? ((metrics.requests.failed / metrics.requests.total) * 100).toFixed(2)
        : "0.00";

    const lines = [
      "",
      "═".repeat(70),
      "                    LOAD TEST METRICS REPORT",
      "═".repeat(70),
      "",
      `Duration: ${(elapsedMs / 1000).toFixed(1)}s`,
      "",
      "─".repeat(70),
      "HTTP LATENCY",
      "─".repeat(70),
      `  P50:  ${metrics.httpLatency.p50.toFixed(1)}ms`,
      `  P95:  ${metrics.httpLatency.p95.toFixed(1)}ms`,
      `  P99:  ${metrics.httpLatency.p99.toFixed(1)}ms`,
      `  Max:  ${metrics.httpLatency.max.toFixed(1)}ms`,
      `  Avg:  ${metrics.httpLatency.avg.toFixed(1)}ms`,
      "",
      "  Distribution:",
      ...httpDist.map(
        (b) =>
          `    ${String(b.min).padStart(4)}ms - ${String(b.max === Infinity ? "∞" : b.max).padStart(4)}ms: ${String(b.count).padStart(6)} (${((b.count / Math.max(1, this.httpLatencies.length)) * 100).toFixed(1)}%)`,
      ),
      "",
      "─".repeat(70),
      "REQUESTS",
      "─".repeat(70),
      `  Total:      ${metrics.requests.total}`,
      `  Successful: ${metrics.requests.successful}`,
      `  Failed:     ${metrics.requests.failed}`,
      `  Error Rate: ${errorRate}%`,
      `  Throughput: ${metrics.requests.perSecond.toFixed(1)} req/s`,
      "",
      "─".repeat(70),
      "WEBSOCKET",
      "─".repeat(70),
      `  Messages Sent:     ${metrics.websocket.messagesSent}`,
      `  Messages Received: ${metrics.websocket.messagesReceived}`,
      `  Active Connections: ${metrics.websocket.activeConnections}`,
      `  Disconnects:       ${metrics.websocket.disconnects}`,
      "",
      "─".repeat(70),
      "TOURNAMENTS",
      "─".repeat(70),
      `  Started:    ${metrics.tournaments.started}`,
      `  Completed:  ${metrics.tournaments.completed}`,
      `  Failed:     ${metrics.tournaments.failed}`,
      `  Hands:      ${metrics.tournaments.handsPlayed}`,
      `  Hands/min:  ${((metrics.tournaments.handsPlayed / elapsedMs) * 60000).toFixed(1)}`,
      "",
      "─".repeat(70),
      "RESOURCES",
      "─".repeat(70),
      `  Memory Start:  ${metrics.memory.startMB.toFixed(1)}MB`,
      `  Memory Current: ${metrics.memory.currentMB.toFixed(1)}MB`,
      `  Memory Peak:   ${metrics.memory.peakMB.toFixed(1)}MB`,
      `  Memory Growth: ${metrics.memory.growthMB.toFixed(1)}MB`,
      `  CPU Avg:       ${metrics.cpu.avgPercent.toFixed(1)}%`,
      `  CPU Peak:      ${metrics.cpu.peakPercent.toFixed(1)}%`,
      "",
      "─".repeat(70),
      "ERRORS",
      "─".repeat(70),
      `  Total: ${this.errors.length}`,
    ];

    if (this.errors.length > 0) {
      const errorsByType = new Map<string, number>();
      for (const err of this.errors) {
        errorsByType.set(err.type, (errorsByType.get(err.type) || 0) + 1);
      }
      for (const [type, count] of errorsByType) {
        lines.push(`    ${type}: ${count}`);
      }
      lines.push("");
      lines.push("  Recent errors:");
      for (const err of this.errors.slice(-5)) {
        lines.push(`    [${err.type}] ${err.message}`);
      }
    }

    lines.push("");
    lines.push("═".repeat(70));

    return lines.join("\n");
  }

  /**
   * Export metrics as JSON for CI/CD pipelines
   */
  exportJSON(): string {
    return JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - this.startTime,
        metrics: this.getMetrics(),
        errors: this.errors,
        snapshots: this.snapshots,
      },
      null,
      2,
    );
  }

  /**
   * Reset collector for new test
   */
  reset(): void {
    this.httpLatencies = [];
    this.wsLatencies = [];
    this.httpRequests = { total: 0, successful: 0, failed: 0 };
    this.wsStats = {
      messagesSent: 0,
      messagesReceived: 0,
      disconnects: 0,
      activeConnections: 0,
    };
    this.tournamentStats = {
      started: 0,
      completed: 0,
      failed: 0,
      handsPlayed: 0,
    };
    this.errors = [];
    this.snapshots = [];
    this.cpuSamples = [];
    this.startTime = Date.now();
    this.memoryStart = process.memoryUsage().heapUsed / 1024 / 1024;
    this.memoryPeak = this.memoryStart;
    this.lastSnapshotTime = this.startTime;
  }
}

export interface MetricsSnapshot {
  timestamp: number;
  elapsedMs: number;
  metrics: LoadTestMetrics;
}

/**
 * Create a metrics collector with default settings
 */
export function createMetricsCollector(
  snapshotIntervalMs = 5000,
): MetricsCollector {
  return new MetricsCollector(snapshotIntervalMs);
}
