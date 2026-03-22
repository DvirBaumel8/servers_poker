import {
  type ValidationError,
  type ValidationResult,
  type ConditionOperator,
  type ConditionCategory,
  type ActionType,
  type SizingMode,
  type StrategyTier,
  type Street,
  type Position,
  CONDITION_FIELDS,
  POSITIONS,
  STREETS,
  PERSONALITY_FIELDS,
  generateAllHandNotations,
} from "./strategy.types";

const VALID_TIERS: StrategyTier[] = ["quick", "strategy", "pro"];
const VALID_ACTION_TYPES: ActionType[] = [
  "fold",
  "check",
  "call",
  "raise",
  "all_in",
];
const VALID_SIZING_MODES: SizingMode[] = [
  "pot_fraction",
  "bb_multiple",
  "previous_bet_multiple",
  "fixed",
];
const VALID_OPERATORS: ConditionOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "between",
];
const VALID_CATEGORIES: ConditionCategory[] = [
  "hand",
  "board",
  "opponent",
  "position",
  "stack",
  "pot",
];
const ALL_HAND_NOTATIONS = new Set(generateAllHandNotations());
const MAX_RULES_PER_STREET = 50;
const MAX_CONDITIONS_PER_RULE = 10;
const MAX_STRATEGY_JSON_SIZE = 100_000; // ~100KB

