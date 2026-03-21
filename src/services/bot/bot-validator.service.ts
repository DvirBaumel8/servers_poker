import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BotCallerService } from "./bot-caller.service";

export interface ValidationScenario {
  id: string;
  name: string;
  description: string;
  category: "connectivity" | "basic" | "edge_case" | "stress";
  payload?: any;
  expectedActions?: string[];
  maxResponseTimeMs?: number;
  validate?: (response: any, payload: any) => ValidationError[];
}

export interface ValidationError {
  field?: string;
  message: string;
  severity: "error" | "warning";
}

export interface ScenarioResult {
  scenarioId: string;
  name: string;
  category: string;
  passed: boolean;
  errors: ValidationError[];
  responseTimeMs: number;
  response?: any;
  retried: boolean;
}

export interface ValidationReport {
  botId: string;
  endpoint: string;
  timestamp: Date;
  overallScore: number;
  passed: boolean;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  warningCount: number;
  averageResponseTimeMs: number;
  maxResponseTimeMs: number;
  categories: {
    connectivity: { passed: number; failed: number };
    basic: { passed: number; failed: number };
    edge_case: { passed: number; failed: number };
    stress: { passed: number; failed: number };
  };
  results: ScenarioResult[];
  recommendations: string[];
}

@Injectable()
export class BotValidatorService {
  private readonly logger = new Logger(BotValidatorService.name);
  private readonly scenarios: ValidationScenario[];

  constructor(
    private readonly botCaller: BotCallerService,
    private readonly configService: ConfigService,
  ) {
    this.scenarios = this.buildScenarios();
  }

  async validateBot(
    botId: string,
    endpoint: string,
    options?: { categories?: string[]; quickMode?: boolean },
  ): Promise<ValidationReport> {
    this.logger.log(`Starting validation for bot ${botId}`);

    const scenarios = this.filterScenarios(options);
    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      const result = await this.runScenario(botId, endpoint, scenario);
      results.push(result);
    }

    const report = this.buildReport(botId, endpoint, results);
    this.logger.log(
      `Validation complete for bot ${botId}: ${report.overallScore}/100`,
    );

