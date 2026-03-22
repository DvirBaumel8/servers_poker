import {
  type BotStrategy,
  type Rule,
  type Condition,
  type ConflictInfo,
  type ConflictDetectionResult,
  STREETS,
} from "./strategy.types";

/**
 * Detects logical conflicts between rules in a strategy.
 *
 * Conflict types:
 * 1. Contradiction: Two rules with identical conditions but different actions
 * 2. Shadowed: A lower-priority rule can never fire because a higher-priority
 *    rule with broader/identical conditions always matches first
 * 3. Redundant: Two rules produce the same action for overlapping conditions
 */
export function detectConflicts(
  strategy: BotStrategy,
): ConflictDetectionResult {
  const conflicts: ConflictInfo[] = [];

  if (strategy.rules) {
    detectRuleConflicts(strategy.rules, conflicts);
  }

  if (strategy.positionOverrides) {
    for (const [position, override] of Object.entries(
      strategy.positionOverrides,
    )) {
      if (!override?.rules) continue;
      const posStrategy: BotStrategy = {
        version: strategy.version,
        tier: strategy.tier,
        personality: strategy.personality,
        rules: override.rules,
      };
      const posConflicts = detectConflicts(posStrategy);
      for (const c of posConflicts.conflicts) {
        conflicts.push({
          ...c,
          description: `[${position}] ${c.description}`,
        });
      }
    }
  }

  return {
    hasConflicts: conflicts.some((c) => c.severity === "error"),
    conflicts,
  };
}

function detectRuleConflicts(
  rules: NonNullable<BotStrategy["rules"]>,
  conflicts: ConflictInfo[],
): void {
  for (const street of STREETS) {
    const streetRules = rules[street];
    if (!streetRules || streetRules.length < 2) continue;

    const enabledRules = streetRules
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (let i = 0; i < enabledRules.length; i++) {
      for (let j = i + 1; j < enabledRules.length; j++) {
        const ruleA = enabledRules[i];
        const ruleB = enabledRules[j];

        const overlap = analyzeConditionOverlap(
          ruleA.conditions,
          ruleB.conditions,
        );

        if (overlap === "identical") {
          if (actionsEqual(ruleA, ruleB)) {
            conflicts.push({
              ruleA: ruleA.id,
              ruleB: ruleB.id,
              street,
              description: `Rules "${ruleA.label || ruleA.id}" and "${ruleB.label || ruleB.id}" have identical conditions and actions — the second is redundant`,
              severity: "warning",
            });
          } else {
            conflicts.push({
              ruleA: ruleA.id,
              ruleB: ruleB.id,
              street,
              description: `Rules "${ruleA.label || ruleA.id}" and "${ruleB.label || ruleB.id}" have identical conditions but different actions — "${ruleB.label || ruleB.id}" will never execute`,
              severity: "error",
            });
          }
        } else if (overlap === "a_subsumes_b") {
          conflicts.push({
            ruleA: ruleA.id,
            ruleB: ruleB.id,
            street,
            description: `Rule "${ruleA.label || ruleA.id}" (priority ${ruleA.priority}) shadows "${ruleB.label || ruleB.id}" (priority ${ruleB.priority}) — the higher-priority rule's conditions are broader`,
            severity: "warning",
          });
        }
      }
    }
  }
}

type OverlapResult =
  | "identical"
  | "a_subsumes_b"
  | "b_subsumes_a"
  | "partial"
  | "disjoint";

/**
 * Analyzes the relationship between two sets of conditions.
 *
 * Since conditions use AND logic, rule A subsumes rule B if A's conditions
 * are a subset of B's conditions (A is less restrictive, so it matches
 * everything B matches and more).
 */
function analyzeConditionOverlap(
  conditionsA: Condition[],
  conditionsB: Condition[],
): OverlapResult {
  if (conditionsA.length === 0 && conditionsB.length === 0) {
    return "identical";
  }

  if (conditionsA.length === 0) {
    return "a_subsumes_b";
  }

  if (conditionsB.length === 0) {
    return "b_subsumes_a";
  }

  const aKeys = conditionsA.map(conditionKey).sort();
  const bKeys = conditionsB.map(conditionKey).sort();

  const aSet = new Set(aKeys);
  const bSet = new Set(bKeys);

  const aInB = aKeys.every((k) => bSet.has(k));
  const bInA = bKeys.every((k) => aSet.has(k));

  if (aInB && bInA) {
    return "identical";
  }

  // A has fewer conditions (all present in B) => A is broader => A subsumes B
  if (aInB && !bInA) {
    return "a_subsumes_b";
  }

  // B has fewer conditions (all present in A) => B is broader => B subsumes A
  if (bInA && !aInB) {
    return "b_subsumes_a";
  }

  if (hasOverlappingFields(conditionsA, conditionsB)) {
    return "partial";
  }

  return "disjoint";
}

/**
 * Creates a canonical key for a condition for comparison.
 * Two conditions with the same key would match the same inputs.
 */
function conditionKey(c: Condition): string {
  return `${c.category}:${c.field}:${c.operator}:${JSON.stringify(c.value)}`;
}

function actionsEqual(ruleA: Rule, ruleB: Rule): boolean {
  if (ruleA.action.type !== ruleB.action.type) return false;
  if (!ruleA.action.sizing && !ruleB.action.sizing) return true;
  if (!ruleA.action.sizing || !ruleB.action.sizing) return false;
  return (
    ruleA.action.sizing.mode === ruleB.action.sizing.mode &&
    ruleA.action.sizing.value === ruleB.action.sizing.value
  );
}

function hasOverlappingFields(a: Condition[], b: Condition[]): boolean {
  const aFields = new Set(a.map((c) => `${c.category}.${c.field}`));
  return b.some((c) => aFields.has(`${c.category}.${c.field}`));
}
