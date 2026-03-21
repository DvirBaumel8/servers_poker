/**
 * Performance and Load Tests
 * ==========================
 *
 * Backend stress testing for:
 * - Concurrent games
 * - Many simultaneous players
 * - High-frequency actions
 * - Memory leaks
 * - Database performance
 */

import http from "http";
import https from "https";
import { WebSocket } from "ws";

export interface LoadTestConfig {
  backendUrl: string;
  wsUrl: string;
  concurrentGames: number;
  playersPerGame: number;
  actionIntervalMs: number;
  testDurationMs: number;
  rampUpMs: number;
}

export const DEFAULT_LOAD_CONFIG: LoadTestConfig = {
  backendUrl: "http://localhost:3000",
  wsUrl: "ws://localhost:3000",
  concurrentGames: 10,
  playersPerGame: 6,
  actionIntervalMs: 500,
  testDurationMs: 60000, // 1 minute
  rampUpMs: 10000, // 10 second ramp up
};

export interface LoadTestResult {
  config: LoadTestConfig;
  startTime: Date;
  endTime: Date;
  metrics: LoadMetrics;
  errors: LoadError[];
  summary: string;
}

export interface LoadMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTimeMs: number;
  p50ResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  maxResponseTimeMs: number;
  minResponseTimeMs: number;
  requestsPerSecond: number;
  wsMessagesReceived: number;
  wsMessagesSent: number;
  wsDisconnects: number;
  memoryUsageStart?: NodeJS.MemoryUsage;
  memoryUsageEnd?: NodeJS.MemoryUsage;
}

export interface LoadError {
  timestamp: Date;
  type: "http" | "websocket" | "timeout" | "error";
  message: string;
  endpoint?: string;
}

/**
 * Simple HTTP request helper
 */
async function makeRequest(
  url: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    timeout?: number;
  } = {},
): Promise<{ status: number; body: any; responseTimeMs: number }> {
  const start = Date.now();
  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === "https:";
  const httpModule = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = httpModule.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        timeout: options.timeout || 30000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const body = data ? JSON.parse(data) : {};
            resolve({
              status: res.statusCode || 0,
              body,
              responseTimeMs: Date.now() - start,
            });
          } catch (e) {
            resolve({
              status: res.statusCode || 0,
              body: data,
              responseTimeMs: Date.now() - start,
            });
          }
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => reject(new Error("Request timeout")));

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * Load test for API endpoints
 */
export async function runApiLoadTest(
  config: Partial<LoadTestConfig> = {},
): Promise<LoadTestResult> {
  const cfg = { ...DEFAULT_LOAD_CONFIG, ...config };
  const startTime = new Date();
  const errors: LoadError[] = [];
  const responseTimes: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;

  console.log(
    `Starting API load test with ${cfg.concurrentGames} concurrent games...`,
  );

  const endpoints = [
    "/api/games",
    "/api/tournaments",
    "/api/leaderboard",
    "/api/bots",
  ];

  const testEnd = Date.now() + cfg.testDurationMs;
  const requests: Promise<void>[] = [];

  // Generate concurrent requests
  while (Date.now() < testEnd) {
    for (const endpoint of endpoints) {
      const requestPromise = (async () => {
        try {
          const { status, responseTimeMs } = await makeRequest(
            `${cfg.backendUrl}${endpoint}`,
            { timeout: 10000 },
          );
          responseTimes.push(responseTimeMs);
          if (status >= 200 && status < 300) {
            successfulRequests++;
          } else {
            failedRequests++;
            errors.push({
              timestamp: new Date(),
              type: "http",
              message: `Status ${status}`,
              endpoint,
            });
          }
        } catch (err) {
          failedRequests++;
          errors.push({
            timestamp: new Date(),
            type: "error",
            message: String(err),
            endpoint,
          });
        }
      })();
      requests.push(requestPromise);
    }

    // Wait between batches
    await new Promise((resolve) => setTimeout(resolve, cfg.actionIntervalMs));
  }

  // Wait for all requests to complete
  await Promise.allSettled(requests);

  const endTime = new Date();
  const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

  // Calculate percentiles
  responseTimes.sort((a, b) => a - b);
  const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
  const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
  const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;

  const metrics: LoadMetrics = {
    totalRequests: successfulRequests + failedRequests,
    successfulRequests,
    failedRequests,
    avgResponseTimeMs:
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0,
    p50ResponseTimeMs: p50,
    p95ResponseTimeMs: p95,
    p99ResponseTimeMs: p99,
    maxResponseTimeMs: Math.max(...responseTimes) || 0,
    minResponseTimeMs: Math.min(...responseTimes) || 0,
    requestsPerSecond: (successfulRequests + failedRequests) / durationSeconds,
    wsMessagesReceived: 0,
    wsMessagesSent: 0,
    wsDisconnects: 0,
  };

  return {
    config: cfg,
    startTime,
    endTime,
    metrics,
    errors,
    summary: generateLoadTestSummary(metrics, errors),
  };
}

/**
 * WebSocket load test - simulates many concurrent players
 */
