import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { ServicesModule } from "../../src/services/services.module";
import { createTestApp, closeTestApp, TestAppContext } from "./shared/test-app";
import { createTestUser, authHeader } from "./shared/test-factories";

describe("Internal Bots E2E Tests", () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    ctx = await createTestApp({
      imports: [ServicesModule, AuthModule, BotsModule],
    });
    app = ctx.app;
    dataSource = ctx.dataSource;
    jwtService = ctx.jwtService;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  const quickStrategy = {
    version: 1,
    tier: "quick",
    personality: {
      aggression: 50,
      bluffFrequency: 30,
      riskTolerance: 50,
      tightness: 50,
    },
  };

  const strategyWithRules = {
    version: 1,
    tier: "strategy",
    personality: {
      aggression: 60,
      bluffFrequency: 20,
      riskTolerance: 40,
      tightness: 70,
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
          label: "Raise with premium hands",
        },
      ],
    },
    rangeChart: {
      AA: "raise",
      KK: "raise",
      AKs: "raise",
      "72o": "fold",
    },
  };

  describe("Internal Bot Creation", () => {
    it("should create an internal bot with quick strategy", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `InternalQuick-${user.id.slice(0, 8)}`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: quickStrategy,
          description: "A quick bot with personality sliders only",
        })
        .expect(201);

      expect(response.body.name).toBe(botName);
      expect(response.body.bot_type).toBe("internal");
      expect(response.body.endpoint).toBeNull();
    });

    it("should create an internal bot with strategy+rules", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `InternalStrategy-${user.id.slice(0, 8)}`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: strategyWithRules,
        })
        .expect(201);

      expect(response.body.name).toBe(botName);
      expect(response.body.bot_type).toBe("internal");
    });

    it("should reject internal bot without strategy", async () => {
      const user = await createTestUser(dataSource, jwtService);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({ name: "NoStrategy" })
        .expect(400);
    });

    it("should reject internal bot with invalid strategy", async () => {
      const user = await createTestUser(dataSource, jwtService);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: "BadStrategy",
          strategy: { version: 1, tier: "quick" },
        })
        .expect(400);
    });

    it("should require authentication", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .send({
          name: "UnauthBot",
          strategy: quickStrategy,
        })
        .expect(401);
    });
  });

  describe("Strategy Management", () => {
    it("should retrieve a bot strategy", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `StratGet-${user.id.slice(0, 8)}`;

      const createRes = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({ name: botName, strategy: quickStrategy })
        .expect(201);

      const botId = createRes.body.id;

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/bots/${botId}/strategy`)
        .set(authHeader(user.accessToken))
        .expect(200);

      expect(getRes.body.strategy).toBeDefined();
      expect(getRes.body.strategy.tier).toBe("quick");
      expect(getRes.body.strategy.personality.aggression).toBe(50);
    });

    it("should update a bot strategy", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `StratUpdate-${user.id.slice(0, 8)}`;

      const createRes = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({ name: botName, strategy: quickStrategy })
        .expect(201);

      const botId = createRes.body.id;

      const updatedStrategy = {
        ...strategyWithRules,
      };

      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/bots/${botId}/strategy`)
        .set(authHeader(user.accessToken))
        .send({ strategy: updatedStrategy })
        .expect(200);

      expect(updateRes.body.strategy.tier).toBe("strategy");
    });

    it("should validate a bot strategy", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `StratValidate-${user.id.slice(0, 8)}`;

      const createRes = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({ name: botName, strategy: quickStrategy })
        .expect(201);

      const botId = createRes.body.id;

      const validateRes = await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/strategy/validate`)
        .set(authHeader(user.accessToken))
        .expect(200);

      expect(validateRes.body.valid).toBe(true);
      expect(validateRes.body.errors).toHaveLength(0);
    });
  });

  describe("Personality Presets & Condition Fields", () => {
    it("should return personality presets", async () => {
      const user = await createTestUser(dataSource, jwtService);

      const response = await request(app.getHttpServer())
        .get("/api/v1/bots/presets")
        .set(authHeader(user.accessToken))
        .expect(200);

      expect(response.body.presets).toBeDefined();
      expect(Array.isArray(response.body.presets)).toBe(true);
      expect(response.body.presets.length).toBeGreaterThan(0);

      const preset = response.body.presets[0];
      expect(preset.id).toBeDefined();
      expect(preset.name).toBeDefined();
      expect(preset.personality).toBeDefined();
      expect(preset.personality.aggression).toBeGreaterThanOrEqual(0);
      expect(preset.personality.aggression).toBeLessThanOrEqual(100);
    });

    it("should return condition field definitions", async () => {
      const user = await createTestUser(dataSource, jwtService);

      const response = await request(app.getHttpServer())
        .get("/api/v1/bots/condition-fields")
        .set(authHeader(user.accessToken))
        .expect(200);

      expect(response.body.fields).toBeDefined();
      expect(Array.isArray(response.body.fields)).toBe(true);
      expect(response.body.fields.length).toBeGreaterThan(0);

      const field = response.body.fields[0];
      expect(field.category).toBeDefined();
      expect(field.field).toBeDefined();
      expect(field.type).toBeDefined();
      expect(field.label).toBeDefined();
    });
  });

  describe("Action Simulation", () => {
    it("should simulate an action for a given strategy and scenario", async () => {
      const user = await createTestUser(dataSource, jwtService);

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots/simulate-action")
        .set(authHeader(user.accessToken))
        .send({
          strategy: quickStrategy,
          scenario: {
            stage: "pre-flop",
            holeCards: ["As", "Ah"],
            communityCards: [],
            position: "UTG",
            stackSize: 1000,
            potSize: 15,
            bigBlind: 10,
            facingBet: false,
            betAmount: 0,
            playersInHand: 6,
          },
        })
        .expect(200);

      expect(response.body.action).toBeDefined();
      expect(response.body.action.type).toBeDefined();
      expect(["fold", "check", "call", "raise", "all_in"]).toContain(
        response.body.action.type,
      );
      expect(response.body.source).toBeDefined();
    });

    it("should produce deterministic results", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const payload = {
        strategy: quickStrategy,
        scenario: {
          stage: "pre-flop",
          holeCards: ["Kd", "Kc"],
          communityCards: [],
          position: "BTN",
          stackSize: 500,
          potSize: 30,
          bigBlind: 10,
          facingBet: true,
          betAmount: 30,
          playersInHand: 3,
        },
      };

      const res1 = await request(app.getHttpServer())
        .post("/api/v1/bots/simulate-action")
        .set(authHeader(user.accessToken))
        .send(payload)
        .expect(200);

      const res2 = await request(app.getHttpServer())
        .post("/api/v1/bots/simulate-action")
        .set(authHeader(user.accessToken))
        .send(payload)
        .expect(200);

      expect(res1.body.action.type).toBe(res2.body.action.type);
    });
  });
});
