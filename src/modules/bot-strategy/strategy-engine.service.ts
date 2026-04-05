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
  StreetRules,
  RangeChart,
  Rule,
  HydratedStrategy,
  HydratedPosition,
  HydratedStreetRules,
  HydratedRangeChart,
} from "../../domain/bot-strategy/strategy.types";

import { analyzeHand, type HandAnalysis } from "./evaluators/hand-analyzer";
import { analyzeBoard, type BoardAnalysis } from "./evaluators/board-analyzer";
import {
  estimateEquityHeuristic,
  clearEquityMemo,
} from "./evaluators/equity.service";
import {
  evaluateCompiledRangeChart,
  rangeActionToActionDef,
  compileRangeChartLUT,
} from "./evaluators/range-chart.evaluator";
import { evaluatePreSortedRules } from "./evaluators/rule.evaluator";
import { evaluatePersonality } from "./evaluators/personality.evaluator";
import { parseCardString } from "./evaluators/hand-analyzer";

// ============================================================================
// HYDRATION — compile BotStrategy once at game-start into fast lookup structures
// ============================================================================

/**
 * Bounded LRU-style cache: evicts oldest entry when full.
 * Keyed by a hash of the serialized strategy so identical strategies share one entry.
 * Max 256 entries covers typical bots-per-server scenarios without unbounded growth.
 */
const HYDRATION_CACHE = new Map<string, HydratedStrategy>();
const CACHE_MAX = 256;

const STRATEGY_HASH_MAX_CHARS = 50_000;

function strategyHash(strategy: BotStrategy): string {
  const str = JSON.stringify(strategy);
  // Cap iteration to prevent unbounded loop over user-controlled input.
  // Include str.length in the key so two strategies with identical prefixes
  // but different total content don't collide.
  const len = Math.min(str.length, STRATEGY_HASH_MAX_CHARS);
  let hash = 0;
  for (let i = 0; i < len; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return `${strategy.tier}:${hash >>> 0}:${str.length}`;
}

function compileStreetRules(rules?: StreetRules): HydratedStreetRules {
  function compile(streetRules?: Rule[]): ReadonlyArray<Rule> {
    if (!streetRules?.length) return [];
    return Object.freeze(
      [...streetRules]
        .filter((r) => r.enabled)
        .sort((a, b) => a.priority - b.priority),
    );
  }
  return {
    preflop: compile(rules?.preflop),
    flop: compile(rules?.flop),
    turn: compile(rules?.turn),
    river: compile(rules?.river),
  };
}

function compileRangeChart(chart?: RangeChart): HydratedRangeChart | null {
  if (!chart) return null;
  return { lut: compileRangeChartLUT(chart) };
}

/**
 * Compile a BotStrategy into a HydratedStrategy for fast evaluation.
 *
 * Performed once per unique strategy per process lifetime (cached).
 * Eliminates repeated sort + filter + object-spread on every action call.
 */
export function hydrateStrategy(strategy: BotStrategy): HydratedStrategy {
  const baseRules = compileStreetRules(strategy.rules);
  const baseRange = compileRangeChart(strategy.rangeChart);

  const base: HydratedPosition = {
    personality: Object.freeze({ ...strategy.personality }),
    rules: baseRules,
    rangeChart: baseRange,
  };

  const positions: Partial<Record<Position, HydratedPosition>> =
    Object.create(null);

  if (strategy.positionOverrides) {
    for (const [pos, override] of Object.entries(
      strategy.positionOverrides,
    ) as [Position, (typeof strategy.positionOverrides)[Position]][]) {
      if (!override) continue;
      positions[pos] = {
        personality: Object.freeze({
          ...strategy.personality,
          ...override.personality,
        }),
        rules: override.rules ? compileStreetRules(override.rules) : baseRules,
        rangeChart: override.rangeChart
          ? compileRangeChart(override.rangeChart)
          : baseRange,
      };
    }
  }

  return { tier: strategy.tier, base, positions };
}

/**
 * Return the cached HydratedStrategy for this strategy, computing it on first access.
 * Safe to call on every action — O(1) after the first call for a given strategy.
 */
export function getOrHydrateStrategy(strategy: BotStrategy): HydratedStrategy {
  const key = strategyHash(strategy);
  const cached = HYDRATION_CACHE.get(key);
  if (cached) return cached;

  const hydrated = hydrateStrategy(strategy);

  if (HYDRATION_CACHE.size >= CACHE_MAX) {
    // Evict the oldest entry (first key in insertion order)
    const firstKey = HYDRATION_CACHE.keys().next().value;
    if (firstKey !== undefined) HYDRATION_CACHE.delete(firstKey);
  }
  HYDRATION_CACHE.set(key, hydrated);
  return hydrated;
}

/** Exposed for tests — clears the hydration cache. */
export function clearHydrationCache(): void {
  HYDRATION_CACHE.clear();
}

// ============================================================================
// EVALUATION CACHE — avoids re-evaluating identical game states
// ============================================================================

const EVAL_CACHE = new Map<string, StrategyEvaluation>();
const EVAL_CACHE_MAX = 512;

function evalCacheKey(hydrated: HydratedStrategy, payload: BotPayload): string {
  // Hash the decision-relevant fields. Personality seed depends on gameId+handNumber
  // so we include those implicitly via holeCards (unique per hand).
  // decisionSeed uniquely encodes (hand, bot, action); stage + constraints capture the rest
  return `${hydrated.tier}:${payload.decisionSeed.substring(0, 16)}:${payload.stage}:${payload.action.toCall}:${payload.action.canCheck ? 1 : 0}`;
}

/** Clear the evaluation cache. Call at the end of each hand. */
export function clearEvalCache(): void {
  EVAL_CACHE.clear();
}

// ============================================================================
// MEMOIZATION — cache hand/board analysis within a street
// ============================================================================

const HAND_ANALYSIS_MEMO = new Map<string, HandAnalysis>();
const BOARD_ANALYSIS_MEMO = new Map<string, BoardAnalysis>();

function memoizedAnalyzeHand(
  holeCards: string[],
  communityCards: string[],
  bestHandName?: string,
  street?: Street,
): HandAnalysis {
  // The community card count encodes the street (5 cards = river), so the
  // key doesn't need the street — same cards always yield the same result.
  const key = `${holeCards[0]}${holeCards[1]}:${communityCards.join(",")}:${bestHandName ?? ""}`;
  const cached = HAND_ANALYSIS_MEMO.get(key);
  if (cached) return cached;
  const result = analyzeHand(holeCards, communityCards, bestHandName, street);
  HAND_ANALYSIS_MEMO.set(key, result);
  return result;
}

function memoizedAnalyzeBoard(communityCards: string[]): BoardAnalysis {
  const key = communityCards.join(",");
  const cached = BOARD_ANALYSIS_MEMO.get(key);
  if (cached) return cached;
  const result = analyzeBoard(communityCards);
  BOARD_ANALYSIS_MEMO.set(key, result);
  return result;
}

/** Clear street-level memos. Call at the end of each hand. */
export function clearStreetMemos(): void {
  HAND_ANALYSIS_MEMO.clear();
  BOARD_ANALYSIS_MEMO.clear();
  clearEquityMemo();
}

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
  /** Hex seed for deterministic strategy decisions. Derived from provably fair combinedHash + botId + actionSeq. */
  decisionSeed: string;
}

