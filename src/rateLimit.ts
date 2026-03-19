import { IncomingMessage, ServerResponse } from "http";

interface LimiterOptions {
  limit: number;
  windowMs: number;
  name?: string;
}

interface CheckResult {
  ok: boolean;
  remaining: number;
  error?: string;
  retryAfter?: number;
}

export function createLimiter({
  limit,
  windowMs,
  name = "limiter",
}: LimiterOptions) {
  const store = new Map<string, number[]>();

  const PRUNE_INTERVAL = windowMs * 2;
  setInterval(() => {
    const cutoff = Date.now() - PRUNE_INTERVAL;
    for (const [key, timestamps] of store.entries()) {
      if (!timestamps.length || timestamps[timestamps.length - 1] < cutoff) {
        store.delete(key);
      }
    }
  }, PRUNE_INTERVAL).unref();

  return {
    check(key: string): CheckResult {
      const now = Date.now();
      const windowStart = now - windowMs;

      if (!store.has(key)) store.set(key, []);
      const timestamps = store.get(key)!;

      while (timestamps.length && timestamps[0] < windowStart) {
        timestamps.shift();
      }

      const remaining = Math.max(0, limit - timestamps.length - 1);

      if (timestamps.length >= limit) {
        const retryAfterMs = timestamps[0] + windowMs - now;
        const retryAfterSec = Math.ceil(retryAfterMs / 1000);
        return {
          ok: false,
          remaining: 0,
          error: `Rate limit exceeded. Try again in ${retryAfterSec}s.`,
          retryAfter: retryAfterSec,
        };
      }

      timestamps.push(now);
      return { ok: true, remaining };
    },

    peek(key: string) {
      const now = Date.now();
      const windowStart = now - windowMs;
      const timestamps = (store.get(key) || []).filter((t) => t >= windowStart);
      return {
        count: timestamps.length,
        remaining: Math.max(0, limit - timestamps.length),
      };
    },

    reset(key: string) {
      store.delete(key);
    },

    name,
    limit,
    windowMs,
  };
}

export function getIp(req: IncomingMessage): string {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export function applyLimit(
  limiter: any,
  req: IncomingMessage,
  res: ServerResponse,
  key: string,
): boolean {
  const result = limiter.check(key);
  if (!result.ok) {
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Retry-After": String(result.retryAfter || 60),
    });
    res.end(JSON.stringify({ error: result.error }));
    return true;
  }
  return false;
}

export const limiters = {
  register: createLimiter({
    limit: 5,
    windowMs: 60 * 60 * 1000,
    name: "register",
  }),
  createBot: createLimiter({
    limit: 20,
    windowMs: 24 * 60 * 60 * 1000,
    name: "createBot",
  }),
  joinTable: createLimiter({
    limit: 10,
    windowMs: 60 * 1000,
    name: "joinTable",
  }),
  login: createLimiter({ limit: 10, windowMs: 15 * 60 * 1000, name: "login" }),
  global: createLimiter({ limit: 300, windowMs: 60 * 1000, name: "global" }),
};
