/**
 * StrategyEngineService: Main entry point for evaluating bot strategies.
 *
 * Receives a game state payload (same format as buildBotPayload) and a
 * BotStrategy, returns the action the bot should take.
 *
 * Evaluation order (first match wins):
 * 1. Position overrides (if tier=pro and position has override)
 * 2. Range chart (preflop only)
 * 3. Rules (per-street, top-to-bottom by priority)
 * 4. Personality (always available as fallback)
 */

import type {
  BotStrategy,
  GameContext,
  StrategyAction,
  StrategyEvaluation,
  ActionDefinition,
  Street,
  Position,
  Personality,
  StreetRules,
  RangeChart,
} from "../../domain/bot-strategy/strategy.types";

import { analyzeHand } from "./evaluators/hand-analyzer";
import { analyzeBoard } from "./evaluators/board-analyzer";
import {
  evaluateRangeChart,
  rangeActionToActionDef,
} from "./evaluators/range-chart.evaluator";
import { evaluateRules } from "./evaluators/rule.evaluator";
import { evaluatePersonality } from "./evaluators/personality.evaluator";
import { parseCardString } from "./evaluators/hand-analyzer";

export interface BotPayload {
  gameId: string;
  handNumber: number;
  stage: string;
  you: {
    name: string;
    chips: number;
    holeCards: string[];
    bet: number;
    position: string;
    bestHand?: { name: string; cards?: unknown[] };
  };
  action: {
    canCheck: boolean;
    toCall: number;
    minRaise: number;
    maxRaise: number;
  };
  table: {
    pot: number;
    currentBet: number;
    communityCards: string[];
    smallBlind: number;
    bigBlind: number;
    ante: number;
  };
  players: Array<{
    name: string;
    chips: number;
    bet: number;
    folded: boolean;
    allIn: boolean;
    position: string;
    disconnected?: boolean;
  }>;
}

/**
 * Evaluate a bot strategy against a game state and return the action.
 * This is a pure function with no side effects.
 */
export function evaluateStrategy(
  strategy: BotStrategy,
  payload: BotPayload,
): StrategyEvaluation {
  const context = buildGameContext(payload);

  // Resolve effective strategy (apply position overrides if applicable)
  const effective = resolveEffectiveStrategy(strategy, context);

  // Step 1: Range chart (preflop only)
  if (context.street === "preflop" && effective.rangeChart) {
    const holeCards = payload.you.holeCards.map(parseCardString);
    const rangeResult = evaluateRangeChart(holeCards, effective.rangeChart);

    if (rangeResult.matched && rangeResult.action !== null) {
      const actionDef = rangeActionToActionDef(rangeResult.action);
      if (actionDef) {
        const action = resolveAction(actionDef, context);
        return {
          action,
          source: "range_chart",
          explanation: `Range chart: ${rangeResult.handNotation} → ${rangeResult.action}`,
          handNotation: rangeResult.handNotation,
        };
      }
    }
  }

  // Step 2: Rules (per-street)
  if (effective.rules) {
    const streetRules = effective.rules[context.street];
    if (streetRules && streetRules.length > 0) {
      const ruleResult = evaluateRules(streetRules, context);
      if (ruleResult.matched && ruleResult.action) {
        const action = resolveAction(ruleResult.action, context);
        return {
          action,
          source: "rule",
          explanation: `Rule matched: ${ruleResult.ruleLabel || ruleResult.ruleId}`,
          ruleId: ruleResult.ruleId,
        };
      }
    }
  }

  // Step 3: Personality fallback
  const handSeed = hashSeed(payload.gameId, payload.handNumber);
  const personalityResult = evaluatePersonality(
    effective.personality,
    context,
    handSeed,
  );

  const action = resolveAction(personalityResult.action, context);
  return {
    action,
    source: strategy.positionOverrides?.[context.myPosition as Position]
      ? "position_override"
      : "personality",
    explanation: personalityResult.explanation,
  };
}

/**
 * Build the full game context from the bot payload.
 * This is the bridge between raw game state and the condition field system.
 */
