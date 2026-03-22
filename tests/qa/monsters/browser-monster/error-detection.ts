/**
 * Error Detection Module
 *
 * Comprehensive error detection for the Browser Monster.
 * Detects errors from multiple sources:
 * - JavaScript console errors
 * - UI error indicators (toasts, banners, error messages)
 * - Network failures
 * - React error boundaries
 */

import { CRITICAL_CONSOLE_ERRORS, UI_ERROR_INDICATORS } from "./scenarios";

export interface ConsoleMessage {
  type: "log" | "warn" | "error" | "info" | "debug";
  text: string;
  url?: string;
  lineNumber?: number;
  timestamp?: number;
}

export interface DetectedError {
  source: "console" | "ui" | "network" | "react-boundary";
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  details?: {
    url?: string;
    lineNumber?: number;
    element?: string;
    stackTrace?: string;
  };
}

export interface ErrorCheckResult {
  hasErrors: boolean;
  errors: DetectedError[];
  warnings: DetectedError[];
  summary: string;
}

/**
 * Check console messages for errors
 */
export function checkConsoleMessages(
  messages: ConsoleMessage[],
): DetectedError[] {
  const errors: DetectedError[] = [];

  for (const msg of messages) {
    if (msg.type !== "error") continue;

    const severity = getConsoleSeverity(msg.text);

    errors.push({
      source: "console",
      severity,
      message: msg.text,
      details: {
        url: msg.url,
        lineNumber: msg.lineNumber,
      },
    });
  }

  return errors;
}

/**
 * Determine severity of console error based on patterns
 */
function getConsoleSeverity(
  text: string,
): "critical" | "high" | "medium" | "low" {
  // Critical: JavaScript runtime errors
  const criticalPatterns = [
    /is not a function/i,
    /is not defined/i,
    /cannot read propert/i,
    /undefined is not/i,
    /null is not/i,
    /typeerror/i,
    /referenceerror/i,
    /syntaxerror/i,
  ];

  for (const pattern of criticalPatterns) {
    if (pattern.test(text)) {
      return "critical";
    }
  }

  // High: Network and API errors
  const highPatterns = [
    /failed to fetch/i,
    /network error/i,
    /cors/i,
    /401/,
    /403/,
    /500/,
  ];

  for (const pattern of highPatterns) {
    if (pattern.test(text)) {
      return "high";
    }
  }

  // Medium: Warnings promoted to errors
  const mediumPatterns = [/warning/i, /deprecated/i];

  for (const pattern of mediumPatterns) {
    if (pattern.test(text)) {
      return "medium";
    }
  }

  return "high"; // Default for unrecognized errors
}

/**
 * Check UI snapshot for error indicators
 */
export function checkUIForErrors(snapshotOrHtml: string): DetectedError[] {
  const errors: DetectedError[] = [];
  const text = snapshotOrHtml.toLowerCase();

  // Check for UI error patterns
  const uiErrorPatterns: Array<{
    pattern: RegExp;
    severity: "critical" | "high" | "medium";
    label: string;
  }> = [
    // Critical: Application crashes
    {
      pattern: /something went wrong/i,
      severity: "critical",
      label: "React Error Boundary",
    },
    {
      pattern: /error boundary/i,
      severity: "critical",
      label: "React Error Boundary",
    },
    {
      pattern: /application error/i,
      severity: "critical",
      label: "Application Error",
    },

    // Critical: JS errors visible in UI
    {
      pattern: /is not a function/i,
      severity: "critical",
      label: "JS TypeError in UI",
    },
    {
      pattern: /typeerror/i,
      severity: "critical",
      label: "JS TypeError in UI",
    },
    {
      pattern: /referenceerror/i,
      severity: "critical",
      label: "JS ReferenceError in UI",
    },

    // High: Auth/API errors shown to user
    {
      pattern: /please sign in to continue/i,
      severity: "high",
      label: "Unexpected Auth Error",
    },
    {
      pattern: /could not be refreshed/i,
      severity: "high",
      label: "Data Refresh Error",
    },
    { pattern: /failed to load/i, severity: "high", label: "Load Error" },
    { pattern: /network error/i, severity: "high", label: "Network Error" },
    { pattern: /server error/i, severity: "high", label: "Server Error" },

    // Medium: Warning states
    { pattern: /error:/i, severity: "medium", label: "Generic Error Message" },
    { pattern: /alert-danger/i, severity: "medium", label: "Error Alert" },
    { pattern: /alert-error/i, severity: "medium", label: "Error Alert" },
    { pattern: /bg-red-/i, severity: "medium", label: "Red Error Element" },
    { pattern: /text-red-/i, severity: "medium", label: "Red Error Text" },
  ];

  for (const { pattern, severity, label } of uiErrorPatterns) {
    const match = text.match(pattern);
    if (match) {
      errors.push({
        source: "ui",
        severity,
        message: `${label}: ${match[0]}`,
        details: {
          element: extractContext(snapshotOrHtml, match.index || 0),
        },
      });
    }
  }

  // Check for stuck loading indicators (potential issue if they persist)
  const loadingPatterns = [
    /loading\.\.\./i,
    /loading player data/i,
    /please wait/i,
  ];

  for (const pattern of loadingPatterns) {
    if (pattern.test(text)) {
      errors.push({
        source: "ui",
        severity: "medium",
        message: `Potential stuck loading: ${text.match(pattern)?.[0]}`,
      });
    }
  }

  return errors;
}

