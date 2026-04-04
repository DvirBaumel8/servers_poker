/**
 * RuleEvaluator: Evaluates IF/THEN rule chains against computed game context.
 *
 * Rules are evaluated in priority order (lower number = higher priority).
 * First matching rule wins. All conditions within a rule use AND logic.
 */

import type {
  Rule,
  Condition,
  ConditionGroup,
  ConditionNode,
  ConditionOperator,
  GameContext,
  ActionDefinition,
} from "../../../domain/bot-strategy/strategy.types";

const MAX_DEPTH = 10; // mirrors MAX_CONDITION_DEPTH

export interface RuleEvalResult {
  matched: boolean;
  ruleId?: string;
  action?: ActionDefinition;
  ruleLabel?: string;
}

export function evaluateRules(
  rules: Rule[],
  context: GameContext,
): RuleEvalResult {
  const sorted = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  return evaluatePreSortedRules(sorted, context);
}

/**
 * Fast-path variant used by the hydration layer.
 * Expects rules that are already sorted by priority and filtered (enabled only).
 * Skips the O(n log n) sort + filter performed by `evaluateRules`.
 */
export function evaluatePreSortedRules(
  rules: ReadonlyArray<Rule>,
  context: GameContext,
): RuleEvalResult {
  for (const rule of rules) {
    if (allConditionsMatch(rule.conditions, context)) {
      return {
        matched: true,
        ruleId: rule.id,
        action: rule.action,
        ruleLabel: rule.label,
      };
    }
  }

  return { matched: false };
}

function allConditionsMatch(
  conditions: ConditionNode[],
  context: GameContext,
): boolean {
  return evaluateNodeList(conditions, "AND", context, 0);
}

function evaluateNodeList(
  nodes: ConditionNode[],
  operator: "AND" | "OR",
  context: GameContext,
  depth: number,
): boolean {
  if (depth > MAX_DEPTH) return false; // runaway guard
  const fn = (node: ConditionNode): boolean =>
    evaluateNode(node, context, depth);
  return operator === "AND" ? nodes.every(fn) : nodes.some(fn);
}

function evaluateNode(
  node: ConditionNode,
  context: GameContext,
  depth: number,
): boolean {
  if ("rules" in node) {
    return evaluateNodeList(
      (node as ConditionGroup).rules,
      (node as ConditionGroup).operator,
      context,
      depth + 1,
    );
  }
  return evaluateCondition(node as Condition, context);
}

function evaluateCondition(
  condition: Condition,
  context: GameContext,
): boolean {
  const actualValue = getContextValue(
    condition.category,
    condition.field,
    context,
  );

  if (actualValue === undefined || actualValue === null) {
    return false;
  }

  return applyOperator(actualValue, condition.operator, condition.value);
}

function getContextValue(
  category: string,
  field: string,
  context: GameContext,
): unknown {
  const key = field as keyof GameContext;
  if (key in context) {
    return context[key];
  }
  return undefined;
}

function applyOperator(
  actual: unknown,
  operator: ConditionOperator,
  expected: unknown,
): boolean {
  switch (operator) {
    case "eq":
      return actual === expected;

    case "neq":
      return actual !== expected;

    case "gt":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual > expected
      );

    case "gte":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual >= expected
      );

    case "lt":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual < expected
      );

    case "lte":
      return (
        typeof actual === "number" &&
        typeof expected === "number" &&
        actual <= expected
      );

    case "in":
      if (Array.isArray(expected)) {
        return expected.includes(actual);
      }
      return false;

    case "between":
      if (
        Array.isArray(expected) &&
        expected.length === 2 &&
        typeof actual === "number"
      ) {
        return actual >= expected[0] && actual <= expected[1];
      }
      return false;

    default:
      return false;
  }
}
