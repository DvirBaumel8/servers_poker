import { v4 as uuidv4 } from "uuid";

/**
 * Default CORS origins for development.
 * In production, set CORS_ORIGINS environment variable.
 */
export const DEFAULT_CORS_ORIGINS = [
  "http://localhost:3001",
  "http://localhost:3002",
];

export interface WorkerConfig {
  enableWorkerThreads: boolean;
  maxConcurrentGames: number;
  workerTimeout: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
}

export interface TournamentSchedulerConfig {
  enabled: boolean;
  checkIntervalMs: number;
  cronExpression: string;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
  botTimeoutMs: number;
  maxBodySize: number;
  workers: WorkerConfig;
  redis: RedisConfig;
  instanceId: string;
  gameOwnershipTtlMs: number;
  gameOwnershipRenewalMs: number;
  tournamentScheduler: TournamentSchedulerConfig;
  botRecoveryTimeoutMs: number;
  redisPubSubPollMs: number;
}

export const appConfig = (): AppConfig => ({
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "24h",
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : DEFAULT_CORS_ORIGINS,
  // Global rate limit: 300 requests per minute (5 req/sec)
  // Generous enough for power users with multiple tabs
  // Per-route limits on auth endpoints are stricter (see auth.controller.ts)
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "300", 10),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  botTimeoutMs: parseInt(process.env.BOT_TIMEOUT_MS || "10000", 10),
  maxBodySize: parseInt(process.env.MAX_BODY_SIZE || "65536", 10),
  workers: {
    enableWorkerThreads: process.env.ENABLE_WORKER_THREADS === "true",
    maxConcurrentGames: parseInt(process.env.MAX_CONCURRENT_GAMES || "100", 10),
    workerTimeout: parseInt(process.env.WORKER_TIMEOUT || "30000", 10),
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || "0", 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || "poker:",
  },
  instanceId: process.env.INSTANCE_ID || uuidv4(),
  gameOwnershipTtlMs: parseInt(
    process.env.GAME_OWNERSHIP_TTL_MS || "10000",
    10,
  ),
  gameOwnershipRenewalMs: parseInt(
    process.env.GAME_OWNERSHIP_RENEWAL_MS || "3000",
    10,
  ),
  tournamentScheduler: {
    enabled: process.env.TOURNAMENT_SCHEDULER_ENABLED !== "false",
    checkIntervalMs: parseInt(
      process.env.TOURNAMENT_SCHEDULER_INTERVAL_MS || "30000",
      10,
    ),
    cronExpression: process.env.TOURNAMENT_SCHEDULER_CRON || "*/30 * * * * *", // Every 30 seconds
  },
  botRecoveryTimeoutMs: parseInt(
    process.env.BOT_RECOVERY_TIMEOUT_MS || "5000",
    10,
  ),
  redisPubSubPollMs: parseInt(process.env.REDIS_PUBSUB_POLL_MS || "100", 10),
});