export async function runWebSocketLoadTest(
  config: Partial<LoadTestConfig> = {},
): Promise<LoadTestResult> {
  const cfg = { ...DEFAULT_LOAD_CONFIG, ...config };
  const startTime = new Date();
  const errors: LoadError[] = [];
  let wsMessagesReceived = 0;
  let wsMessagesSent = 0;
  let wsDisconnects = 0;

  console.log(
    `Starting WebSocket load test: ${cfg.concurrentGames} games, ${cfg.playersPerGame} players each...`,
  );

  const connections: WebSocket[] = [];
  const totalConnections = cfg.concurrentGames * cfg.playersPerGame;

  // Ramp up connections
  const rampUpInterval = cfg.rampUpMs / totalConnections;

  for (let i = 0; i < totalConnections; i++) {
    const gameId = `load-test-game-${Math.floor(i / cfg.playersPerGame)}`;
    const playerId = `load-test-player-${i}`;

    try {
      const ws = new WebSocket(`${cfg.wsUrl}/game/${gameId}`);

      ws.on("open", () => {
        wsMessagesSent++;
        ws.send(JSON.stringify({ type: "join", playerId }));
      });

      ws.on("message", () => {
        wsMessagesReceived++;
      });

      ws.on("close", () => {
        wsDisconnects++;
      });

      ws.on("error", (err) => {
        errors.push({
          timestamp: new Date(),
          type: "websocket",
          message: String(err),
        });
      });

      connections.push(ws);
    } catch (err) {
      errors.push({
        timestamp: new Date(),
        type: "error",
        message: `Failed to create WS: ${err}`,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, rampUpInterval));
  }

  console.log(`Established ${connections.length} WebSocket connections`);

  // Run test for duration
  const testEnd = Date.now() + cfg.testDurationMs;

  while (Date.now() < testEnd) {
    // Send periodic messages from each connection
    for (const ws of connections) {
      if (ws.readyState === WebSocket.OPEN) {
        wsMessagesSent++;
        ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, cfg.actionIntervalMs));
  }

  // Cleanup
  for (const ws of connections) {
    ws.close();
  }

  const endTime = new Date();

  const metrics: LoadMetrics = {
    totalRequests: totalConnections,
    successfulRequests: connections.length,
    failedRequests: totalConnections - connections.length,
    avgResponseTimeMs: 0,
    p50ResponseTimeMs: 0,
    p95ResponseTimeMs: 0,
    p99ResponseTimeMs: 0,
    maxResponseTimeMs: 0,
    minResponseTimeMs: 0,
    requestsPerSecond: 0,
    wsMessagesReceived,
    wsMessagesSent,
    wsDisconnects,
  };

  return {
    config: cfg,
    startTime,
    endTime,
    metrics,
    errors,
    summary: generateWebSocketLoadTestSummary(
      metrics,
      errors,
      totalConnections,
    ),
  };
}

/**
 * Concurrent game simulation
 */
export async function runConcurrentGameTest(
  config: Partial<LoadTestConfig> = {},
): Promise<LoadTestResult> {
  const cfg = { ...DEFAULT_LOAD_CONFIG, ...config };
  const startTime = new Date();
  const memoryStart = process.memoryUsage();
  const errors: LoadError[] = [];
  const responseTimes: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;

  console.log(`Starting concurrent game test: ${cfg.concurrentGames} games...`);

  // Create games
  const gameIds: string[] = [];
  for (let i = 0; i < cfg.concurrentGames; i++) {
    try {
      const { status, body, responseTimeMs } = await makeRequest(
        `${cfg.backendUrl}/api/games`,
        {
          method: "POST",
          body: {
            name: `Load Test Game ${i}`,
            type: "cash",
            smallBlind: 1,
            bigBlind: 2,
            minBuyIn: 100,
            maxBuyIn: 500,
            maxPlayers: cfg.playersPerGame,
          },
        },
      );

      responseTimes.push(responseTimeMs);
      if (status >= 200 && status < 300 && body.id) {
        gameIds.push(body.id);
        successfulRequests++;
      } else {
        failedRequests++;
        errors.push({
          timestamp: new Date(),
          type: "http",
          message: `Failed to create game: ${status}`,
        });
      }
    } catch (err) {
      failedRequests++;
      errors.push({
        timestamp: new Date(),
        type: "error",
        message: `Game creation error: ${err}`,
      });
    }
  }

  console.log(`Created ${gameIds.length} games`);

  // Simulate actions on each game
  const testEnd = Date.now() + cfg.testDurationMs;
  const actionTypes = ["fold", "check", "call", "bet", "raise"];

  while (Date.now() < testEnd) {
    const actionPromises = gameIds.map(async (gameId) => {
      const action =
        actionTypes[Math.floor(Math.random() * actionTypes.length)];
      try {
        const { status, responseTimeMs } = await makeRequest(
          `${cfg.backendUrl}/api/games/${gameId}/action`,
          {
            method: "POST",
            body: {
              action,
              amount: action === "bet" || action === "raise" ? 10 : undefined,
            },
          },
        );
        responseTimes.push(responseTimeMs);
        if (status >= 200 && status < 400) {
          successfulRequests++;
        } else {
          failedRequests++;
        }
      } catch (err) {
        failedRequests++;
        errors.push({
          timestamp: new Date(),
          type: "error",
          message: `Action error: ${err}`,
        });
      }
    });

    await Promise.allSettled(actionPromises);
    await new Promise((resolve) => setTimeout(resolve, cfg.actionIntervalMs));
  }

  const endTime = new Date();
  const memoryEnd = process.memoryUsage();
  const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

  responseTimes.sort((a, b) => a - b);

  const metrics: LoadMetrics = {
    totalRequests: successfulRequests + failedRequests,
    successfulRequests,
    failedRequests,
    avgResponseTimeMs:
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0,
    p50ResponseTimeMs:
      responseTimes[Math.floor(responseTimes.length * 0.5)] || 0,
    p95ResponseTimeMs:
      responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
    p99ResponseTimeMs:
      responseTimes[Math.floor(responseTimes.length * 0.99)] || 0,
    maxResponseTimeMs: Math.max(...responseTimes) || 0,
    minResponseTimeMs: Math.min(...responseTimes) || 0,
    requestsPerSecond: (successfulRequests + failedRequests) / durationSeconds,
    wsMessagesReceived: 0,
    wsMessagesSent: 0,
    wsDisconnects: 0,
    memoryUsageStart: memoryStart,
    memoryUsageEnd: memoryEnd,
  };

  return {
    config: cfg,
    startTime,
    endTime,
    metrics,
    errors,
    summary: generateConcurrentGameSummary(metrics, errors, gameIds.length),
  };
}

function generateLoadTestSummary(
  metrics: LoadMetrics,
  errors: LoadError[],
): string {
  return `
# API Load Test Summary

## Requests
- Total: ${metrics.totalRequests}
- Successful: ${metrics.successfulRequests} (${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(1)}%)
- Failed: ${metrics.failedRequests}
- Requests/sec: ${metrics.requestsPerSecond.toFixed(2)}

## Response Times
- Average: ${metrics.avgResponseTimeMs.toFixed(2)}ms
- P50: ${metrics.p50ResponseTimeMs.toFixed(2)}ms
- P95: ${metrics.p95ResponseTimeMs.toFixed(2)}ms
- P99: ${metrics.p99ResponseTimeMs.toFixed(2)}ms
- Max: ${metrics.maxResponseTimeMs.toFixed(2)}ms
- Min: ${metrics.minResponseTimeMs.toFixed(2)}ms

## Errors
- Total errors: ${errors.length}
${errors
  .slice(0, 5)
  .map((e) => `- ${e.type}: ${e.message}`)
  .join("\n")}
${errors.length > 5 ? `- ... and ${errors.length - 5} more` : ""}
`;
}

function generateWebSocketLoadTestSummary(
  metrics: LoadMetrics,
  errors: LoadError[],
  totalConnections: number,
): string {
  return `
# WebSocket Load Test Summary

## Connections
- Attempted: ${totalConnections}
- Established: ${metrics.successfulRequests}
- Failed: ${metrics.failedRequests}

## Messages
- Sent: ${metrics.wsMessagesSent}
- Received: ${metrics.wsMessagesReceived}
- Disconnects: ${metrics.wsDisconnects}

## Errors
- Total errors: ${errors.length}
${errors
  .slice(0, 5)
  .map((e) => `- ${e.type}: ${e.message}`)
  .join("\n")}
`;
}

function generateConcurrentGameSummary(
  metrics: LoadMetrics,
  errors: LoadError[],
  gamesCreated: number,
): string {
  const memoryGrowth =
    metrics.memoryUsageEnd && metrics.memoryUsageStart
      ? (metrics.memoryUsageEnd.heapUsed - metrics.memoryUsageStart.heapUsed) /
        1024 /
        1024
      : 0;

  return `
# Concurrent Game Test Summary

## Games
- Created: ${gamesCreated}

## Actions
- Total: ${metrics.totalRequests}
- Successful: ${metrics.successfulRequests}
- Failed: ${metrics.failedRequests}

## Response Times
- Average: ${metrics.avgResponseTimeMs.toFixed(2)}ms
- P95: ${metrics.p95ResponseTimeMs.toFixed(2)}ms
- Max: ${metrics.maxResponseTimeMs.toFixed(2)}ms

## Memory
- Heap growth: ${memoryGrowth.toFixed(2)}MB

## Errors
${
  errors.length === 0
    ? "- No errors"
    : errors
        .slice(0, 10)
        .map((e) => `- ${e.message}`)
        .join("\n")
}
`;
}

// CLI runner
if (require.main === module) {
  const testType = process.argv[2] || "api";

  (async () => {
    let result: LoadTestResult;

    switch (testType) {
      case "ws":
      case "websocket":
        result = await runWebSocketLoadTest();
        break;
      case "games":
      case "concurrent":
        result = await runConcurrentGameTest();
        break;
      case "api":
      default:
        result = await runApiLoadTest();
        break;
    }

    console.log(result.summary);
    process.exit(result.errors.length > 0 ? 1 : 0);
  })();
}

export { generateLoadTestSummary };
