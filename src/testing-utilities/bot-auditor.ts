/**
 * BotAuditor — High-level validation suite for bot logic.
 *
 * Injects synthetic GameState (BotPayload) directly into the strategy engine
 * and asserts that the returned action is logically sound.
 *
 * Two categories of checks:
 *   - "illegal_move": Hard failures. The action is outright illegal in poker.
 *   - "strategy_sanity": Soft flags. The action is deeply suboptimal given math.
 *
 * Scenarios:
 *   1. neverFoldOnCheck       — canCheck=true → MUST NOT fold (illegal move)
 *   2. neverCallZeroEquity    — very negative EV call → should fold (strategy flag)
 *   3. minRaiseCompliance     — any raise must be >= minRaise (illegal move)
 *   4. neverFoldAllIn         — player is all-in → MUST NOT fold (illegal move)
 *   5. strongHandValidation  — full house on river, single bet → MUST NOT fold (strategy sanity)
 *   6. potOddsAwareness       — nut flush draw, 5:1 pot odds → MUST NOT fold (strategy sanity)
 *   7. bluffFrequencyCheck    — HIGH_CARD on dry river, 100 trials → Shark/Maniac must raise ≥15-20%
 */

import type {
  BotStrategy,
  GameContext,
  StrategyAction,
} from "../domain/bot-strategy/strategy.types";
import {
  evaluateHydrated,
  getOrHydrateStrategy,
  buildGameContext,
  clearEvalCache,
  type BotPayload,
} from "../modules/bot-strategy/strategy-engine.service";

// ============================================================================
// PUBLIC TYPES
// ============================================================================

export type AssertionCategory = "illegal_move" | "strategy_sanity";

export interface FrequencyData {
  raiseCount: number;
  callCount: number;
  foldCount: number;
  trialCount: number;
  raiseRate: number; // 0–1
}

export interface AssertionResult {
  assertionName: string;
  category: AssertionCategory;
  passed: boolean;
  action: StrategyAction;
  /** Key context values captured at evaluation time for debugging */
  context: {
    equity: number;
    potOdds: number;
    canCheck: boolean;
    toCall: number;
    minRaise: number;
    chips: number;
  };
  message: string;
  /** Populated only for frequency-based assertions */
  frequencyData?: FrequencyData;
}

export interface BotScenarioResult {
  botId: string;
  botName: string;
  scenarioName: string;
  scenarioDescription: string;
  actionTaken: StrategyAction;
  source: string;
  explanation: string;
  assertions: AssertionResult[];
}

export interface BotAuditReport {
  results: BotScenarioResult[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    byBot: Record<string, { passed: number; failed: number }>;
  };
}

// ============================================================================
// INTERNAL SCENARIO SHAPE
// ============================================================================

type AssertionFn = (
  payload: BotPayload,
  action: StrategyAction,
  ctx: GameContext,
) => Omit<AssertionResult, "action" | "context">;

interface Scenario {
  name: string;
  description: string;
  payload: BotPayload;
  assertions: Array<{
    name: string;
    category: AssertionCategory;
    fn: AssertionFn;
  }>;
}

interface FrequencyScenario {
  name: string;
  description: string;
  /** Base payload — decisionSeed is overridden per trial */
  basePayload: BotPayload;
  trialCount: number;
  category: AssertionCategory;
  /** Returns min/max raise-rate thresholds for a given bot name. null = no upper bound. */
  getThresholds(botName: string): { min: number; max: number | null };
}

// ============================================================================
// PAYLOAD HELPERS
// ============================================================================

const DECISION_SEED = "0".repeat(64);

function makePayload(
  overrides: Partial<BotPayload> & {
    holeCards: string[];
    communityCards: string[];
    chips: number;
    toCall: number;
    canCheck: boolean;
    minRaise: number;
    maxRaise: number;
    pot: number;
    stage: string;
    bestHandName?: string;
    position?: string;
    bet?: number;
  },
): BotPayload {
  const {
    holeCards,
    communityCards,
    chips,
    toCall,
    canCheck,
    minRaise,
    maxRaise,
    pot,
    stage,
    bestHandName,
    position = "BB",
    bet = 0,
    ...rest
  } = overrides;

  return {
    gameId: "audit-test",
    handNumber: 1,
    stage,
    you: {
      name: "AuditBot",
      chips,
      holeCards,
      bet,
      position,
      ...(bestHandName ? { bestHand: { name: bestHandName } } : {}),
    },
    action: { canCheck, toCall, minRaise, maxRaise },
    table: {
      pot,
      currentBet: toCall,
      communityCards,
      smallBlind: 10,
      bigBlind: 20,
      ante: 0,
    },
    players: [
      {
        name: "AuditBot",
        chips,
        bet,
        folded: false,
        allIn: chips === 0,
        position,
      },
      {
        name: "Opponent",
        chips: 1000,
        bet: toCall,
        folded: false,
        allIn: false,
        position: "BTN",
      },
    ],
    decisionSeed: DECISION_SEED,
    ...rest,
  };
}