/**
 * Core evaluation loop against a pre-hydrated strategy.
 *
 * This is the hot path — called on every bot action. Accepts a HydratedStrategy
 * (compiled at game-start) so no sort, filter, or object-spread occurs here.
 * Pure function with no side effects.
 *
 * Evaluation order (first match wins):
 *   1. Range chart  (preflop, compiled Map lookup)
 *   2. Rules        (pre-sorted array, no re-sort)
 *   3. Personality  (always fires as fallback)
 */
export function evaluateHydrated(
  hydrated: HydratedStrategy,
  payload: BotPayload,
): StrategyEvaluation {
  // ── Check eval cache ──────────────────────────────────────────────────
  const cacheKey = evalCacheKey(hydrated, payload);
  const cached = EVAL_CACHE.get(cacheKey);
  if (cached) return cached;

  const result = evaluateHydratedUncached(hydrated, payload);

  // Store in eval cache (bounded LRU)
  if (EVAL_CACHE.size >= EVAL_CACHE_MAX) {
    const firstKey = EVAL_CACHE.keys().next().value;
    if (firstKey !== undefined) EVAL_CACHE.delete(firstKey);
  }
  EVAL_CACHE.set(cacheKey, result);
  return result;
}

function evaluateHydratedUncached(
  hydrated: HydratedStrategy,
  payload: BotPayload,
): StrategyEvaluation {
  const street = normalizeStreet(payload.stage);

  // Resolve per-position override (O(1) lookup) or fall back to base
  const position = (payload.you.position as Position) || null;
  const effective: HydratedPosition =
    hydrated.tier === "pro" && position
      ? (hydrated.positions[position] ?? hydrated.base)
      : hydrated.base;

  // ── Lazy fast path: preflop range chart (zero context building) ───────
  if (street === "preflop" && effective.rangeChart) {
    const holeCards = payload.you.holeCards.map(parseCardString);
    const rangeResult = evaluateCompiledRangeChart(
      holeCards,
      effective.rangeChart,
    );

    if (rangeResult.matched && rangeResult.action !== null) {
      const actionDef = rangeActionToActionDef(rangeResult.action);
      if (actionDef) {
        const action = resolveActionMinimal(actionDef, payload);
        return {
          action,
          source: "range_chart",
          explanation: `Range chart: ${rangeResult.handNotation} → ${rangeResult.action}`,
          handNotation: rangeResult.handNotation,
        };
      }
    }
  }

  // ── Full context path: rules → personality ────────────────────────────
  const context = buildGameContext(payload);

  // Step 2: Rules — pre-sorted, no re-sort
  const streetRules = effective.rules[context.street];
  if (streetRules.length > 0) {
    const ruleResult = evaluatePreSortedRules(streetRules, context);
    if (ruleResult.matched && ruleResult.action) {
      const action = resolveAction(ruleResult.action, context);
      return {
        action,
        source:
          context.myPosition && hydrated.positions[context.myPosition]
            ? "position_override"
            : "rule",
        explanation: `Rule matched: ${ruleResult.ruleLabel || ruleResult.ruleId}`,
        ruleId: ruleResult.ruleId,
      };
    }
  }

  // Step 3: Personality fallback — seed derived from provably fair chain
  const seed = seedFromHex(payload.decisionSeed);
  const personalityResult = evaluatePersonality(
    effective.personality,
    context,
    seed,
    hydrated.tier !== "pro", // Quick + Strategy tiers get position-aware eval; Pro uses explicit overrides
  );

  return {
    action: resolveAction(personalityResult.action, context),
    source:
      context.myPosition && hydrated.positions[context.myPosition]
        ? "position_override"
        : "personality",
    explanation: personalityResult.explanation,
  };
}

