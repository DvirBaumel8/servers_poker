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
  estimateEquityMonteCarlo,
  clearEquityMemo,
  isBoardPlays,
} from "./evaluators/equity.service";
import {
  evaluateCompiledRangeChart,
  rangeActionToActionDef,
  compileRangeChartLUT,
} from "./evaluators/range-chart.evaluator";
import { evaluatePreSortedRules } from "./evaluators/rule.evaluator";
import { evaluatePersonality } from "./evaluators/personality.evaluator";
import { parseCardString } from "./evaluators/hand-analyzer";
import { STRATEGY_TUNABLES } from "./strategy-tunables";

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
        // Merge global chart first, then overlay position-specific cells on top.
        // This ensures cells not explicitly painted on this position tab inherit
        // from the global chart, matching the Bot Builder "Inheriting from Global" UX.
        //
        // IMPORTANT: null values in override.rangeChart mean "unset / inherit from global"
        // (the user clicked Clear in the position tab). We must skip null entries so they
        // don't clobber a global "raise" and cause an unintended fold.
        rangeChart: override.rangeChart
          ? compileRangeChart({
              ...(strategy.rangeChart ?? {}),
              ...Object.fromEntries(
                Object.entries(override.rangeChart).filter(
                  ([, v]) => v !== null,
                ),
              ),
            })
          : baseRange,
      };
    }
  }

  return {
    tier: strategy.tier,
    base,
    positions,
    strategyKey: strategyHash(strategy),
  };
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
  // strategyKey namespaces the cache per unique strategy content, so a bot whose
  // range chart or rules have been edited never returns a result from the old version.
  return `${hydrated.strategyKey}:${payload.decisionSeed.substring(0, 16)}:${payload.stage}:${payload.action.toCall}:${payload.action.canCheck ? 1 : 0}`;
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
  /** Tournament context — absent in cash games. */
  tournament?: {
    startingChips: number;
    startingBigBlind: number;
    playersRemaining: number;
    totalPlayers: number;
  };
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
  options?: { labMode?: boolean },
): StrategyEvaluation {
  const labMode = options?.labMode ?? false;

  // Skip eval cache in lab mode: labMode=true changes the result deterministically
  // and must not pollute the cache used by game-mode calls.
  if (!labMode) {
    const cacheKey = evalCacheKey(hydrated, payload);
    const cached = EVAL_CACHE.get(cacheKey);
    if (cached) return cached;
  }

  let result = evaluateHydratedUncached(hydrated, payload, labMode);

  // Hard guard: on the river, when hole cards contribute nothing to the best hand
  // (board plays), block raise/all-in unless a bluff is justified.
  //
  // A bluff is justified when:
  //   1. Heads-up (≤ 2 active players) — opponent may fold under pressure, or
  //   2. Free bet (canCheck=true, toCall=0) — everyone checked, showing weakness.
  //
  // In all other cases (3+ players OR facing a bet), raising with a board-plays
  // hand can never win outright and is indefensible regardless of configured rules.
  //
  // Rule Supremacy: this guard is intentionally skipped when the action originated
  // from a Hard Rule (ruleId is set). The user defined an explicit instruction and
  // expects it executed with 100% probability. Only personality-driven raises are
  // subject to this safety override.
  if (
    !result.ruleId &&
    (result.action.type === "raise" || result.action.type === "all_in") &&
    payload.table.communityCards?.length === 5 &&
    isBoardPlays(payload.you.holeCards, payload.table.communityCards)
  ) {
    const activePlayers =
      payload.players?.filter((p) => !p.folded && !p.allIn).length ?? 3;
    const isHeadsUp = activePlayers <= 2;
    const isFreeBet = payload.action.canCheck; // toCall=0, nobody bet yet

    if (!isHeadsUp && !isFreeBet) {
      const safeAction: StrategyAction = { type: "fold" };
      result = { ...result, action: safeAction };
    }
  }

  // Store in eval cache (bounded LRU) — only for game-mode calls
  if (!labMode) {
    const cacheKey = evalCacheKey(hydrated, payload);
    if (EVAL_CACHE.size >= EVAL_CACHE_MAX) {
      const firstKey = EVAL_CACHE.keys().next().value;
      if (firstKey !== undefined) EVAL_CACHE.delete(firstKey);
    }
    EVAL_CACHE.set(cacheKey, result);
  }
  return result;
}

/**
 * All-in equity guard — hard override that fires AFTER any decision source.
 * When facing an all-in, if the bot's equity is below the configured threshold,
 * the action is overridden to fold (or check if available). This prevents rules,
 * range charts, and position overrides from making suicidal calls.
 */
