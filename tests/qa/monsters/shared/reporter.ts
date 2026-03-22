/**
 * Monster Army - Reporter Constants
 *
 * Shared icons and formatting constants used by monsters and the CLI runner.
 *
 * Note: printConsoleReport, generateMarkdownReport, generateJsonReport,
 * and printEvolutionReport were removed when orchestrator.ts was eliminated.
 * The canonical runner is run-all.ts, and report generation lives in
 * issue-tracker.ts (generateReport) and run-all.ts (generateStatsReport).
 */

import { Severity, MonsterType } from "./types";

export const SEVERITY_ICONS: Record<Severity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
};

export const MONSTER_ICONS: Record<MonsterType, string> = {
  api: "🔌",
  visual: "👁️",
  chaos: "🌪️",
  perf: "⚡",
  guardian: "🛡️",
  invariant: "🔒",
  contract: "📜",
  browser: "🌐",
  "css-lint": "🎨",
  "layout-lint": "📐",
  "design-critic": "🎭",
  "code-quality": "🔍",
  "api-db": "🗄️",
  "api-ws": "📡",
  "ws-ui": "🖥️",
  "auth-flow": "🔐",
  "game-flow": "🎮",
  "tournament-flow": "🏆",
  "betting-flow": "💰",
  "player-flow": "👤",
  simulation: "🎰",
  "analyzer-pipeline": "🔬",
  e2e: "🌐",
  "browser-qa": "🧪",
  regression: "🔄",
  strategy: "♟️",
  explorer: "🧭",
  superhero: "🦸",
  "quick-check": "⚡",
  "fast-browser": "🏎️",
  "fast-quality": "📊",
  "product-quality": "🎯",
  "data-integrity": "🗄️",
  "data-analytics": "📈",
  "log-analyzer": "📋",
};
