export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export type Rank = typeof RANKS[number];

export const POSITIONS = ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "HJ", "CO"] as const;
export type Position = typeof POSITIONS[number];

export const STREETS = ["preflop", "flop", "turn", "river"] as const;
export type Street = typeof STREETS[number];

export interface Personality {
  aggression: number;
  bluffFrequency: number;
  riskTolerance: number;
  tightness: number;
}

export const PERSONALITY_FIELDS = ["aggression", "bluffFrequency", "riskTolerance", "tightness"] as const;
export type PersonalityField = typeof PERSONALITY_FIELDS[number];

export type ConditionCategory = "hand" | "board" | "opponent" | "position" | "stack" | "pot";
export type ConditionOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "between";
export type HandStrength = "high_card" | "pair" | "two_pair" | "trips" | "straight" | "flush" | "full_house" | "quads" | "straight_flush" | "royal_flush";
export type PairType = "overpair" | "top_pair" | "middle_pair" | "low_pair" | "pocket_pair";
export type HoleCardRank = "premium" | "strong" | "playable" | "weak";
export type BoardTexture = "dry" | "wet" | "monotone" | "paired";
export type ConditionValue = string | number | boolean | string[] | number[] | [number, number];

export interface Condition {
  category: ConditionCategory;
  field: string;
  operator: ConditionOperator;
  value: ConditionValue;
}

export interface ConditionFieldDef {
  category: ConditionCategory;
  field: string;
  type: "enum" | "number" | "boolean";
  label: string;
  description: string;
  enumValues?: string[];
  min?: number;
  max?: number;
  tier: "quick" | "strategy" | "pro";
  streets?: Street[];
}

export type ActionType = "fold" | "check" | "call" | "raise" | "all_in";
export type SizingMode = "pot_fraction" | "bb_multiple" | "previous_bet_multiple" | "fixed";

export interface SizingDefinition {
  mode: SizingMode;
  value: number;
}

export interface ActionDefinition {
  type: ActionType;
  sizing?: SizingDefinition;
}

export interface Rule {
  id: string;
  priority: number;
  conditions: Condition[];
  action: ActionDefinition;
  enabled: boolean;
  label?: string;
}

export interface StreetRules {
  preflop?: Rule[];
  flop?: Rule[];
  turn?: Rule[];
  river?: Rule[];
}

export type RangeAction = "raise" | "call" | "fold" | null;
export type RangeChart = Record<string, RangeAction>;

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

export interface PositionOverride {
  personality?: Partial<Personality>;
  rangeChart?: RangeChart;
  rules?: StreetRules;
}

export type StrategyTier = "quick" | "strategy" | "pro";

export interface BotStrategy {
  version: 1;
  tier: StrategyTier;
  personality: Personality;
  rules?: StreetRules;
  rangeChart?: RangeChart;
  positionOverrides?: Partial<Record<Position, PositionOverride>>;
}

export interface Bot {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  user_id: string;
  created_at: string;
  strategy: BotStrategy | null;
}

export interface PersonalityPreset {
  id: string;
  name: string;
  description: string;
  personality: Personality;
  styleDescription: string;
}

export interface StrategyEvaluation {
  action: {
    type: ActionType;
    amount?: number;
  };
  source: "position_override" | "range_chart" | "rule" | "personality";
  explanation: string;
  ruleId?: string;
  handNotation?: string;
}
