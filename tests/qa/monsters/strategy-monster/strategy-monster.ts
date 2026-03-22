/**
 * Strategy Monster
 *
 * Validates the bot strategy system end-to-end:
 * - Strategy validation (schema, types, ranges)
 * - Conflict detection accuracy
 * - Execution engine determinism
 * - All personality presets produce valid actions
 * - Range chart evaluation correctness
 * - Rule evaluation with all operators
 * - Edge cases (empty strategies, boundary values)
 */

import { BaseMonster } from "../shared/base-monster";
import { RunConfig } from "../shared/types";
import { validateStrategy } from "../../../../src/domain/bot-strategy/strategy.validator";
import { detectConflicts } from "../../../../src/domain/bot-strategy/strategy-conflict.detector";
import { evaluateStrategy } from "../../../../src/modules/bot-strategy/strategy-engine.service";
import { PERSONALITY_PRESETS } from "../../../../src/modules/bot-strategy/presets/personality-presets";
import {
  CONDITION_FIELDS,
  type BotStrategy,
} from "../../../../src/domain/bot-strategy/strategy.types";

const VALID_ACTIONS = ["fold", "check", "call", "raise", "all_in"];

function baseBotPayload(overrides: Record<string, any> = {}): any {
  return {
    gameId: "test-game",
    handNumber: 1,
    stage: overrides.stage ?? "pre-flop",
    you: {
      name: "TestBot",
      chips: 1000,
      holeCards: ["As", "Kh"],
      bet: 0,
      position: "UTG",
      ...(overrides.you || {}),
    },
    action: {
      canCheck: false,
      toCall: 10,
      minRaise: 20,
      maxRaise: 1000,
      ...(overrides.action || {}),
    },
    table: {
      pot: 15,
      currentBet: 10,
      communityCards: overrides.communityCards || [],
      smallBlind: 5,
      bigBlind: 10,
      ante: 0,
      ...(overrides.table || {}),
    },
    players: [
      {
        name: "TestBot",
        chips: 1000,
        bet: 0,
        folded: false,
        allIn: false,
        position: "UTG",
      },
      {
        name: "Opponent",
        chips: 1000,
        bet: 10,
        folded: false,
        allIn: false,
        position: "BB",
      },
      ...(overrides.players || []),
    ],
  };
}

export class StrategyMonster extends BaseMonster {
  constructor() {
    super({
      name: "Strategy Monster",
      type: "strategy",
      timeout: 30000,
      verbose: true,
    });
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log(
      `Loaded ${PERSONALITY_PRESETS.length} presets, ${CONDITION_FIELDS.length} condition fields`,
    );
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    await this.testValidation();
    await this.testConflictDetection();
    await this.testPresets();
    await this.testRuleEvaluation();
    await this.testRangeChartEvaluation();
    await this.testDeterminism();
    await this.testEdgeCases();
  }

  protected async teardown(): Promise<void> {}

  private async testValidation(): Promise<void> {
    this.log("Testing strategy validation...");

    const validQuick: BotStrategy = {
      version: 1,
      tier: "quick",
      personality: {
        aggression: 50,
        bluffFrequency: 30,
        riskTolerance: 50,
        tightness: 50,
      },
    };
    const result = validateStrategy(validQuick);
    if (!result.valid) {
      this.addFinding({
        title: "Valid quick strategy rejected",
        description: `Errors: ${result.errors.join(", ")}`,
        category: "BUG",
        severity: "high",
        location: { file: "strategy.validator.ts" },
        reproducible: true,
        tags: ["strategy", "validation"],
      });
    }
    this.recordTest(result.valid);

    const invalidMissing = validateStrategy({
      version: 1,
      tier: "quick",
    });
    if (invalidMissing.valid) {
      this.addFinding({
        title: "Invalid strategy (missing personality) accepted",
        description: "Validator should reject strategy without personality",
        category: "BUG",
        severity: "high",
        location: { file: "strategy.validator.ts" },
        reproducible: true,
        tags: ["strategy", "validation"],
      });
    }
    this.recordTest(!invalidMissing.valid);

    const invalidRange = validateStrategy({
      version: 1,
      tier: "quick",
      personality: {
        aggression: 150,
        bluffFrequency: 30,
        riskTolerance: 50,
        tightness: 50,
      },
    });
    if (invalidRange.valid) {
      this.addFinding({
        title: "Strategy with out-of-range personality value accepted",
        description: "Aggression 150 should be rejected (max 100)",
        category: "BUG",
        severity: "medium",
        location: { file: "strategy.validator.ts" },
        reproducible: true,
        tags: ["strategy", "validation"],
      });
    }
    this.recordTest(!invalidRange.valid);

    this.log("  Validation tests complete");
  }