/**
 * Extract context around a match for better error reporting
 */
function extractContext(
  text: string,
  index: number,
  contextLength = 50,
): string {
  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + contextLength);

  let context = text.slice(start, end);
  if (start > 0) context = "..." + context;
  if (end < text.length) context = context + "...";

  return context.replace(/\s+/g, " ").trim();
}

/**
 * Check for React Error Boundary markers
 */
export function checkForReactErrorBoundary(html: string): DetectedError | null {
  const errorBoundaryPatterns = [
    /<[^>]*error-?boundary[^>]*>/i,
    /Something went wrong/i,
    /componentStack/i,
  ];

  for (const pattern of errorBoundaryPatterns) {
    if (pattern.test(html)) {
      return {
        source: "react-boundary",
        severity: "critical",
        message: "React Error Boundary triggered",
        details: {
          element: html.slice(0, 200),
        },
      };
    }
  }

  return null;
}

/**
 * Comprehensive error check combining all sources
 */
export function checkForErrors(
  consoleMessages: ConsoleMessage[],
  uiSnapshot: string,
): ErrorCheckResult {
  const allErrors: DetectedError[] = [];
  const allWarnings: DetectedError[] = [];

  // Check console errors
  const consoleErrors = checkConsoleMessages(consoleMessages);
  for (const error of consoleErrors) {
    if (error.severity === "low" || error.severity === "medium") {
      allWarnings.push(error);
    } else {
      allErrors.push(error);
    }
  }

  // Check UI errors
  const uiErrors = checkUIForErrors(uiSnapshot);
  for (const error of uiErrors) {
    if (error.severity === "low" || error.severity === "medium") {
      allWarnings.push(error);
    } else {
      allErrors.push(error);
    }
  }

  // Check for React Error Boundary
  const reactError = checkForReactErrorBoundary(uiSnapshot);
  if (reactError) {
    allErrors.push(reactError);
  }

  // Build summary
  const summary = buildSummary(allErrors, allWarnings);

  return {
    hasErrors: allErrors.length > 0,
    errors: allErrors,
    warnings: allWarnings,
    summary,
  };
}

function buildSummary(
  errors: DetectedError[],
  warnings: DetectedError[],
): string {
  if (errors.length === 0 && warnings.length === 0) {
    return "No errors detected";
  }

  const parts: string[] = [];

  if (errors.length > 0) {
    const critical = errors.filter((e) => e.severity === "critical").length;
    const high = errors.filter((e) => e.severity === "high").length;
    parts.push(
      `${errors.length} error(s) (${critical} critical, ${high} high)`,
    );
  }

  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning(s)`);
  }

  return parts.join(", ");
}

/**
 * Quick check for immediate critical errors
 * Use this for fast checks during navigation
 */
export function hasImmediateCriticalError(text: string): boolean {
  const immediatePatterns = [
    /is not a function/i,
    /cannot read propert/i,
    /typeerror/i,
    /referenceerror/i,
    /something went wrong/i,
  ];

  return immediatePatterns.some((p) => p.test(text));
}

/**
 * Check if a console message matches critical error patterns
 * Returns true if it's a critical bug that needs immediate attention
 */
export function isCriticalConsoleError(message: string): boolean {
  return CRITICAL_CONSOLE_ERRORS.some((pattern) => pattern.test(message));
}

/**
 * Check if UI text matches error indicator patterns
 */
export function isUIErrorIndicator(text: string): boolean {
  return UI_ERROR_INDICATORS.some((indicator) =>
    text.toLowerCase().includes(indicator.toLowerCase()),
  );
}

/**
 * Format errors for logging/reporting
 */
export function formatErrorsForReport(errors: DetectedError[]): string {
  if (errors.length === 0) {
    return "No errors";
  }

  return errors
    .map((e) => {
      const icon =
        e.severity === "critical"
          ? "🔴"
          : e.severity === "high"
            ? "🟠"
            : e.severity === "medium"
              ? "🟡"
              : "🔵";

      return `${icon} [${e.source.toUpperCase()}] ${e.message}`;
    })
    .join("\n");
}
