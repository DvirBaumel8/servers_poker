/**
 * Monster Army - Shared Types
 *
 * Core type definitions used across all monsters and the evolution system.
 * These types are designed for:
 * - Consistent finding structure across all monsters
 * - Persistence and historical tracking
 * - Trend analysis and regression detection
 * - CI integration with clear pass/fail semantics
 */

import { createHash } from "crypto";

// ============================================================================
// FINDING TYPES
// ============================================================================

export type MonsterType =
  | "api"
  | "visual"
  | "chaos"
  | "perf"
  | "guardian"
  | "invariant"
  | "contract"
  | "browser"
  | "browser-qa"
  | "css-lint"
  | "layout-lint"
  | "design-critic"
  | "code-quality"
  // Connectors (Layer 2)
  | "api-db"
  | "api-ws"
  | "ws-ui"
  | "auth-flow"
  // Flows (Layer 3)
  | "game-flow"
  | "tournament-flow"
  | "betting-flow"
  | "player-flow"
  | "simulation" // Live game simulation with invariant validation
  // E2E (Layer 4)
  | "e2e";

export type FindingCategory =
  | "BUG" // Definite bug, must fix
  | "REGRESSION" // Previously fixed, now broken again
  | "DEGRADATION" // Performance or quality got worse
  | "SECURITY" // Security vulnerability
  | "A11Y" // Accessibility issue
  | "CODE_QUALITY" // Code quality/maintainability issue
  | "BROWSER" // Browser-based UI issue
  | "VISUAL" // Visual/styling issue
  | "UX" // User experience issue
  | "CONCERN" // Potential issue, needs investigation
  | "OBSERVATION"; // Notable but not necessarily bad

export type Severity = "critical" | "high" | "medium" | "low";

export interface Location {
  file?: string;
  endpoint?: string;
  page?: string;
  component?: string;
  line?: number;
  column?: number;
  viewport?: string;
}

export interface Evidence {
  screenshot?: string;
  request?: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
    useAuth?: boolean;
  };
  response?: {
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
  };
  consoleErrors?: string[];
  domSnapshot?: string;
  metrics?: Record<string, number>;
  diff?: {
    expected: unknown;
    actual: unknown;
  };
  raw?: unknown;
  foundText?: string;
  missingText?: string;
  role?: string;
  uiErrors?: unknown[];
  errors?: unknown[];
  warnings?: unknown[];
  formattedErrors?: string;
  config?: unknown;
  contract?: unknown;
  useAuth?: boolean;
  actualResponse?: unknown;
}

export interface Finding {
  id: string;
  monster: MonsterType;
  category: FindingCategory;
  severity: Severity;

  // What was found
  title: string;
  description: string;
  evidence?: Evidence;

  // Context
  location: Location;

  // Reproducibility
  reproducible: boolean;
  reproductionSteps?: string[];

  // For tracking across runs
  fingerprint: string;
  firstSeen: Date;
  lastSeen: Date;
  occurrences: number;

  // Resolution tracking
  status: "open" | "fixed" | "wontfix" | "flaky";
  fixedInCommit?: string;
  fixedInRun?: string;

  // Tags for filtering
  tags: string[];
}

// ============================================================================
// RUN TYPES
// ============================================================================

export interface RunConfig {
  version: number;
  runId: string;
  startTime: Date;
  monsters: MonsterType[];
  triggeredBy: "ci" | "manual" | "scheduled";
  gitCommit?: string;
  gitBranch?: string;
  changedFiles?: string[];
}

export interface RunResult {
  runId: string;
  monster: MonsterType;
  startTime: Date;
  endTime: Date;
  duration: number;

  // Results
  passed: boolean;
  findings: Finding[];
  findingsSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };

  // Comparison to previous
  newFindings: string[]; // Finding IDs new this run
  regressions: string[]; // Previously fixed, now broken
  fixed: string[]; // Previously broken, now passing

  // Metadata
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;

  // Error if monster itself failed
  error?: string;
}

export interface AggregatedRunResult {
  runId: string;
  config: RunConfig;
  startTime: Date;
  endTime: Date;
  duration: number;

  // Per-monster results
  monsterResults: Map<MonsterType, RunResult>;

  // Aggregated findings
  allFindings: Finding[];
  findingsSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
    byMonster: Record<MonsterType, number>;
  };

  // Overall status
  passed: boolean; // No critical or high findings
  exitCode: number; // 0 = pass, 1 = fail, 2 = error

  // Comparison
  newFindings: Finding[];
  regressions: Finding[];
  fixed: Finding[];
}

// ============================================================================
// MEMORY & ANALYTICS TYPES
// ============================================================================

export interface TrendData {
  // Bug clustering
  bugsByArea: Map<string, number>;
  bugsByType: Map<string, number>;
  bugsByMonster: Map<MonsterType, number>;

  // Historical metrics
  regressionRate: number; // % of fixed bugs that returned
  mttr: number; // Mean time to resolution (hours)
  bugVelocity: number; // Bugs found per run (rolling avg)

  // Coverage
  coverageGaps: CoverageGap[];

  // Risk areas
  hotspots: Hotspot[];
}

export interface CoverageGap {
  type:
    | "untested_endpoint"
    | "untested_page"
    | "untested_component"
    | "untested_flow";
  location: string;
  discoveredAt: Date;
  suggestion: string;
  priority: "high" | "medium" | "low";
}

export interface Hotspot {
  area: string;
  bugCount: number;
  regressionCount: number;
  lastIssue: Date;
  trend: "increasing" | "stable" | "decreasing";
  recommendation: string;
}

