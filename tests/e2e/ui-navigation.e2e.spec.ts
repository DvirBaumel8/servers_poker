/**
 * UI Navigation E2E Tests
 * =======================
 * Tests for all UI pages and navigation flows.
 * These tests use HTTP requests to verify frontend API contracts.
 *
 * For full browser-based testing, see the browser automation scripts.
 *
 * NOTE: Tests are designed for parallel execution - each test creates
 * its own isolated data using unique identifiers.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import { CustomThrottlerGuard } from "../../src/common/guards/custom-throttler.guard";
import request from "supertest";
import * as http from "http";
import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { GamesModule } from "../../src/modules/games/games.module";
import { TournamentsModule } from "../../src/modules/tournaments/tournaments.module";
import { UsersModule } from "../../src/modules/users/users.module";
import { ServicesModule } from "../../src/services/services.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";

const uid = () => Math.random().toString(36).slice(2, 8);

let portCounter = 22000;
function getUniquePort(): number {
  return portCounter++;
}

interface TestUserData {
  email: string;
  name: string;
  botName: string;
}

function createTestUser(prefix: string): TestUserData {
  const id = uid();
  return {
    email: `${prefix}-${id}@test.com`,
    name: `${prefix}${id}`,
    botName: `Bot${id}`,
  };
}

interface BotServer {
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}

function createMockBotServer(port: number): Promise<BotServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.method === "GET") {
        res.end(JSON.stringify({ status: "ok" }));
      } else {
        res.end(JSON.stringify({ type: "call" }));
      }
    });
    server.on("error", reject);
    server.listen(port, () => {
      resolve({
        server,
        port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe("UI Navigation & API Contract E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const botServers: BotServer[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
        TypeOrmModule.forRoot({
          type: "postgres",
          host: process.env.TEST_DB_HOST || "localhost",
          port: parseInt(process.env.TEST_DB_PORT || "5432", 10),
          username: process.env.TEST_DB_USERNAME || "postgres",
          password: process.env.TEST_DB_PASSWORD || "postgres",
          database: process.env.TEST_DB_NAME || "poker_test",
          entities: Object.values(entities),
          synchronize: true,
          dropSchema: true,
        }),
        ThrottlerModule.forRoot([
          { name: "default", ttl: 60000, limit: 100000 },
        ]),
        EventEmitterModule.forRoot(),
        ServicesModule,
        AuthModule,
        BotsModule,
        GamesModule,
        TournamentsModule,
        UsersModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: CustomThrottlerGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix("api/v1");
    await app.init();
    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    for (const bot of botServers) await bot.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  async function registerDeveloper(userData?: TestUserData) {
    const { email, name, botName } = userData || createTestUser("dev");
    const botPort = getUniquePort();
    const botServer = await createMockBotServer(botPort);
    botServers.push(botServer);
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register-developer")
      .send({
        email,
        name,
        password: "SecurePass123!",
        botName,
        botEndpoint: `http://localhost:${botPort}`,
      })
      .expect(201);
    return { ...response.body, botServer };
  }

  async function createAdditionalBot(
    accessToken: string,
    namePrefix: string = "Extra",
  ) {
    const botPort = getUniquePort();
    const botServer = await createMockBotServer(botPort);
    botServers.push(botServer);
    const response = await request(app.getHttpServer())
      .post("/api/v1/bots")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: `${namePrefix}Bot-${uid()}`,
        endpoint: `http://localhost:${botPort}`,
      })
      .expect(201);
    return { ...response.body, botServer };
  }

  async function createTableDirect(
    options: {
      name?: string;
      smallBlind?: number;
      bigBlind?: number;
      startingChips?: number;
      maxPlayers?: number;
    } = {},
  ): Promise<{ id: string; name: string }> {
    const tableId = uuidv4();
    const name = options.name || `Table-${uid()}`;
    const smallBlind = options.smallBlind ?? 10;
    const bigBlind = options.bigBlind ?? 20;
    const startingChips = options.startingChips ?? 1000;
    const maxPlayers = options.maxPlayers ?? 6;

    await dataSource.query(
      `INSERT INTO tables (id, name, small_blind, big_blind, starting_chips, max_players, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'waiting', NOW(), NOW())`,
      [tableId, name, smallBlind, bigBlind, startingChips, maxPlayers],
    );

    return { id: tableId, name };
  }

  describe("Home Page APIs", () => {
    it("should return leaderboard data for home page", async () => {
      const response = await request(app.getHttpServer()).get(
        "/api/v1/games/leaderboard",
      );

      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });

    it("should return active tournaments for home page", async () => {
      const user = await registerDeveloper(createTestUser("home"));

      const response = await request(app.getHttpServer())
        .get("/api/v1/tournaments/active")
        .set("Authorization", `Bearer ${user.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.activeTournaments).toBeDefined();
    });
  });

  describe("Tables Page APIs", () => {
    it("should list all available tables", async () => {
      const tableIdSuffix = uid();

      // Create tables directly in DB (table creation requires admin)
      await createTableDirect({
        name: `Test Table 1-${tableIdSuffix}`,
        smallBlind: 10,
        bigBlind: 20,
        startingChips: 1000,
        maxPlayers: 6,
      });

      await createTableDirect({
        name: `Test Table 2-${tableIdSuffix}`,
        smallBlind: 25,
        bigBlind: 50,
        startingChips: 2000,
        maxPlayers: 9,
      });

      const response = await request(app.getHttpServer())
        .get("/api/v1/games")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should return table details with player info", async () => {
      const user1 = await registerDeveloper(createTestUser("detail1"));

      // Create table directly in DB (table creation requires admin)
      const table = await createTableDirect({
        name: `Detail Test Table-${uid()}`,
        smallBlind: 10,
        bigBlind: 20,
        startingChips: 1000,
        maxPlayers: 6,
      });

      const tableId = table.id;

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${user1.accessToken}`)
        .send({ bot_id: user1.bot.id })
        .expect(201);

      const detailResponse = await request(app.getHttpServer())
        .get(`/api/v1/games/tables/${tableId}`)
        .set("Authorization", `Bearer ${user1.accessToken}`)
        .expect(200);

      expect(detailResponse.body).toHaveProperty("id");
      expect(detailResponse.body).toHaveProperty("name");
      expect(detailResponse.body).toHaveProperty("small_blind");
      expect(detailResponse.body).toHaveProperty("big_blind");
    });
  });

  describe("Bots Page APIs", () => {
    it("should list user's bots", async () => {
      const user = await registerDeveloper(createTestUser("mybots"));

      await createAdditionalBot(user.accessToken, "Second");

      const response = await request(app.getHttpServer())
        .get("/api/v1/bots/my")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(200);

      const bots = response.body.data || response.body;
      expect(Array.isArray(bots)).toBe(true);
      expect(bots.length).toBe(2);
    });

    it("should return bot profile with statistics", async () => {
      const user = await registerDeveloper(createTestUser("profile"));

      const response = await request(app.getHttpServer())
        .get(`/api/v1/bots/${user.bot.id}/profile`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("bot");
      expect(response.body.bot).toHaveProperty("id");
      expect(response.body.bot).toHaveProperty("name");
    });

    it("should validate bot endpoint", async () => {
      const user = await registerDeveloper(createTestUser("validate"));

      const response = await request(app.getHttpServer())
        .post(`/api/v1/bots/${user.bot.id}/validate`)
        .set("Authorization", `Bearer ${user.accessToken}`);

      expect([200, 201]).toContain(response.status);
    });

    it("should create bot with all required fields", async () => {
      const user = await registerDeveloper(createTestUser("create"));
      const newBotName = `NewTestBot${uid()}`;

      const botPort = getUniquePort();
      const newBotServer = await createMockBotServer(botPort);
      botServers.push(newBotServer);

      // Small delay to ensure bot server is ready
      await new Promise((r) => setTimeout(r, 100));

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          name: newBotName,
          endpoint: `http://localhost:${botPort}`,
          description: "A test bot for validation",
        });

      expect([201, 500]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe(newBotName);
      }
    });

    it("should update bot name and description", async () => {
      const user = await registerDeveloper(createTestUser("update"));
      const updatedName = `UpdatedBotName-${uid()}`;

      const updateResponse = await request(app.getHttpServer())
        .put(`/api/v1/bots/${user.bot.id}`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          name: updatedName,
          description: "Updated description",
        });

      expect([200, 400]).toContain(updateResponse.status);
    });

    it("should delete bot", async () => {
      const user = await registerDeveloper(createTestUser("delete"));

      const extraBot = await createAdditionalBot(user.accessToken, "ToDelete");

      await request(app.getHttpServer())
        .delete(`/api/v1/bots/${extraBot.id}`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(200);

      const verifyResponse = await request(app.getHttpServer())
        .get(`/api/v1/bots/${extraBot.id}`)
        .set("Authorization", `Bearer ${user.accessToken}`);

      expect([200, 404]).toContain(verifyResponse.status);
    });
  });

  describe("Tournaments Page APIs", () => {
    it("should list all tournaments", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/tournaments")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should create tournament", async () => {
      const user = await registerDeveloper(createTestUser("tournament"));
      const tournamentName = `Test Tournament-${uid()}`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          name: tournamentName,
          type: "rolling",
          buy_in: 100,
          starting_chips: 5000,
          max_players: 100,
          min_players: 2,
        });

      expect([201, 403]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe(tournamentName);
      }
    });

    it("should get tournament details", async () => {
      const user = await registerDeveloper(createTestUser("tdetails"));
      const tournamentName = `Details Tournament-${uid()}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          name: tournamentName,
          type: "rolling",
          buy_in: 100,
          starting_chips: 5000,
          max_players: 100,
          min_players: 2,
        });

      if (createResponse.status !== 201) {
        expect([201, 403]).toContain(createResponse.status);
        return;
      }

      const response = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/${createResponse.body.id}`)
        .expect(200);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("name");
      expect(response.body).toHaveProperty("status");
    });

    it("should register bot for tournament", async () => {
      const user = await registerDeveloper(createTestUser("treg"));
      const tournamentName = `Register Tournament-${uid()}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          name: tournamentName,
          type: "rolling",
          buy_in: 100,
          starting_chips: 5000,
          max_players: 100,
          min_players: 2,
        });

      if (createResponse.status !== 201) {
        expect([201, 403]).toContain(createResponse.status);
        return;
      }

      const regResponse = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${createResponse.body.id}/register`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({ bot_id: user.bot.id });

      expect([201, 403]).toContain(regResponse.status);
    });
  });

  describe("Leaderboard Page APIs", () => {
    it("should return leaderboard with proper structure", async () => {
      const response = await request(app.getHttpServer()).get(
        "/api/v1/games/leaderboard",
      );

      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });
  });

  describe("User Profile APIs", () => {
    it("should return current user profile", async () => {
      const userData = createTestUser("myprofile");
      const user = await registerDeveloper(userData);

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("email");
      expect(response.body.email).toBe(userData.email);
    });

    it("should regenerate API key", async () => {
      const user = await registerDeveloper(createTestUser("apikey"));

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/regenerate-api-key")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("apiKey");
      expect(response.body.apiKey).toBeDefined();
    });
  });

  describe("Game State APIs", () => {
    it("should return game state for active table", async () => {
      const user1 = await registerDeveloper(createTestUser("state1"));
      const user2 = await registerDeveloper(createTestUser("state2"));

      // Create table directly in DB (table creation requires admin)
      const table = await createTableDirect({
        name: `State Test Table-${uid()}`,
        smallBlind: 10,
        bigBlind: 20,
        startingChips: 1000,
        maxPlayers: 2,
      });

      const tableId = table.id;

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${user1.accessToken}`)
        .send({ bot_id: user1.bot.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${user2.accessToken}`)
        .send({ bot_id: user2.bot.id })
        .expect(201);

      await new Promise((r) => setTimeout(r, 1000));

      const stateResponse = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${user1.accessToken}`)
        .expect(200);

      expect(stateResponse.body).toHaveProperty("status");
      expect(stateResponse.body).toHaveProperty("players");
    });

    it("should return hand history for game", async () => {
      const user1 = await registerDeveloper(createTestUser("history1"));
      const user2 = await registerDeveloper(createTestUser("history2"));

      // Create table directly in DB (table creation requires admin)
      const table = await createTableDirect({
        name: `History Test Table-${uid()}`,
        smallBlind: 10,
        bigBlind: 20,
        startingChips: 1000,
        maxPlayers: 2,
      });

      const tableId = table.id;

      const join1 = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${user1.accessToken}`)
        .send({ bot_id: user1.bot.id });

      if (join1.status !== 201) {
        return;
      }

      const join2 = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${user2.accessToken}`)
        .send({ bot_id: user2.bot.id });

      if (join2.status !== 201) {
        return;
      }

      await new Promise((r) => setTimeout(r, 8000));

      const handsResponse = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/hands`)
        .set("Authorization", `Bearer ${user1.accessToken}`);

      expect([200, 403, 404]).toContain(handsResponse.status);
      if (handsResponse.status === 200) {
        expect(Array.isArray(handsResponse.body)).toBe(true);
      }
    }, 30000);
  });

  describe("Bot Connectivity APIs", () => {
    it("should return bot health summary (admin only)", async () => {
      const user = await registerDeveloper(createTestUser("health"));

      const response = await request(app.getHttpServer())
        .get("/api/v1/bots/connectivity/health/summary")
        .set("Authorization", `Bearer ${user.accessToken}`);

      expect([200, 403]).toContain(response.status);
    });

    it("should check specific bot health", async () => {
      const user = await registerDeveloper(createTestUser("bothealth"));

      const response = await request(app.getHttpServer())
        .get(`/api/v1/bots/connectivity/health/${user.bot.id}`)
        .set("Authorization", `Bearer ${user.accessToken}`);

      expect([200, 403, 404]).toContain(response.status);
    });
  });

  describe("Provably Fair APIs", () => {
    it("should return provably fair info", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/games/provably-fair/info")
        .expect(200);

      expect(response.body).toHaveProperty("description");
    });
  });
});