export function validateStrategy(strategy: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!strategy || typeof strategy !== "object") {
    errors.push({
      path: "",
      message: "Strategy must be a non-null object",
      severity: "error",
    });
    return { valid: false, errors, warnings };
  }

  const s = strategy as Record<string, unknown>;

  const jsonSize = JSON.stringify(strategy).length;
  if (jsonSize > MAX_STRATEGY_JSON_SIZE) {
    errors.push({
      path: "",
      message: `Strategy JSON exceeds maximum size (${jsonSize} > ${MAX_STRATEGY_JSON_SIZE} bytes)`,
      severity: "error",
    });
    return { valid: false, errors, warnings };
  }

  if (s.version !== 1) {
    errors.push({
      path: "version",
      message: `Version must be 1, got ${String(s.version)}`,
      severity: "error",
    });
  }

  if (!VALID_TIERS.includes(s.tier as StrategyTier)) {
    errors.push({
      path: "tier",
      message: `Tier must be one of ${VALID_TIERS.join(", ")}, got "${String(s.tier)}"`,
      severity: "error",
    });
  }

  const tier = s.tier as StrategyTier;

  validatePersonality(s.personality, "personality", errors);

  if (tier === "quick") {
    if (s.rules !== undefined && s.rules !== null) {
      warnings.push({
        path: "rules",
        message: "Rules are ignored for quick tier bots",
        severity: "warning",
      });
    }
    if (s.rangeChart !== undefined && s.rangeChart !== null) {
      warnings.push({
        path: "rangeChart",
        message: "Range chart is ignored for quick tier bots",
        severity: "warning",
      });
    }
    if (s.positionOverrides !== undefined && s.positionOverrides !== null) {
      warnings.push({
        path: "positionOverrides",
        message: "Position overrides are ignored for quick tier bots",
        severity: "warning",
      });
    }
  }

  if (
    (tier === "strategy" || tier === "pro") &&
    s.rules !== undefined &&
    s.rules !== null
  ) {
    validateStreetRules(s.rules, "rules", errors, warnings);
  }

  if (
    (tier === "strategy" || tier === "pro") &&
    s.rangeChart !== undefined &&
    s.rangeChart !== null
  ) {
    validateRangeChart(s.rangeChart, "rangeChart", errors);
  }

  if (
    tier === "pro" &&
    s.positionOverrides !== undefined &&
    s.positionOverrides !== null
  ) {
    validatePositionOverrides(
      s.positionOverrides,
      "positionOverrides",
      errors,
      warnings,
    );
  } else if (
    tier !== "pro" &&
    s.positionOverrides !== undefined &&
    s.positionOverrides !== null
  ) {
    warnings.push({
      path: "positionOverrides",
      message: "Position overrides are only used in pro tier",
      severity: "warning",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validatePersonality(
  personality: unknown,
  path: string,
  errors: ValidationError[],
): void {
  if (!personality || typeof personality !== "object") {
    errors.push({
      path,
      message: "Personality is required and must be an object",
      severity: "error",
    });
    return;
  }

  const p = personality as Record<string, unknown>;

  for (const field of PERSONALITY_FIELDS) {
    const value = p[field];
    if (value === undefined || value === null) {
      errors.push({
        path: `${path}.${field}`,
        message: `${field} is required`,
        severity: "error",
      });
      continue;
    }
    if (typeof value !== "number") {
      errors.push({
        path: `${path}.${field}`,
        message: `${field} must be a number, got ${typeof value}`,
        severity: "error",
      });
      continue;
    }
    if (value < 0 || value > 100) {
      errors.push({
        path: `${path}.${field}`,
        message: `${field} must be between 0 and 100, got ${value}`,
        severity: "error",
      });
    }
    if (!Number.isFinite(value)) {
      errors.push({
        path: `${path}.${field}`,
        message: `${field} must be a finite number`,
        severity: "error",
      });
    }
  }
}

function validateStreetRules(
  rules: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  if (typeof rules !== "object" || rules === null) {
    errors.push({
      path,
      message: "Rules must be an object",
      severity: "error",
    });
    return;
  }

  const r = rules as Record<string, unknown>;

  for (const key of Object.keys(r)) {
    if (!STREETS.includes(key as Street)) {
      errors.push({
        path: `${path}.${key}`,
        message: `Invalid street "${key}". Must be one of: ${STREETS.join(", ")}`,
        severity: "error",
      });
      continue;
    }
    const streetRules = r[key];
    if (!Array.isArray(streetRules)) {
      errors.push({
        path: `${path}.${key}`,
        message: `Rules for ${key} must be an array`,
        severity: "error",
      });
      continue;
    }
    if (streetRules.length > MAX_RULES_PER_STREET) {
      errors.push({
        path: `${path}.${key}`,
        message: `Too many rules for ${key} (${streetRules.length} > ${MAX_RULES_PER_STREET})`,
        severity: "error",
      });
      continue;
    }

    const ruleIds = new Set<string>();
    for (let i = 0; i < streetRules.length; i++) {
      validateRule(
        streetRules[i],
        `${path}.${key}[${i}]`,
        key as Street,
        errors,
        warnings,
      );
      const rule = streetRules[i] as Record<string, unknown>;
      if (rule.id && typeof rule.id === "string") {
        if (ruleIds.has(rule.id)) {
          errors.push({
            path: `${path}.${key}[${i}].id`,
            message: `Duplicate rule ID "${rule.id}" in ${key}`,
            severity: "error",
          });
        }
        ruleIds.add(rule.id);
      }
    }
  }
}

function validateRule(
  rule: unknown,
  path: string,
  street: Street,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  if (!rule || typeof rule !== "object") {
    errors.push({
      path,
      message: "Rule must be a non-null object",
      severity: "error",
    });
    return;
  }

  const r = rule as Record<string, unknown>;

  if (typeof r.id !== "string" || r.id.length === 0) {
    errors.push({
      path: `${path}.id`,
      message: "Rule ID is required and must be a non-empty string",
      severity: "error",
    });
  }

  if (
    typeof r.priority !== "number" ||
    !Number.isInteger(r.priority) ||
    r.priority < 0
  ) {
    errors.push({
      path: `${path}.priority`,
      message: "Priority must be a non-negative integer",
      severity: "error",
    });
  }

  if (typeof r.enabled !== "boolean") {
    errors.push({
      path: `${path}.enabled`,
      message: "Enabled must be a boolean",
      severity: "error",
    });
  }

  if (!r.enabled) {
    return;
  }

  if (!Array.isArray(r.conditions)) {
    errors.push({
      path: `${path}.conditions`,
      message: "Conditions must be an array",
      severity: "error",
    });
  } else {
    if (r.conditions.length === 0) {
      warnings.push({
        path: `${path}.conditions`,
        message: "Rule has no conditions — it will always match",
        severity: "warning",
      });
    }
    if (r.conditions.length > MAX_CONDITIONS_PER_RULE) {
      errors.push({
        path: `${path}.conditions`,
        message: `Too many conditions (${r.conditions.length} > ${MAX_CONDITIONS_PER_RULE})`,
        severity: "error",
      });
    }
    for (
      let i = 0;
      i < Math.min(r.conditions.length, MAX_CONDITIONS_PER_RULE);
      i++
    ) {
      validateCondition(
        r.conditions[i],
        `${path}.conditions[${i}]`,
        street,
        errors,
      );
    }
  }

  if (!r.action || typeof r.action !== "object") {
    errors.push({
      path: `${path}.action`,
      message: "Action is required and must be an object",
      severity: "error",
    });
  } else {
    validateAction(
      r.action as Record<string, unknown>,
      `${path}.action`,
      errors,
    );
  }
}

function validateCondition(
  condition: unknown,
  path: string,
  street: Street,
  errors: ValidationError[],
): void {
  if (!condition || typeof condition !== "object") {
    errors.push({
      path,
      message: "Condition must be a non-null object",
      severity: "error",
    });
    return;
  }

  const c = condition as Record<string, unknown>;

  if (!VALID_CATEGORIES.includes(c.category as ConditionCategory)) {
    errors.push({
      path: `${path}.category`,
      message: `Invalid category "${String(c.category)}"`,
      severity: "error",
    });
    return;
  }

  if (typeof c.field !== "string") {
    errors.push({
      path: `${path}.field`,
      message: "Field must be a string",
      severity: "error",
    });
    return;
  }

  const fieldDef = CONDITION_FIELDS.find(
    (f) => f.category === c.category && f.field === c.field,
  );
  if (!fieldDef) {
    errors.push({
      path: `${path}.field`,
      message: `Unknown condition field "${c.category}.${c.field}"`,
      severity: "error",
    });
    return;
  }

  if (
    fieldDef.streets &&
    fieldDef.streets.length > 0 &&
    !fieldDef.streets.includes(street)
  ) {
    errors.push({
      path: `${path}.field`,
      message: `Field "${c.field}" is not available on ${street} (only on ${fieldDef.streets.join(", ")})`,
      severity: "error",
    });
  }

  if (!VALID_OPERATORS.includes(c.operator as ConditionOperator)) {
    errors.push({
      path: `${path}.operator`,
      message: `Invalid operator "${String(c.operator)}"`,
      severity: "error",
    });
    return;
  }

  validateConditionValue(c, fieldDef, path, errors);
}

function validateConditionValue(
  c: Record<string, unknown>,
  fieldDef: (typeof CONDITION_FIELDS)[number],
  path: string,
  errors: ValidationError[],
): void {
  const operator = c.operator as ConditionOperator;
  const value = c.value;

  if (value === undefined || value === null) {
    errors.push({
      path: `${path}.value`,
      message: "Value is required",
      severity: "error",
    });
    return;
  }

  if (operator === "in") {
    if (!Array.isArray(value)) {
      errors.push({
        path: `${path}.value`,
        message: '"in" operator requires an array value',
        severity: "error",
      });
    }
    return;
  }

  if (operator === "between") {
    if (!Array.isArray(value) || value.length !== 2) {
      errors.push({
        path: `${path}.value`,
        message:
          '"between" operator requires an array of exactly 2 values [min, max]',
        severity: "error",
      });
    } else if (typeof value[0] !== "number" || typeof value[1] !== "number") {
      errors.push({
        path: `${path}.value`,
        message: '"between" values must be numbers',
        severity: "error",
      });
    } else if (value[0] > value[1]) {
      errors.push({
        path: `${path}.value`,
        message: '"between" min must be <= max',
        severity: "error",
      });
    }
    return;
  }

  if (fieldDef.type === "boolean") {
    if (typeof value !== "boolean") {
      errors.push({
        path: `${path}.value`,
        message: `Expected boolean for field "${fieldDef.field}", got ${typeof value}`,
        severity: "error",
      });
    }
  } else if (fieldDef.type === "number") {
    if (typeof value !== "number") {
      errors.push({
        path: `${path}.value`,
        message: `Expected number for field "${fieldDef.field}", got ${typeof value}`,
        severity: "error",
      });
    }
  } else if (fieldDef.type === "enum") {
    if (typeof value !== "string") {
      errors.push({
        path: `${path}.value`,
        message: `Expected string for enum field "${fieldDef.field}", got ${typeof value}`,
        severity: "error",
      });
    } else if (fieldDef.enumValues && !fieldDef.enumValues.includes(value)) {
      errors.push({
        path: `${path}.value`,
        message: `Invalid value "${value}" for field "${fieldDef.field}". Allowed: ${fieldDef.enumValues.join(", ")}`,
        severity: "error",
      });
    }
  }
}

function validateAction(
  action: Record<string, unknown>,
  path: string,
  errors: ValidationError[],
): void {
  if (!VALID_ACTION_TYPES.includes(action.type as ActionType)) {
    errors.push({
      path: `${path}.type`,
      message: `Invalid action type "${String(action.type)}". Must be one of: ${VALID_ACTION_TYPES.join(", ")}`,
      severity: "error",
    });
    return;
  }

  if (action.type === "raise" && !action.sizing) {
    errors.push({
      path: `${path}.sizing`,
      message: "Raise action requires a sizing definition",
      severity: "error",
    });
  }

  if (action.sizing) {
    validateSizing(action.sizing, `${path}.sizing`, errors);
  }
}

function validateSizing(
  sizing: unknown,
  path: string,
  errors: ValidationError[],
): void {
  if (!sizing || typeof sizing !== "object") {
    errors.push({
      path,
      message: "Sizing must be an object",
      severity: "error",
    });
    return;
  }

  const s = sizing as Record<string, unknown>;

  if (!VALID_SIZING_MODES.includes(s.mode as SizingMode)) {
    errors.push({
      path: `${path}.mode`,
      message: `Invalid sizing mode "${String(s.mode)}". Must be one of: ${VALID_SIZING_MODES.join(", ")}`,
      severity: "error",
    });
  }

  if (typeof s.value !== "number" || s.value <= 0) {
    errors.push({
      path: `${path}.value`,
      message: "Sizing value must be a positive number",
      severity: "error",
    });
  }

  if (typeof s.value === "number" && !Number.isFinite(s.value)) {
    errors.push({
      path: `${path}.value`,
      message: "Sizing value must be finite",
      severity: "error",
    });
  }
}

function validateRangeChart(
  chart: unknown,
  path: string,
  errors: ValidationError[],
): void {
  if (!chart || typeof chart !== "object") {
    errors.push({
      path,
      message: "Range chart must be an object",
      severity: "error",
    });
    return;
  }

  const c = chart as Record<string, unknown>;
  const validActions = new Set(["raise", "call", "fold", null]);

  for (const [hand, action] of Object.entries(c)) {
    if (!ALL_HAND_NOTATIONS.has(hand)) {
      errors.push({
        path: `${path}.${hand}`,
        message: `Invalid hand notation "${hand}"`,
        severity: "error",
      });
      continue;
    }
    if (!validActions.has(action as string | null)) {
      errors.push({
        path: `${path}.${hand}`,
        message: `Invalid range action "${String(action)}" for hand ${hand}. Must be "raise", "call", "fold", or null`,
        severity: "error",
      });
    }
  }
}

function validatePositionOverrides(
  overrides: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  if (!overrides || typeof overrides !== "object") {
    errors.push({
      path,
      message: "Position overrides must be an object",
      severity: "error",
    });
    return;
  }

  const o = overrides as Record<string, unknown>;

  for (const [pos, override] of Object.entries(o)) {
    if (!POSITIONS.includes(pos as Position)) {
      errors.push({
        path: `${path}.${pos}`,
        message: `Invalid position "${pos}". Must be one of: ${POSITIONS.join(", ")}`,
        severity: "error",
      });
      continue;
    }

    if (!override || typeof override !== "object") {
      errors.push({
        path: `${path}.${pos}`,
        message: "Position override must be an object",
        severity: "error",
      });
      continue;
    }

    const ov = override as Record<string, unknown>;

    if (ov.personality !== undefined && ov.personality !== null) {
      validatePartialPersonality(
        ov.personality,
        `${path}.${pos}.personality`,
        errors,
      );
    }

    if (ov.rangeChart !== undefined && ov.rangeChart !== null) {
      validateRangeChart(ov.rangeChart, `${path}.${pos}.rangeChart`, errors);
    }

    if (ov.rules !== undefined && ov.rules !== null) {
      validateStreetRules(ov.rules, `${path}.${pos}.rules`, errors, warnings);
    }
  }
}

function validatePartialPersonality(
  personality: unknown,
  path: string,
  errors: ValidationError[],
): void {
  if (typeof personality !== "object" || personality === null) {
    errors.push({
      path,
      message: "Personality override must be an object",
      severity: "error",
    });
    return;
  }

  const p = personality as Record<string, unknown>;

  for (const [key, value] of Object.entries(p)) {
    if (
      !PERSONALITY_FIELDS.includes(key as (typeof PERSONALITY_FIELDS)[number])
    ) {
      errors.push({
        path: `${path}.${key}`,
        message: `Unknown personality field "${key}"`,
        severity: "error",
      });
      continue;
    }
    if (typeof value !== "number") {
      errors.push({
        path: `${path}.${key}`,
        message: `${key} must be a number, got ${typeof value}`,
        severity: "error",
      });
      continue;
    }
    if (value < 0 || value > 100) {
      errors.push({
        path: `${path}.${key}`,
        message: `${key} must be between 0 and 100, got ${value}`,
        severity: "error",
      });
    }
  }
}