    return report;
  }

  async quickHealthCheck(
    botId: string,
    endpoint: string,
  ): Promise<{ healthy: boolean; responseTimeMs: number; error?: string }> {
    const result = await this.botCaller.callBot(botId, endpoint, {
      type: "health_check",
      timestamp: Date.now(),
    });

    return {
      healthy: result.success,
      responseTimeMs: result.latencyMs,
      error: result.error,
    };
  }

  private async runScenario(
    botId: string,
    endpoint: string,
    scenario: ValidationScenario,
  ): Promise<ScenarioResult> {
    const errors: ValidationError[] = [];

    if (scenario.category === "connectivity") {
      const healthy = await this.botCaller.healthCheck(botId, endpoint);
      return {
        scenarioId: scenario.id,
        name: scenario.name,
        category: scenario.category,
        passed: healthy,
        errors: healthy
          ? []
          : [{ message: "Health check failed", severity: "error" }],
        responseTimeMs: 0,
        retried: false,
      };
    }

    const result = await this.botCaller.callBot(
      botId,
      endpoint,
      scenario.payload,
    );

    if (!result.success) {
      errors.push({
        message: result.error || "Request failed",
        severity: "error",
      });

      return {
        scenarioId: scenario.id,
        name: scenario.name,
        category: scenario.category,
        passed: false,
        errors,
        responseTimeMs: result.latencyMs,
        retried: result.retried,
      };
    }

    if (
      scenario.maxResponseTimeMs &&
      result.latencyMs > scenario.maxResponseTimeMs
    ) {
      errors.push({
        message: `Response time ${result.latencyMs}ms exceeds limit ${scenario.maxResponseTimeMs}ms`,
        severity: "warning",
      });
    }

    const structureErrors = this.validateResponseStructure(result.response);
    errors.push(...structureErrors);

    if (scenario.expectedActions && result.response?.type) {
      if (!scenario.expectedActions.includes(result.response.type)) {
        errors.push({
          field: "type",
          message: `Expected one of [${scenario.expectedActions.join(", ")}], got "${result.response.type}"`,
          severity: "error",
        });
      }
    }

    if (scenario.validate) {
      const customErrors = scenario.validate(result.response, scenario.payload);
      errors.push(...customErrors);
    }

    const passed = !errors.some((e) => e.severity === "error");

    return {
      scenarioId: scenario.id,
      name: scenario.name,
      category: scenario.category,
      passed,
      errors,
      responseTimeMs: result.latencyMs,
      response: result.response,
      retried: result.retried,
    };
  }

  private validateResponseStructure(response: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!response || typeof response !== "object") {
      errors.push({
        message: "Response must be a JSON object",
        severity: "error",
      });
      return errors;
    }

    if (!response.type) {
      errors.push({
        field: "type",
        message: 'Response must include "type" field',
        severity: "error",
      });
      return errors;
    }

    const validActions = ["fold", "check", "call", "raise", "bet", "all_in"];
    if (!validActions.includes(response.type)) {
      errors.push({
        field: "type",
        message: `Invalid action type "${response.type}". Must be one of: ${validActions.join(", ")}`,
        severity: "error",
      });
    }

    if (response.type === "raise" || response.type === "bet") {
      if (typeof response.amount !== "number") {
        errors.push({
          field: "amount",
          message: 'Raise/bet must include numeric "amount" field',
          severity: "error",
        });
      } else if (response.amount <= 0) {
        errors.push({
          field: "amount",
          message: "Raise/bet amount must be positive",
          severity: "error",
        });
      } else if (!Number.isInteger(response.amount)) {
        errors.push({
          field: "amount",
          message: "Raise/bet amount must be an integer",
          severity: "warning",
        });
      }
    }

    return errors;
  }

  private filterScenarios(options?: {
    categories?: string[];
    quickMode?: boolean;
  }): ValidationScenario[] {
    let scenarios = [...this.scenarios];

    if (options?.quickMode) {
      scenarios = scenarios.filter(
        (s) => s.category === "connectivity" || s.category === "basic",
      );
    }

    if (options?.categories && options.categories.length > 0) {
      scenarios = scenarios.filter((s) =>
        options.categories!.includes(s.category),
      );
    }

    return scenarios;
  }

  private buildReport(
    botId: string,
    endpoint: string,
    results: ScenarioResult[],
  ): ValidationReport {
    const passedScenarios = results.filter((r) => r.passed).length;
    const failedScenarios = results.length - passedScenarios;
    const warningCount = results.reduce(
      (sum, r) => sum + r.errors.filter((e) => e.severity === "warning").length,
      0,
    );

    const totalResponseTime = results.reduce(
      (sum, r) => sum + r.responseTimeMs,
      0,
    );
    const maxResponseTime = Math.max(...results.map((r) => r.responseTimeMs));

    const categories = {
      connectivity: { passed: 0, failed: 0 },
      basic: { passed: 0, failed: 0 },
      edge_case: { passed: 0, failed: 0 },
      stress: { passed: 0, failed: 0 },
    };

    for (const result of results) {
      const cat = result.category as keyof typeof categories;
      if (categories[cat]) {
        if (result.passed) {
          categories[cat].passed++;
        } else {
          categories[cat].failed++;
        }
      }
    }

    const categoryWeights = {
      connectivity: 30,
      basic: 40,
      edge_case: 20,
      stress: 10,
    };

    let weightedScore = 0;
    let totalWeight = 0;

    for (const [category, counts] of Object.entries(categories)) {
      const total = counts.passed + counts.failed;
      if (total > 0) {
        const categoryScore = (counts.passed / total) * 100;
        const weight =
          categoryWeights[category as keyof typeof categoryWeights] || 10;
        weightedScore += categoryScore * weight;
        totalWeight += weight;
      }
    }

    const overallScore =
      totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

    const recommendations = this.generateRecommendations(results, categories);

    return {
      botId,
      endpoint,
      timestamp: new Date(),
      overallScore,
      passed: failedScenarios === 0,
      totalScenarios: results.length,
      passedScenarios,
      failedScenarios,
      warningCount,
      averageResponseTimeMs:
        results.length > 0 ? Math.round(totalResponseTime / results.length) : 0,
      maxResponseTimeMs: maxResponseTime,
      categories,
      results,
      recommendations,
    };
  }

  private generateRecommendations(
    results: ScenarioResult[],
    categories: ValidationReport["categories"],
  ): string[] {
    const recommendations: string[] = [];

    if (categories.connectivity.failed > 0) {
      recommendations.push(
        "Health check endpoint (/health) should return HTTP 200. Ensure your server is accessible.",
      );
    }

    const slowResponses = results.filter((r) => r.responseTimeMs > 3000);
    if (slowResponses.length > 0) {
      recommendations.push(
        `${slowResponses.length} scenarios had response times > 3 seconds. Tournament timeout is 10 seconds - optimize response times.`,
      );
    }

    const raiseErrors = results.filter((r) =>
      r.errors.some(
        (e) => e.field === "amount" && e.message.includes("positive"),
      ),
    );
    if (raiseErrors.length > 0) {
      recommendations.push(
        "Raise amounts must be positive integers. Check your raise logic.",
      );
    }

    const invalidActionErrors = results.filter((r) =>
      r.errors.some(
        (e) => e.field === "type" && e.message.includes("Invalid action"),
      ),
    );
    if (invalidActionErrors.length > 0) {
      recommendations.push(
        'Valid action types are: fold, check, call, raise, bet, all_in. Ensure "type" field uses one of these.',
      );
    }

    if (categories.edge_case.failed > 0) {
      recommendations.push(
        "Some edge case scenarios failed. Review handling for: short stacks, heads-up, large bets, multi-way pots.",
      );
    }

    const retriedResults = results.filter((r) => r.retried);
    if (retriedResults.length > 2) {
      recommendations.push(
        "Multiple requests required retries. Consider improving server stability or response consistency.",
      );
    }

    return recommendations;
  }

  private buildScenarios(): ValidationScenario[] {
    return [
      {
        id: "health_check",
        name: "Health Check Endpoint",
        description: "GET /health returns 200",
        category: "connectivity",
      },
      {
        id: "basic_preflop_call",
        name: "Pre-flop: Standard Call/Fold Decision",
        description: "Bot handles basic pre-flop situation",
        category: "basic",
        payload: this.buildPayload({
          stage: "pre-flop",
          action: {
            canCheck: false,
            toCall: 50,
            minRaise: 100,
            maxRaise: 4950,
          },
        }),
        expectedActions: ["fold", "call", "raise"],
        maxResponseTimeMs: 5000,
      },
      {
        id: "basic_preflop_check",
        name: "Pre-flop: Check When Allowed",
        description: "Bot can check from BB when not raised",
        category: "basic",
        payload: this.buildPayload({
          stage: "pre-flop",
          action: { canCheck: true, toCall: 0, minRaise: 50, maxRaise: 5000 },
        }),
        expectedActions: ["check", "raise"],
        maxResponseTimeMs: 5000,
      },
      {
        id: "basic_flop",
        name: "Flop: With Best Hand Info",
        description: "Bot handles flop with bestHand provided",
        category: "basic",
        payload: this.buildPayload({
          stage: "flop",
          communityCards: ["A♦", "7♣", "2♠"],
          bestHand: { name: "ONE_PAIR", cards: ["A♠", "A♦", "K♥", "7♣", "2♠"] },
          action: { canCheck: true, toCall: 0, minRaise: 50, maxRaise: 4500 },
        }),
        expectedActions: ["check", "bet", "raise"],
        maxResponseTimeMs: 5000,
      },
      {
        id: "basic_river",
        name: "River: Final Decision",
        description: "Bot handles river betting",
        category: "basic",
        payload: this.buildPayload({
          stage: "river",
          communityCards: ["A♠", "K♦", "Q♣", "J♥", "9♠"],
          bestHand: {
            name: "STRAIGHT",
            cards: ["A♠", "K♦", "Q♣", "J♥", "10♥"],
          },
          action: {
            canCheck: false,
            toCall: 200,
            minRaise: 400,
            maxRaise: 2800,
          },
        }),
        expectedActions: ["fold", "call", "raise"],
        maxResponseTimeMs: 5000,
      },
      {
        id: "edge_short_stack",
        name: "Edge: Short Stack (< 1BB)",
        description: "Bot handles near-zero chip count",
        category: "edge_case",
        payload: this.buildPayload({
          stage: "pre-flop",
          chips: 30,
          action: { canCheck: false, toCall: 50, minRaise: 0, maxRaise: 0 },
        }),
        expectedActions: ["fold", "call", "all_in"],
        maxResponseTimeMs: 5000,
      },
      {
        id: "edge_all_in_facing",
        name: "Edge: Facing All-In",
        description: "Bot handles all-in decision",
        category: "edge_case",
        payload: this.buildPayload({
          stage: "pre-flop",
          chips: 5000,
          action: {
            canCheck: false,
            toCall: 3000,
            minRaise: 0,
            maxRaise: 2000,
          },
          pot: 4000,
        }),
        expectedActions: ["fold", "call", "all_in"],
        maxResponseTimeMs: 5000,
      },
      {
        id: "edge_heads_up",
        name: "Edge: Heads-Up Play",
        description: "Bot handles heads-up BTN/SB position",
        category: "edge_case",
        payload: this.buildPayload({
          stage: "pre-flop",
          position: "BTN/SB",
          players: [
            {
              name: "TestBot",
              chips: 5000,
              bet: 25,
              folded: false,
              allIn: false,
              position: "BTN/SB",
            },
            {
              name: "Opponent",
              chips: 5000,
              bet: 50,
              folded: false,
              allIn: false,
              position: "BB",
            },
          ],
          action: { canCheck: false, toCall: 25, minRaise: 50, maxRaise: 4975 },
        }),
        expectedActions: ["fold", "call", "raise"],
        maxResponseTimeMs: 5000,
      },
      {
        id: "edge_multiway",
        name: "Edge: Multi-way Pot (4+ players)",
        description: "Bot handles multi-way pot correctly",
        category: "edge_case",
        payload: this.buildPayload({
          stage: "flop",
          communityCards: ["J♠", "8♠", "3♠"],
          players: [
            {
              name: "TestBot",
              chips: 3800,
              bet: 0,
              folded: false,
              allIn: false,
              position: "CO",
            },
            {
              name: "P2",
              chips: 2500,
              bet: 200,
              folded: false,
              allIn: false,
              position: "BTN",
            },
            {
              name: "P3",
              chips: 800,
              bet: 200,
              folded: false,
              allIn: false,
              position: "SB",
            },
            {
              name: "P4",
              chips: 0,
              bet: 200,
              folded: false,
              allIn: true,
              position: "BB",
            },
          ],
          action: {
            canCheck: false,
            toCall: 200,
            minRaise: 400,
            maxRaise: 3600,
          },
          pot: 600,
        }),
        expectedActions: ["fold", "call", "raise"],
        maxResponseTimeMs: 5000,
      },
      {
        id: "edge_min_raise_only",
        name: "Edge: Can Only Min-Raise",
        description: "Bot handles situation where only min-raise is possible",
        category: "edge_case",
        payload: this.buildPayload({
          stage: "turn",
          chips: 150,
          action: { canCheck: false, toCall: 100, minRaise: 50, maxRaise: 50 },
          pot: 400,
        }),
        expectedActions: ["fold", "call", "raise", "all_in"],
        maxResponseTimeMs: 5000,
      },
      {
        id: "edge_zero_max_raise",
        name: "Edge: No Raise Possible",
        description: "Bot handles when maxRaise is 0",
        category: "edge_case",
        payload: this.buildPayload({
          stage: "pre-flop",
          chips: 50,
          action: { canCheck: false, toCall: 50, minRaise: 0, maxRaise: 0 },
        }),
        expectedActions: ["fold", "call", "all_in"],
        maxResponseTimeMs: 5000,
        validate: (response) => {
          const errors: ValidationError[] = [];
          if (response.type === "raise") {
            errors.push({
              field: "type",
              message: "Cannot raise when maxRaise is 0",
              severity: "error",
            });
          }
          return errors;
        },
      },
      {
        id: "stress_response_time",
        name: "Stress: Response Time Under 3s",
        description:
          "Bot responds within comfortable margin of tournament timeout",
        category: "stress",
        payload: this.buildPayload({ stage: "flop" }),
        maxResponseTimeMs: 3000,
      },
      {
        id: "stress_large_numbers",
        name: "Stress: Large Chip Amounts",
        description: "Bot handles large chip numbers correctly",
        category: "stress",
        payload: this.buildPayload({
          stage: "turn",
          chips: 999999999,
          pot: 500000000,
          action: {
            canCheck: false,
            toCall: 100000000,
            minRaise: 100000000,
            maxRaise: 899999999,
          },
        }),
        expectedActions: ["fold", "call", "raise", "all_in"],
        maxResponseTimeMs: 5000,
        validate: (response) => {
          const errors: ValidationError[] = [];
          if (response.type === "raise" && response.amount > 899999999) {
            errors.push({
              field: "amount",
              message: "Raise amount exceeds maxRaise",
              severity: "error",
            });
          }
          return errors;
        },
      },
    ];
  }

  private buildPayload(overrides: any = {}): any {
    const base = {
      gameId: "validation_test",
      handNumber: 1,
      stage: overrides.stage || "pre-flop",
      you: {
        name: "TestBot",
        chips: overrides.chips || 5000,
        holeCards: overrides.holeCards || ["A♠", "K♥"],
        bet: overrides.bet || 0,
        position: overrides.position || "BTN",
        bestHand: overrides.bestHand,
      },
      action: overrides.action || {
        canCheck: false,
        toCall: 50,
        minRaise: 100,
        maxRaise: 4950,
      },
      table: {
        pot: overrides.pot || 75,
        currentBet: overrides.currentBet || 50,
        communityCards: overrides.communityCards || [],
        smallBlind: 25,
        bigBlind: 50,
        ante: 10,
      },
      players: overrides.players || [
        {
          name: "TestBot",
          chips: overrides.chips || 5000,
          bet: overrides.bet || 0,
          folded: false,
          allIn: false,
          position: overrides.position || "BTN",
        },
        {
          name: "Opponent",
          chips: 5000,
          bet: 50,
          folded: false,
          allIn: false,
          position: "BB",
        },
      ],
    };

    return base;
  }
}
