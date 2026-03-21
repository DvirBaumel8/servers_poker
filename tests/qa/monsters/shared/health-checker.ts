/**
 * Monster Army - Health Checker
 *
 * Centralized health check utilities for all monsters.
 * Reduces duplication of health check logic across monsters.
 */

import { getEnv } from "./env-config";

export interface HealthCheckResult {
  healthy: boolean;
  status?: number;
  responseTime?: number;
  error?: string;
}

export interface HealthCheckOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

const DEFAULT_OPTIONS: Required<HealthCheckOptions> = {
  timeout: 5000,
  retries: 0,
  retryDelay: 1000,
};

/**
 * Check if a service is healthy by hitting its health endpoint.
 */
export async function checkHealth(
  url: string,
  options: HealthCheckOptions = {},
): Promise<HealthCheckResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    return {
      healthy: response.ok,
      status: response.status,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    const errorMessage =
      error instanceof Error
        ? error.name === "AbortError"
          ? `Timeout after ${opts.timeout}ms`
          : error.message
        : String(error);

    return {
      healthy: false,
      responseTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Check health with retries.
 */
export async function checkHealthWithRetries(
  url: string,
  options: HealthCheckOptions = {},
): Promise<HealthCheckResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastResult: HealthCheckResult = { healthy: false };

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    lastResult = await checkHealth(url, { timeout: opts.timeout });

    if (lastResult.healthy) {
      return lastResult;
    }

    if (attempt < opts.retries) {
      await sleep(opts.retryDelay);
    }
  }

  return lastResult;
}

/**
 * Require a service to be healthy, throwing if not.
 * Use this at the start of monster setup().
 */
export async function requireHealthy(
  serviceName: string,
  healthUrl: string,
  options: HealthCheckOptions = {},
): Promise<void> {
  const result = await checkHealthWithRetries(healthUrl, options);

  if (!result.healthy) {
    throw new Error(
      `${serviceName} is not healthy at ${healthUrl}: ${result.error || `HTTP ${result.status}`}`,
    );
  }
}

/**
 * Check if the backend API is healthy.
 */
export async function checkBackendHealth(
  options: HealthCheckOptions = {},
): Promise<HealthCheckResult> {
  const env = getEnv();
  return checkHealth(`${env.apiBaseUrl}/health`, options);
}

/**
 * Require the backend API to be healthy.
 */
export async function requireBackendHealthy(
  options: HealthCheckOptions = {},
): Promise<void> {
  const env = getEnv();
  await requireHealthy("Backend API", `${env.apiBaseUrl}/health`, options);
}

/**
 * Check if the frontend is healthy.
 */
export async function checkFrontendHealth(
  options: HealthCheckOptions = {},
): Promise<HealthCheckResult> {
  const env = getEnv();
  return checkHealth(env.frontendUrl, options);
}

/**
 * Require the frontend to be healthy.
 */
export async function requireFrontendHealthy(
  options: HealthCheckOptions = {},
): Promise<void> {
  const env = getEnv();
  await requireHealthy("Frontend", env.frontendUrl, options);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