/**
 * Evaluate a bot strategy against a game state and return the action.
 * This is a pure function with no side effects.
 *
 * Internally hydrates (or retrieves from cache) the strategy before evaluating,
 * so repeated calls with the same strategy object are fast after the first call.
 * For maximum performance, pre-hydrate at game-start using `getOrHydrateStrategy`
 * and call `evaluateHydrated` directly.
 */
export function evaluateStrategy(
  strategy: BotStrategy,
  payload: BotPayload,
): StrategyEvaluation {
  return evaluateHydrated(getOrHydrateStrategy(strategy), payload);
}

/**
 * Build the full game context from the bot payload.
 * This is the bridge between raw game state and the condition field system.
 */
export function buildGameContext(payload: BotPayload): GameContext {
  const bb = payload.table.bigBlind || 1;
  const stage = normalizeStreet(payload.stage);

  const handAnalysis = memoizedAnalyzeHand(
    payload.you.holeCards,
    payload.table.communityCards,
    payload.you.bestHand?.name,
    stage,
  );

  const boardAnalysis = memoizedAnalyzeBoard(payload.table.communityCards);

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
    equity: estimateEquityHeuristic(
      payload.you.holeCards,
      payload.table.communityCards,
      activePlayers.length - 1,
    ),

    canCheck: payload.action.canCheck,
    toCall: payload.action.toCall,
    minRaise: payload.action.minRaise,
    maxRaise: payload.action.maxRaise,

    street: stage,
    bigBlind: bb,
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

/**
 * Lightweight action resolver that works directly from BotPayload constraints.
 * Used for the lazy preflop path where range chart decides before building full GameContext.
 */
function resolveActionMinimal(
  actionDef: ActionDefinition,
  payload: BotPayload,
): StrategyAction {
  const { canCheck, toCall, minRaise, maxRaise } = payload.action;
  const bb = payload.table.bigBlind || 1;

  switch (actionDef.type) {
    case "fold":
      return canCheck ? { type: "check" } : { type: "fold" };
    case "check":
      return canCheck ? { type: "check" } : { type: "fold" };
    case "call":
      return toCall <= 0 && canCheck ? { type: "check" } : { type: "call" };
    case "raise": {
      if (maxRaise <= 0) {
        return toCall > 0 ? { type: "call" } : { type: "check" };
      }
      let amount = minRaise;
      if (actionDef.sizing) {
        switch (actionDef.sizing.mode) {
          case "bb_multiple":
            amount = actionDef.sizing.value * bb;
            break;
          case "pot_fraction":
            amount = payload.table.pot * actionDef.sizing.value;
            break;
          case "fixed":
            amount = actionDef.sizing.value;
            break;
          default:
            amount = minRaise;
        }
      }
      return {
        type: "raise",
        amount: Math.round(Math.max(minRaise, Math.min(amount, maxRaise))),
      };
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

/** Convert first 8 hex chars of a SHA-256 decision seed to a 32-bit integer for SeededRandom. */
function seedFromHex(hex: string): number {
  return parseInt(hex.substring(0, 8), 16) >>> 0 || 1;
}
