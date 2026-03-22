/**
 * Bot Strategy Type Definitions
 *
 * Core types for the UI Bot Builder feature. A BotStrategy is a JSON document
 * that fully describes how an internal bot makes decisions. It supports three
 * tiers of complexity:
 *
 * - Quick (Tier 1): Personality sliders only
 * - Strategy (Tier 2): Personality + rules + range chart
 * - Pro (Tier 3): Everything + per-position overrides
 *
 * The strategy is evaluated in this order (first match wins):
 *   Position overrides > Range chart > Rules > Personality fallback
 */

// ============================================================================
// CARD & POSITION TYPES
// ============================================================================

export const RANKS = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
] as const;

export type Rank = (typeof RANKS)[number];

export const POSITIONS = [
  "BTN",
  "SB",
  "BB",
  "UTG",
  "UTG+1",
  "MP",
  "MP+1",
  "HJ",
  "CO",
] as const;

export type Position = (typeof POSITIONS)[number];

export const STREETS = ["preflop", "flop", "turn", "river"] as const;

export type Street = (typeof STREETS)[number];

// ============================================================================
// PERSONALITY (Tier 1 - always present)
// ============================================================================

export interface Personality {
  /** 0-100: tendency to bet/raise vs check/call */
  aggression: number;
  /** 0-100: how often to bet with weak hands when conditions allow */
  bluffFrequency: number;
  /** 0-100: willingness to risk large portions of stack */
  riskTolerance: number;
  /** 0-100: how selective with starting hands (higher = fewer hands) */
  tightness: number;
}

export const PERSONALITY_FIELDS = [
  "aggression",
  "bluffFrequency",
  "riskTolerance",
  "tightness",
] as const;

export type PersonalityField = (typeof PERSONALITY_FIELDS)[number];

// ============================================================================
// CONDITIONS (used in rules)
// ============================================================================

export type ConditionCategory =
  | "hand"
  | "board"
  | "opponent"
  | "position"
  | "stack"
  | "pot";

export type ConditionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "between";

export type HandStrength =
  | "high_card"
  | "pair"
  | "two_pair"
  | "trips"
  | "straight"
  | "flush"
  | "full_house"
  | "quads"
  | "straight_flush"
  | "royal_flush";

export type PairType =
  | "overpair"
  | "top_pair"
  | "middle_pair"
  | "low_pair"
  | "pocket_pair";

export type HoleCardRank = "premium" | "strong" | "playable" | "weak";

export type BoardTexture = "dry" | "wet" | "monotone" | "paired";

export type ConditionValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | [number, number];

export interface Condition {
  category: ConditionCategory;
  field: string;
  operator: ConditionOperator;
  value: ConditionValue;
}

/**
 * Registry of all available condition fields.
 * The UI uses this to populate dropdowns; the engine uses it for validation.
 */
export interface ConditionFieldDef {
  category: ConditionCategory;
  field: string;
  type: "enum" | "number" | "boolean";
  label: string;
  description: string;
  enumValues?: string[];
  min?: number;
  max?: number;
  /** Tier required to access this field */
  tier: "quick" | "strategy" | "pro";
  /** Which streets this field is available on (empty = all) */
  streets?: Street[];
}

