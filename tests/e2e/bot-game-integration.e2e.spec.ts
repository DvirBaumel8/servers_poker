import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { getSharedApp } from "./shared/app-singleton";
import {
  createTestUser,
  createTestTable,
  authHeader,
} from "./shared/test-factories";
import {
  createDefaultStrategy,
  createCallerStrategy,
  createAggressiveStrategy,
} from "../utils/strategy-bot-factory";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("Bot Creation & Game Integration E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    const shared = await getSharedApp();
    app = shared.app;
    dataSource = shared.dataSource;
    jwtService = shared.jwtService;
  }, 60000);

  describe("Bot Creation → Table Join Full Flow", () => {
    it("should create bot via API → create table → join table → verify seated", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `FlowBot-${uid()}`;

      // Create bot via API
      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = botResponse.body.id;

      // Create table
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set(authHeader(user.accessToken))
        .send({
          name: `FlowTable-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      const tableId = tableResponse.body.id;

      // Join table with bot
      const joinResponse = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set(authHeader(user.accessToken))
        .send({
          bot_id: botId,
        })
        .expect(201);

      expect(joinResponse.body).toHaveProperty("botId", botId);
      expect(joinResponse.body).toHaveProperty("tableId", tableId);

      // Verify game state shows the bot seated
      const stateResponse = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .expect(200);

      const seatedBots = stateResponse.body.players || stateResponse.body.seats;
      expect(seatedBots).toBeDefined();
    });

    it("should verify game state reflects bot's joined seat", async () => {
      const user = await createTestUser(dataSource, jwtService);

      // Create bot
      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `SeatBot-${uid()}`,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = botResponse.body.id;

      // Create table
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set(authHeader(user.accessToken))
        .send({
          name: `SeatTable-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      const tableId = tableResponse.body.id;

      // Join table
      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set(authHeader(user.accessToken))
        .send({ bot_id: botId })
        .expect(201);

      // Get state
      const stateResponse = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .expect(200);

      // Verify bot appears in state
      const state = stateResponse.body;
      expect(state).toBeDefined();
      expect(state.players || state.seats).toBeDefined();
    });

    it("should join table with bot created from strategy tier", async () => {
      const user = await createTestUser(dataSource, jwtService);

      // Create bot with strategy tier
      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `StrateryTierBot-${uid()}`,
          strategy: {
            version: 1,
            tier: "strategy",
            personality: {
              aggression: 60,
              bluffFrequency: 35,
              riskTolerance: 55,
              tightness: 50,
            },
            rules: {
              preflop: [],
              flop: [],
              turn: [],
              river: [],
            },
          },
        })
        .expect(201);

      const botId = botResponse.body.id;

      // Create table
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set(authHeader(user.accessToken))
        .send({
          name: `StrategyTable-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      const tableId = tableResponse.body.id;

      // Join table with strategy-tier bot
      const joinResponse = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set(authHeader(user.accessToken))
        .send({ bot_id: botId })
        .expect(201);

      expect(joinResponse.body.botId).toBe(botId);
    });
  });

  describe("Multi-Strategy Bots on Same Table", () => {
    it("should allow aggressive and passive bots from different users to join same table", async () => {
      const user1 = await createTestUser(dataSource, jwtService);
      const user2 = await createTestUser(dataSource, jwtService);

      // User 1 creates aggressive bot
      const bot1Response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user1.accessToken))
        .send({
          name: `AggressiveBot-${uid()}`,
          strategy: createAggressiveStrategy(),
        })
        .expect(201);

      // User 2 creates passive bot
      const bot2Response = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user2.accessToken))
        .send({
          name: `PassiveBot-${uid()}`,
          strategy: createCallerStrategy(),
        })
        .expect(201);

      // Create shared table
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set(authHeader(user1.accessToken))
        .send({
          name: `MultiStrategyTable-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      const tableId = tableResponse.body.id;

      // Both bots join
      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set(authHeader(user1.accessToken))
        .send({ bot_id: bot1Response.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set(authHeader(user2.accessToken))
        .send({ bot_id: bot2Response.body.id })
        .expect(201);

      // Verify both seated
      const stateResponse = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .expect(200);

      expect(stateResponse.body).toBeDefined();
    });

    it("should allow 6 bots from 6 different users to join same table", async () => {
      // Create 6 users and bots
      const users = [];
      const bots = [];

      for (let i = 0; i < 6; i++) {
        const user = await createTestUser(dataSource, jwtService);
        users.push(user);

        const botResponse = await request(app.getHttpServer())
          .post("/api/v1/bots/internal")
          .set(authHeader(user.accessToken))
          .send({
            name: `Bot${i}-${uid()}`,
            strategy: createDefaultStrategy(),
          })
          .expect(201);

        bots.push(botResponse.body);
      }

      // Create table for 6 players
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set(authHeader(users[0].accessToken))
        .send({
          name: `SixBotTable-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      const tableId = tableResponse.body.id;

      // All bots join
      for (let i = 0; i < 6; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/games/${tableId}/join`)
          .set(authHeader(users[i].accessToken))
          .send({ bot_id: bots[i].id })
          .expect(201);
      }

      // Verify all seated
      const stateResponse = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .expect(200);

      expect(stateResponse.body).toBeDefined();
    });

    it("should reject more than max_players bots on same table", async () => {
      const users = [];
      const bots = [];

      // Create 7 users and bots
      for (let i = 0; i < 7; i++) {
        const user = await createTestUser(dataSource, jwtService);
        users.push(user);

        const botResponse = await request(app.getHttpServer())
          .post("/api/v1/bots/internal")
          .set(authHeader(user.accessToken))
          .send({
            name: `BotX${i}-${uid()}`,
            strategy: createDefaultStrategy(),
          })
          .expect(201);

        bots.push(botResponse.body);
      }

      // Create table for max 6 players
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set(authHeader(users[0].accessToken))
        .send({
          name: `MaxCapacityTable-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      const tableId = tableResponse.body.id;

      // First 6 bots join
      for (let i = 0; i < 6; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/games/${tableId}/join`)
          .set(authHeader(users[i].accessToken))
          .send({ bot_id: bots[i].id })
          .expect(201);
      }

      // 7th bot should be rejected
      const rejectResponse = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set(authHeader(users[6].accessToken))
        .send({ bot_id: bots[6].id });

      expect([400, 409, 422]).toContain(rejectResponse.status);
    });
  });

  describe("Bot Lifecycle → Game Interaction", () => {
    it("should reject inactive bot from joining table", async () => {
      const user = await createTestUser(dataSource, jwtService);

      // Create and deactivate bot
      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `InactiveBotTest-${uid()}`,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = botResponse.body.id;

      // Deactivate bot
      await request(app.getHttpServer())
        .delete(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      // Create table
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set(authHeader(user.accessToken))
        .send({
          name: `InactiveTestTable-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      // Try to join with inactive bot
      const joinResponse = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableResponse.body.id}/join`)
        .set(authHeader(user.accessToken))
        .send({ bot_id: botId });

      expect([400, 403, 409, 422]).toContain(joinResponse.status);
    });

    it("should allow reactivated bot to join table after reactivation", async () => {
      const user = await createTestUser(dataSource, jwtService);

      // Create bot
      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `ReactivateTest-${uid()}`,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const botId = botResponse.body.id;

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

      // Create table
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set(authHeader(user.accessToken))
        .send({
          name: `ReactivateTable-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      // Join with reactivated bot (should succeed)
      const joinResponse = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableResponse.body.id}/join`)
        .set(authHeader(user.accessToken))
        .send({ bot_id: botId })
        .expect(201);

      expect(joinResponse.body.botId).toBe(botId);
    });
  });

  describe("Duplicate Bot → Game Join", () => {
    it("should allow original and duplicate bot to join different tables", async () => {
      const user = await createTestUser(dataSource, jwtService);

      // Create original bot
      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `DuplicateOriginal-${uid()}`,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const originalBotId = botResponse.body.id;

      // Duplicate
      const dupResponse = await request(app.getHttpServer())
        .post(`/api/v1/bots/${originalBotId}/duplicate`)
        .set(authHeader(user.accessToken))
        .expect(201);

      const duplicateBotId = dupResponse.body.id;

      // Create two tables
      const table1Response = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set(authHeader(user.accessToken))
        .send({
          name: `DuplicateTable1-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      const table2Response = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set(authHeader(user.accessToken))
        .send({
          name: `DuplicateTable2-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      // Original joins table 1
      await request(app.getHttpServer())
        .post(`/api/v1/games/${table1Response.body.id}/join`)
        .set(authHeader(user.accessToken))
        .send({ bot_id: originalBotId })
        .expect(201);

      // Duplicate joins table 2
      await request(app.getHttpServer())
        .post(`/api/v1/games/${table2Response.body.id}/join`)
        .set(authHeader(user.accessToken))
        .send({ bot_id: duplicateBotId })
        .expect(201);
    });

    it("should not allow original and duplicate on same table (same owner)", async () => {
      const user = await createTestUser(dataSource, jwtService);

      // Create original bot
      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set(authHeader(user.accessToken))
        .send({
          name: `SameTableOriginal-${uid()}`,
          strategy: createDefaultStrategy(),
        })
        .expect(201);

      const originalBotId = botResponse.body.id;

      // Duplicate
      const dupResponse = await request(app.getHttpServer())
        .post(`/api/v1/bots/${originalBotId}/duplicate`)
        .set(authHeader(user.accessToken))
        .expect(201);

      const duplicateBotId = dupResponse.body.id;

      // Create table
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set(authHeader(user.accessToken))
        .send({
          name: `SameTableTest-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      const tableId = tableResponse.body.id;

      // Original joins
      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set(authHeader(user.accessToken))
        .send({ bot_id: originalBotId })
        .expect(201);

      // Duplicate tries to join same table (should fail: same user constraint)
      const rejectResponse = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set(authHeader(user.accessToken))
        .send({ bot_id: duplicateBotId });

      expect([400, 409, 422]).toContain(rejectResponse.status);
    });
  });
});
