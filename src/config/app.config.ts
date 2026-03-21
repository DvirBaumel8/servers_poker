import { v4 as uuidv4 } from "uuid";

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
}

export const appConfig = (): AppConfig => ({
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "24h",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3001").split(","),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
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
});