export function buildGameContext(payload: BotPayload): GameContext {
  const bb = payload.table.bigBlind || 1;
  const stage = normalizeStreet(payload.stage);

  const handAnalysis = analyzeHand(
    payload.you.holeCards,
    payload.table.communityCards,
    payload.you.bestHand?.name,
  );

  const boardAnalysis = analyzeBoard(payload.table.communityCards);

  const activePlayers = payload.players.filter((p) => !p.folded);
  const myIndex = payload.players.findIndex((p) => p.name === payload.you.name);
  const playersToAct =
    myIndex >= 0
      ? payload.players.filter((p, i) => i > myIndex && !p.folded).length
      : 0;

  const minOpponentChips = activePlayers
    .filter((p) => p.name !== payload.you.name)
    .reduce((min, p) => Math.min(min, p.chips), Infinity);
  const effectiveStack = Math.min(
    payload.you.chips,
    minOpponentChips === Infinity ? payload.you.chips : minOpponentChips,
  );

  return {
    handStrength: handAnalysis.handStrength,
    pairType: handAnalysis.pairType,
    hasFlushDraw: handAnalysis.hasFlushDraw,
    hasStraightDraw: handAnalysis.hasStraightDraw,
    holeCardRank: handAnalysis.holeCardRank,

    communityCardCount: boardAnalysis.communityCardCount,
    boardTexture: boardAnalysis.boardTexture,

    facingBet: payload.action.toCall > 0,
    facingRaise: payload.table.currentBet > bb,
    facingAllIn: payload.players.some((p) => p.allIn && !p.folded),
    activePlayerCount: activePlayers.length,
    playersToAct,

    myPosition: (payload.you.position as Position) || null,
    isInPosition: isLastToAct(payload),

    myStackBB: payload.you.chips / bb,
    effectiveStackBB: effectiveStack / bb,

    potSizeBB: payload.table.pot / bb,
    potOdds:
      payload.action.toCall > 0
        ? payload.action.toCall / (payload.table.pot + payload.action.toCall)
        : 0,

    canCheck: payload.action.canCheck,
    toCall: payload.action.toCall,
    minRaise: payload.action.minRaise,
    maxRaise: payload.action.maxRaise,

    street: stage,
    bigBlind: bb,
  };
}

function resolveEffectiveStrategy(
  strategy: BotStrategy,
  context: GameContext,
): {
  personality: Personality;
  rules?: StreetRules;
  rangeChart?: RangeChart;
} {
  const pos = context.myPosition as Position;

  if (strategy.tier === "pro" && pos && strategy.positionOverrides?.[pos]) {
    const override = strategy.positionOverrides[pos];
    return {
      personality: {
        ...strategy.personality,
        ...override.personality,
      },
      rules: override.rules || strategy.rules,
      rangeChart: override.rangeChart || strategy.rangeChart,
    };
  }

  return {
    personality: strategy.personality,
    rules: strategy.rules,
    rangeChart: strategy.rangeChart,
  };
}

/**
 * Ensures the returned action is valid given game constraints.
 * Converts abstract actions (raise with pot_fraction sizing) to concrete amounts.
 */
function resolveAction(
  actionDef: ActionDefinition,
  ctx: GameContext,
): StrategyAction {
  switch (actionDef.type) {
    case "fold":
      if (ctx.canCheck) {
        return { type: "check" };
      }
      return { type: "fold" };

    case "check":
      if (ctx.canCheck) {
        return { type: "check" };
      }
      return { type: "fold" };

    case "call":
      if (ctx.toCall <= 0 && ctx.canCheck) {
        return { type: "check" };
      }
      return { type: "call" };

    case "raise": {
      if (ctx.maxRaise <= 0) {
        if (ctx.toCall > 0) return { type: "call" };
        return { type: "check" };
      }

      const amount = computeRaiseAmount(actionDef, ctx);
      const clampedAmount = Math.max(
        ctx.minRaise,
        Math.min(amount, ctx.maxRaise),
      );
      return { type: "raise", amount: Math.round(clampedAmount) };
    }

    case "all_in":
      return { type: "all_in" };

    default:
      return { type: "fold" };
  }
}

function computeRaiseAmount(
  actionDef: ActionDefinition,
  ctx: GameContext,
): number {
  if (!actionDef.sizing) {
    return ctx.minRaise;
  }

  switch (actionDef.sizing.mode) {
    case "pot_fraction":
      return ctx.potSizeBB * ctx.bigBlind * actionDef.sizing.value;

    case "bb_multiple":
      return actionDef.sizing.value * ctx.bigBlind;

    case "previous_bet_multiple": {
      const currentBet = ctx.toCall;
      return currentBet * actionDef.sizing.value;
    }

    case "fixed":
      return actionDef.sizing.value;

    default:
      return ctx.minRaise;
  }
}

function normalizeStreet(stage: string): Street {
  const normalized = stage.toLowerCase().replace(/[_-]/g, "");
  if (normalized === "preflop") return "preflop";
  if (normalized === "flop") return "flop";
  if (normalized === "turn") return "turn";
  if (normalized === "river") return "river";
  return "preflop";
}

function isLastToAct(payload: BotPayload): boolean {
  const activePlayers = payload.players.filter((p) => !p.folded);
  if (activePlayers.length <= 1) return true;

  // BTN is typically last to act post-flop
  return payload.you.position === "BTN";
}

function hashSeed(gameId: string, handNumber: number): number {
  let hash = 0;
  const str = `${gameId}:${handNumber}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash || 1;
}