// ============================================================================
// EVOLUTION AGENT TYPES
// ============================================================================

export interface EvolutionReport {
  runId: string;
  generatedAt: Date;

  // Summary
  summary: string;
  overallHealth: "healthy" | "concerning" | "critical";

  // Alerts
  alerts: Alert[];

  // Suggested improvements
  suggestedConfigChanges: ConfigChange[];
  newTestCases: NewTestCase[];

  // Human review needed
  humanReviewRequired: HumanReviewItem[];

  // Trends
  trendAnalysis: TrendData;
}

export interface Alert {
  level: "critical" | "warning" | "info";
  message: string;
  action: string;
  relatedFindings?: string[];
}

export interface ConfigChange {
  monster: MonsterType;
  changeType:
    | "add_test"
    | "modify_threshold"
    | "add_edge_case"
    | "remove_flaky"
    | "add_invariant";
  details: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

export interface NewTestCase {
  description: string;
  targetMonster: MonsterType;
  implementation: string;
  derivedFrom?: string; // Finding ID that inspired this
}

export interface HumanReviewItem {
  finding: Finding;
  reason: string;
  question: string;
}

// ============================================================================
// POKER-SPECIFIC TYPES
// ============================================================================

export interface InvariantCheck {
  name: string;
  description: string;
  category: "money" | "cards" | "actions" | "tournament" | "state";
  severity: Severity;
  check: (context: InvariantContext) => InvariantResult;
}

export interface InvariantContext {
  before?: GameStateSnapshot;
  after: GameStateSnapshot;
  action?: ActionRecord;
  tournament?: TournamentSnapshot;
}

export interface InvariantResult {
  passed: boolean;
  message?: string;
  evidence?: Evidence;
}

export interface GameStateSnapshot {
  gameId: string;
  timestamp: Date;
  handNumber?: number; // Current hand number (for simulation tracking)
  stage: string;
  pot: number;
  sidePots: number[];
  communityCards: string[];
  players: PlayerSnapshot[];
  currentBet: number;
  dealer: number;
  activePlayer?: number | string;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  position: number;
  chips: number;
  bet: number;
  cards?: string[];
  folded: boolean;
  allIn: boolean;
  disconnected: boolean;
}

export interface ActionRecord {
  playerId: string;
  action: string;
  amount?: number;
  timestamp: Date;
}

export interface TournamentSnapshot {
  id: string;
  status: string;
  playersRemaining: number;
  tablesActive: number;
  level: number;
  blinds: { small: number; big: number };
  prizePool: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a fingerprint for a finding.
 * Used to track the same issue across runs.
 */
export function generateFingerprint(
  monster: MonsterType,
  category: FindingCategory,
  location: Location,
  title: string,
): string {
  const parts = [
    monster,
    category,
    location.file || "",
    location.endpoint || "",
    location.page || "",
    location.component || "",
    location.line?.toString() || "",
    title.toLowerCase().replace(/\s+/g, "_").slice(0, 50),
  ];

  return createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Create a new finding with auto-generated ID and fingerprint.
 */
export function createFinding(
  params: Omit<
    Finding,
    "id" | "fingerprint" | "firstSeen" | "lastSeen" | "occurrences" | "status"
  >,
): Finding {
  const now = new Date();
  const fingerprint = generateFingerprint(
    params.monster,
    params.category,
    params.location,
    params.title,
  );

  return {
    ...params,
    id: `${params.monster}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fingerprint,
    firstSeen: now,
    lastSeen: now,
    occurrences: 1,
    status: "open",
  };
}

/**
 * Determine if a run should fail based on findings.
 */
export function shouldFailRun(findings: Finding[]): boolean {
  return findings.some(
    (f) => f.severity === "critical" || f.severity === "high",
  );
}

/**
 * Calculate severity counts.
 */
export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };
}

/**
 * Group findings by location for reporting.
 */
export function groupByLocation(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();

  for (const finding of findings) {
    const key =
      finding.location.file ||
      finding.location.endpoint ||
      finding.location.page ||
      "unknown";

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(finding);
  }

  return groups;
}

/**
 * Sort findings by severity (critical first).
 */
export function sortBySeverity(findings: Finding[]): Finding[] {
  const order: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * Normalize a card to string format.
 * Handles both string format ("A♥") and object format ({ rank: "A", suit: "♥" }).
 * Also handles invalid strings like "undefinedundefined" from serialization bugs.
 */
export function normalizeCardToString(
  card: string | { rank?: string; suit?: string } | null | undefined,
): string {
  if (!card) {
    return "??";
  }
  if (typeof card === "string") {
    // Handle invalid serialized strings
    if (
      card === "undefinedundefined" ||
      card.includes("undefined") ||
      card === "nullnull" ||
      card.includes("null") ||
      card === "??" ||
      card === "?"
    ) {
      return "??";
    }
    return card;
  }
  if (typeof card === "object") {
    const rank = card.rank;
    const suit = card.suit;
    // If either is missing/undefined, treat as hidden card
    if (!rank || !suit || rank === "undefined" || suit === "undefined") {
      return "??";
    }
    return `${rank}${suit}`;
  }
  return "??";
}

/**
 * Normalize an array of cards to string format.
 */
export function normalizeCardsToStrings(cards: unknown[]): string[] {
  if (!Array.isArray(cards)) {
    return [];
  }
  return cards.map((c) => normalizeCardToString(c as any));
}