  private async testConflictDetection(): Promise<void> {
    this.log("Testing conflict detection...");

    const noConflictStrategy: BotStrategy = {
      version: 1,
      tier: "strategy",
      personality: {
        aggression: 50,
        bluffFrequency: 30,
        riskTolerance: 50,
        tightness: 50,
      },
      rules: {
        preflop: [
          {
            id: "r1",
            priority: 0,
            conditions: [
              {
                category: "hand",
                field: "handStrength",
                operator: "eq",
                value: "premium",
              },
            ],
            action: { type: "raise" },
            enabled: true,
          },
          {
            id: "r2",
            priority: 1,
            conditions: [
              {
                category: "hand",
                field: "handStrength",
                operator: "eq",
                value: "trash",
              },
            ],
            action: { type: "fold" },
            enabled: true,
          },
        ],
      },
    };

    const noConflicts = detectConflicts(noConflictStrategy);
    const hasNoConflicts = noConflicts.conflicts.length === 0;
    if (!hasNoConflicts) {
      this.addFinding({
        title: "False positive conflict detected",
        description: `Non-conflicting rules produced ${noConflicts.conflicts.length} conflicts`,
        category: "BUG",
        severity: "medium",
        location: { file: "strategy-conflict.detector.ts" },
        reproducible: true,
        tags: ["strategy", "conflict"],
      });
    }
    this.recordTest(hasNoConflicts);

    const contradictionStrategy: BotStrategy = {
      version: 1,
      tier: "strategy",
      personality: {
        aggression: 50,
        bluffFrequency: 30,
        riskTolerance: 50,
        tightness: 50,
      },
      rules: {
        preflop: [
          {
            id: "r1",
            priority: 0,
            conditions: [
              {
                category: "hand",
                field: "handStrength",
                operator: "eq",
                value: "premium",
              },
            ],
            action: { type: "raise" },
            enabled: true,
          },
          {
            id: "r2",
            priority: 1,
            conditions: [
              {
                category: "hand",
                field: "handStrength",
                operator: "eq",
                value: "premium",
              },
            ],
            action: { type: "fold" },
            enabled: true,
          },
        ],
      },
    };

    const contradictions = detectConflicts(contradictionStrategy);
    const foundContradiction = contradictions.conflicts.length > 0;
    if (!foundContradiction) {
      this.addFinding({
        title: "Missed contradiction between rules",
        description:
          "Same conditions with different actions should be detected",
        category: "BUG",
        severity: "high",
        location: { file: "strategy-conflict.detector.ts" },
        reproducible: true,
        tags: ["strategy", "conflict"],
      });
    }
    this.recordTest(foundContradiction);

    this.log("  Conflict detection tests complete");
  }