// ============================================================================
// SCENARIOS
// ============================================================================

function scenarioNeverFoldOnCheck(): Scenario {
  const payload = makePayload({
    stage: "flop",
    holeCards: ["7c", "2d"],
    communityCards: ["Ah", "Kd", "5c"],
    chips: 1000,
    bet: 20,
    toCall: 0,
    canCheck: true,
    minRaise: 40,
    maxRaise: 1000,
    pot: 60,
    position: "BB",
  });

  return {
    name: "neverFoldOnCheck",
    description:
      "When no bet is pending (toCall=0, canCheck=true), folding is illegal. Bot must check or bet.",
    payload,
    assertions: [
      {
        name: "neverFoldOnCheck",
        category: "illegal_move",
        fn: (_payload, action) => ({
          assertionName: "neverFoldOnCheck",
          category: "illegal_move",
          passed: action.type !== "fold",
          message:
            action.type === "fold"
              ? `ILLEGAL: Bot folded when it could check for free (toCall=0, canCheck=true)`
              : `OK: Bot chose ${action.type} (fold-when-free prevented)`,
        }),
      },
    ],
  };
}

function scenarioNeverCallZeroEquity(): Scenario {
  // High card hand (7-2 off, board A-K-Q-7-5 non-paired) → equity ~25% via heuristic.
  // Facing a massive overbet (70% pot odds). Calling is deeply –EV.
  // Flag bots that call when potOdds > equity by a wide margin.
  const payload = makePayload({
    stage: "river",
    holeCards: ["2c", "3d"],
    communityCards: ["As", "Kd", "Qh", "7c", "5s"],
    chips: 800,
    toCall: 560, // 70% of pot: 560/(240+560) = 70%
    canCheck: false,
    minRaise: 0,
    maxRaise: 800,
    pot: 240,
    position: "BB",
    bestHandName: "HIGH_CARD",
  });

  return {
    name: "neverCallZeroEquity",
    description:
      "Facing a 70% pot-odds bet with ~25% high-card equity is deeply –EV. " +
      "Bot should fold. Calling here is a 'Stupidity' flag.",
    payload,
    assertions: [
      {
        name: "neverCallZeroEquity",
        category: "strategy_sanity",
        fn: (_payload, action, ctx) => {
          // Only flag if pot odds clearly exceed equity by a wide margin
          const isNegativeEv = ctx.potOdds > ctx.equity * 1.5;
          const passed = !isNegativeEv || action.type === "fold";
          return {
            assertionName: "neverCallZeroEquity",
            category: "strategy_sanity",
            passed,
            message: passed
              ? `OK: action=${action.type} (equity=${(ctx.equity * 100).toFixed(1)}%, potOdds=${(ctx.potOdds * 100).toFixed(1)}%)`
              : `FLAG: Bot ${action.type}d with equity=${(ctx.equity * 100).toFixed(1)}% ` +
                `vs potOdds=${(ctx.potOdds * 100).toFixed(1)}% — deeply negative EV`,
          };
        },
      },
    ],
  };
}

function scenarioMinRaiseCompliance(): Scenario {
  // Premium hand (AA) on a dry turn board — aggressive bots will raise.
  // The engine must not return raise.amount < minRaise.
  const payload = makePayload({
    stage: "turn",
    holeCards: ["Ah", "Ad"],
    communityCards: ["2h", "7d", "Kc", "3s"],
    chips: 1000,
    bet: 20,
    toCall: 0,
    canCheck: true,
    minRaise: 40,
    maxRaise: 1000,
    pot: 80,
    position: "BTN",
    bestHandName: "ONE_PAIR",
  });

  return {
    name: "minRaiseCompliance",
    description:
      "Any raise action MUST be >= minRaise (40). Raises below the minimum are illegal in poker.",
    payload,
    assertions: [
      {
        name: "minRaiseCompliance",
        category: "illegal_move",
        fn: (p, action) => {
          if (action.type !== "raise") {
            return {
              assertionName: "minRaiseCompliance",
              category: "illegal_move",
              passed: true,
              message: `OK: Bot ${action.type}d (no raise — compliance n/a)`,
            };
          }
          const amount = action.amount ?? 0;
          const minRaise = p.action.minRaise;
          const passed = amount >= minRaise;
          return {
            assertionName: "minRaiseCompliance",
            category: "illegal_move",
            passed,
            message: passed
              ? `OK: raise=${amount} >= minRaise=${minRaise}`
              : `ILLEGAL: raise=${amount} is below minRaise=${minRaise}`,
          };
        },
      },
    ],
  };
}

