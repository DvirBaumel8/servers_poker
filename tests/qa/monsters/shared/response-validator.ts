/**
 * Monster Army - Response Validator
 *
 * Utilities for validating API response shapes.
 * Centralizes response validation logic across monsters.
 */

/**
 * Type definitions for response shape validation.
 */
export type ExpectedType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "null"
  | "undefined"
  | "any";

export interface ResponseShape {
  [field: string]: ExpectedType | ResponseShape;
}

export interface ValidationError {
  field: string;
  expected: string;
  actual: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Get the type of a value as a string.
 */
function getActualType(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Validate that a value matches an expected type.
 */
function validateType(value: unknown, expected: ExpectedType): boolean {
  if (expected === "any") return true;
  return getActualType(value) === expected;
}

/**
 * Validate response shape against expected structure.
 *
 * @example
 * const shape = {
 *   id: 'string',
 *   name: 'string',
 *   count: 'number',
 *   items: 'array',
 * };
 * const result = validateResponseShape(response, shape);
 * if (!result.valid) {
 *   console.log('Validation errors:', result.errors);
 * }
 */
export function validateResponseShape(
  data: unknown,
  shape: ResponseShape,
  prefix: string = "",
): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push({
      field: prefix || "root",
      expected: "object",
      actual: getActualType(data),
    });
    return { valid: false, errors };
  }

  const dataObj = data as Record<string, unknown>;

  for (const [field, expectedType] of Object.entries(shape)) {
    const fieldPath = prefix ? `${prefix}.${field}` : field;
    const value = dataObj[field];

    if (typeof expectedType === "object") {
      const nestedResult = validateResponseShape(
        value,
        expectedType,
        fieldPath,
      );
      errors.push(...nestedResult.errors);
    } else {
      if (!validateType(value, expectedType)) {
        errors.push({
          field: fieldPath,
          expected: expectedType,
          actual: getActualType(value),
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate that required fields are present.
 */
export function validateRequiredFields(
  data: unknown,
  requiredFields: string[],
): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push({
      field: "root",
      expected: "object with required fields",
      actual: getActualType(data),
    });
    return { valid: false, errors };
  }

  const dataObj = data as Record<string, unknown>;

  for (const field of requiredFields) {
    if (!(field in dataObj)) {
      errors.push({
        field,
        expected: "present",
        actual: "missing",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate array items against a shape.
 */
export function validateArrayItemsShape(
  data: unknown,
  itemShape: ResponseShape,
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!Array.isArray(data)) {
    errors.push({
      field: "root",
      expected: "array",
      actual: getActualType(data),
    });
    return { valid: false, errors };
  }

  data.forEach((item, index) => {
    const result = validateResponseShape(item, itemShape, `[${index}]`);
    errors.push(...result.errors);
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Common response shapes for poker platform.
 */
export const COMMON_SHAPES = {
  paginatedResponse: {
    data: "array",
    total: "number",
    limit: "number",
    offset: "number",
    hasMore: "boolean",
  } as ResponseShape,

  bot: {
    id: "string",
    name: "string",
    endpoint: "string",
    active: "boolean",
    user_id: "string",
    created_at: "string",
  } as ResponseShape,

  tournament: {
    id: "string",
    name: "string",
    status: "string",
    max_players: "number",
    buy_in: "number",
    starting_chips: "number",
    created_at: "string",
  } as ResponseShape,

  user: {
    id: "string",
    email: "string",
    name: "string",
    role: "string",
    active: "boolean",
    created_at: "string",
  } as ResponseShape,

  game: {
    id: "string",
    table_id: "string",
    status: "string",
    created_at: "string",
  } as ResponseShape,

  errorResponse: {
    statusCode: "number",
    message: "any",
    error: "string",
  } as ResponseShape,
};
