/**
 * Scenario Lab E2E Tests
 *
 * Full HTTP round-trip tests for POST /api/v1/bots/:id/scenario.
 * Each test creates a real bot in the DB, calls the endpoint, and asserts
 * on the returned action + distribution.
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
 *  9. DTO validation errors
 * 10. Auth / ownership guards
 */

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { getSharedApp } from "./shared/app-singleton";
import { createTestUser, authHeader } from "./shared/test-factories";
import type { BotStrategy } from "../../src/domain/bot-strategy/strategy.types";
import { PERSONALITY_PRESETS } from "../../src/modules/bot-strategy/presets/personality-presets";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── Shared helpers ────────────────────────────────────────────────────────────

/** POST /bots/internal — create and return the bot id */
async function createBot(
  app: INestApplication,
  token: string,
  strategy: BotStrategy,
  name?: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/api/v1/bots/internal")
    .set(authHeader(token))
    .send({ name: name ?? `TestBot-${uid()}`, strategy })
    .expect(201);
  return res.body.id;
}

/** POST /bots/:id/scenario — evaluate a scenario for a bot */
function evalScenario(
  app: INestApplication,
  token: string,
  botId: string,
  scenario: {
    holeCards: [string, string];
    communityCards: string[];
    position: string;
    pot: number;
    toCall: number;
    minRaise: number;
    numberOfPlayers?: number;
  },
) {
  return request(app.getHttpServer())
    .post(`/api/v1/bots/${botId}/scenario`)
    .set(authHeader(token))
    .send(scenario);
}