export const CONDITION_FIELDS: ConditionFieldDef[] = [
  // Hand conditions
  {
    category: "hand",
    field: "handStrength",
    type: "enum",
    label: "Hand Strength",
    description: "Current best hand ranking",
    enumValues: [
      "high_card",
      "pair",
      "two_pair",
      "trips",
      "straight",
      "flush",
      "full_house",
      "quads",
      "straight_flush",
      "royal_flush",
    ],
    tier: "strategy",
  },
  {
    category: "hand",
    field: "pairType",
    type: "enum",
    label: "Pair Type",
    description: "Type of pair relative to the board",
    enumValues: [
      "overpair",
      "top_pair",
      "middle_pair",
      "low_pair",
      "pocket_pair",
    ],
    tier: "strategy",
    streets: ["flop", "turn", "river"],
  },
  {
    category: "hand",
    field: "hasFlushDraw",
    type: "boolean",
    label: "Has Flush Draw",
    description: "Holding 4 cards to a flush",
    tier: "strategy",
    streets: ["flop", "turn"],
  },
  {
    category: "hand",
    field: "hasStraightDraw",
    type: "boolean",
    label: "Has Straight Draw",
    description: "Holding 4 cards to a straight (open-ended)",
    tier: "strategy",
    streets: ["flop", "turn"],
  },
  {
    category: "hand",
    field: "holeCardRank",
    type: "enum",
    label: "Hole Card Rank",
    description: "Classification of starting hand strength",
    enumValues: ["premium", "strong", "playable", "weak"],
    tier: "strategy",
    streets: ["preflop"],
  },

  // Board conditions
  {
    category: "board",
    field: "communityCardCount",
    type: "number",
    label: "Community Cards",
    description: "Number of community cards dealt",
    min: 0,
    max: 5,
    tier: "strategy",
  },
  {
    category: "board",
    field: "boardTexture",
    type: "enum",
    label: "Board Texture",
    description: "Overall board character",
    enumValues: ["dry", "wet", "monotone", "paired"],
    tier: "pro",
    streets: ["flop", "turn", "river"],
  },

  // Opponent conditions
  {
    category: "opponent",
    field: "facingBet",
    type: "boolean",
    label: "Facing a Bet",
    description: "There is a bet to call",
    tier: "strategy",
  },
  {
    category: "opponent",
    field: "facingRaise",
    type: "boolean",
    label: "Facing a Raise",
    description: "Someone raised before you",
    tier: "strategy",
  },
  {
    category: "opponent",
    field: "facingAllIn",
    type: "boolean",
    label: "Facing All-In",
    description: "Someone went all-in",
    tier: "strategy",
  },
  {
    category: "opponent",
    field: "activePlayerCount",
    type: "number",
    label: "Active Players",
    description: "Players still in the hand",
    min: 2,
    max: 10,
    tier: "strategy",
  },
  {
    category: "opponent",
    field: "playersToAct",
    type: "number",
    label: "Players to Act",
    description: "Players yet to act after you",
    min: 0,
    max: 9,
    tier: "pro",
  },

  // Position conditions
  {
    category: "position",
    field: "myPosition",
    type: "enum",
    label: "My Position",
    description: "Your seat position at the table",
    enumValues: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "HJ", "CO"],
    tier: "strategy",
  },
  {
    category: "position",
    field: "isInPosition",
    type: "boolean",
    label: "In Position",
    description: "Acting last post-flop",
    tier: "pro",
    streets: ["flop", "turn", "river"],
  },

  // Stack conditions
  {
    category: "stack",
    field: "myStackBB",
    type: "number",
    label: "My Stack (BB)",
    description: "Your stack size in big blinds",
    min: 0,
    tier: "strategy",
  },
  {
    category: "stack",
    field: "effectiveStackBB",
    type: "number",
    label: "Effective Stack (BB)",
    description: "Effective stack size vs deepest opponent",
    min: 0,
    tier: "pro",
  },

  // Pot conditions
  {
    category: "pot",
    field: "potSizeBB",
    type: "number",
    label: "Pot Size (BB)",
    description: "Current pot size in big blinds",
    min: 0,
    tier: "strategy",
  },
  {
    category: "pot",
    field: "potOdds",
    type: "number",
    label: "Pot Odds",
    description: "Ratio of call amount to pot (0-1)",
    min: 0,
    max: 1,
    tier: "pro",
  },
];

// ============================================================================
// ACTIONS
// ============================================================================

export type ActionType = "fold" | "check" | "call" | "raise" | "all_in";

export type SizingMode =
  | "pot_fraction"
  | "bb_multiple"
  | "previous_bet_multiple"
  | "fixed";

export interface SizingDefinition {
  mode: SizingMode;
  value: number;
}

export interface ActionDefinition {
  type: ActionType;
  /** Required for raise; defines how much to raise */
  sizing?: SizingDefinition;
}

// ============================================================================
// RULES (Tier 2+)
// ============================================================================

export interface Rule {
  id: string;
  /** Lower = higher priority. Rules evaluated in priority order. */
  priority: number;
  /** All conditions must be true (AND logic) for the rule to fire */
  conditions: Condition[];
  action: ActionDefinition;
  enabled: boolean;
  /** Human-readable description auto-generated by UI */
  label?: string;
}

export interface StreetRules {
  preflop?: Rule[];
  flop?: Rule[];
  turn?: Rule[];
  river?: Rule[];
}

