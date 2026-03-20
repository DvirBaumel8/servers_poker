import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import * as http from "http";
import * as https from "https";
import { HmacSigningService } from "../common/security";

export interface BotCallResult {
  success: boolean;
  response?: any;
  error?: string;
  latencyMs: number;
  attempt: number;
  retried: boolean;
}

export interface BotHealthStatus {
  botId: string;
  endpoint: string;
  healthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  averageLatencyMs: number;
  circuitOpen: boolean;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  halfOpenAt: number;
}

interface LatencyWindow {
  samples: number[];
  sum: number;
}

@Injectable()
export class BotCallerService implements OnModuleInit {
  private readonly logger = new Logger(BotCallerService.name);

  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly circuitBreakerThreshold: number;
  private readonly circuitBreakerResetMs: number;
  private readonly maxResponseBytes: number;

  private readonly circuitBreakers = new Map<string, CircuitBreakerState>();
  private readonly latencyWindows = new Map<string, LatencyWindow>();
  private readonly healthStatuses = new Map<string, BotHealthStatus>();

  private httpAgent: http.Agent;
  private httpsAgent: https.Agent;

  private readonly enableHmacSigning: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly hmacSigningService: HmacSigningService,
  ) {
    const parseNum = (
      val: string | number | undefined,
      defaultVal: number,
    ): number => {
      if (val === undefined) return defaultVal;
      const parsed = typeof val === "string" ? parseInt(val, 10) : val;
      return isNaN(parsed) ? defaultVal : parsed;
    };

    this.timeoutMs = parseNum(this.configService.get("BOT_TIMEOUT_MS"), 10000);
    this.maxRetries = parseNum(this.configService.get("BOT_MAX_RETRIES"), 1);
    this.retryDelayMs = parseNum(
      this.configService.get("BOT_RETRY_DELAY_MS"),
      500,
    );
    this.circuitBreakerThreshold = parseNum(
      this.configService.get("BOT_CIRCUIT_BREAKER_THRESHOLD"),
      5,
    );
    this.circuitBreakerResetMs = parseNum(
      this.configService.get("BOT_CIRCUIT_BREAKER_RESET_MS"),
      30000,
    );
    this.maxResponseBytes = 65536;
    this.enableHmacSigning = this.configService.get<boolean>(
      "ENABLE_BOT_HMAC_SIGNING",
      false,
    );

    this.httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 100,
      maxFreeSockets: 20,
      timeout: this.timeoutMs,
    });

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 100,
      maxFreeSockets: 20,
      timeout: this.timeoutMs,
    });
  }

  onModuleInit() {
    this.logger.log(
      `BotCallerService initialized with Keep-Alive agents (timeout: ${this.timeoutMs}ms)`,
    );
  }

  getAgentStats(): { http: http.Agent; https: https.Agent } {
    return { http: this.httpAgent, https: this.httpsAgent };
  }

  async callBot(
    botId: string,
    endpoint: string,
    payload: any,
    secretKey?: string,
  ): Promise<BotCallResult> {
    const startTime = Date.now();

    if (this.isCircuitOpen(botId)) {
      this.logger.warn(`Circuit breaker open for bot ${botId}`);
      return {
        success: false,
        error: "Circuit breaker open - bot temporarily unavailable",
        latencyMs: 0,
        attempt: 0,
        retried: false,
      };
    }

    let lastError: string | undefined;
    let attempt = 0;

    for (attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      const attemptStart = Date.now();

      try {
        const response = await this.makeRequest(endpoint, payload, secretKey);
        const latencyMs = Date.now() - attemptStart;

        this.recordSuccess(botId, latencyMs);

        return {
          success: true,
          response,
          latencyMs,
          attempt,
          retried: attempt > 1,
        };
      } catch (error: any) {
        lastError = error.message;

        this.logger.warn(
          `Bot ${botId} call failed (attempt ${attempt}): ${error.message}`,
        );

        if (!this.isRetryable(error) || attempt > this.maxRetries) {
          this.recordFailure(botId);
          break;
        }

        await this.sleep(this.retryDelayMs * attempt);
      }
    }

    const totalLatencyMs = Date.now() - startTime;

    this.eventEmitter.emit("bot.callFailed", {
      botId,
      endpoint,
      error: lastError,
      attempts: attempt,
      latencyMs: totalLatencyMs,
    });

    return {
      success: false,
      error: lastError,
      latencyMs: totalLatencyMs,
      attempt,
      retried: attempt > 1,
    };
  }

  async healthCheck(botId: string, endpoint: string): Promise<boolean> {
    const healthEndpoint = endpoint.replace(/\/action$/, "/health");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.min(this.timeoutMs, 5000),
      );

      const response = await fetch(healthEndpoint, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const healthy = response.ok;
      this.updateHealthStatus(botId, endpoint, healthy);

      return healthy;
    } catch (error) {
      this.updateHealthStatus(botId, endpoint, false);
      return false;
    }
  }

  async preGameHealthCheck(
    bots: Array<{ id: string; endpoint: string }>,
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    const checks = bots.map(async (bot) => {
      const healthy = await this.healthCheck(bot.id, bot.endpoint);
      results.set(bot.id, healthy);
      return { id: bot.id, healthy };
    });

    const allResults = await Promise.all(checks);

    const unhealthyCount = allResults.filter((r) => !r.healthy).length;
    if (unhealthyCount > 0) {
      this.logger.warn(
        `Pre-game health check: ${unhealthyCount}/${bots.length} bots unhealthy`,
      );
    }

    return results;
  }

  getHealthStatus(botId: string): BotHealthStatus | undefined {
    return this.healthStatuses.get(botId);
  }

  getAllHealthStatuses(): BotHealthStatus[] {
    return Array.from(this.healthStatuses.values());
  }

  getAverageLatency(botId: string): number {
    const window = this.latencyWindows.get(botId);
    if (!window || window.samples.length === 0) return 0;
    return window.sum / window.samples.length;
  }

  resetCircuitBreaker(botId: string): void {
    this.circuitBreakers.delete(botId);
    this.logger.log(`Circuit breaker reset for bot ${botId}`);
  }

  private async makeRequest(
    endpoint: string,
    payload: any,
    secretKey?: string,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint);
      const isHttps = url.protocol === "https:";
      const agent = isHttps ? this.httpsAgent : this.httpAgent;
      const requestModule = isHttps ? https : http;

      const body = JSON.stringify(payload);
      let responseData = "";
      let responseSize = 0;
      let req: http.ClientRequest | null = null;

      // Build headers with optional HMAC signing
      const headers: Record<string, string | number> = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "PokerEngine/1.0",
        Connection: "keep-alive",
      };

      // Add HMAC signature headers if enabled and secret key provided
      if (this.enableHmacSigning && secretKey) {
        const signedHeaders = this.hmacSigningService.generateSignedHeaders(
          payload,
          secretKey,
        );
        Object.assign(headers, signedHeaders);
      }

      const timeoutId = setTimeout(() => {
        if (req) {
          req.destroy();
        }
        reject(new Error(`Timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      req = requestModule.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: "POST",
          agent,
          headers,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            clearTimeout(timeoutId);
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            res.resume();
            return;
          }

          res.on("data", (chunk: Buffer) => {
            responseSize += chunk.length;
            if (responseSize > this.maxResponseBytes) {
              clearTimeout(timeoutId);
              res.destroy();
              reject(new Error("Response too large"));
              return;
            }
            responseData += chunk.toString();
          });

          res.on("end", () => {
            clearTimeout(timeoutId);
            try {
              resolve(JSON.parse(responseData));
            } catch {
              reject(new Error("Invalid JSON response"));
            }
          });

          res.on("error", (err) => {
            clearTimeout(timeoutId);
            reject(err);
          });
        },
      );

      req.on("error", (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });

      req.write(body);
      req.end();
    });
  }

  private isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();

    const nonRetryable = [
      "invalid json",
      "response too large",
      "circuit breaker",
    ];

    if (nonRetryable.some((msg) => message.includes(msg))) {
      return false;
    }

    const retryable = [
      "timeout",
      "econnreset",
      "econnrefused",
      "etimedout",
      "socket hang up",
      "network",
      "fetch failed",
      "http 502",
      "http 503",
      "http 504",
    ];

    return retryable.some((msg) => message.includes(msg));
  }

  private isCircuitOpen(botId: string): boolean {
    const state = this.circuitBreakers.get(botId);
    if (!state) return false;

    if (!state.isOpen) return false;

    const now = Date.now();
    if (now >= state.halfOpenAt) {
      state.isOpen = false;
      this.logger.log(`Circuit breaker half-open for bot ${botId}`);
      return false;
    }

    return true;
  }

  private recordSuccess(botId: string, latencyMs: number): void {
    const state = this.circuitBreakers.get(botId);
    if (state) {
      state.failures = 0;
      state.isOpen = false;
    }

    this.recordLatency(botId, latencyMs);

    const status = this.healthStatuses.get(botId);
    if (status) {
      status.healthy = true;
      status.consecutiveFailures = 0;
      status.lastCheck = new Date();
      status.circuitOpen = false;
    }
  }

  private recordFailure(botId: string): void {
    let state = this.circuitBreakers.get(botId);
    if (!state) {
      state = {
        failures: 0,
        lastFailure: 0,
        isOpen: false,
        halfOpenAt: 0,
      };
      this.circuitBreakers.set(botId, state);
    }

    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= this.circuitBreakerThreshold) {
      state.isOpen = true;
      state.halfOpenAt = Date.now() + this.circuitBreakerResetMs;
      this.logger.warn(
        `Circuit breaker opened for bot ${botId} after ${state.failures} failures`,
      );

      this.eventEmitter.emit("bot.circuitOpened", {
        botId,
        failures: state.failures,
        resetAt: new Date(state.halfOpenAt),
      });
    }

    const status = this.healthStatuses.get(botId);
    if (status) {
      status.healthy = false;
      status.consecutiveFailures++;
      status.lastCheck = new Date();
      status.circuitOpen = state.isOpen;
    }
  }

  private recordLatency(botId: string, latencyMs: number): void {
    let window = this.latencyWindows.get(botId);
    if (!window) {
      window = { samples: [], sum: 0 };
      this.latencyWindows.set(botId, window);
    }

    const maxSamples = 100;
    if (window.samples.length >= maxSamples) {
      const removed = window.samples.shift()!;
      window.sum -= removed;
    }

    window.samples.push(latencyMs);
    window.sum += latencyMs;

    const status = this.healthStatuses.get(botId);
    if (status) {
      status.averageLatencyMs = window.sum / window.samples.length;
    }
  }

  private updateHealthStatus(
    botId: string,
    endpoint: string,
    healthy: boolean,
  ): void {
    let status = this.healthStatuses.get(botId);
    if (!status) {
      status = {
        botId,
        endpoint,
        healthy,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        averageLatencyMs: 0,
        circuitOpen: false,
      };
      this.healthStatuses.set(botId, status);
    }

    status.healthy = healthy;
    status.lastCheck = new Date();

    if (healthy) {
      status.consecutiveFailures = 0;
    } else {
      status.consecutiveFailures++;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
