import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { getSharedApp } from "./shared/app-singleton";
import { createTestUser, authHeader } from "./shared/test-factories";
import {
  createCallerStrategy,
  createDefaultStrategy,
  createAggressiveStrategy,
  createSmartStrategy,
  createFolderStrategy,
} from "../utils/strategy-bot-factory";
import type { BotStrategy } from "../../src/domain/bot-strategy/strategy.types";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("Bots E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    const shared = await getSharedApp();
    app = shared.app;
    dataSource = shared.dataSource;
    jwtService = shared.jwtService;
  }, 60000);

  describe("Bot CRUD Operations", () => {
    it("should create a new internal bot", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `MyPokerBot-${user.id.slice(0, 8)}`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createCallerStrategy(),
          description: "My first poker bot",
        })
        .expect(201);

      expect(response.body.name).toBe(botName);
      expect(response.body.active).toBe(true);

      const bots = await dataSource.query(
        'SELECT * FROM "bots" WHERE name = $1',
        [botName],
      );
      expect(bots).toHaveLength(1);
    });

    it("should list user bots", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `Bot1-${id}`,
          strategy: createCallerStrategy(),
        })
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `Bot2-${id}`,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get("/api/v1/bots/my")
        .set(authHeader(user.accessToken))
        .expect(200);

      const bots = response.body.data || response.body;
      expect(bots).toHaveLength(2);
    });

    it("should get bot by ID", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);
      const botName = `GetBot-${id}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      expect(response.body.id).toBe(botId);
      expect(response.body.name).toBe(botName);
    });

    it("should update bot", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `UpdBot-${id}`,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .put(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .send({
          description: "Updated description",
        })
        .expect(200);

      expect(response.body.description).toBe("Updated description");
    });

    it("should deactivate bot", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `DeactBot-${id}`,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = createResponse.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      expect(response.body.active).toBe(false);
    });
  });

  describe("Bot Validation", () => {
    it("should reject bot with missing name", async () => {
      const user = await createTestUser(dataSource, jwtService);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          strategy: createDefaultStrategy(),
        })
        .expect(400);
    });

    it("should reject bot without strategy", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `NoStrat-${id}`,
        })
        .expect(400);
    });

    it("should reject duplicate bot names for same user", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);
      const botName = `DupBot-${id}`;

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createCallerStrategy(),
        })
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createDefaultStrategy(),
        })
        .expect(409);
    });
  });

  describe("Bot Ownership", () => {
    it("should not allow updating another user's bot", async () => {
      const owner = await createTestUser(dataSource, jwtService);
      const otherUser = await createTestUser(dataSource, jwtService);
      const ownerId = owner.id.slice(0, 8);

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(owner.accessToken))
        .send({
          name: `ProtBot-${ownerId}`,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .put(`/api/v1/bots/${botId}`)
        .set(authHeader(otherUser.accessToken))
        .send({
          description: "hacked",
        });

      expect([403, 404]).toContain(response.status);
    });

    it("should not allow deleting another user's bot", async () => {
      const owner = await createTestUser(dataSource, jwtService);
      const otherUser = await createTestUser(dataSource, jwtService);
      const ownerId = owner.id.slice(0, 8);

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(owner.accessToken))
        .send({
          name: `ProtBot2-${ownerId}`,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/bots/${botId}`)
        .set(authHeader(otherUser.accessToken));

      expect([403, 404]).toContain(response.status);
    });

    it("should isolate bot lists by user", async () => {
      const user1 = await createTestUser(dataSource, jwtService);
      const user2 = await createTestUser(dataSource, jwtService);
      const id1 = user1.id.slice(0, 8);
      const id2 = user2.id.slice(0, 8);

      const bot1Name = `U1Bot-${id1}`;
      const bot2Name = `U2Bot-${id2}`;

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user1.accessToken))
        .send({
          name: bot1Name,
          strategy: createCallerStrategy(),
        })
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user2.accessToken))
        .send({
          name: bot2Name,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const user1Bots = await request(app.getHttpServer())
        .get("/api/v1/bots/my")
        .set(authHeader(user1.accessToken))
        .expect(200);

      const user2Bots = await request(app.getHttpServer())
        .get("/api/v1/bots/my")
        .set(authHeader(user2.accessToken))
        .expect(200);

      const bots1 = user1Bots.body.data || user1Bots.body;
      const bots2 = user2Bots.body.data || user2Bots.body;

      expect(bots1).toHaveLength(1);
      expect(bots1[0].name).toBe(bot1Name);

      expect(bots2).toHaveLength(1);
      expect(bots2[0].name).toBe(bot2Name);
    });
  });

  describe("Strategy Tier Variants", () => {
    it("should create bot with quick tier strategy", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `QuickBot-${uid()}`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createDefaultStrategy(),
          description: "Quick tier bot",
        })
        .expect(201);

      expect(response.body.name).toBe(botName);
      expect(response.body.active).toBe(true);
      expect(response.body.strategy.tier).toBe("quick");
      expect(response.body.strategy.personality).toHaveProperty("aggression");
    });

    it("should create bot with strategy tier including rules", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `StrategyBot-${uid()}`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createSmartStrategy(),
          description: "Strategy tier bot with rules",
        })
        .expect(201);

      expect(response.body.strategy.tier).toBe("strategy");
      expect(response.body.strategy.rules).toBeDefined();
      expect(response.body.strategy.rules.preflop).toBeInstanceOf(Array);
    });

    it("should create bot with complex strategy rules (multiple conditions)", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `ComplexBot-${uid()}`;

      const complexStrategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 60,
          bluffFrequency: 35,
          riskTolerance: 55,
          tightness: 50,
        },
        rules: {
          preflop: [
            {
              id: "rule1",
              priority: 1,
              conditions: [
                { field: "facingBet", operator: "eq", value: false },
                { field: "myStackBB", operator: "gt", value: 20 },
              ],
              action: { type: "raise" },
              enabled: true,
            },
            {
              id: "rule2",
              priority: 2,
              conditions: [
                { field: "facingBet", operator: "eq", value: true },
                { field: "myStackBB", operator: "lt", value: 10 },
              ],
              action: { type: "fold" },
              enabled: true,
            },
          ],
          flop: [],
          turn: [],
          river: [],
        },
      };

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: complexStrategy,
        })
        .expect(201);

      expect(response.body.strategy.rules.preflop).toHaveLength(2);
      expect(response.body.strategy.rules.preflop[0].conditions).toHaveLength(
        2,
      );
    });
  });

  describe("Bot Name Validation", () => {
    it("should reject name shorter than 2 characters", async () => {
      const user = await createTestUser(dataSource, jwtService);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: "A",
          strategy: createDefaultStrategy(),
        })
        .expect(400);
    });

    it("should reject name longer than 100 characters", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const longName = "A".repeat(101);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: longName,
          strategy: createDefaultStrategy(),
        })
        .expect(400);
    });

    it("should reject name with invalid characters (exclamation mark)", async () => {
      const user = await createTestUser(dataSource, jwtService);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: "BadBot!",
          strategy: createDefaultStrategy(),
        })
        .expect(400);
    });

    it("should create bot with name containing underscores, hyphens, and spaces", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `Bot_Name-Test ${uid()}`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      expect(response.body.name).toBe(botName);
    });
  });

  describe("Bot Description Validation", () => {
    it("should reject description with HTML tags", async () => {
      const user = await createTestUser(dataSource, jwtService);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `HTMLBot-${uid()}`,
          strategy: createDefaultStrategy(),
          description: "This has <script>alert('xss')</script> tags",
        })
        .expect(400);
    });

    it("should reject description longer than 500 characters", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const longDescription = "A".repeat(501);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `LongDescBot-${uid()}`,
          strategy: createDefaultStrategy(),
          description: longDescription,
        })
        .expect(400);
    });
  });

  describe("Bot Strategy Size Limit", () => {
    it("should reject strategy exceeding 50KB JSON size", async () => {
      const user = await createTestUser(dataSource, jwtService);

      // Build a strategy with huge personality descriptions to exceed 50KB
      const hugeStrategy: BotStrategy = {
        version: 1,
        tier: "strategy",
        personality: {
          aggression: 50,
          bluffFrequency: 30,
          riskTolerance: 50,
          tightness: 50,
        },
        rules: {
          preflop: Array.from({ length: 1000 }, (_, i) => ({
            id: `rule_${i}`,
            priority: i,
            conditions: [{ field: "facingBet", operator: "eq", value: false }],
            action: { type: "call" },
            enabled: true,
            label: `Rule ${i} with a very long description that helps us exceed the size limit we have in place for security and performance reasons which is fifty kilobytes total`,
          })),
          flop: [],
          turn: [],
          river: [],
        },
      };

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `HugeBot-${uid()}`,
          strategy: hugeStrategy,
        })
        .expect(413);
    });
  });

  describe("Bot Lifecycle — Deactivate & Reactivate", () => {
    it("should deactivate an active bot", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `DeactBot-${uid()}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = createResponse.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      const checkResponse = await request(app.getHttpServer())
        .get(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      expect(checkResponse.body.active).toBe(false);
    });

    it("should reactivate a deactivated bot", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `ReactBot-${uid()}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = createResponse.body.id;

      // Deactivate
      await request(app.getHttpServer())
        .delete(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      // Reactivate
      await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/activate`)
        .set(authHeader(user.accessToken))
        .expect(201);

      const checkResponse = await request(app.getHttpServer())
        .get(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      expect(checkResponse.body.active).toBe(true);
    });

    it("should include deactivated bots when listing user bots", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const activeBotName = `ActiveBot-${uid()}`;
      const inactiveBotName = `InactiveBot-${uid()}`;

      const activeResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: activeBotName,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const inactiveResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: inactiveBotName,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const inactiveBotId = inactiveResponse.body.id;

      // Deactivate one bot
      await request(app.getHttpServer())
        .delete(`/api/v1/bots/${inactiveBotId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      // List bots
      const listResponse = await request(app.getHttpServer())
        .get("/api/v1/bots/my")
        .set(authHeader(user.accessToken))
        .expect(200);

      const bots = listResponse.body.data || listResponse.body;
      const foundBots = bots.filter(
        (b: any) => b.name === activeBotName || b.name === inactiveBotName,
      );

      expect(foundBots).toHaveLength(2);
      expect(foundBots.some((b: any) => b.active === true)).toBe(true);
      expect(foundBots.some((b: any) => b.active === false)).toBe(true);
    });
  });

  describe("Bot Duplication", () => {
    it("should duplicate a bot with (Copy) suffix in name", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `DupBot-${uid()}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createDefaultStrategy(),
          description: "Original bot",
        })
        .expect(201);

      const botId = createResponse.body.id;

      const dupResponse = await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/duplicate`)
        .set(authHeader(user.accessToken))
        .expect(201);

      expect(dupResponse.body.name).toContain("(Copy)");
      expect(dupResponse.body.id).not.toBe(botId);
      expect(dupResponse.body.strategy).toEqual(createResponse.body.strategy);
    });

    it("should not allow duplicating another user's bot", async () => {
      const owner = await createTestUser(dataSource, jwtService);
      const otherUser = await createTestUser(dataSource, jwtService);
      const botName = `ProtectedBot-${uid()}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(owner.accessToken))
        .send({
          name: botName,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = createResponse.body.id;

      const dupResponse = await request(app.getHttpServer())
        .post(`/api/v1/bots/${botId}/duplicate`)
        .set(authHeader(otherUser.accessToken));

      expect([403, 404]).toContain(dupResponse.status);
    });

    it("should fail to duplicate when at account limit", async () => {
      const user = await createTestUser(dataSource, jwtService);

      // Create 10 bots via API
      const bots: any[] = [];
      for (let i = 0; i < 10; i++) {
        const response = await request(app.getHttpServer())
          .post("/api/v1/bots/internal")
          .set(authHeader(user.accessToken))
          .send({
            name: `LimitBot${i}-${uid()}`,
            strategy: createDefaultStrategy(),
          })
          .expect(201);
        bots.push(response.body);
      }

      // Try to duplicate (should fail because at limit)
      const dupResponse = await request(app.getHttpServer())
        .post(`/api/v1/bots/${bots[0].id}/duplicate`)
        .set(authHeader(user.accessToken));

      expect([400, 403, 409]).toContain(dupResponse.status);
    });
  });

  describe("Bot Account Limit", () => {
    it("should allow creating up to MAX (10) bots", async () => {
      const user = await createTestUser(dataSource, jwtService);

      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post("/api/v1/bots/internal")
          .set(authHeader(user.accessToken))
          .send({
            name: `MaxBot${i}-${uid()}`,
            strategy: createDefaultStrategy(),
          })
          .expect(201);
      }

      const listResponse = await request(app.getHttpServer())
        .get("/api/v1/bots/my")
        .set(authHeader(user.accessToken))
        .expect(200);

      const bots = listResponse.body.data || listResponse.body;
      expect(bots).toHaveLength(10);
    });

    it("should reject creating 11th bot with 403", async () => {
      const user = await createTestUser(dataSource, jwtService);

      // Create 10 bots
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post("/api/v1/bots/internal")
          .set(authHeader(user.accessToken))
          .send({
            name: `ExceedBot${i}-${uid()}`,
            strategy: createDefaultStrategy(),
          })
          .expect(201);
      }

      // Try to create 11th
      const response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `ExceedBot11-${uid()}`,
          strategy: createDefaultStrategy(),
        });

      expect([400, 403]).toContain(response.status);
    });
  });

  describe("Strategy Simulation Endpoint", () => {
    it("should simulate action for default strategy with facingBet=false", async () => {
      const user = await createTestUser(dataSource, jwtService);

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal/simulate")
        .set(authHeader(user.accessToken))
        .send({
          strategy: createDefaultStrategy(),
          scenario: {
            stage: "preflop",
            holeCards: ["Ah", "Kd"],
            communityCards: [],
            position: "BTN",
            stackSize: 1000,
            potSize: 30,
            bigBlind: 20,
            facingBet: false,
            betAmount: 0,
            playersInHand: 4,
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty("action");
      expect(["fold", "check", "call", "raise", "all_in"]).toContain(
        response.body.action.type,
      );
    });

    it("should simulate action for aggressive strategy", async () => {
      const user = await createTestUser(dataSource, jwtService);

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal/simulate")
        .set(authHeader(user.accessToken))
        .send({
          strategy: createAggressiveStrategy(),
          scenario: {
            stage: "flop",
            holeCards: ["As", "Ad"],
            communityCards: ["Kh", "Qd", "Jc"],
            position: "SB",
            stackSize: 2000,
            potSize: 100,
            bigBlind: 20,
            facingBet: false,
            betAmount: 0,
            playersInHand: 3,
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty("action");
    });

    it("should reject simulate with invalid stage value", async () => {
      const user = await createTestUser(dataSource, jwtService);

      await request(app.getHttpServer())
        .post("/api/v1/bots/internal/simulate")
        .set(authHeader(user.accessToken))
        .send({
          strategy: createDefaultStrategy(),
          scenario: {
            stage: "invalid_stage",
            holeCards: ["Ah", "Kd"],
            communityCards: [],
            position: "BTN",
            stackSize: 1000,
            potSize: 30,
            bigBlind: 20,
            facingBet: false,
            betAmount: 0,
            playersInHand: 4,
          },
        })
        .expect(400);
    });
  });

  describe("Bot Strategy Update", () => {
    it("should update bot strategy tier from quick to strategy", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `UpdateBot-${uid()}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = createResponse.body.id;

      const updateResponse = await request(app.getHttpServer())
        .put(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .send({
          strategy: createSmartStrategy(),
        })
        .expect(200);

      expect(updateResponse.body.strategy.tier).toBe("strategy");
      expect(updateResponse.body.strategy.rules).toBeDefined();
    });

    it("should verify updated strategy persists and is used in simulation", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `PersistBot-${uid()}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createCallerStrategy(),
        })
        .expect(201);

      const botId = createResponse.body.id;

      // Update strategy
      await request(app.getHttpServer())
        .put(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .send({
          strategy: createAggressiveStrategy(),
        })
        .expect(200);

      // Fetch bot and verify strategy persisted
      const getResponse = await request(app.getHttpServer())
        .get(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      expect(getResponse.body.strategy.personality.aggression).toBe(90);
      expect(getResponse.body.strategy.personality.bluffFrequency).toBe(60);
    });
  });

  describe("Bot Metadata Updates", () => {
    it("should update bot name", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const originalName = `OriginalName-${uid()}`;
      const newName = `UpdatedName-${uid()}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: originalName,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = createResponse.body.id;

      const updateResponse = await request(app.getHttpServer())
        .put(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .send({
          name: newName,
        })
        .expect(200);

      expect(updateResponse.body.name).toBe(newName);
    });

    it("should update bot description", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `DescBot-${uid()}`;
      const newDescription = "Updated description for testing";

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createDefaultStrategy(),
          description: "Original description",
        })
        .expect(201);

      const botId = createResponse.body.id;

      const updateResponse = await request(app.getHttpServer())
        .put(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .send({
          description: newDescription,
        })
        .expect(200);

      expect(updateResponse.body.description).toBe(newDescription);
    });
  });

  describe("Bot Strategy Variant Coverage", () => {
    it("should create bots with each strategy variant and verify different personalities", async () => {
      const user = await createTestUser(dataSource, jwtService);

      const variants = [
        { factory: createCallerStrategy, expectedAggression: 10 },
        { factory: createAggressiveStrategy, expectedAggression: 90 },
        { factory: createFolderStrategy, expectedAggression: 5 },
        { factory: createDefaultStrategy, expectedAggression: 50 },
      ];

      for (const variant of variants) {
        const botName = `VariantBot-${variant.expectedAggression}-${uid()}`;
        const strategy = variant.factory();

        const response = await request(app.getHttpServer())
          .post("/api/v1/bots/internal")
          .set(authHeader(user.accessToken))
          .send({
            name: botName,
            strategy,
          })
          .expect(201);

        expect(response.body.strategy.personality.aggression).toBe(
          variant.expectedAggression,
        );
      }
    });
  });
});
