import { Logger } from "@nestjs/common";

/**
 * Context for structured logging of operation errors.
 */
export interface OperationContext {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Logs an operation error with consistent formatting.
 * Use this for try/catch blocks to maintain consistent error logging.
 *
 * @example
 * try {
 *   await this.saveToRedis(state);
 * } catch (error) {
 *   logOperationError(this.logger, 'save game state to Redis', error, { gameId });
 * }
 */
export function logOperationError(
  logger: Logger,
  operation: string,
  error: unknown,
  context?: OperationContext,
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const contextStr = context
    ? ` [${Object.entries(context)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}]`
    : "";

  logger.error(`Failed to ${operation}${contextStr}: ${errorMessage}`, stack);
}

/**
 * Logs a warning with consistent formatting.
 */
export function logOperationWarning(
  logger: Logger,
  operation: string,
  reason: string,
  context?: OperationContext,
): void {
  const contextStr = context
    ? ` [${Object.entries(context)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}]`
    : "";

  logger.warn(`${operation}${contextStr}: ${reason}`);
}
