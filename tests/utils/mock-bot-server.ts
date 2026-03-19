import * as http from "http";

export interface BotAction {
  type: "fold" | "check" | "call" | "raise" | "all_in";
  amount?: number;
}

export interface MockBotConfig {
  port: number;
  strategy?: (payload: any) => BotAction;
  latencyMs?: number;
  failureRate?: number;
}

export class MockBotServer {
  private server: http.Server | null = null;
  private port: number;
  private strategy: (payload: any) => BotAction;
  private latencyMs: number;
  private failureRate: number;
  private requestCount = 0;
  private lastRequest: any = null;

  constructor(config: MockBotConfig) {
    this.port = config.port;
    this.strategy = config.strategy || this.defaultStrategy;
    this.latencyMs = config.latencyMs || 0;
    this.failureRate = config.failureRate || 0;
  }

  private defaultStrategy(payload: any): BotAction {
    if (payload.action?.canCheck) {
      return { type: "check" };
    }
    return { type: "call" };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        this.requestCount++;

        if (Math.random() < this.failureRate) {
          res.statusCode = 500;
          res.end("Simulated failure");
          return;
        }

        if (this.latencyMs > 0) {
          await this.sleep(this.latencyMs);
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });

          req.on("end", () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              this.lastRequest = payload;

              if (req.url === "/health") {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ status: "ok" }));
                return;
              }

              if (req.url === "/recovery") {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ acknowledged: true }));
                return;
              }

              const action = this.strategy(payload);
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(action));
            } catch (error) {
              res.statusCode = 500;
              res.end("Internal error");
            }
          });
      });

      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  getLastRequest(): any {
    return this.lastRequest;
  }

  resetStats(): void {
    this.requestCount = 0;
    this.lastRequest = null;
  }

  setStrategy(strategy: (payload: any) => BotAction): void {
    this.strategy = strategy;
  }

  getEndpoint(): string {
    return `http://localhost:${this.port}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createCallingBot(port: number): MockBotServer {
  return new MockBotServer({
    port,
    strategy: (payload) => {
      if (payload.action?.canCheck) {
        return { type: "check" };
      }
      return { type: "call" };
    },
  });
}

export function createFoldingBot(port: number): MockBotServer {
  return new MockBotServer({
    port,
    strategy: () => ({ type: "fold" }),
  });
}

export function createAggressiveBot(port: number): MockBotServer {
  return new MockBotServer({
    port,
    strategy: (payload) => {
      const minRaise = payload.action?.minRaise || 0;
      const maxRaise = payload.action?.maxRaise || 0;
      if (maxRaise > 0) {
        return { type: "raise", amount: Math.min(minRaise * 2, maxRaise) };
      }
      if (payload.action?.canCheck) {
        return { type: "check" };
      }
      return { type: "call" };
    },
  });
}

export function createSlowBot(port: number, latencyMs: number): MockBotServer {
  return new MockBotServer({
    port,
    latencyMs,
    strategy: (payload) => {
      if (payload.action?.canCheck) {
        return { type: "check" };
      }
      return { type: "call" };
    },
  });
}

export function createUnreliableBot(
  port: number,
  failureRate: number,
): MockBotServer {
  return new MockBotServer({
    port,
    failureRate,
    strategy: (payload) => {
      if (payload.action?.canCheck) {
        return { type: "check" };
      }
      return { type: "call" };
    },
  });
}