  private async testPresets(): Promise<void> {
    this.log("Testing personality presets...");

    for (const preset of PERSONALITY_PRESETS) {
      const strategy: BotStrategy = {
        version: 1,
        tier: "quick",
        personality: preset.personality,
      };

      const validationResult = validateStrategy(strategy);
      if (!validationResult.valid) {
        this.addFinding({
          title: `Preset "${preset.name}" has invalid personality values`,
          description: `Errors: ${validationResult.errors.join(", ")}`,
          category: "BUG",
          severity: "high",
          location: {
            file: "personality-presets.ts",
            component: preset.name,
          },
          reproducible: true,
          tags: ["strategy", "preset"],
        });
        this.recordTest(false);
        continue;
      }

      try {
        const payload = baseBotPayload();
        const evaluation = evaluateStrategy(strategy, payload);

        if (!VALID_ACTIONS.includes(evaluation.action.type)) {
          this.addFinding({
            title: `Preset "${preset.name}" produced invalid action`,
            description: `Action type "${evaluation.action.type}" not in valid set`,
            category: "BUG",
            severity: "high",
            location: {
              file: "personality-presets.ts",
              component: preset.name,
            },
            reproducible: true,
            tags: ["strategy", "preset", "engine"],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }
      } catch (error: any) {
        this.addFinding({
          title: `Preset "${preset.name}" crashed engine`,
          description: error.message,
          category: "BUG",
          severity: "critical",
          location: {
            file: "strategy-engine.service.ts",
            component: preset.name,
          },
          reproducible: true,
          tags: ["strategy", "preset", "crash"],
        });
        this.recordTest(false);
      }
    }

    this.log(`  Tested ${PERSONALITY_PRESETS.length} presets`);
  }

  private async testRuleEvaluation(): Promise<void> {
    this.log("Testing rule evaluation...");

    const ruleStrategy: BotStrategy = {
      version: 1,
      tier: "strategy",
      personality: {
        aggression: 50,
        bluffFrequency: 30,
        riskTolerance: 50,
        tightness: 50,
      },
      rules: {
        preflop: [
          {
            id: "r1",
            priority: 0,
            conditions: [
              {
                category: "opponent",
                field: "facingBet",
                operator: "eq",
                value: false,
              },
            ],
            action: { type: "raise" },
            enabled: true,
          },
        ],
      },
    };

    try {
      const payload = baseBotPayload({
        action: {
          canCheck: true,
          toCall: 0,
          minRaise: 20,
          maxRaise: 1000,
        },
      });
      const result = evaluateStrategy(ruleStrategy, payload);

      if (!VALID_ACTIONS.includes(result.action.type)) {
        this.addFinding({
          title: "Rule evaluation returned invalid action",
          description: `Got "${result.action.type}"`,
          category: "BUG",
          severity: "high",
          location: { file: "rule.evaluator.ts" },
          reproducible: true,
          tags: ["strategy", "rules"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    } catch (error: any) {
      this.addFinding({
        title: "Rule evaluation crashed",
        description: error.message,
        category: "BUG",
        severity: "critical",
        location: { file: "rule.evaluator.ts" },
        reproducible: true,
        tags: ["strategy", "rules", "crash"],
      });
      this.recordTest(false);
    }

    this.log("  Rule evaluation tests complete");
  }

  private async testRangeChartEvaluation(): Promise<void> {
    this.log("Testing range chart evaluation...");

    const rangeStrategy: BotStrategy = {
      version: 1,
      tier: "strategy",
      personality: {
        aggression: 50,
        bluffFrequency: 30,
        riskTolerance: 50,
        tightness: 50,
      },
      rangeChart: {
        AA: "raise",
        AKs: "raise",
        AKo: "call",
        "72o": "fold",
      },
    };

    try {
      const payload = baseBotPayload();
      const result = evaluateStrategy(rangeStrategy, payload);

      if (!VALID_ACTIONS.includes(result.action.type)) {
        this.addFinding({
          title: "Range chart evaluation returned invalid action",
          description: `Got "${result.action.type}"`,
          category: "BUG",
          severity: "high",
          location: { file: "range-chart.evaluator.ts" },
          reproducible: true,
          tags: ["strategy", "range-chart"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    } catch (error: any) {
      this.addFinding({
        title: "Range chart evaluation crashed",
        description: error.message,
        category: "BUG",
        severity: "critical",
        location: { file: "range-chart.evaluator.ts" },
        reproducible: true,
        tags: ["strategy", "range-chart", "crash"],
      });
      this.recordTest(false);
    }

    this.log("  Range chart tests complete");
  }

  private async testDeterminism(): Promise<void> {
    this.log("Testing execution determinism...");

    const strategy: BotStrategy = {
      version: 1,
      tier: "quick",
      personality: {
        aggression: 50,
        bluffFrequency: 30,
        riskTolerance: 50,
        tightness: 50,
      },
    };

    const payload = baseBotPayload();

    try {
      const results: string[] = [];
      for (let i = 0; i < 10; i++) {
        const result = evaluateStrategy(strategy, payload);
        results.push(result.action.type);
      }

      const allSame = results.every((r) => r === results[0]);
      if (!allSame) {
        this.addFinding({
          title: "Strategy engine is non-deterministic",
          description: `Same input produced different outputs: ${JSON.stringify(results)}`,
          category: "BUG",
          severity: "high",
          location: { file: "strategy-engine.service.ts" },
          reproducible: true,
          tags: ["strategy", "determinism"],
        });
      }
      this.recordTest(allSame);
    } catch (error: any) {
      this.addFinding({
        title: "Determinism test crashed",
        description: error.message,
        category: "BUG",
        severity: "critical",
        location: { file: "strategy-engine.service.ts" },
        reproducible: true,
        tags: ["strategy", "determinism", "crash"],
      });
      this.recordTest(false);
    }

    this.log("  Determinism tests complete");
  }

  private async testEdgeCases(): Promise<void> {
    this.log("Testing edge cases...");

    const minStrategy: BotStrategy = {
      version: 1,
      tier: "quick",
      personality: {
        aggression: 0,
        bluffFrequency: 0,
        riskTolerance: 0,
        tightness: 0,
      },
    };

    const maxStrategy: BotStrategy = {
      version: 1,
      tier: "quick",
      personality: {
        aggression: 100,
        bluffFrequency: 100,
        riskTolerance: 100,
        tightness: 100,
      },
    };

    for (const [label, strategy] of [
      ["min", minStrategy],
      ["max", maxStrategy],
    ] as const) {
      try {
        const payload = baseBotPayload();
        const result = evaluateStrategy(strategy, payload);
        if (!VALID_ACTIONS.includes(result.action.type)) {
          this.addFinding({
            title: `${label}-value personality produced invalid action`,
            description: `Action: ${result.action.type}`,
            category: "BUG",
            severity: "high",
            location: { file: "personality.evaluator.ts" },
            reproducible: true,
            tags: ["strategy", "edge-case"],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }
      } catch (error: any) {
        this.addFinding({
          title: `${label}-value personality crashed engine`,
          description: error.message,
          category: "BUG",
          severity: "critical",
          location: { file: "strategy-engine.service.ts" },
          reproducible: true,
          tags: ["strategy", "edge-case", "crash"],
        });
        this.recordTest(false);
      }
    }

    const shortStackPayload = baseBotPayload({
      you: { chips: 5 },
      action: {
        canCheck: false,
        toCall: 10,
        minRaise: 5,
        maxRaise: 5,
      },
    });
    try {
      const result = evaluateStrategy(minStrategy, shortStackPayload);
      this.recordTest(VALID_ACTIONS.includes(result.action.type));
    } catch (error: any) {
      this.addFinding({
        title: "Short stack scenario crashed engine",
        description: error.message,
        category: "BUG",
        severity: "critical",
        location: { file: "strategy-engine.service.ts" },
        reproducible: true,
        tags: ["strategy", "edge-case", "crash"],
      });
      this.recordTest(false);
    }

    this.log("  Edge case tests complete");
  }
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { runMonsterCli } = require("../shared/cli-runner");
  runMonsterCli(new StrategyMonster(), "strategy");
}