function applyAllInEquityGuard(
  result: StrategyEvaluation,
  payload: BotPayload,
  context: GameContext | null,
): StrategyEvaluation {
  // Guard triggers when facing an all-in OR a bet > 50% of hero's stack.
  // This prevents position overrides and personality aggression from making
  // suicidal calls with trash hands (e.g. 7-high calling all-in on 9-6-2).
  const facingAllIn = payload.players.some((p) => p.allIn && !p.folded);
  const heroChips = payload.you.chips + (payload.you.bet ?? 0);
  const facingLargeBet =
    heroChips > 0 &&
    payload.action.toCall >
      heroChips * STRATEGY_TUNABLES.allInGuard.largeBetStackRatio;
  if (!facingAllIn && !facingLargeBet) return result;

  // Only override call/raise/all_in — fold and check are fine
  const actionType = result.action.type;
  if (actionType === "fold" || actionType === "check") return result;

  // Build context if it wasn't built (e.g. range chart lazy path)
  const ctx = context ?? buildGameContext(payload);
  const equity = ctx.equity;

  // Skip guard when equity is unknown (0 = not computed, e.g. deep preflop)
  if (equity <= 0) return result;

  const thresholds = STRATEGY_TUNABLES.allInGuard;
  const threshold =
    actionType === "call"
      ? thresholds.callEquityThreshold
      : thresholds.raiseEquityThreshold;

  if (equity >= threshold) return result;

  // Override to fold (or check if available)
  const canCheck = payload.action.toCall === 0;
  const overrideAction = canCheck
    ? { type: "check" as const }
    : { type: "fold" as const };

  return {
    ...result,
    action: overrideAction,
    explanation: `All-in equity guard: ${(equity * 100).toFixed(0)}% equity < ${(threshold * 100).toFixed(0)}% threshold (was: ${result.explanation})`,
    metrics: {
      ...result.metrics,
      equity,
    },
  };
}