// ============================================================================
// RANGE CHART (Tier 2+, preflop only)
// ============================================================================

/**
 * 13x13 range chart for preflop decisions.
 *
 * Keys are hand notations: "AA", "AKs", "AKo", "KQs", etc.
 * - Pairs: "AA", "KK", ..., "22"
 * - Suited: higher rank first + "s" (e.g., "AKs", "QJs")
 * - Offsuit: higher rank first + "o" (e.g., "AKo", "QJo")
 *
 * Values: "raise" | "call" | "fold" | null (null = use personality fallback)
 */
export type RangeAction = "raise" | "call" | "fold" | null;
export type RangeChart = Record<string, RangeAction>;

/**
 * Generate all 169 unique hand notations for the 13x13 grid.
 * Diagonal = pairs, upper triangle = suited, lower triangle = offsuit.
 */
export function generateAllHandNotations(): string[] {
  const hands: string[] = [];
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = 0; j < RANKS.length; j++) {
      if (i === j) {
        hands.push(`${RANKS[i]}${RANKS[j]}`);
      } else if (i < j) {
        hands.push(`${RANKS[i]}${RANKS[j]}s`);
      } else {
        hands.push(`${RANKS[j]}${RANKS[i]}o`);
      }
    }
  }
  return hands;
}

// ============================================================================
// POSITION OVERRIDES (Tier 3)
// ============================================================================

export interface PositionOverride {
  personality?: Partial<Personality>;
  rangeChart?: RangeChart;
  rules?: StreetRules;
}

// ============================================================================
// BOT STRATEGY (top-level)
// ============================================================================

export type StrategyTier = "quick" | "strategy" | "pro";

export interface BotStrategy {
  version: 1;
  tier: StrategyTier;

  /** Always present. Serves as fallback when no rule/range matches. */
  personality: Personality;

  /** Tier 2+: per-street rule blocks, evaluated top-to-bottom */
  rules?: StreetRules;

  /** Tier 2+: 13x13 preflop range chart */
  rangeChart?: RangeChart;

  /** Tier 3: per-position strategy overrides */
  positionOverrides?: Partial<Record<Position, PositionOverride>>;
}

// ============================================================================
// GAME CONTEXT (computed from game state for rule evaluation)
// ============================================================================

/**
 * Computed context derived from the raw game state payload.
 * Every condition field maps to a property here.
 * The HandAnalyzer and BoardAnalyzer populate this.
 */
export interface GameContext {
  // Hand
  handStrength: HandStrength;
  pairType: PairType | null;
  hasFlushDraw: boolean;
  hasStraightDraw: boolean;
  holeCardRank: HoleCardRank;

  // Board
  communityCardCount: number;
  boardTexture: BoardTexture | null;

  // Opponent
  facingBet: boolean;
  facingRaise: boolean;
  facingAllIn: boolean;
  activePlayerCount: number;
  playersToAct: number;

  // Position
  myPosition: Position | null;
  isInPosition: boolean;

  // Stack
  myStackBB: number;
  effectiveStackBB: number;

  // Pot
  potSizeBB: number;
  potOdds: number;

  // Raw action constraints from game state
  canCheck: boolean;
  toCall: number;
  minRaise: number;
  maxRaise: number;

  // Metadata
  street: Street;
  bigBlind: number;
}

// ============================================================================
// ENGINE OUTPUT
// ============================================================================

export interface StrategyAction {
  type: ActionType;
  amount?: number;
}

export interface StrategyEvaluation {
  action: StrategyAction;
  /** What triggered this action */
  source: "position_override" | "range_chart" | "rule" | "personality";
  /** Human-readable explanation */
  explanation: string;
  /** ID of the rule that fired (if source is "rule") */
  ruleId?: string;
  /** The hand notation looked up (if source is "range_chart") */
  handNotation?: string;
}

// ============================================================================
// PRESETS
// ============================================================================

export interface PersonalityPreset {
  id: string;
  name: string;
  description: string;
  personality: Personality;
  /** Suggested playing style description shown in UI */
  styleDescription: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ConflictInfo {
  ruleA: string;
  ruleB: string;
  street: Street;
  description: string;
  severity: "error" | "warning";
}

export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: ConflictInfo[];
}
