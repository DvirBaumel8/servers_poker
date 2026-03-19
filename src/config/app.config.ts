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
});
