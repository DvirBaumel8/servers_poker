/**
 * ConsistencyChecker — Strategy-to-Lab consistency testing utility.
 *
 * Pure functions that directly call the strategy engine (no NestJS, no DB).
 * Used by scenario-logic.test.ts to assert that strategy definitions produce
 * actions consistent with their declared overrides.
 */

import * as crypto from "crypto";
import {
  hydrateStrategy,
  evaluateHydrated,
  clearEvalCache,
  type BotPayload,
} from "../../src/modules/bot-strategy/strategy-engine.service";
import type {
  BotStrategy,
  StrategyEvaluation,
  ActionType,
} from "../../src/domain/bot-strategy/strategy.types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Mirrors the Scenario Lab DTO shape for test construction. */
export interface ScenarioInput {
  holeCards: [string, string];
  /** 0 = preflop, 3 = flop, 4 = turn, 5 = river */
  communityCards: string[];
  position: string;
  pot: number;
  toCall: number;
  minRaise: number;
  /** Defaults to 6 */
  numberOfPlayers?: number;
  /** When true, hero can check (toCall must be 0) */
  canCheck?: boolean;
  /**
   * Best hand name in the pokersolver/HAND_NAME_TO_STRENGTH format.
   * Used by the hand analyzer and personality evaluator to determine hand strength category.
   * Required for post-flop scenarios where hand strength affects action weights.
   * Values: "ONE_PAIR", "TWO_PAIR", "THREE_OF_A_KIND", "STRAIGHT", "FLUSH",
   *         "FULL_HOUSE", "FOUR_OF_A_KIND", "STRAIGHT_FLUSH", "ROYAL_FLUSH"
   */
  bestHandName?: string;
}

export interface ActionDistribution {
  fold: number;
  check: number;
  call: number;
  raise: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const VILLAIN_POSITIONS = [
  "UTG",
  "UTG+1",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
] as const;

function deriveStage(communityCardCount: number): string {
  if (communityCardCount === 0) return "preflop";
  if (communityCardCount === 3) return "flop";
  if (communityCardCount === 4) return "turn";
  return "river";
}

function buildPayload(scenario: ScenarioInput, seed: string): BotPayload {
  const playerCount = scenario.numberOfPlayers ?? 6;
  const stage = deriveStage(scenario.communityCards.length);
  const canCheck = scenario.canCheck ?? scenario.toCall === 0;

  const mockPlayers: BotPayload["players"] = Array.from(
    { length: playerCount - 1 },
    (_, i) => ({
      name: `Villain${i + 1}`,
      chips: 1000,
      bet: i === 0 && scenario.toCall > 0 ? scenario.toCall : 0,
      folded: false,
      allIn: false,
      position: VILLAIN_POSITIONS[i % VILLAIN_POSITIONS.length],
    }),
  );

  return {
    gameId: "consistency-check",
    handNumber: 1,
    stage,
    you: {
      name: "Hero",
      chips: 1000,
      holeCards: [...scenario.holeCards],
      bet: 0,
      position: scenario.position,
      ...(scenario.bestHandName
        ? { bestHand: { name: scenario.bestHandName } }
        : {}),
    },
    action: {
      canCheck,
      toCall: scenario.toCall,
      minRaise: scenario.minRaise,
      maxRaise: 10000,
    },
    table: {
      pot: scenario.pot,
      currentBet: scenario.toCall,
      communityCards: [...scenario.communityCards],
      smallBlind: 5,
      bigBlind: 10,
      ante: 0,
    },
    players: [
      {
        name: "Hero",
        chips: 1000,
        bet: 0,
        folded: false,
        allIn: false,
        position: scenario.position,
      },
      ...mockPlayers,
    ],
    decisionSeed: seed,
  };
}

function makeBaseHash(scenario: ScenarioInput): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        h: scenario.holeCards,
        c: scenario.communityCards,
        pos: scenario.position,
        pot: scenario.pot,
        tc: scenario.toCall,
        mr: scenario.minRaise,
      }),
    )
    .digest("hex");
}