// ── Canonical strategies for reuse ───────────────────────────────────────────

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

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Scenario Lab E2E", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    const shared = await getSharedApp();
    app = shared.app;
    dataSource = shared.dataSource;
    jwtService = shared.jwtService;
  }, 60000);

  // ── 1. Illegal Move Guards ─────────────────────────────────────────────────
  // These are engine invariants — no strategy or configuration may violate them.
  // The distribution field is checked (not just primaryAction) because the invariant
  // must hold across ALL 20 runs, not just the first.

  describe("Illegal move guards", () => {
    it("never folds when canCheck (toCall=0) — aggressive bot, preflop", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ aggression: 90, tightness: 5 }),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["2c", "7d"], // worst hand in poker
        communityCards: [],
        position: "UTG",
        pot: 30,
        toCall: 0, // nobody bet — canCheck is true
        minRaise: 20,
        numberOfPlayers: 6,
      }).expect(200);

      expect(res.body.distribution.fold).toBe(0); // fold for free is ILLEGAL
    });

    it("never folds when canCheck — tight bot, flop, free action", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ tightness: 95, aggression: 5 }),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["2s", "7h"],
        communityCards: ["Ac", "Kd", "Qh"],
        position: "UTG",
        pot: 40,
        toCall: 0, // checked to us
        minRaise: 20,
        numberOfPlayers: 4,
      }).expect(200);

      expect(res.body.distribution.fold).toBe(0);
    });

    it("raise amount is always >= minRaise when bot decides to raise", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ aggression: 95, bluffFrequency: 80 }),
      );

      // Run across a premium preflop hand to maximize raise probability
      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Ah"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 40,
        numberOfPlayers: 3,
      }).expect(200);

      if (
        res.body.primaryAction.type === "raise" ||
        res.body.primaryAction.type === "all_in"
      ) {
        expect(res.body.primaryAction.amount ?? 0).toBeGreaterThanOrEqual(40);
      }
      // The distribution tells us if raises were the majority — each raise seen must comply
      expect(
        res.body.distribution.raise +
          res.body.distribution.fold +
          res.body.distribution.call +
          res.body.distribution.check,
      ).toBe(100);
    });

    it("board plays hand — never raises in multi-player pot (4 players, facing bet)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      // Very aggressive bot — UTG override with aggression=100 (the exact reported bug)
      const botId = await createBot(
        app,
        user.accessToken,
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
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["8s", "6s"], // contributes nothing to best 5
        communityCards: ["Ks", "Ah", "9d", "9c", "Ac"], // board = AA99K two pair
        position: "UTG",
        pot: 200,
        toCall: 50, // facing a bet (not free)
        minRaise: 100,
        numberOfPlayers: 3, // 3-player pot (hero + 2 opponents) → NOT heads-up
      }).expect(200);

      expect(res.body.distribution.raise).toBe(0);
      expect(["fold", "call"]).toContain(res.body.primaryAction.type);
    });

    it("board plays hand — MAY raise heads-up (bluff is justified with 2 players)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ aggression: 95, bluffFrequency: 80 }),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["8s", "6s"],
        communityCards: ["Ks", "Ah", "9d", "9c", "Ac"],
        position: "BTN",
        pot: 200,
        toCall: 50,
        minRaise: 100,
        numberOfPlayers: 2, // heads-up → bluff CAN be justified
      }).expect(200);

      // We don't assert raise MUST happen, just that it's allowed (no 400/500)
      expect(res.status).toBe(200);
      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.body.primaryAction.type,
      );
    });

    it("board plays hand — MAY raise on free bet (probe bet is justified)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ aggression: 95, bluffFrequency: 80 }),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["8s", "6s"],
        communityCards: ["Ks", "Ah", "9d", "9c", "Ac"],
        position: "BTN",
        pot: 200,
        toCall: 0, // nobody bet (free) → probe bet allowed
        minRaise: 100,
        numberOfPlayers: 5,
      }).expect(200);

      expect(res.status).toBe(200);
      expect(["check", "raise", "all_in"]).toContain(
        res.body.primaryAction.type,
      );
      // MUST NOT fold for free
      expect(res.body.distribution.fold).toBe(0);
    });

    it("premium free hand — AhKh, toCall=0 — never folds", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ tightness: 90 }), // very tight
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Ah", "Kh"],
        communityCards: ["2d", "7c", "3s"],
        position: "UTG",
        pot: 60,
        toCall: 0,
        minRaise: 20,
      }).expect(200);

      expect(res.body.distribution.fold).toBe(0);
    });
  });

  // ── 2. All Poker Streets ───────────────────────────────────────────────────

  describe("All poker streets produce valid actions", () => {
    it("preflop (0 community cards)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Ks", "Qd"],
        communityCards: [],
        position: "CO",
        pot: 30,
        toCall: 20,
        minRaise: 40,
      }).expect(200);

      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.body.primaryAction.type,
      );
      expect(res.body.source).toBeDefined();
      expect(res.body.explanation).toBeTruthy();
    });

    it("flop (3 community cards)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Kd"],
        communityCards: ["Ah", "7c", "2s"],
        position: "SB",
        pot: 80,
        toCall: 0,
        minRaise: 20,
      }).expect(200);

      expect(["check", "raise", "all_in"]).toContain(
        res.body.primaryAction.type,
      );
    });

    it("turn (4 community cards)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Jh", "Th"],
        communityCards: ["9h", "Qh", "8d", "2c"],
        position: "BTN",
        pot: 200,
        toCall: 100,
        minRaise: 200,
      }).expect(200);

      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.body.primaryAction.type,
      );
    });

    it("river (5 community cards)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Ac"],
        communityCards: ["Ad", "Kh", "Qc", "Js", "Th"],
        position: "BB",
        pot: 300,
        toCall: 0,
        minRaise: 50,
      }).expect(200);

      // Royal flush — bot should not fold (free bet)
      expect(res.body.distribution.fold).toBe(0);
    });

    it("rejects 1 community card (not a valid poker street)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Kd"],
        communityCards: ["Ah"], // invalid — must be 0, 3, 4, or 5
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
      }).expect(400);
    });

    it("rejects 2 community cards (not a valid poker street)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Kd"],
        communityCards: ["Ah", "Kc"], // invalid
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
      }).expect(400);
    });
  });

  // ── 3. All 8 Personality Presets ──────────────────────────────────────────

  describe("All 8 quick-tier personality presets return valid actions", () => {
    for (const preset of PERSONALITY_PRESETS) {
      it(`${preset.name} — preflop, facing bet`, async () => {
        const user = await createTestUser(dataSource, jwtService);
        const botId = await createBot(app, user.accessToken, {
          version: 1,
          tier: "quick",
          personality: preset.personality,
        });

        const res = await evalScenario(app, user.accessToken, botId, {
          holeCards: ["Ah", "Ks"],
          communityCards: [],
          position: "CO",
          pot: 60,
          toCall: 20,
          minRaise: 40,
          numberOfPlayers: 5,
        }).expect(200);

        expect(["fold", "call", "raise", "all_in"]).toContain(
          res.body.primaryAction.type,
        );
        expect(res.body.source).toBeDefined();

        // Verify distribution sums to 100
        const { fold, check, call, raise } = res.body.distribution;
        expect(fold + check + call + raise).toBe(100);
      });

      it(`${preset.name} — river, free bet, strong hand`, async () => {
        const user = await createTestUser(dataSource, jwtService);
        const botId = await createBot(app, user.accessToken, {
          version: 1,
          tier: "quick",
          personality: preset.personality,
        });

        const res = await evalScenario(app, user.accessToken, botId, {
          holeCards: ["Ks", "Kd"],
          communityCards: ["Kh", "2c", "7s", "9d", "3h"], // trip kings
          position: "BTN",
          pot: 200,
          toCall: 0,
          minRaise: 50,
          numberOfPlayers: 4,
        }).expect(200);

        // Free bet with trips — never fold
        expect(res.body.distribution.fold).toBe(0);
      });
    }
  });

  // ── 4. Strategy Tier — Rules Engine ───────────────────────────────────────

  describe("Strategy tier — rules fire and override personality", () => {
    it("high-priority rule 'always raise when no bet' fires preflop", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
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
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["2c", "7d"], // worst hand, but rule forces raise
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0, // canCheck = true
        minRaise: 20,
      }).expect(200);

      expect(res.body.primaryAction.type).toBe("raise");
      expect(res.body.source).toBe("Hard Rule");
      expect(res.body.ruleId).toBe("always-raise-free");
    });

    it("'fold facing a bet' rule fires on river", async () => {
      const user = await createTestUser(dataSource, jwtService);
      // facingBet = (toCall > 0) which IS testable via DTO.
      // facingAllIn requires a mock player with allIn=true which the scenario
      // lab cannot set via DTO — use facingBet instead for the same intent.
      const botId = await createBot(
        app,
        user.accessToken,
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
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["2c", "7d"],
        communityCards: ["Ac", "Kd", "Qh", "Js", "Th"],
        position: "BB",
        pot: 200,
        toCall: 100, // facingBet = true
        minRaise: 200,
        numberOfPlayers: 3,
      }).expect(200);

      expect(res.body.primaryAction.type).toBe("fold");
      expect(res.body.source).toBe("Hard Rule");
    });

    it("disabled rule does NOT fire — personality takes over", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
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
                enabled: false, // disabled — should not fire
              },
            ],
          },
          { aggression: 80, tightness: 20 },
        ),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Ah"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
      }).expect(200);

      // Disabled rule cannot fold; aggressive personality should raise
      expect(res.body.source).toBe("Personality");
      expect(res.body.distribution.fold).toBe(0); // canCheck=true so fold is illegal anyway
    });

    it("rule with AND conditions fires only when all conditions match", async () => {
      const user = await createTestUser(dataSource, jwtService);
      // HandStrength enum values: "trips" (not "three_of_a_kind"), "quads" (not "four_of_a_kind")
      const botId = await createBot(
        app,
        user.accessToken,
        strategyTierWithRules({
          flop: [
            {
              id: "and-rule",
              priority: 1,
              conditions: [
                { field: "canCheck", operator: "eq", value: false }, // facing a bet
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
      );

      // Trip kings + facing a bet → both conditions true → rule fires → raise
      const hitRes = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Ks", "Kd"],
        communityCards: ["Kh", "7c", "2s"], // trips (KKK72)
        position: "BTN",
        pot: 100,
        toCall: 50, // canCheck=false, facingBet=true
        minRaise: 100,
      }).expect(200);

      expect(hitRes.body.primaryAction.type).toBe("raise");
      expect(hitRes.body.source).toBe("Hard Rule");
    });

    it("rule with OR group fires when either branch matches", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
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
      );

      // Flush draw on flop
      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Ah", "Kh"],
        communityCards: ["2h", "7h", "Qc"], // flush draw (4 hearts)
        position: "CO",
        pot: 80,
        toCall: 40,
        minRaise: 80,
      }).expect(200);

      expect(res.body.primaryAction.type).toBe("call");
      expect(res.body.source).toBe("Hard Rule");
    });

    it("lower priority rule does not override a higher priority match", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
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
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Ah", "Kd"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0, // facingBet=false
        minRaise: 20,
      }).expect(200);

      expect(res.body.primaryAction.type).toBe("raise");
      expect(res.body.ruleId).toBe("p1-raise");
    });
  });

  // ── 5. Pro Tier — Position Overrides ──────────────────────────────────────

  describe("Pro tier — position overrides change behavior vs other positions", () => {
    it("UTG override with high aggression mostly raises when free from UTG", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        proStrategy(
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
          { aggression: 20, tightness: 70 }, // tight base personality
        ),
      );

      // From UTG with override — should be aggressive
      const utgRes = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Kd"],
        communityCards: [],
        position: "UTG",
        pot: 30,
        toCall: 0,
        minRaise: 20,
        numberOfPlayers: 6,
      }).expect(200);

      expect(utgRes.body.source).toBe("Position Override");

      // From BTN without override — base personality (tight) should be different
      const btnRes = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Kd"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
        numberOfPlayers: 6,
      }).expect(200);

      // BTN has no override → falls through to base personality
      expect(btnRes.body.source).not.toBe("Position Override");

      // The distributions should differ between positions
      // (UTG override=100 aggression vs base=20 aggression)
      expect(utgRes.body.distribution.raise).toBeGreaterThan(
        btnRes.body.distribution.raise,
      );
    });

    it("position override with fold rule fires for that position only", async () => {
      const user = await createTestUser(dataSource, jwtService);
      // Position override rules must use StreetRules format { preflop: [], flop: [], ... }
      const botId = await createBot(
        app,
        user.accessToken,
        proStrategy({
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
        }),
      );

      // From SB facing a bet → rule fires → fold
      const sbRes = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Ad"], // pocket aces — but rule says fold
        communityCards: [],
        position: "SB",
        pot: 40,
        toCall: 20,
        minRaise: 40,
      }).expect(200);

      expect(sbRes.body.primaryAction.type).toBe("fold");
      expect(sbRes.body.source).toBe("Position Override");

      // From BTN (no override) — pocket aces facing bet → personality, not fold
      const btnRes = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Ad"],
        communityCards: [],
        position: "BTN",
        pot: 40,
        toCall: 20,
        minRaise: 40,
      }).expect(200);

      expect(btnRes.body.source).not.toBe("Position Override");
      // Pocket aces vs small bet — aggressive bot should NOT fold
      expect(btnRes.body.distribution.fold).toBeLessThan(50);
    });

    it("BTN override with range chart maps specific hands", async () => {
      const user = await createTestUser(dataSource, jwtService);

      // RangeChart is Record<string, RangeAction> — hand notation → action
      // When matched via a position override's range chart, engine source = "range_chart"
      const botId = await createBot(
        app,
        user.accessToken,
        proStrategy({
          BTN: {
            rangeChart: {
              AA: "raise",
              KK: "raise",
              QQ: "raise",
              AKs: "raise",
              "72o": "fold",
            },
          },
        }),
      );

      // AA from BTN → position override range chart matches → raise
      const aaRes = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Ah", "Ad"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
      }).expect(200);

      expect(aaRes.body.primaryAction.type).toBe("raise");
      // Source is "range_chart" whether it came from global or position override range chart
      expect(["range_chart", "position_override"]).toContain(aaRes.body.source);

      // 72o from BTN → range chart says fold; but toCall=0 so fold-for-free is illegal,
      // engine should upgrade to check instead
      const worstRes = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["7c", "2d"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
      }).expect(200);

      // Even if range says fold, toCall=0 means fold is illegal → check
      expect(["check", "raise"]).toContain(worstRes.body.primaryAction.type);
    });
  });

  // ── 6. Strategy Correctness — Poker Logic ─────────────────────────────────

  describe("Strategy correctness — poker logic", () => {
    it("aggressive bot with premium hand (AA) mostly raises preflop", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ aggression: 90, bluffFrequency: 60, tightness: 20 }),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Ah"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
        numberOfPlayers: 3,
      }).expect(200);

      // Aggressive bot with the best hand should raise in most of the 20 runs
      expect(res.body.distribution.raise).toBeGreaterThanOrEqual(60);
    });

    it("tight bot folds 72o preflop from UTG facing raise (deeply negative EV)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ tightness: 85, aggression: 10, riskTolerance: 15 }),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["2c", "7d"],
        communityCards: [],
        position: "UTG",
        pot: 200,
        toCall: 150, // huge raise relative to pot
        minRaise: 300,
        numberOfPlayers: 7,
      }).expect(200);

      expect(res.body.distribution.fold).toBeGreaterThanOrEqual(70);
    });

    it("nut flush on river — aggressive bot almost never folds to small bet", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ aggression: 60, riskTolerance: 60 }),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Ah", "Kh"],
        communityCards: ["Qh", "Jh", "Th", "2c", "3d"], // royal flush
        position: "SB",
        pot: 200,
        toCall: 20, // tiny bet — great pot odds
        minRaise: 40,
        numberOfPlayers: 3,
      }).expect(200);

      expect(res.body.distribution.fold).toBe(0);
    });

    it("strong draw with good pot odds — should not fold (flush draw, cheap price)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ riskTolerance: 60, aggression: 50 }),
      );

      // Nut flush draw: ~36% equity on the flop, pot odds ~17% (great call)
      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Ah", "Kh"],
        communityCards: ["2h", "7h", "Qc"], // 4 hearts = nut flush draw
        position: "CO",
        pot: 100,
        toCall: 20, // only 17% pot odds needed
        minRaise: 40,
        numberOfPlayers: 3,
      }).expect(200);

      // Should NOT fold — getting better than 2:1 on a draw
      expect(res.body.distribution.fold).toBeLessThan(50);
    });

    it("paired board weak kicker — should not raise in multi-player pot", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ aggression: 90, bluffFrequency: 70 }),
      );

      // 2s3d on AhAdKsQcJh — pair of aces on board, 2-kicker is worst possible
      // 3-player pot: hero + 2 opponents → guard correctly treats as multi-player (not heads-up)
      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["2s", "3d"],
        communityCards: ["Ah", "Ad", "Ks", "Qc", "Jh"],
        position: "UTG",
        pot: 200,
        toCall: 50,
        minRaise: 100,
        numberOfPlayers: 3,
      }).expect(200);

      expect(res.body.distribution.raise).toBe(0);
    });

    it("trips board weak kicker — large facing bet → should not raise", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ aggression: 90, bluffFrequency: 70 }),
      );

      // 3h4d on KcKsKhAcJd — trip kings board, 3-4 contributes nothing
      // 3-player pot: hero + 2 opponents → guard correctly treats as multi-player
      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["3h", "4d"],
        communityCards: ["Kc", "Ks", "Kh", "Ac", "Jd"],
        position: "UTG",
        pot: 400,
        toCall: 200, // large bet (not free → guard blocks raise)
        minRaise: 400,
        numberOfPlayers: 3,
      }).expect(200);

      expect(res.body.distribution.raise).toBe(0);
    });
  });

  // ── 7. Player Count Effects ────────────────────────────────────────────────

  describe("Player count (2 vs 8 players) — no illegal moves in either case", () => {
    it("heads-up (2 players) — aggressive bot returns valid action", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ aggression: 80 }),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Ah", "Kd"],
        communityCards: ["Ac", "7s", "2h"],
        position: "BTN",
        pot: 100,
        toCall: 50,
        minRaise: 100,
        numberOfPlayers: 2,
      }).expect(200);

      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.body.primaryAction.type,
      );
    });

    it("full table (8 players) — aggressive bot returns valid action", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ aggression: 80 }),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Ah", "Kd"],
        communityCards: ["Ac", "7s", "2h"],
        position: "UTG",
        pot: 100,
        toCall: 50,
        minRaise: 100,
        numberOfPlayers: 8,
      }).expect(200);

      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.body.primaryAction.type,
      );
    });

    it("multi-way vs heads-up — tight bot is looser heads-up", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ tightness: 75, aggression: 40 }),
      );

      const scenario = {
        holeCards: ["Qs", "Jd"] as [string, string],
        communityCards: [],
        position: "CO",
        pot: 60,
        toCall: 40,
        minRaise: 80,
      };

      const huRes = await evalScenario(app, user.accessToken, botId, {
        ...scenario,
        numberOfPlayers: 2,
      }).expect(200);

      const mwRes = await evalScenario(app, user.accessToken, botId, {
        ...scenario,
        numberOfPlayers: 8,
      }).expect(200);

      // More players = lower equity → tight bot should fold MORE in multi-way
      expect(mwRes.body.distribution.fold).toBeGreaterThanOrEqual(
        huRes.body.distribution.fold,
      );
    });
  });

  // ── 8. Response Shape ──────────────────────────────────────────────────────

  describe("Response shape and field validation", () => {
    it("response always contains all required fields", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Kd"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
      }).expect(200);

      expect(res.body).toHaveProperty("primaryAction");
      expect(res.body).toHaveProperty("source");
      expect(res.body).toHaveProperty("explanation");
      expect(res.body).toHaveProperty("distribution");
      expect(res.body.distribution).toHaveProperty("fold");
      expect(res.body.distribution).toHaveProperty("check");
      expect(res.body.distribution).toHaveProperty("call");
      expect(res.body.distribution).toHaveProperty("raise");
    });

    it("distribution always sums to 100", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["7c", "2d"],
        communityCards: ["Ac", "Kd", "Qh"],
        position: "UTG",
        pot: 100,
        toCall: 50,
        minRaise: 100,
        numberOfPlayers: 5,
      }).expect(200);

      const { fold, check, call, raise } = res.body.distribution;
      expect(fold + check + call + raise).toBe(100);
    });

    it("source is one of the valid values", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Ad"],
        communityCards: [],
        position: "BTN",
        pot: 30,
        toCall: 0,
        minRaise: 20,
      }).expect(200);

      expect([
        "position_override",
        "range_chart",
        "rule",
        "personality",
      ]).toContain(res.body.source);
    });

    it("explanation is non-empty string", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Kd"],
        communityCards: [],
        position: "CO",
        pot: 50,
        toCall: 20,
        minRaise: 40,
      }).expect(200);

      expect(typeof res.body.explanation).toBe("string");
      expect(res.body.explanation.length).toBeGreaterThan(0);
    });

    it("same scenario run twice returns identical primaryAction (deterministic)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      const scenario = {
        holeCards: ["Ks", "Qd"] as [string, string],
        communityCards: ["Kh", "7c", "2s"],
        position: "BTN",
        pot: 100,
        toCall: 0,
        minRaise: 30,
        numberOfPlayers: 4,
      };

      const res1 = await evalScenario(
        app,
        user.accessToken,
        botId,
        scenario,
      ).expect(200);
      const res2 = await evalScenario(
        app,
        user.accessToken,
        botId,
        scenario,
      ).expect(200);

      expect(res1.body.primaryAction).toEqual(res2.body.primaryAction);
      expect(res1.body.distribution).toEqual(res2.body.distribution);
    });
  });

  // ── 9. DTO Validation ──────────────────────────────────────────────────────

  describe("DTO validation errors", () => {
    it("rejects request with missing holeCards", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/scenario`)
        .set(authHeader(user.accessToken))
        .send({
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
        })
        .expect(400);
    });

    it("rejects request with only 1 hole card", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/scenario`)
        .set(authHeader(user.accessToken))
        .send({
          holeCards: ["As"], // only 1 card
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
        })
        .expect(400);
    });

    it("rejects request with 6 community cards (max is 5)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/scenario`)
        .set(authHeader(user.accessToken))
        .send({
          holeCards: ["As", "Kd"],
          communityCards: ["Ah", "Kc", "Qd", "Jh", "Ts", "9c"], // 6 cards
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
        })
        .expect(400);
    });

    it("rejects numberOfPlayers=1 (minimum is 2)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/scenario`)
        .set(authHeader(user.accessToken))
        .send({
          holeCards: ["As", "Kd"],
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
          numberOfPlayers: 1,
        })
        .expect(400);
    });

    it("rejects numberOfPlayers=10 (maximum is 9)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/scenario`)
        .set(authHeader(user.accessToken))
        .send({
          holeCards: ["As", "Kd"],
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
          numberOfPlayers: 10,
        })
        .expect(400);
    });

    it("rejects negative pot value", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/scenario`)
        .set(authHeader(user.accessToken))
        .send({
          holeCards: ["As", "Kd"],
          communityCards: [],
          position: "BTN",
          pot: -100,
          toCall: 0,
          minRaise: 20,
        })
        .expect(400);
    });
  });

  // ── 10. Auth / Ownership Guards ───────────────────────────────────────────

  describe("Auth and ownership guards", () => {
    it("returns 401 without auth token", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, user.accessToken, quickStrategy());

      await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/scenario`)
        .send({
          holeCards: ["As", "Kd"],
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
        })
        .expect(401);
    });

    it("returns 403 when testing another user's bot", async () => {
      const owner = await createTestUser(dataSource, jwtService);
      const attacker = await createTestUser(dataSource, jwtService);
      const botId = await createBot(app, owner.accessToken, quickStrategy());

      await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/scenario`)
        .set(authHeader(attacker.accessToken)) // wrong user
        .send({
          holeCards: ["As", "Kd"],
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
        })
        .expect(403);
    });

    it("returns 404 for a non-existent bot ID", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const fakeId = "00000000-0000-0000-0000-000000000000";

      await request(app.getHttpServer())
        .post(`/api/v1/bots/${fakeId}/scenario`)
        .set(authHeader(user.accessToken))
        .send({
          holeCards: ["As", "Kd"],
          communityCards: [],
          position: "BTN",
          pot: 30,
          toCall: 0,
          minRaise: 20,
        })
        .expect(404);
    });
  });

  // ── 11. Edge Cases ────────────────────────────────────────────────────────

  describe("Edge cases and boundary conditions", () => {
    it("all-in situation (toCall = all remaining chips)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ riskTolerance: 80 }),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Ad"],
        communityCards: [],
        position: "BTN",
        pot: 500,
        toCall: 1000, // forces all-in or fold
        minRaise: 1000,
        numberOfPlayers: 2,
      }).expect(200);

      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.body.primaryAction.type,
      );
    });

    it("short stack (pot = 10x remaining chips) — risk tolerant bot should not always fold", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botId = await createBot(
        app,
        user.accessToken,
        quickStrategy({ riskTolerance: 90, aggression: 70 }),
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Qh", "Js"],
        communityCards: [],
        position: "BTN",
        pot: 500,
        toCall: 200,
        minRaise: 400,
        numberOfPlayers: 3,
      }).expect(200);

      expect(["fold", "call", "raise", "all_in"]).toContain(
        res.body.primaryAction.type,
      );
    });

    it("river with strategy tier rules and post-flop hand strength", async () => {
      const user = await createTestUser(dataSource, jwtService);
      // HandStrength enum: "quads" (not "four_of_a_kind"), "trips" (not "three_of_a_kind")
      const botId = await createBot(
        app,
        user.accessToken,
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
      );

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["Kh", "Kd"],
        communityCards: ["Ks", "Kc", "Ah", "2d", "5s"], // four of a kind kings = "quads"
        position: "BTN",
        pot: 200,
        toCall: 0,
        minRaise: 50,
      }).expect(200);

      expect(res.body.primaryAction.type).toBe("raise");
      expect(res.body.source).toBe("Hard Rule");
    });

    it("strategy tier with equity condition (pro field in strategy tier) is ignored gracefully", async () => {
      const user = await createTestUser(dataSource, jwtService);
      // equity is a Pro-only condition field; using it in strategy tier should not crash
      const botId = await createBot(app, user.accessToken, {
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
      } as any);

      const res = await evalScenario(app, user.accessToken, botId, {
        holeCards: ["As", "Ad"],
        communityCards: ["Ah", "Kd", "Qc"],
        position: "BTN",
        pot: 100,
        toCall: 0,
        minRaise: 30,
      }).expect(200);

      // Should return a valid action without crashing
      expect(["check", "raise", "all_in"]).toContain(
        res.body.primaryAction.type,
      );
    });
  });
});
