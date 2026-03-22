/**
 * Monster Army - Environment Configuration
 *
 * Centralized environment configuration for all monsters.
 * Eliminates duplication of URL and credential configuration.
 */

export interface EnvConfig {
  apiBaseUrl: string;
  frontendUrl: string;
  wsUrl: string;
  adminEmail: string;
  adminPassword: string;
  userEmail: string;
  userPassword: string;
  nodeEnv: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

/**
 * Get environment configuration with sensible defaults for testing.
 */
export function getEnvConfig(): EnvConfig {
  const nodeEnv = process.env.NODE_ENV || "test";

  return {
    apiBaseUrl:
      process.env.API_BASE_URL ||
      process.env.API_URL ||
      "http://localhost:3000/api/v1",
    frontendUrl:
      process.env.FRONTEND_URL ||
      process.env.FRONTEND_BASE_URL ||
      "http://localhost:3001",
    wsUrl:
      process.env.WS_URL || process.env.WEBSOCKET_URL || "ws://localhost:3000",
    adminEmail: process.env.ADMIN_EMAIL || "admin@poker.io",
    adminPassword: process.env.ADMIN_PASSWORD || "TestPassword123!",
    userEmail: process.env.USER_EMAIL || "user@poker.io",
    userPassword: process.env.USER_PASSWORD || "TestPassword123!",
    nodeEnv,
    isProduction: nodeEnv === "production",
    isDevelopment: nodeEnv === "development",
    isTest: nodeEnv === "test",
  };
}

/**
 * Singleton instance of env config for convenience.
 */
let cachedConfig: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!cachedConfig) {
    cachedConfig = getEnvConfig();
  }
  return cachedConfig;
}

/**
 * Reset cached config (useful for testing).
 */
export function resetEnvCache(): void {
  cachedConfig = null;
}