function evaluateHydratedUncached(
  hydrated: HydratedStrategy,
  payload: BotPayload,
  labMode = false,
): StrategyEvaluation {
  const street = normalizeStreet(payload.stage);

  // Resolve per-position override (O(1) lookup) or fall back to base
  const position = (payload.you.position as Position) || null;
  const effective: HydratedPosition =
    hydrated.tier === "pro" && position
      ? (hydrated.positions[position] ?? hydrated.base)
      : hydrated.base;

  // ── Step 1: Rules — highest priority, always evaluated first ─────────
  //
  // Rule Supremacy: if any Hard Rule matches, return its action immediately
  // with 100% probability. The range chart and personality DNA are only
  // consulted when no rule fires.
  //
  // Context is built lazily — only when rules exist for this street — so
  // bots without rules retain the zero-context fast path for range charts.
  const streetRulesFirst = effective.rules[street];
  let builtContext: GameContext | null = null;
  if (streetRulesFirst.length > 0) {
    builtContext = buildGameContext(payload);
    const ruleResult = evaluatePreSortedRules(streetRulesFirst, builtContext);
    if (ruleResult.matched && ruleResult.action) {
      const action = resolveAction(ruleResult.action, builtContext);
      return applyAllInEquityGuard(
        {
          action,
          source:
            builtContext.myPosition &&
            hydrated.positions[builtContext.myPosition]
              ? "Position Override"
              : "Hard Rule",
          explanation: `Rule matched: ${ruleResult.ruleLabel || ruleResult.ruleId}`,
          ruleId: ruleResult.ruleId,
          metrics: { equity: builtContext.equity, strategyWeights: undefined },
        },
        payload,
        builtContext,
      );
    }
  }

  // ── Step 2: Range chart (preflop only, lazy — skips context if not yet built) ─
  if (street === "preflop" && effective.rangeChart) {
    const holeCards = payload.you.holeCards.map(parseCardString);
    const rangeResult = evaluateCompiledRangeChart(
      holeCards,
      effective.rangeChart,
    );

    if (rangeResult.matched) {
      // null action means the cell is unset — the UI contract says "unset = Fold".
      const resolvedAction = rangeResult.action ?? "fold";
      const actionDef = rangeActionToActionDef(resolvedAction);
      if (actionDef) {
        const action = resolveActionMinimal(actionDef, payload);
        return applyAllInEquityGuard(
          {
            action,
            source: "Range Chart",
            explanation: `Range chart: ${rangeResult.handNotation} → ${resolvedAction}`,
            handNotation: rangeResult.handNotation,
            // Equity is not computed on the lazy preflop path — use floor, never 0
            metrics: { equity: 0.0001, strategyWeights: undefined },
          },
          payload,
          builtContext,
        );
      }
    }
  }

  // ── Step 3: Personality fallback — seed derived from provably fair chain ─
  // Reuse context already built during rule evaluation if available.
  const context = builtContext ?? buildGameContext(payload);
  const seed = seedFromHex(payload.decisionSeed);
  const personalityResult = evaluatePersonality(
    effective.personality,
    context,
    seed,
    hydrated.tier !== "pro", // Quick + Strategy tiers get position-aware eval; Pro uses explicit overrides
    labMode,
  );

  return applyAllInEquityGuard(
    {
      action: resolveAction(personalityResult.action, context),
      source:
        context.myPosition && hydrated.positions[context.myPosition]
          ? "Position Override"
          : "Personality",
      explanation: personalityResult.explanation,
      metrics: {
        equity: context.equity,
        strategyWeights: personalityResult.weights,
      },
    },
    payload,
    context,
  );
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
  const spr = payload.table.pot > 0 ? effectiveStack / payload.table.pot : 0;

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
    spr,

    potSizeBB: payload.table.pot / bb,
    potOdds:
      payload.action.toCall > 0
        ? payload.action.toCall / (payload.table.pot + payload.action.toCall)
        : 0,
    isBoardPlays:
      payload.table.communityCards.length === 5 &&
      isBoardPlays(payload.you.holeCards, payload.table.communityCards),
    equity: estimateEquityMonteCarlo(
      payload.you.holeCards,
      payload.table.communityCards,
      activePlayers.length - 1,
      STRATEGY_TUNABLES.equity.monteCarloIterations,
      seedFromHex(payload.decisionSeed),
    ),

    canCheck: payload.action.canCheck,
    toCall: payload.action.toCall,
    currentBetLevel: payload.table.currentBet,
    minRaise: payload.action.minRaise,
    maxRaise: payload.action.maxRaise,

    street: stage,
    bigBlind: bb,

    // Tournament stage: derived from how much blinds have grown relative to starting level.
    // blindRatio=1 (level 1) → stage ≈ 0.25 (early), blindRatio=10 → stage ≈ 0.77 (late).
    // Undefined in cash games (no payload.tournament).
    tournamentStage: payload.tournament
      ? 1 - 1 / (1 + bb / payload.tournament.startingBigBlind / 3)
      : undefined,
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

      // Cannot afford the minimum legal raise delta — go all-in instead of
      // submitting an amount the engine would silently downgrade anyway.
      if (ctx.maxRaise < ctx.minRaise) {
        return { type: "all_in" };
      }

      // Heads-up all-in: the only active opponent is already committed — they cannot
      // respond to a raise, and there is no side pot to build. Convert to call so the
      // bot doesn't over-commit chips without strategic benefit.
      if (ctx.facingAllIn && ctx.activePlayerCount <= 2 && ctx.toCall > 0) {
        return { type: "call" };
      }

      const amount = computeRaiseAmount(actionDef, ctx);
      const clampedAmount = Math.max(
        ctx.minRaise,
        Math.min(amount, ctx.maxRaise),
      );
      // Safety Rail 3 — All-In Stack Commit: if the raise delta exceeds 70% of the
      // post-call remaining stack (= maxRaise), go all-in rather than leave a tiny residual.
      if (
        clampedAmount >
        STRATEGY_TUNABLES.sizing.allInStackCommitRatio * ctx.maxRaise
      ) {
        return { type: "all_in" };
      }
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
      // Cannot afford the minimum legal raise delta — go all-in explicitly.
      if (maxRaise < minRaise) {
        return { type: "all_in" };
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
      const clampedAmt = Math.max(minRaise, Math.min(amount, maxRaise));
      // Safety Rail 3 — All-In Stack Commit (same logic as resolveAction).
      if (
        clampedAmt >
        STRATEGY_TUNABLES.sizing.allInStackCommitRatio * maxRaise
      ) {
        return { type: "all_in" };
      }
      return { type: "raise", amount: Math.round(clampedAmt) };
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

  let rawAmount: number;
  switch (actionDef.sizing.mode) {
    case "pot_fraction":
      rawAmount = ctx.potSizeBB * ctx.bigBlind * actionDef.sizing.value;
      break;

    case "bb_multiple":
      rawAmount = actionDef.sizing.value * ctx.bigBlind;
      break;

    case "previous_bet_multiple": {
      // Raise-to = currentBetLevel × multiple.
      // Raise-delta (what the engine receives as action.amount) = currentBetLevel × (multiple - 1).
      // This guarantees the resulting total bet is always ≥ 2.2× the facing bet.
      // Fall back to toCall when currentBetLevel is 0 or unavailable (safety for unit tests).
      const facingBet =
        ctx.currentBetLevel > 0 ? ctx.currentBetLevel : ctx.toCall;
      rawAmount = facingBet * (actionDef.sizing.value - 1);
      break;
    }

    case "fixed":
      rawAmount = actionDef.sizing.value;
      break;

    default:
      rawAmount = ctx.minRaise;
  }

  // Safety Rail 1 — Pot-relative floor (applies to all sizing modes, including
  // Hard Rules that specify pot_fraction while facing a bet).
  // Lead bet: rawAmount IS the total bet — apply floor directly.
  // Re-raise: rawAmount is the raise-delta; raise-to = facingBet + rawAmount.
  //   → potFloorDelta = max(0, potFloor − facingBet) ensures raise-to ≥ potFloor.
  const potInChips = ctx.potSizeBB * ctx.bigBlind;
  const potFloor = Math.max(
    STRATEGY_TUNABLES.sizing.minLeadBetBBMultiple * ctx.bigBlind,
    STRATEGY_TUNABLES.sizing.minLeadBetPotFraction * potInChips,
  );

  if (ctx.facingBet) {
    const facingBet =
      ctx.currentBetLevel > 0 ? ctx.currentBetLevel : ctx.toCall;
    const potFloorDelta = Math.max(0, potFloor - facingBet);
    rawAmount = Math.max(rawAmount, potFloorDelta);
  } else {
    rawAmount = Math.max(rawAmount, potFloor);
  }

  return rawAmount;
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
