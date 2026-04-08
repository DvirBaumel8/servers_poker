/**
 * Scenario Lab — Strategy Engine Unit Tests
 *
 * Converted from e2e/scenario-lab.e2e.spec.ts to call the strategy engine
 * directly (no NestJS, no DB, no HTTP). Each test hydrates a strategy and
 * runs 20 evaluations, matching the live Scenario Lab behavior.
 *
 * Coverage areas:
 *  1. Illegal move guards (engine invariants)
 *  2. All poker streets (preflop / flop / turn / river)
 *  3. All 8 quick-tier personality presets
 *  4. Strategy tier — rules fire + override personality
 *  5. Pro tier — position overrides change behavior
 *  6. Preflop range chart routing
 *  7. Board-plays detection (hole cards contribute nothing)
 *  8. Player count effects (2 vs 8 players)
 *  9. Response shape
 * 10. Edge cases
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as crypto from "crypto";
import {
  evaluateHydrated,
  hydrateStrategy,
  clearEvalCache,
  type BotPayload,
} from "../../src/modules/bot-strategy/strategy-engine.service";
import { bestHand as evaluateBestHand } from "../../src/domain/handEvaluator";
import { parseCardString } from "../../src/modules/bot-strategy/evaluators/hand-analyzer";
import { PERSONALITY_PRESETS } from "../../src/modules/bot-strategy/presets/personality-presets";
import type { BotStrategy } from "../../src/domain/bot-strategy/strategy.types";

// ─── Core evaluation helper (mirrors bots.service.ts evaluateScenario) ───────

interface ScenarioInput {
  holeCards: [string, string];
  communityCards: string[];
  position: string;
  pot: number;
  toCall: number;
  minRaise: number;
  numberOfPlayers?: number;
  botStack?: number;
  bigBlind?: number;
  avgOpponentStack?: number;
}

type ActionBucket = "fold" | "check" | "call" | "raise";

function pickModalBucket(counts: Record<ActionBucket, number>): ActionBucket {
  const order: ActionBucket[] = ["raise", "call", "check", "fold"];
  return order.reduce((best, b) => (counts[b] > counts[best] ? b : best));
}

function runScenario(strategy: BotStrategy, dto: ScenarioInput) {
  const hydrated = hydrateStrategy(strategy);

  const cardCount = dto.communityCards.length;
  const stage =
    cardCount === 0
      ? "preflop"
      : cardCount === 3
        ? "flop"
        : cardCount === 4
          ? "turn"
          : "river";

  const botStack = dto.botStack ?? 1000;
  const bb = dto.bigBlind ?? 10;
  const oppStack = dto.avgOpponentStack ?? botStack;
  const playerCount = dto.numberOfPlayers ?? 6;
  const VILLAIN_POSITIONS = ["UTG", "UTG+1", "HJ", "CO", "BTN", "SB", "BB"];
  const mockPlayers: BotPayload["players"] = [
    {
      name: "Hero",
      chips: botStack,
      bet: 0,
      folded: false,
      allIn: false,
      position: dto.position,
    },
    ...Array.from({ length: playerCount - 1 }, (_, i) => ({
      name: `Villain${i + 1}`,
      chips: oppStack,
      bet: i === 0 ? dto.toCall : 0,
      folded: dto.toCall > 0 && i !== 0,
      allIn: i === 0 && dto.toCall > 0 && dto.toCall >= oppStack,
      position: VILLAIN_POSITIONS[i % VILLAIN_POSITIONS.length],
    })),
  ];

  let bestHandName: string | undefined;
  if (dto.communityCards.length > 0) {
    bestHandName = evaluateBestHand(
      dto.holeCards.map(parseCardString),
      dto.communityCards.map(parseCardString),
    ).name;
  }

  const basePayload: Omit<BotPayload, "decisionSeed"> = {
    gameId: "scenario-lab",
    handNumber: 1,
    stage,
    you: {
      name: "Hero",
      chips: botStack,
      holeCards: dto.holeCards,
      bet: 0,
      position: dto.position,
      ...(bestHandName ? { bestHand: { name: bestHandName } } : {}),
    },
    action: {
      canCheck: dto.toCall === 0,
      toCall: dto.toCall,
      minRaise: dto.minRaise,
      maxRaise: botStack,
    },
    table: {
      pot: dto.pot + dto.toCall,
      currentBet: dto.toCall,
      communityCards: dto.communityCards,
      smallBlind: Math.round(bb / 2),
      bigBlind: bb,
      ante: 0,
    },
    players: mockPlayers,
  };

  const RUNS = 20;
  const counts = { fold: 0, check: 0, call: 0, raise: 0 };
  const firstResultByType: Partial<
    Record<ActionBucket, ReturnType<typeof evaluateHydrated>>
  > = {};

  const baseHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        h: dto.holeCards,
        c: dto.communityCards,
        pos: dto.position,
        pot: dto.pot,
        tc: dto.toCall,
        mr: dto.minRaise,
      }),
    )
    .digest("hex");

  clearEvalCache();

  const canCheck = dto.toCall === 0;

  for (let i = 0; i < RUNS; i++) {
    const seed = crypto
      .createHash("sha256")
      .update(`${baseHash}:${i}`)
      .digest("hex");
    const payload: BotPayload = { ...basePayload, decisionSeed: seed };
    const result = evaluateHydrated(hydrated, payload, { labMode: true });
    let type = result.action.type;
    if (type === "fold" && canCheck) type = "check";
    if (type === "check" && !canCheck) type = "call";
    if (type === "fold") {
      counts.fold++;
      if (!firstResultByType.fold) firstResultByType.fold = result;
    } else if (type === "check") {
      counts.check++;
      if (!firstResultByType.check) firstResultByType.check = result;
    } else if (type === "raise" || type === "all_in") {
      counts.raise++;
      if (!firstResultByType.raise) firstResultByType.raise = result;
    } else {
      counts.call++;
      if (!firstResultByType.call) firstResultByType.call = result;
    }
  }

  const modalBucket = pickModalBucket(counts);

  const distribution = {
    fold: Math.round((counts.fold / RUNS) * 100),
    check: Math.round((counts.check / RUNS) * 100),
    call: Math.round((counts.call / RUNS) * 100),
    raise: Math.round((counts.raise / RUNS) * 100),
  };

  const primaryResult = firstResultByType[modalBucket]!;

  return {
    primaryAction: primaryResult.action,
    source: primaryResult.source,
    explanation: primaryResult.explanation,
    handNotation: primaryResult.handNotation,
    ruleId: primaryResult.ruleId,
    distribution,
  };
}

// ─── Strategy builders ──────────────────────────────────────────────────────

function quickStrategy(
  overrides: Partial<{
    aggression: number;
    bluffFrequency: number;
    riskTolerance: number;
    tightness: number;
  }> = {},
): BotStrategy {
  return {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 50,
      bluffFrequency: 30,
      riskTolerance: 50,
      tightness: 50,
      ...overrides,
    },
  };
}

function strategyTierWithRules(
  rules: BotStrategy["rules"],
  personalityOverrides: Partial<{
    aggression: number;
    bluffFrequency: number;
    riskTolerance: number;
    tightness: number;
  }> = {},
): BotStrategy {
  return {
    version: 1,
    tier: "strategy",
    personality: {
      aggression: 50,
      bluffFrequency: 30,
      riskTolerance: 50,
      tightness: 50,
      ...personalityOverrides,
    },
    rules: {
      preflop: [],
      flop: [],
      turn: [],
      river: [],
      ...rules,
    },
  };
}

function proStrategy(
  positionOverrides: BotStrategy["positionOverrides"],
  personalityOverrides: Partial<{
    aggression: number;
    bluffFrequency: number;
    riskTolerance: number;
    tightness: number;
  }> = {},
): BotStrategy {
  return {
    version: 1,
    tier: "pro",
    personality: {
      aggression: 50,
      bluffFrequency: 30,
      riskTolerance: 50,
      tightness: 50,
      ...personalityOverrides,
    },
    positionOverrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Scenario Lab — Strategy Engine (unit)", () => {
  beforeEach(() => {
    clearEvalCache();
  });

  // ── 1. Illegal Move Guards ──────────────────────────────────────────────

  describe("Illegal move guards", () => {
    it("never folds when canCheck (toCall=0) — aggressive bot, preflop", () => {
      const res = runScenario(quickStrategy({ aggression: 90, tightness: 5 }), {
        holeCards: ["2c", "7d"],
        communityCards: [],
        position: "UTG",
        pot: 30,
        toCall: 0,
        minRaise: 20,
        numberOfPlayers: 6,
      });
      expect(res.distribution.fold).toBe(0);
    });

    it("never folds when canCheck — tight bot, flop, free action", () => {
      const res = runScenario(quickStrategy({ tightness: 95, aggression: 5 }), {
        holeCards: ["2s", "7h"],
        communityCards: ["Ac", "Kd", "Qh"],
        position: "UTG",
        pot: 40,
        toCall: 0,
        minRaise: 20,
        numberOfPlayers: 4,
      });
      expect(res.distribution.fold).toBe(0);
    });

    it("raise amount is always >= minRaise when bot decides to raise", () => {
      const res = runScenario(
        quickStrategy({ aggression: 95, bluffFrequency: 80 }),
        {
          holeCards: ["As", "Ah"],
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 40,
          numberOfPlayers: 3,
        },
      );

      if (
        res.primaryAction.type === "raise" ||
        res.primaryAction.type === "all_in"
      ) {
        expect(res.primaryAction.amount ?? 0).toBeGreaterThanOrEqual(40);
      }
      expect(
        res.distribution.raise +
          res.distribution.fold +
          res.distribution.call +
          res.distribution.check,
      ).toBe(100);
    });

    it("board plays hand — never raises in multi-player pot (3 players, facing bet)", () => {
      const res = runScenario(
        proStrategy({
          UTG: {
            personality: {
              aggression: 100,
              bluffFrequency: 80,
              riskTolerance: 100,
              tightness: 0,
            },
          },
        }),
        {
          holeCards: ["8s", "6s"],
          communityCards: ["Ks", "Ah", "9d", "9c", "Ac"],
          position: "UTG",
          pot: 200,
          toCall: 50,
          minRaise: 100,
          numberOfPlayers: 3,
        },
      );
      expect(res.distribution.raise).toBe(0);
      expect(["fold", "call"]).toContain(res.primaryAction.type);
    });

    it("board plays hand — MAY raise heads-up (bluff justified)", () => {
      const res = runScenario(
        quickStrategy({ aggression: 95, bluffFrequency: 80 }),
        {
          holeCards: ["8s", "6s"],
          communityCards: ["Ks", "Ah", "9d", "9c", "Ac"],
          position: "BTN",
          pot: 200,
          toCall: 50,
          minRaise: 100,
          numberOfPlayers: 2,
        },
      );
      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.primaryAction.type,
      );
    });

    it("board plays hand — MAY raise on free bet (probe bet justified)", () => {
      const res = runScenario(
        quickStrategy({ aggression: 95, bluffFrequency: 80 }),
        {
          holeCards: ["8s", "6s"],
          communityCards: ["Ks", "Ah", "9d", "9c", "Ac"],
          position: "BTN",
          pot: 200,
          toCall: 0,
          minRaise: 100,
          numberOfPlayers: 5,
        },
      );
      expect(["check", "raise", "all_in"]).toContain(res.primaryAction.type);
      expect(res.distribution.fold).toBe(0);
    });

    it("premium free hand — AhKh, toCall=0 — never folds", () => {
      const res = runScenario(quickStrategy({ tightness: 90 }), {
        holeCards: ["Ah", "Kh"],
        communityCards: ["2d", "7c", "3s"],
        position: "UTG",
        pot: 60,
        toCall: 0,
        minRaise: 20,
      });
      expect(res.distribution.fold).toBe(0);
    });
  });

  // ── 2. All Poker Streets ──────────────────────────────────────────────

  describe("All poker streets produce valid actions", () => {
    it("preflop (0 community cards)", () => {
      const res = runScenario(quickStrategy(), {
        holeCards: ["Ks", "Qd"],
        communityCards: [],
        position: "CO",
        pot: 30,
        toCall: 20,
        minRaise: 40,
      });
      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.primaryAction.type,
      );
      expect(res.source).toBeDefined();
      expect(res.explanation).toBeTruthy();
    });

    it("flop (3 community cards)", () => {
      const res = runScenario(quickStrategy(), {
        holeCards: ["As", "Kd"],
        communityCards: ["Ah", "7c", "2s"],
        position: "SB",
        pot: 80,
        toCall: 0,
        minRaise: 20,
      });
      expect(["check", "raise", "all_in"]).toContain(res.primaryAction.type);
    });

    it("turn (4 community cards)", () => {
      const res = runScenario(quickStrategy(), {
        holeCards: ["Jh", "Th"],
        communityCards: ["9h", "Qh", "8d", "2c"],
        position: "BTN",
        pot: 200,
        toCall: 100,
        minRaise: 200,
      });
      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.primaryAction.type,
      );
    });

    it("river (5 community cards)", () => {
      const res = runScenario(quickStrategy(), {
        holeCards: ["As", "Ac"],
        communityCards: ["Ad", "Kh", "Qc", "Js", "Th"],
        position: "BB",
        pot: 300,
        toCall: 0,
        minRaise: 50,
      });
      expect(res.distribution.fold).toBe(0);
    });
  });

  // ── 3. All 8 Personality Presets ──────────────────────────────────────

  describe("All 8 quick-tier personality presets return valid actions", () => {
    for (const preset of PERSONALITY_PRESETS) {
      it(`${preset.name} — preflop, facing bet`, () => {
        const res = runScenario(
          {
            version: 1,
            tier: "quick",
            personality: preset.personality,
          },
          {
            holeCards: ["Ah", "Ks"],
            communityCards: [],
            position: "CO",
            pot: 60,
            toCall: 20,
            minRaise: 40,
            numberOfPlayers: 5,
          },
        );
        expect(["fold", "call", "raise", "all_in"]).toContain(
          res.primaryAction.type,
        );
        expect(res.source).toBeDefined();
        const { fold, check, call, raise } = res.distribution;
        expect(fold + check + call + raise).toBe(100);
      });

      it(`${preset.name} — river, free bet, strong hand`, () => {
        const res = runScenario(
          {
            version: 1,
            tier: "quick",
            personality: preset.personality,
          },
          {
            holeCards: ["Ks", "Kd"],
            communityCards: ["Kh", "2c", "7s", "9d", "3h"],
            position: "BTN",
            pot: 200,
            toCall: 0,
            minRaise: 50,
            numberOfPlayers: 4,
          },
        );
        expect(res.distribution.fold).toBe(0);
      });
    }
  });

  // ── 4. Strategy Tier — Rules Engine ──────────────────────────────────

  describe("Strategy tier — rules fire and override personality", () => {
    it("high-priority rule 'always raise when no bet' fires preflop", () => {
      const res = runScenario(
        strategyTierWithRules({
          preflop: [
            {
              id: "always-raise-free",
              priority: 1,
              conditions: [{ field: "canCheck", operator: "eq", value: true }],
              action: { type: "raise" },
              enabled: true,
            },
          ],
        }),
        {
          holeCards: ["2c", "7d"],
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
        },
      );
      expect(res.primaryAction.type).toBe("raise");
      expect(res.source).toBe("Hard Rule");
      expect(res.ruleId).toBe("always-raise-free");
    });

    it("'fold facing a bet' rule fires on river", () => {
      const res = runScenario(
        strategyTierWithRules(
          {
            river: [
              {
                id: "fold-bet",
                priority: 1,
                conditions: [
                  { field: "facingBet", operator: "eq", value: true },
                ],
                action: { type: "fold" },
                enabled: true,
              },
            ],
          },
          { riskTolerance: 10 },
        ),
        {
          holeCards: ["2c", "7d"],
          communityCards: ["Ac", "Kd", "Qh", "Js", "Th"],
          position: "BB",
          pot: 200,
          toCall: 100,
          minRaise: 200,
          numberOfPlayers: 3,
        },
      );
      expect(res.primaryAction.type).toBe("fold");
      expect(res.source).toBe("Hard Rule");
    });

    it("disabled rule does NOT fire — personality takes over", () => {
      const res = runScenario(
        strategyTierWithRules(
          {
            preflop: [
              {
                id: "disabled-fold",
                priority: 1,
                conditions: [
                  { field: "facingBet", operator: "eq", value: false },
                ],
                action: { type: "fold" },
                enabled: false,
              },
            ],
          },
          { aggression: 80, tightness: 20 },
        ),
        {
          holeCards: ["As", "Ah"],
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
        },
      );
      expect(res.source).toBe("Personality");
      expect(res.distribution.fold).toBe(0);
    });

    it("rule with AND conditions fires only when all conditions match", () => {
      const res = runScenario(
        strategyTierWithRules({
          flop: [
            {
              id: "and-rule",
              priority: 1,
              conditions: [
                { field: "canCheck", operator: "eq", value: false },
                {
                  field: "handStrength",
                  operator: "in",
                  value: [
                    "two_pair",
                    "trips",
                    "straight",
                    "flush",
                    "full_house",
                    "quads",
                    "straight_flush",
                    "royal_flush",
                  ],
                },
              ],
              action: { type: "raise" },
              enabled: true,
            },
          ],
        }),
        {
          holeCards: ["Ks", "Kd"],
          communityCards: ["Kh", "7c", "2s"],
          position: "BTN",
          pot: 100,
          toCall: 50,
          minRaise: 100,
        },
      );
      expect(res.primaryAction.type).toBe("raise");
      expect(res.source).toBe("Hard Rule");
    });

    it("rule with OR group fires when either branch matches", () => {
      const res = runScenario(
        strategyTierWithRules({
          flop: [
            {
              id: "or-rule",
              priority: 1,
              conditions: [
                {
                  operator: "OR",
                  rules: [
                    { field: "hasFlushDraw", operator: "eq", value: true },
                    { field: "hasStraightDraw", operator: "eq", value: true },
                  ],
                } as any,
              ],
              action: { type: "call" },
              enabled: true,
            },
          ],
        }),
        {
          holeCards: ["Ah", "Kh"],
          communityCards: ["2h", "7h", "Qc"],
          position: "CO",
          pot: 80,
          toCall: 40,
          minRaise: 80,
        },
      );
      expect(res.primaryAction.type).toBe("call");
      expect(res.source).toBe("Hard Rule");
    });

    it("lower priority rule does not override a higher priority match", () => {
      const res = runScenario(
        strategyTierWithRules({
          preflop: [
            {
              id: "p1-raise",
              priority: 1,
              conditions: [
                { field: "facingBet", operator: "eq", value: false },
              ],
              action: { type: "raise" },
              enabled: true,
            },
            {
              id: "p2-fold",
              priority: 2,
              conditions: [
                { field: "facingBet", operator: "eq", value: false },
              ],
              action: { type: "fold" },
              enabled: true,
            },
          ],
        }),
        {
          holeCards: ["Ah", "Kd"],
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
        },
      );
      expect(res.primaryAction.type).toBe("raise");
      expect(res.ruleId).toBe("p1-raise");
    });
  });

  // ── 5. Pro Tier — Position Overrides ──────────────────────────────────

  describe("Pro tier — position overrides change behavior", () => {
    it("UTG override with high aggression raises more than BTN (base personality)", () => {
      const strategy = proStrategy(
        {
          UTG: {
            personality: {
              aggression: 100,
              bluffFrequency: 80,
              riskTolerance: 100,
              tightness: 0,
            },
          },
        },
        { aggression: 20, tightness: 70 },
      );

      const utgRes = runScenario(strategy, {
        holeCards: ["As", "Kd"],
        communityCards: [],
        position: "UTG",
        pot: 30,
        toCall: 0,
        minRaise: 20,
        numberOfPlayers: 6,
      });
      expect(utgRes.source).toBe("Position Override");

      const btnRes = runScenario(strategy, {
        holeCards: ["As", "Kd"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
        numberOfPlayers: 6,
      });
      expect(btnRes.source).not.toBe("Position Override");
      // UTG override (aggression=100) should be at least as aggressive as BTN (base, aggression=20)
      expect(
        utgRes.distribution.raise + utgRes.distribution.check,
      ).toBeGreaterThanOrEqual(
        btnRes.distribution.raise + btnRes.distribution.check,
      );
    });

    it("position override with fold rule fires for that position only", () => {
      const strategy = proStrategy({
        SB: {
          rules: {
            preflop: [
              {
                id: "sb-fold-always",
                priority: 1,
                conditions: [
                  { field: "facingBet", operator: "eq", value: true },
                ],
                action: { type: "fold" },
                enabled: true,
              },
            ],
          },
        },
      });

      const sbRes = runScenario(strategy, {
        holeCards: ["As", "Ad"],
        communityCards: [],
        position: "SB",
        pot: 40,
        toCall: 20,
        minRaise: 40,
      });
      expect(sbRes.primaryAction.type).toBe("fold");
      expect(sbRes.source).toBe("Position Override");

      const btnRes = runScenario(strategy, {
        holeCards: ["As", "Ad"],
        communityCards: [],
        position: "BTN",
        pot: 40,
        toCall: 20,
        minRaise: 40,
      });
      expect(btnRes.source).not.toBe("Position Override");
      expect(btnRes.distribution.fold).toBeLessThan(50);
    });

    it("BTN override with range chart maps specific hands", () => {
      const strategy = proStrategy({
        BTN: {
          rangeChart: {
            AA: "raise",
            KK: "raise",
            QQ: "raise",
            AKs: "raise",
            "72o": "fold",
          },
        },
      });

      const aaRes = runScenario(strategy, {
        holeCards: ["Ah", "Ad"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
      });
      expect(aaRes.primaryAction.type).toBe("raise");

      // 72o from BTN → range chart says fold; but toCall=0 → fold-for-free illegal → check
      const worstRes = runScenario(strategy, {
        holeCards: ["7c", "2d"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
      });
      expect(["check", "raise"]).toContain(worstRes.primaryAction.type);
    });
  });

  // ── 6. Strategy Correctness — Poker Logic ─────────────────────────────

  describe("Strategy correctness — poker logic", () => {
    it("aggressive bot with premium hand (AA) mostly raises preflop", () => {
      const res = runScenario(
        quickStrategy({ aggression: 90, bluffFrequency: 60, tightness: 20 }),
        {
          holeCards: ["As", "Ah"],
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
          numberOfPlayers: 3,
        },
      );
      expect(res.distribution.raise).toBeGreaterThanOrEqual(60);
    });

    it("tight bot folds 72o preflop from UTG facing raise", () => {
      const res = runScenario(
        quickStrategy({ tightness: 85, aggression: 10, riskTolerance: 15 }),
        {
          holeCards: ["2c", "7d"],
          communityCards: [],
          position: "UTG",
          pot: 200,
          toCall: 150,
          minRaise: 300,
          numberOfPlayers: 7,
        },
      );
      expect(res.distribution.fold).toBeGreaterThanOrEqual(70);
    });

    it("nut flush on river — aggressive bot never folds to small bet", () => {
      const res = runScenario(
        quickStrategy({ aggression: 60, riskTolerance: 60 }),
        {
          holeCards: ["Ah", "Kh"],
          communityCards: ["Qh", "Jh", "Th", "2c", "3d"],
          position: "SB",
          pot: 200,
          toCall: 20,
          minRaise: 40,
          numberOfPlayers: 3,
        },
      );
      expect(res.distribution.fold).toBe(0);
    });

    it("strong draw with good pot odds — should not fold", () => {
      const res = runScenario(
        quickStrategy({ riskTolerance: 60, aggression: 50 }),
        {
          holeCards: ["Ah", "Kh"],
          communityCards: ["2h", "7h", "Qc"],
          position: "CO",
          pot: 100,
          toCall: 20,
          minRaise: 40,
          numberOfPlayers: 3,
        },
      );
      expect(res.distribution.fold).toBeLessThan(50);
    });

    it("paired board weak kicker — should not raise in multi-player pot", () => {
      const res = runScenario(
        quickStrategy({ aggression: 90, bluffFrequency: 70 }),
        {
          holeCards: ["2s", "3d"],
          communityCards: ["Ah", "Ad", "Ks", "Qc", "Jh"],
          position: "UTG",
          pot: 200,
          toCall: 50,
          minRaise: 100,
          numberOfPlayers: 3,
        },
      );
      expect(res.distribution.raise).toBe(0);
    });

    it("trips board weak kicker — large facing bet → should not raise", () => {
      const res = runScenario(
        quickStrategy({ aggression: 90, bluffFrequency: 70 }),
        {
          holeCards: ["3h", "4d"],
          communityCards: ["Kc", "Ks", "Kh", "Ac", "Jd"],
          position: "UTG",
          pot: 400,
          toCall: 200,
          minRaise: 400,
          numberOfPlayers: 3,
        },
      );
      expect(res.distribution.raise).toBe(0);
    });
  });

  // ── 7. Player Count Effects ───────────────────────────────────────────

  describe("Player count (2 vs 8) — no illegal moves", () => {
    it("heads-up (2 players) — returns valid action", () => {
      const res = runScenario(quickStrategy({ aggression: 80 }), {
        holeCards: ["Ah", "Kd"],
        communityCards: ["Ac", "7s", "2h"],
        position: "BTN",
        pot: 100,
        toCall: 50,
        minRaise: 100,
        numberOfPlayers: 2,
      });
      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.primaryAction.type,
      );
    });

    it("full table (8 players) — returns valid action", () => {
      const res = runScenario(quickStrategy({ aggression: 80 }), {
        holeCards: ["Ah", "Kd"],
        communityCards: ["Ac", "7s", "2h"],
        position: "UTG",
        pot: 100,
        toCall: 50,
        minRaise: 100,
        numberOfPlayers: 8,
      });
      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.primaryAction.type,
      );
    });

    it("tight bot is looser heads-up than multi-way", () => {
      const strategy = quickStrategy({ tightness: 75, aggression: 40 });
      const scenario = {
        holeCards: ["Qs", "Jd"] as [string, string],
        communityCards: [] as string[],
        position: "CO",
        pot: 60,
        toCall: 40,
        minRaise: 80,
      };

      const huRes = runScenario(strategy, {
        ...scenario,
        numberOfPlayers: 2,
      });
      const mwRes = runScenario(strategy, {
        ...scenario,
        numberOfPlayers: 8,
      });
      expect(mwRes.distribution.fold).toBeGreaterThanOrEqual(
        huRes.distribution.fold,
      );
    });
  });

  // ── 8. Response Shape ─────────────────────────────────────────────────

  describe("Response shape and field validation", () => {
    it("response contains all required fields", () => {
      const res = runScenario(quickStrategy(), {
        holeCards: ["As", "Kd"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
      });
      expect(res.primaryAction).toBeDefined();
      expect(res.source).toBeDefined();
      expect(res.explanation).toBeDefined();
      expect(res.distribution).toBeDefined();
      expect(res.distribution).toHaveProperty("fold");
      expect(res.distribution).toHaveProperty("check");
      expect(res.distribution).toHaveProperty("call");
      expect(res.distribution).toHaveProperty("raise");
    });

    it("distribution always sums to 100", () => {
      const res = runScenario(quickStrategy(), {
        holeCards: ["7c", "2d"],
        communityCards: ["Ac", "Kd", "Qh"],
        position: "UTG",
        pot: 100,
        toCall: 50,
        minRaise: 100,
        numberOfPlayers: 5,
      });
      const { fold, check, call, raise } = res.distribution;
      expect(fold + check + call + raise).toBe(100);
    });

    it("source is one of the valid values", () => {
      const res = runScenario(quickStrategy(), {
        holeCards: ["As", "Ad"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
      });
      expect([
        "Position Override",
        "range_chart",
        "Hard Rule",
        "Personality",
      ]).toContain(res.source);
    });

    it("explanation is non-empty string", () => {
      const res = runScenario(quickStrategy(), {
        holeCards: ["As", "Kd"],
        communityCards: [],
        position: "CO",
        pot: 50,
        toCall: 20,
        minRaise: 40,
      });
      expect(typeof res.explanation).toBe("string");
      expect(res.explanation.length).toBeGreaterThan(0);
    });

    it("same scenario run twice returns identical results (deterministic)", () => {
      const strategy = quickStrategy();
      const scenario: ScenarioInput = {
        holeCards: ["Ks", "Qd"],
        communityCards: ["Kh", "7c", "2s"],
        position: "BTN",
        pot: 100,
        toCall: 0,
        minRaise: 30,
        numberOfPlayers: 4,
      };
      const res1 = runScenario(strategy, scenario);
      const res2 = runScenario(strategy, scenario);
      expect(res1.primaryAction).toEqual(res2.primaryAction);
      expect(res1.distribution).toEqual(res2.distribution);
    });
  });

  // ── 9. Edge Cases ─────────────────────────────────────────────────────

  describe("Edge cases and boundary conditions", () => {
    it("all-in situation (toCall = all remaining chips)", () => {
      const res = runScenario(quickStrategy({ riskTolerance: 80 }), {
        holeCards: ["As", "Ad"],
        communityCards: [],
        position: "BTN",
        pot: 500,
        toCall: 1000,
        minRaise: 1000,
        numberOfPlayers: 2,
      });
      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.primaryAction.type,
      );
    });

    it("short stack — risk tolerant bot should not always fold", () => {
      const res = runScenario(
        quickStrategy({ riskTolerance: 90, aggression: 70 }),
        {
          holeCards: ["Qh", "Js"],
          communityCards: [],
          position: "BTN",
          pot: 500,
          toCall: 200,
          minRaise: 400,
          numberOfPlayers: 3,
        },
      );
      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.primaryAction.type,
      );
    });

    it("river with strategy tier rules and post-flop hand strength", () => {
      const res = runScenario(
        strategyTierWithRules({
          river: [
            {
              id: "raise-strong-hand",
              priority: 1,
              conditions: [
                {
                  field: "handStrength",
                  operator: "in",
                  value: [
                    "full_house",
                    "quads",
                    "straight_flush",
                    "royal_flush",
                  ],
                },
              ],
              action: { type: "raise" },
              enabled: true,
            },
          ],
        }),
        {
          holeCards: ["Kh", "Kd"],
          communityCards: ["Ks", "Kc", "Ah", "2d", "5s"],
          position: "BTN",
          pot: 200,
          toCall: 0,
          minRaise: 50,
        },
      );
      expect(res.primaryAction.type).toBe("raise");
      expect(res.source).toBe("Hard Rule");
    });

    it("strategy tier with equity condition is ignored gracefully", () => {
      const res = runScenario(
        {
          version: 1,
          tier: "strategy",
          personality: {
            aggression: 50,
            bluffFrequency: 30,
            riskTolerance: 50,
            tightness: 50,
          },
          rules: {
            preflop: [],
            flop: [
              {
                id: "equity-rule",
                priority: 1,
                conditions: [
                  { field: "equity", operator: "gt", value: 0.7 } as any,
                ],
                action: { type: "raise" },
                enabled: true,
              },
            ],
            turn: [],
            river: [],
          },
        } as any,
        {
          holeCards: ["As", "Ad"],
          communityCards: ["Ah", "Kd", "Qc"],
          position: "BTN",
          pot: 100,
          toCall: 0,
          minRaise: 30,
        },
      );
      expect(["check", "raise", "all_in"]).toContain(res.primaryAction.type);
    });
  });
});