function scenarioNeverFoldAllIn(): Scenario {
  // Player is all-in (chips=0). They've committed their stack — folding is nonsensical.
  // canCheck=true because they have no more chips to respond to bets with.
  const payload = makePayload({
    stage: "river",
    holeCards: ["Kh", "Qd"],
    communityCards: ["2h", "7d", "Kc", "3s", "Ah"],
    chips: 0,
    bet: 500,
    toCall: 0,
    canCheck: true,
    minRaise: 0,
    maxRaise: 0,
    pot: 1000,
    position: "SB",
    bestHandName: "ONE_PAIR",
  });

  // Override players to show bot as all-in
  payload.players[0].allIn = true;

  return {
    name: "neverFoldAllIn",
    description:
      "An all-in player (chips=0) has nothing left to fold. " +
      "They should check/call, not fold — folding sacrifices the pot they've already committed.",
    payload,
    assertions: [
      {
        name: "neverFoldAllIn",
        category: "illegal_move",
        fn: (_payload, action) => ({
          assertionName: "neverFoldAllIn",
          category: "illegal_move",
          passed: action.type !== "fold",
          message:
            action.type === "fold"
              ? `ILLEGAL: All-in bot (chips=0) returned fold — gives up already-committed stack`
              : `OK: All-in bot returned ${action.type} (stack preserved)`,
        }),
      },
    ],
  };
}

function scenarioStrongHandValidation(): Scenario {
  // Full house (KKK over AA) on the river, facing a single bet.
  // Folding a full house to any single bet on the river is never correct.
  const payload = makePayload({
    stage: "river",
    holeCards: ["Kh", "Kd"],
    communityCards: ["Kc", "Ah", "Ad", "Qc", "5s"],
    chips: 970,
    toCall: 30,
    canCheck: false,
    minRaise: 60,
    maxRaise: 970,
    pot: 200,
    position: "BTN",
    bestHandName: "FULL_HOUSE",
  });

  return {
    name: "strongHandValidation",
    description:
      "Bot holds Full House (KKKAA) on the river facing a small bet (30 into 200). " +
      "Folding a strong hand here is never correct — even The Nit should call.",
    payload,
    assertions: [
      {
        name: "strongHandValidation",
        category: "strategy_sanity",
        fn: (_payload, action, ctx) => ({
          assertionName: "strongHandValidation",
          category: "strategy_sanity",
          passed: action.type !== "fold",
          message:
            action.type === "fold"
              ? `FLAG: Bot folded Full House to a ${ctx.toCall} bet into ${ctx.potSizeBB * ctx.bigBlind} pot ` +
                `(equity=${(ctx.equity * 100).toFixed(1)}%)`
              : `OK: Bot ${action.type}d with Full House (equity=${(ctx.equity * 100).toFixed(1)}%)`,
        }),
      },
    ],
  };
}

function scenarioPotOddsAwareness(): Scenario {
  // Nut flush draw (A♥2♥ on K♥7♥3♣): 9 flush outs, ~36% draw equity via Rule of 4.
  // Pot=100, toCall=20 → pot odds=16.7%. This is a highly profitable call (equity > 2× pot odds).
  const payload = makePayload({
    stage: "flop",
    holeCards: ["Ah", "2h"],
    communityCards: ["Kh", "7h", "3c"],
    chips: 980,
    toCall: 20,
    canCheck: false,
    minRaise: 40,
    maxRaise: 980,
    pot: 100,
    position: "CO",
  });

  return {
    name: "potOddsAwareness",
    description:
      "Nut flush draw (9 outs, ~36% equity with 2 cards to come) vs a small bet (20 into 100). " +
      "Pot odds=16.7%. This is a massively profitable call — folding here loses EV.",
    payload,
    assertions: [
      {
        name: "potOddsAwareness",
        category: "strategy_sanity",
        fn: (_payload, action, ctx) => {
          // Equity well above pot odds — folding surrenders huge +EV
          const equityVsPotOdds = ctx.equity - ctx.potOdds;
          const isObviouslyProfitable = equityVsPotOdds > 0.1; // equity exceeds pot odds by >10%
          const passed = !isObviouslyProfitable || action.type !== "fold";
          return {
            assertionName: "potOddsAwareness",
            category: "strategy_sanity",
            passed,
            message: passed
              ? `OK: Bot ${action.type}d (equity=${(ctx.equity * 100).toFixed(1)}%, potOdds=${(ctx.potOdds * 100).toFixed(1)}%)`
              : `FLAG: Bot folded with equity=${(ctx.equity * 100).toFixed(1)}% ` +
                `vs only ${(ctx.potOdds * 100).toFixed(1)}% pot odds ` +
                `(+${(equityVsPotOdds * 100).toFixed(1)}% EV surrendered)`,
          };
        },
      },
    ],
  };
}