function makeSeed(baseHash: string, runIndex: number): string {
  return crypto
    .createHash("sha256")
    .update(`${baseHash}:${runIndex}`)
    .digest("hex");
}

// ─── ConsistencyChecker ───────────────────────────────────────────────────────

export class ConsistencyChecker {
  /**
   * Evaluate a strategy against a scenario once, using the provided seed
   * (or seed "0" if omitted).
   */
  static evaluate(
    strategy: BotStrategy,
    scenario: ScenarioInput,
    seed?: string,
  ): StrategyEvaluation {
    clearEvalCache();
    const resolvedSeed = seed ?? "0".repeat(64);
    const hydrated = hydrateStrategy(strategy);
    return evaluateHydrated(hydrated, buildPayload(scenario, resolvedSeed));
  }

  /**
   * Run `runs` evaluations with deterministic seeds derived from the scenario
   * inputs. Returns percentage breakdown (0-100).
   */
  static distribution(
    strategy: BotStrategy,
    scenario: ScenarioInput,
    runs = 20,
  ): ActionDistribution {
    clearEvalCache();
    const hydrated = hydrateStrategy(strategy);
    const baseHash = makeBaseHash(scenario);
    const counts = { fold: 0, check: 0, call: 0, raise: 0 };

    for (let i = 0; i < runs; i++) {
      const seed = makeSeed(baseHash, i);
      const result = evaluateHydrated(hydrated, buildPayload(scenario, seed));
      const t = result.action.type;
      if (t === "fold") counts.fold++;
      else if (t === "check") counts.check++;
      else if (t === "raise" || t === "all_in") counts.raise++;
      else counts.call++;
    }

    return {
      fold: Math.round((counts.fold / runs) * 100),
      check: Math.round((counts.check / runs) * 100),
      call: Math.round((counts.call / runs) * 100),
      raise: Math.round((counts.raise / runs) * 100),
    };
  }

  /**
   * Assert that a single evaluation (seed 0) matches the expected action type.
   */
  static assertAction(
    strategy: BotStrategy,
    scenario: ScenarioInput,
    expected: ActionType,
    context = "",
  ): void {
    const result = ConsistencyChecker.evaluate(strategy, scenario);
    if (result.action.type !== expected) {
      const tag = context ? `[${context}] ` : "";
      throw new Error(
        `${tag}Expected action "${expected}" but got "${result.action.type}" ` +
          `(source: ${result.source}, explanation: ${result.explanation})`,
      );
    }
  }

  /**
   * Run `runs` evaluations with different seeds and assert the forbidden action
   * NEVER appears in any of them. Useful for verifying that range-chart overrides
   * are deterministic regardless of the RNG seed.
   */
  static assertNever(
    strategy: BotStrategy,
    scenario: ScenarioInput,
    forbidden: ActionType,
    runs = 50,
    context = "",
  ): void {
    clearEvalCache();
    const hydrated = hydrateStrategy(strategy);
    const baseHash = makeBaseHash(scenario);

    for (let i = 0; i < runs; i++) {
      const seed = makeSeed(baseHash, i);
      const result = evaluateHydrated(hydrated, buildPayload(scenario, seed));
      const t = result.action.type;
      const actual = t === "all_in" && forbidden === "raise" ? "raise" : t;
      if (actual === forbidden) {
        const tag = context ? `[${context}] ` : "";
        throw new Error(
          `${tag}Action "${forbidden}" appeared on run ${i}/${runs} ` +
            `(source: ${result.source}, explanation: ${result.explanation})`,
        );
      }
    }
  }

  /**
   * Assert that the fold percentage in a distribution is at or below maxFoldPct.
   * Use this for rationality checks on personality-tier bots.
   */
  static assertRationality(
    dist: ActionDistribution,
    maxFoldPct: number,
    context = "",
  ): void {
    if (dist.fold > maxFoldPct) {
      const tag = context ? `[${context}] ` : "";
      throw new Error(
        `${tag}Rationality violated: fold=${dist.fold}% exceeds maxFoldPct=${maxFoldPct}% ` +
          `(dist: fold=${dist.fold}% call=${dist.call}% raise=${dist.raise}% check=${dist.check}%)`,
      );
    }
  }
}
