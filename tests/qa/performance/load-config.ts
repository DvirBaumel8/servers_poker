/**
 * Load Test Configuration
 * =======================
 *
 * Defines SLOs, scenarios, and thresholds for performance testing.
 *
 * Target: 100 concurrent tournaments, 1000 users
 */

export interface LoadTestSLOs {
  // Latency thresholds (milliseconds)
  httpP50MaxMs: number;
  httpP95MaxMs: number;
  httpP99MaxMs: number;
  wsLatencyP95MaxMs: number;

  // Error rate thresholds (percentage, 0-100)
  maxErrorRatePercent: number;
  maxWsDisconnectRatePercent: number;

  // Throughput minimums
  minRequestsPerSecond: number;
  minHandsPerMinute: number;

  // Resource thresholds
  maxMemoryGrowthMB: number;
  maxCpuUsagePercent: number;
}

export const DEFAULT_SLOS: LoadTestSLOs = {
  // Latency - reasonable for a poker platform
  httpP50MaxMs: 50,
  httpP95MaxMs: 200,
  httpP99MaxMs: 500,
  wsLatencyP95MaxMs: 100,

  // Error rates - target near-zero
  maxErrorRatePercent: 1.0,
  maxWsDisconnectRatePercent: 2.0,

  // Throughput - based on 100 tournaments with ~10 hands/min each
  minRequestsPerSecond: 50,
  minHandsPerMinute: 500,

  // Resource limits
  maxMemoryGrowthMB: 500,
  maxCpuUsagePercent: 80,
};

export interface ScenarioConfig {
  name: string;
  description: string;

  // Scale targets
  targetTournaments: number;
  playersPerTournament: number;

  // Timing
  rampUpDurationMs: number;
  sustainedDurationMs: number;
  rampDownDurationMs: number;

  // Behavior
  tournamentStartIntervalMs: number;
  metricsCollectionIntervalMs: number;

  // Bot configuration
  botActionDelayMs: number;
  botPersonalities: BotPersonality[];

  // SLOs to validate against
  slos: LoadTestSLOs;
}

export type BotPersonality =
  | "caller"
  | "folder"
  | "maniac"
  | "smart"
  | "random";

export const SCENARIOS: Record<string, ScenarioConfig> = {
  /**
   * Baseline - Establish performance metrics with minimal load
   * Use this to determine baseline latencies and throughput
   */
  baseline: {
    name: "Baseline",
    description: "Minimal load to establish baseline metrics",
    targetTournaments: 5,
    playersPerTournament: 9,
    rampUpDurationMs: 5000,
    sustainedDurationMs: 60000,
    rampDownDurationMs: 5000,
    tournamentStartIntervalMs: 1000,
    metricsCollectionIntervalMs: 1000,
    botActionDelayMs: 100,
    botPersonalities: ["caller", "folder", "maniac", "smart", "random"],
    slos: {
      ...DEFAULT_SLOS,
      httpP50MaxMs: 30,
      httpP95MaxMs: 100,
    },
  },

  /**
   * Ramp-up - Gradually increase load to find breaking points
   * Starts with 1 tournament and adds more over time
   */
  rampUp: {
    name: "Ramp-up",
    description: "Gradually increase to 50 concurrent tournaments",
    targetTournaments: 50,
    playersPerTournament: 9,
    rampUpDurationMs: 120000, // 2 minutes
    sustainedDurationMs: 180000, // 3 minutes at peak
    rampDownDurationMs: 30000,
    tournamentStartIntervalMs: 2400, // ~50 tournaments over 2 min
    metricsCollectionIntervalMs: 2000,
    botActionDelayMs: 50,
    botPersonalities: ["caller", "folder", "maniac", "smart", "random"],
    slos: DEFAULT_SLOS,
  },

  /**
   * Sustained - Full load for extended period
   * Tests stability and memory leaks
   */
  sustained: {
    name: "Sustained",
    description: "100 concurrent tournaments for 10 minutes",
    targetTournaments: 100,
    playersPerTournament: 10,
    rampUpDurationMs: 60000, // 1 minute ramp
    sustainedDurationMs: 600000, // 10 minutes
    rampDownDurationMs: 30000,
    tournamentStartIntervalMs: 600, // 100 tournaments in 1 minute
    metricsCollectionIntervalMs: 5000,
    botActionDelayMs: 50,
    botPersonalities: ["caller", "folder", "maniac", "smart", "random"],
    slos: DEFAULT_SLOS,
  },

  /**
   * Spike - Sudden surge of load
   * Tests auto-scaling and recovery
   */
  spike: {
    name: "Spike",
    description: "Sudden 10x load increase",
    targetTournaments: 100,
    playersPerTournament: 10,
    rampUpDurationMs: 10000, // Very fast ramp
    sustainedDurationMs: 120000, // 2 minutes at peak
    rampDownDurationMs: 10000,
    tournamentStartIntervalMs: 100, // 100 tournaments in 10 seconds
    metricsCollectionIntervalMs: 1000,
    botActionDelayMs: 30,
    botPersonalities: ["caller", "folder", "random"],
    slos: {
      ...DEFAULT_SLOS,
      httpP95MaxMs: 500, // Allow higher latency during spike
      httpP99MaxMs: 1000,
      maxErrorRatePercent: 5.0, // Allow more errors during spike
    },
  },

  /**
   * Endurance - Long-running test for memory leaks
   * CI-friendly: can run for hours
   */
  endurance: {
    name: "Endurance",
    description: "70% capacity for 1 hour",
    targetTournaments: 70,
    playersPerTournament: 10,
    rampUpDurationMs: 60000,
    sustainedDurationMs: 3600000, // 1 hour
    rampDownDurationMs: 60000,
    tournamentStartIntervalMs: 857, // 70 in 1 minute
    metricsCollectionIntervalMs: 10000,
    botActionDelayMs: 100,
    botPersonalities: ["caller", "folder", "smart", "random"],
    slos: {
      ...DEFAULT_SLOS,
      maxMemoryGrowthMB: 200, // Stricter memory limit for endurance
    },
  },

  /**
   * Quick - Fast validation for CI/CD
   * Runs in under 2 minutes
   */
  quick: {
    name: "Quick",
    description: "Fast CI validation (20 tournaments, 90 seconds)",
    targetTournaments: 20,
    playersPerTournament: 6,
    rampUpDurationMs: 10000,
    sustainedDurationMs: 60000,
    rampDownDurationMs: 5000,
    tournamentStartIntervalMs: 500,
    metricsCollectionIntervalMs: 2000,
    botActionDelayMs: 50,
    botPersonalities: ["caller", "random"],
    slos: {
      ...DEFAULT_SLOS,
      minHandsPerMinute: 100, // Lower threshold for quick test
    },
  },
};