function scenarioBluffFrequencyCheck(): FrequencyScenario {
  // River: 7♣2♦ on A♠K♥J♦9♠4♣ — total miss, HIGH_CARD.
  // Board is dry (no flush, low connectivity) but has scary high cards.
  // Opponent checked (canCheck=true, toCall=0). Bot may CHECK or BET (raise = bluff).
  // We run 100 trials with different seeds to measure how often the bot bets.
  const basePayload = makePayload({
    stage: "river",
    holeCards: ["7c", "2d"],
    communityCards: ["As", "Kh", "Jd", "9s", "4c"],
    chips: 800,
    toCall: 0,
    canCheck: true,
    minRaise: 40,
    maxRaise: 800,
    pot: 200,
    position: "BB",
    bestHandName: "HIGH_CARD",
  });

  return {
    name: "bluffFrequencyCheck",
    description:
      "River HIGH_CARD (7♣2♦) on a dry A-K-J-9-4 board, opponent checked. " +
      "Runs 200 trials with varied seeds to measure bluff-bet (raise) frequency. " +
      "Shark must bluff ≥12%, Maniac ≥20%, Nit/Rock ≤10%. " +
      "Bots that never bluff are flagged as 'Exploitable: Never Bluffs'.",
    basePayload,
    trialCount: 200,
    category: "strategy_sanity",
    getThresholds(botName: string): { min: number; max: number | null } {
      if (botName.includes("Nit")) return { min: 0, max: 0.1 };
      if (botName.includes("Rock")) return { min: 0, max: 0.1 };
      if (botName.includes("Shark")) return { min: 0.12, max: null };
      if (botName.includes("Maniac")) return { min: 0.2, max: null };
      return { min: 0.1, max: null };
    },
  };
}

// ============================================================================
// BOT AUDITOR
// ============================================================================

export class BotAuditor {
  private readonly scenarios: Scenario[];
  private readonly frequencyScenarios: FrequencyScenario[];

  constructor() {
    this.scenarios = [
      scenarioNeverFoldOnCheck(),
      scenarioNeverCallZeroEquity(),
      scenarioMinRaiseCompliance(),
      scenarioNeverFoldAllIn(),
      scenarioStrongHandValidation(),
      scenarioPotOddsAwareness(),
    ];
    this.frequencyScenarios = [scenarioBluffFrequencyCheck()];
  }

