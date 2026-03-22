/**
 * Browser Explorer Monster
 *
 * Exports for the browser monster module.
 */

export {
  BrowserMonster,
  BrowserMonsterConfig,
  DEFAULT_CONFIG,
} from "./browser-monster";
export { BrowserQAMonster } from "./browser-qa-monster";
export { CssLintMonster } from "./css-lint-monster";
export {
  BROWSER_SCENARIOS,
  BrowserScenario,
  ScenarioStep,
  UserRole,
  getScenariosByRole,
  getCriticalScenarios,
  getQuickScenarios,
  PAGES_BY_ROLE,
  FORBIDDEN_ELEMENTS,
  CRITICAL_CONSOLE_ERRORS,
  UI_ERROR_INDICATORS,
} from "./scenarios";
export {
  checkForErrors,
  checkConsoleMessages,
  checkUIForErrors,
  checkForReactErrorBoundary,
  isCriticalConsoleError,
  isUIErrorIndicator,
  hasImmediateCriticalError,
  formatErrorsForReport,
  ConsoleMessage,
  DetectedError,
  ErrorCheckResult,
} from "./error-detection";
export {
  checkButtonInteractivity,
  checkCssForAccessibilityIssues,
  AccessibilityIssue,
  BUTTON_STYLE_EXPECTATIONS,
  PAGE_BUTTON_CHECKS,
} from "./accessibility-checks";
