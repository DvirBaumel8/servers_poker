import { ConfigService } from "@nestjs/config";

/**
 * Parse a config value as a number with a default fallback.
 * Use this to reduce boilerplate when reading numeric config values.
 *
 * @example
 * this.timeoutMs = parseConfigNumber(this.configService, 'BOT_TIMEOUT_MS', 10000);
 * this.maxRetries = parseConfigNumber(this.configService, 'BOT_MAX_RETRIES', 1);
 */
export function parseConfigNumber(
  config: ConfigService,
  key: string,
  defaultValue: number,
): number {
  const value = config.get<string | number>(key);
  if (value === undefined || value === null) {
    return defaultValue;
  }
  const parsed = typeof value === "string" ? parseInt(value, 10) : value;
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse a config value as a boolean with a default fallback.
 */
export function parseConfigBoolean(
  config: ConfigService,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = config.get<string | boolean>(key);
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return value.toLowerCase() === "true" || value === "1";
}

/**
 * Parse a config value as a string with a default fallback.
 */
export function parseConfigString(
  config: ConfigService,
  key: string,
  defaultValue: string,
): string {
  const value = config.get<string>(key);
  return value ?? defaultValue;
}