  private runFrequencyScenario(
    hydrated: ReturnType<typeof getOrHydrateStrategy>,
    bot: { id: string; name: string },
    scenario: FrequencyScenario,
  ): BotScenarioResult {
    let raiseCount = 0;
    let callCount = 0;
    let foldCount = 0;

    let firstAction: StrategyAction = { type: "fold" };
    let firstCtx!: GameContext;

    for (let i = 0; i < scenario.trialCount; i++) {
      // Unique seed per trial: index in the first 8 chars (seedFromHex reads first 8 chars only)
      const trialPayload: BotPayload = {
        ...scenario.basePayload,
        decisionSeed: (i + 1).toString(16).padStart(8, "0").padEnd(64, "0"),
      };

      clearEvalCache();
      const evaluation = evaluateHydrated(hydrated, trialPayload);

      if (i === 0) {
        firstAction = evaluation.action;
        firstCtx = buildGameContext(trialPayload);
      }

      if (evaluation.action.type === "raise") raiseCount++;
      else if (evaluation.action.type === "call") callCount++;
      else foldCount++;
    }

    const raiseRate = raiseCount / scenario.trialCount;
    const frequencyData: FrequencyData = {
      raiseCount,
      callCount,
      foldCount,
      trialCount: scenario.trialCount,
      raiseRate,
    };

    const thresholds = scenario.getThresholds(bot.name);
    const pct = (raiseRate * 100).toFixed(0);
    const counts = `Raise:${raiseCount} Call:${callCount} Fold:${foldCount}`;

    let passed = true;
    let message: string;

    if (thresholds.max !== null && raiseRate > thresholds.max) {
      passed = false;
      message =
        `FLAG: Bluffs too much for a Nit — raiseRate=${pct}% (${raiseCount}/${scenario.trialCount}), ` +
        `threshold ≤${(thresholds.max * 100).toFixed(0)}% (${counts})`;
    } else if (raiseRate < thresholds.min) {
      passed = false;
      message =
        `FLAG: Exploitable: Never Bluffs — raiseRate=${pct}% (${raiseCount}/${scenario.trialCount}), ` +
        `threshold ≥${(thresholds.min * 100).toFixed(0)}% (${counts})`;
    } else {
      const threshold =
        thresholds.max !== null
          ? `≤${(thresholds.max * 100).toFixed(0)}%`
          : `≥${(thresholds.min * 100).toFixed(0)}%`;
      message = `OK: raiseRate=${pct}% (${raiseCount}/${scenario.trialCount}) — threshold ${threshold} met (${counts})`;
    }

    const assertionResult: AssertionResult = {
      assertionName: scenario.name,
      category: scenario.category,
      passed,
      action: firstAction,
      context: {
        equity: firstCtx.equity,
        potOdds: firstCtx.potOdds,
        canCheck: firstCtx.canCheck,
        toCall: firstCtx.toCall,
        minRaise: firstCtx.minRaise,
        chips: scenario.basePayload.you.chips,
      },
      message,
      frequencyData,
    };

    return {
      botId: bot.id,
      botName: bot.name,
      scenarioName: scenario.name,
      scenarioDescription: scenario.description,
      actionTaken: firstAction,
      source: "frequency-trial",
      explanation: message,
      assertions: [assertionResult],
    };
  }

  runAll(
    bots: { id: string; name: string; strategy: BotStrategy }[],
  ): BotAuditReport {
    const results: BotScenarioResult[] = [];
    const byBot: Record<string, { passed: number; failed: number }> = {};

    for (const bot of bots) {
      const hydrated = getOrHydrateStrategy(bot.strategy);
      byBot[bot.name] = { passed: 0, failed: 0 };

      for (const scenario of this.scenarios) {
        // Clear the eval cache before each (bot × scenario) pair.
        // All audit scenarios share the same decisionSeed (deterministic), so without
        // clearing, the first bot's result would be returned from cache for every
        // subsequent bot. In production each bot has a unique per-action decisionSeed.
        clearEvalCache();

        const evaluation = evaluateHydrated(hydrated, scenario.payload);
        const ctx = buildGameContext(scenario.payload);

        const assertionResults: AssertionResult[] = scenario.assertions.map(
          ({ name, category, fn }) => {
            const partial = fn(scenario.payload, evaluation.action, ctx);
            return {
              ...partial,
              assertionName: name,
              category,
              action: evaluation.action,
              context: {
                equity: ctx.equity,
                potOdds: ctx.potOdds,
                canCheck: ctx.canCheck,
                toCall: ctx.toCall,
                minRaise: ctx.minRaise,
                chips: scenario.payload.you.chips,
              },
            };
          },
        );

        const allPassed = assertionResults.every((r) => r.passed);
        if (allPassed) {
          byBot[bot.name].passed += assertionResults.length;
        } else {
          byBot[bot.name].passed += assertionResults.filter(
            (r) => r.passed,
          ).length;
          byBot[bot.name].failed += assertionResults.filter(
            (r) => !r.passed,
          ).length;
        }

        results.push({
          botId: bot.id,
          botName: bot.name,
          scenarioName: scenario.name,
          scenarioDescription: scenario.description,
          actionTaken: evaluation.action,
          source: evaluation.source,
          explanation: evaluation.explanation,
          assertions: assertionResults,
        });
      }

      // Frequency scenarios (multi-trial)
      for (const freqScenario of this.frequencyScenarios) {
        const freqResult = this.runFrequencyScenario(
          hydrated,
          bot,
          freqScenario,
        );
        const passed = freqResult.assertions.filter((a) => a.passed).length;
        const failed = freqResult.assertions.length - passed;
        byBot[bot.name].passed += passed;
        byBot[bot.name].failed += failed;
        results.push(freqResult);
      }
    }

    const totalChecks = results.reduce(
      (sum, r) => sum + r.assertions.length,
      0,
    );
    const passed = results.reduce(
      (sum, r) => sum + r.assertions.filter((a) => a.passed).length,
      0,
    );
    const failed = totalChecks - passed;

    return { results, summary: { totalChecks, passed, failed, byBot } };
  }
}