export interface EnvironmentConfig {
  backendUrl: string;
  wsUrl: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  metricsEndpoint: string;
}

export function getEnvironmentConfig(): EnvironmentConfig {
  return {
    backendUrl: process.env.LOAD_TEST_BACKEND_URL || "http://localhost:3000",
    wsUrl: process.env.LOAD_TEST_WS_URL || "ws://localhost:3000",
    dbHost: process.env.LOAD_TEST_DB_HOST || "localhost",
    dbPort: parseInt(process.env.LOAD_TEST_DB_PORT || "5432", 10),
    dbName: process.env.LOAD_TEST_DB_NAME || "poker_test",
    dbUser: process.env.LOAD_TEST_DB_USER || "postgres",
    dbPassword: process.env.LOAD_TEST_DB_PASSWORD || "postgres",
    metricsEndpoint:
      process.env.LOAD_TEST_METRICS_ENDPOINT ||
      "http://localhost:3000/api/metrics",
  };
}

export interface LoadTestPhase {
  name: "ramp_up" | "sustained" | "ramp_down" | "completed";
  startTime: number;
  endTime?: number;
  tournamentsTarget: number;
  tournamentsActive: number;
}

export interface TournamentState {
  id: string;
  status: "starting" | "running" | "finished" | "error";
  playersRegistered: number;
  playersRemaining: number;
  handsPlayed: number;
  startTime: number;
  endTime?: number;
  errors: string[];
}

export interface LoadTestState {
  scenario: ScenarioConfig;
  phase: LoadTestPhase;
  tournaments: Map<string, TournamentState>;
  startTime: number;
  errors: LoadTestError[];
}

export interface LoadTestError {
  timestamp: number;
  tournamentId?: string;
  type: "http" | "ws" | "db" | "timeout" | "crash";
  message: string;
  endpoint?: string;
  responseTimeMs?: number;
}

export function validateSLOs(
  metrics: LoadTestMetrics,
  slos: LoadTestSLOs,
): SLOValidationResult {
  const violations: SLOViolation[] = [];

  if (metrics.httpLatency.p50 > slos.httpP50MaxMs) {
    violations.push({
      metric: "httpP50",
      threshold: slos.httpP50MaxMs,
      actual: metrics.httpLatency.p50,
      severity: "warning",
    });
  }

  if (metrics.httpLatency.p95 > slos.httpP95MaxMs) {
    violations.push({
      metric: "httpP95",
      threshold: slos.httpP95MaxMs,
      actual: metrics.httpLatency.p95,
      severity: "error",
    });
  }

  if (metrics.httpLatency.p99 > slos.httpP99MaxMs) {
    violations.push({
      metric: "httpP99",
      threshold: slos.httpP99MaxMs,
      actual: metrics.httpLatency.p99,
      severity: "error",
    });
  }

  const errorRate =
    metrics.requests.total > 0
      ? (metrics.requests.failed / metrics.requests.total) * 100
      : 0;

  if (errorRate > slos.maxErrorRatePercent) {
    violations.push({
      metric: "errorRate",
      threshold: slos.maxErrorRatePercent,
      actual: errorRate,
      severity: "error",
    });
  }

  if (metrics.requests.perSecond < slos.minRequestsPerSecond) {
    violations.push({
      metric: "requestsPerSecond",
      threshold: slos.minRequestsPerSecond,
      actual: metrics.requests.perSecond,
      severity: "warning",
    });
  }

  if (metrics.memory.growthMB > slos.maxMemoryGrowthMB) {
    violations.push({
      metric: "memoryGrowth",
      threshold: slos.maxMemoryGrowthMB,
      actual: metrics.memory.growthMB,
      severity: "error",
    });
  }

  return {
    passed: violations.filter((v) => v.severity === "error").length === 0,
    violations,
  };
}

export interface LoadTestMetrics {
  httpLatency: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
    avg: number;
  };
  wsLatency: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
  };
  requests: {
    total: number;
    successful: number;
    failed: number;
    perSecond: number;
  };
  websocket: {
    messagesSent: number;
    messagesReceived: number;
    disconnects: number;
    activeConnections: number;
  };
  tournaments: {
    started: number;
    completed: number;
    failed: number;
    handsPlayed: number;
  };
  memory: {
    startMB: number;
    currentMB: number;
    peakMB: number;
    growthMB: number;
  };
  cpu: {
    avgPercent: number;
    peakPercent: number;
  };
}

export interface SLOViolation {
  metric: string;
  threshold: number;
  actual: number;
  severity: "warning" | "error";
}

export interface SLOValidationResult {
  passed: boolean;
  violations: SLOViolation[];
}
