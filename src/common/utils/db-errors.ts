import { BadRequestException, ConflictException } from "@nestjs/common";

/**
 * PostgreSQL error codes that we handle specially.
 */
export const PG_ERROR_CODES = {
  UNIQUE_VIOLATION: "23505",
  CHECK_VIOLATION: "23514",
  FOREIGN_KEY_VIOLATION: "23503",
  NOT_NULL_VIOLATION: "23502",
} as const;

/**
 * Configuration for mapping PostgreSQL errors to HTTP exceptions.
 */
export interface DbErrorMapping {
  [PG_ERROR_CODES.UNIQUE_VIOLATION]?: string;
  [PG_ERROR_CODES.CHECK_VIOLATION]?: string;
  [PG_ERROR_CODES.FOREIGN_KEY_VIOLATION]?: string;
  [PG_ERROR_CODES.NOT_NULL_VIOLATION]?: string;
  default?: string;
}

/**
 * Maps PostgreSQL database errors to appropriate HTTP exceptions.
 * Use this to provide user-friendly error messages for common DB constraint violations.
 *
 * @example
 * try {
 *   await this.repository.create(data);
 * } catch (error) {
 *   throw mapPostgresError(error, {
 *     '23505': 'A table with this name already exists',
 *     '23514': 'Invalid configuration values',
 *     default: 'Failed to create table',
 *   });
 * }
 */
export function mapPostgresError(
  error: unknown,
  mappings: DbErrorMapping,
): Error {
  const dbError = error as { code?: string; message?: string };
  const code = dbError?.code;

  if (code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
    return new ConflictException(
      mappings[PG_ERROR_CODES.UNIQUE_VIOLATION] || "Duplicate entry",
    );
  }

  if (code === PG_ERROR_CODES.CHECK_VIOLATION) {
    return new BadRequestException(
      mappings[PG_ERROR_CODES.CHECK_VIOLATION] ||
        "Validation constraint failed",
    );
  }

  if (code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    return new BadRequestException(
      mappings[PG_ERROR_CODES.FOREIGN_KEY_VIOLATION] ||
        "Referenced entity does not exist",
    );
  }

  if (code === PG_ERROR_CODES.NOT_NULL_VIOLATION) {
    return new BadRequestException(
      mappings[PG_ERROR_CODES.NOT_NULL_VIOLATION] ||
        "Required field is missing",
    );
  }

  return new BadRequestException(
    mappings.default ||
      (error instanceof Error ? error.message : "Database operation failed"),
  );
}

/**
 * Check if an error is a PostgreSQL error with a specific code.
 */
export function isPostgresError(error: unknown, code: string): boolean {
  const dbError = error as { code?: string };
  return dbError?.code === code;
}
