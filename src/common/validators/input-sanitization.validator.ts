import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

const SQL_INJECTION_PATTERNS = [
  /['";]/,
  /--/,
  /\/\*/,
  /\*\//,
  /\bDROP\b/i,
  /\bDELETE\b/i,
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bSELECT\b/i,
  /\bUNION\b/i,
  /\bEXEC\b/i,
  /\bEXECUTE\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bTABLE\b/i,
  /\bDATABASE\b/i,
  /\bSCHEMA\b/i,
];

const XSS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<\s*img/i,
  /<\s*iframe/i,
  /<\s*object/i,
  /<\s*embed/i,
  /<\s*link/i,
  /<\s*style/i,
  /expression\s*\(/i,
  /url\s*\(/i,
];

@ValidatorConstraint({ name: "noSqlInjection", async: false })
export class NoSqlInjectionConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    if (typeof value !== "string") return true;
    return !SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
  }

  defaultMessage(): string {
    return "Input contains potentially dangerous SQL characters or keywords";
  }
}

@ValidatorConstraint({ name: "noXss", async: false })
export class NoXssConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    if (typeof value !== "string") return true;
    return !XSS_PATTERNS.some((pattern) => pattern.test(value));
  }

  defaultMessage(): string {
    return "Input contains potentially dangerous script or HTML content";
  }
}

@ValidatorConstraint({ name: "safeName", async: false })
export class SafeNameConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    if (typeof value !== "string") return true;
    const allPatterns = [...SQL_INJECTION_PATTERNS, ...XSS_PATTERNS];
    return !allPatterns.some((pattern) => pattern.test(value));
  }

  defaultMessage(): string {
    return "Name contains invalid or potentially dangerous characters";
  }
}

export function containsSqlInjection(value: string): boolean {
  return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsXss(value: string): boolean {
  return XSS_PATTERNS.some((pattern) => pattern.test(value));
}

export function containsDangerousInput(value: string): boolean {
  return containsSqlInjection(value) || containsXss(value);
}

export const DANGEROUS_INPUT_TEST_CASES = [
  "'; DROP TABLE users; --",
  "1; DROP TABLE tournaments; --",
  "'; DELETE FROM users WHERE '1'='1",
  "UNION SELECT * FROM passwords",
  "'; EXEC xp_cmdshell('dir'); --",
  "1' OR '1'='1",
  '"; INSERT INTO users VALUES (1, "hacker"); --',
  "<script>alert('xss')</script>",
  "javascript:alert('xss')",
  '<img src=x onerror="alert(1)">',
  '<iframe src="evil.com">',
  "onclick=alert(1)",
  "'; TRUNCATE TABLE sessions; --",
  "/* comment */ DROP DATABASE",
];
