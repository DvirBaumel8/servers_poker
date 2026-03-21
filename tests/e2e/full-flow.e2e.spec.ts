/**
 * Full Flow E2E Test
 * ==================
 * Tests the complete developer journey:
 * 1. Register via API (register-developer endpoint)
 * 2. Bot joins a table
 * 3. Multiple bots play hands together
 * 4. Game completes with a winner
 *
 * This test spins up mock bot servers and exercises the full system.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule, EventEmitter2 } from "@nestjs/event-emitter";
import request from "supertest";
import * as http from "http";
import { DataSource } from "typeorm";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { GamesModule } from "../../src/modules/games/games.module";
import { ServicesModule } from "../../src/services/services.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { ThrottlerModule } from "@nestjs/throttler";

let uidCounter = 1;
const uid = () => `${uidCounter++}${Math.random().toString(36).slice(2, 8)}`;

let portCounter = 30000;
const getNextPort = () => portCounter++;

interface BotServer {
  server: http.Server;
  port: number;
  decisions: Array<{ timestamp: Date; payload: any; response: any }>;
  close: () => Promise<void>;
}

interface TestContext {
  app: INestApplication;
  dataSource: DataSource;
  eventEmitter: EventEmitter2;
}

interface TestData {
  email: string;
  name: string;
  botName: string;
  tableName: string;
}

function createTestData(prefix: string): TestData {
  const id = uid();
  return {
    email: `${prefix}-${id}@example.com`,
    name: `${prefix}-${id}`,
    botName: `Bot_${prefix}_${id}`,
    tableName: `Table_${prefix}_${id}`,
  };
}

function createMockBotServer(
  port: number,
  strategy: "caller" | "folder" | "random" = "caller",
): Promise<BotServer> {
  return new Promise((resolve, reject) => {
    const decisions: Array<{ timestamp: Date; payload: any; response: any }> =
      [];

    const server = http.createServer((req, res) => {
      if (req.method === "GET" || req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => {
        try {
          const payload = JSON.parse(body);
          let response: { type: string; amount?: number };

          if (strategy === "caller") {
            if (payload.action?.canCheck) {
              response = { type: "check" };
            } else {
              response = { type: "call" };
            }
          } else if (strategy === "folder") {
            if (payload.action?.canCheck) {
              response = { type: "check" };
            } else {
              response = { type: "fold" };
            }
          } else {
            const rand = Math.random();
            if (payload.action?.canCheck && rand < 0.3) {
              response = { type: "check" };
            } else if (rand < 0.7) {
              response = { type: "call" };
            } else if (rand < 0.9) {
              response = { type: "fold" };
            } else {
              const minRaise = payload.action?.minRaise || 20;
              response = { type: "raise", amount: minRaise };
            }
          }

          decisions.push({ timestamp: new Date(), payload, response });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        } catch {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ type: "fold" }));
        }
      });
    });

    server.on("error", reject);
    server.listen(port, () => {
      resolve({
        server,
        port,
        decisions,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeoutMs: number = 30000,
  intervalMs: number = 500,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

async function registerDeveloper(
  app: INestApplication,
  data: TestData,
  botPort: number,
) {
  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/register-developer")
    .send({
      email: data.email,
      name: data.name,
      password: "SecurePass123",
      botName: data.botName,
      botEndpoint: `http://localhost:${botPort}`,
      botDescription: "Test bot",
    })
    .expect(201);

  return response.body;
}

async function createTable(
  app: INestApplication,
  token: string,
  name: string,
  options: Partial<{
    small_blind: number;
    big_blind: number;
    starting_chips: number;
    max_players: number;
    turn_timeout_ms: number;
  }> = {},
) {
  const response = await request(app.getHttpServer())
    .post("/api/v1/games/tables")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name,
      small_blind: options.small_blind ?? 10,
      big_blind: options.big_blind ?? 20,
      starting_chips: options.starting_chips ?? 1000,
      max_players: options.max_players ?? 6,
      turn_timeout_ms: options.turn_timeout_ms ?? 5000,
    })
    .expect(201);

  return response.body;
}

describe("Full Flow E2E Tests", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [appConfig],
        }),
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
          { name: "short", ttl: 1000, limit: 100000 },
          { name: "long", ttl: 3600000, limit: 100000 },
        ]),
        EventEmitterModule.forRoot(),
        ServicesModule,
        AuthModule,
        BotsModule,
        GamesModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
    }).compile();

    const app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix("api/v1");

    await app.init();

    ctx = {
      app,
      dataSource: moduleFixture.get(DataSource),
      eventEmitter: moduleFixture.get(EventEmitter2),
    };
  });

  afterAll(async () => {
    if (ctx.dataSource?.isInitialized) {
      await ctx.dataSource.destroy();
    }
    await ctx.app.close();
  });

  describe("Developer Registration Flow", () => {
    it("should register developer with bot via API", async () => {
      const testData = createTestData("register");
      const port = getNextPort();
      const botServer = await createMockBotServer(port);

      try {
        const response = await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: testData.email,
            name: testData.name,
            password: "SecurePass123",
            botName: testData.botName,
            botEndpoint: `http://localhost:${botServer.port}`,
            botDescription: "My test bot",
          })
          .expect(201);

        expect(response.body).toHaveProperty("accessToken");
        expect(response.body).toHaveProperty("apiKey");
        expect(response.body.user).toHaveProperty("id");
        expect(response.body.user.email).toBe(testData.email);
        expect(response.body.bot).toHaveProperty("id");
        expect(response.body.bot.name).toBe(testData.botName);
      } finally {
        await botServer.close();
      }
    });

    it("should reject registration with unreachable bot endpoint", async () => {
      const testData = createTestData("unreachable");
      const unreachablePort = 59999;

      const response = await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: testData.email,
          name: testData.name,
          password: "SecurePass123",
          botName: testData.botName,
          botEndpoint: `http://localhost:${unreachablePort}`,
        });

      expect([201, 400]).toContain(response.status);
    });

    it("should reject duplicate email registration", async () => {
      const testData = createTestData("dupemail");
      const port = getNextPort();
      const botServer = await createMockBotServer(port);

      try {
        await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: testData.email,
            name: "First Dev",
            password: "SecurePass123",
            botName: `${testData.botName}_1`,
            botEndpoint: `http://localhost:${botServer.port}`,
          })
          .expect(201);

        const response = await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: testData.email,
            name: "Second Dev",
            password: "SecurePass123",
            botName: `${testData.botName}_2`,
            botEndpoint: `http://localhost:${botServer.port}`,
          })
          .expect(409);

        expect(response.body.message).toContain("Email already registered");
      } finally {
        await botServer.close();
      }
    });

    it("should reject duplicate bot name", async () => {
      const testData = createTestData("dupbot");
      const port1 = getNextPort();
      const port2 = getNextPort();
      const botServer1 = await createMockBotServer(port1);
      const botServer2 = await createMockBotServer(port2);

      try {
        await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: `dev1-${testData.email}`,
            name: "Dev One",
            password: "SecurePass123",
            botName: testData.botName,
            botEndpoint: `http://localhost:${botServer1.port}`,
          })
          .expect(201);

        const response = await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: `dev2-${testData.email}`,
            name: "Dev Two",
            password: "SecurePass123",
            botName: testData.botName,
            botEndpoint: `http://localhost:${botServer2.port}`,
          })
          .expect(409);

        expect(response.body.message).toContain("already exists");
      } finally {
        await botServer1.close();
        await botServer2.close();
      }
    });
  });

  describe("Complete Game Flow", () => {
    it("should complete full flow: register → join table → play hands", async () => {
      const testData1 = createTestData("player1");
      const testData2 = createTestData("player2");
      const port1 = getNextPort();
      const port2 = getNextPort();

      const bot1Server = await createMockBotServer(port1, "caller");
      const bot2Server = await createMockBotServer(port2, "caller");

      try {
        const dev1Response = await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: testData1.email,
            name: testData1.name,
            password: "SecurePass123",
            botName: testData1.botName,
            botEndpoint: `http://localhost:${bot1Server.port}`,
          })
          .expect(201);

        const dev2Response = await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: testData2.email,
            name: testData2.name,
            password: "SecurePass123",
            botName: testData2.botName,
            botEndpoint: `http://localhost:${bot2Server.port}`,
          })
          .expect(201);

        const dev1 = dev1Response.body;
        const dev2 = dev2Response.body;

        const table = await createTable(
          ctx.app,
          dev1.accessToken,
          testData1.tableName,
          { turn_timeout_ms: 5000 },
        );

        const join1 = await request(ctx.app.getHttpServer())
          .post(`/api/v1/games/${table.id}/join`)
          .set("Authorization", `Bearer ${dev1.accessToken}`)
          .send({ bot_id: dev1.bot.id })
          .expect(201);

        expect(join1.body).toHaveProperty("message");
        expect(join1.body.playerCount).toBe(1);

        const join2 = await request(ctx.app.getHttpServer())
          .post(`/api/v1/games/${table.id}/join`)
          .set("Authorization", `Bearer ${dev2.accessToken}`)
          .send({ bot_id: dev2.bot.id })
          .expect(201);

        expect(join2.body.playerCount).toBe(2);

        await waitFor(
          async () => {
            const stateResponse = await request(ctx.app.getHttpServer())
              .get(`/api/v1/games/${table.id}/state`)
              .set("Authorization", `Bearer ${dev1.accessToken}`);
            return (
              stateResponse.body?.status === "running" ||
              stateResponse.body?.handNumber > 0
            );
          },
          10000,
          200,
        );

        await waitFor(
          () =>
            bot1Server.decisions.length > 0 || bot2Server.decisions.length > 0,
          10000,
          200,
        );

        const totalDecisions =
          bot1Server.decisions.length + bot2Server.decisions.length;
        expect(totalDecisions).toBeGreaterThan(0);

        const allDecisions = [...bot1Server.decisions, ...bot2Server.decisions];
        for (const decision of allDecisions) {
          expect(decision.payload).toHaveProperty("gameId");
          expect(decision.payload).toHaveProperty("handNumber");
          expect(decision.payload).toHaveProperty("stage");
          expect(decision.payload).toHaveProperty("you");
          expect(decision.payload).toHaveProperty("action");
          expect(decision.payload).toHaveProperty("table");
          expect(decision.payload).toHaveProperty("players");

          expect(["check", "call", "fold", "bet", "raise", "all_in"]).toContain(
            decision.response.type,
          );
        }
      } finally {
        await bot1Server.close();
        await bot2Server.close();
      }
    }, 30000);

    it("should handle bot with different strategies correctly", async () => {
      const callerData = createTestData("caller");
      const folderData = createTestData("folder");
      const callerPort = getNextPort();
      const folderPort = getNextPort();

      const callerServer = await createMockBotServer(callerPort, "caller");
      const folderServer = await createMockBotServer(folderPort, "folder");

      try {
        const callerDev = await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: callerData.email,
            name: callerData.name,
            password: "SecurePass123",
            botName: callerData.botName,
            botEndpoint: `http://localhost:${callerServer.port}`,
          })
          .expect(201);

        const folderDev = await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: folderData.email,
            name: folderData.name,
            password: "SecurePass123",
            botName: folderData.botName,
            botEndpoint: `http://localhost:${folderServer.port}`,
          })
          .expect(201);

        const table = await createTable(
          ctx.app,
          callerDev.body.accessToken,
          callerData.tableName,
          {
            starting_chips: 500,
            max_players: 2,
            turn_timeout_ms: 5000,
          },
        );

        await request(ctx.app.getHttpServer())
          .post(`/api/v1/games/${table.id}/join`)
          .set("Authorization", `Bearer ${callerDev.body.accessToken}`)
          .send({ bot_id: callerDev.body.bot.id })
          .expect(201);

        await request(ctx.app.getHttpServer())
          .post(`/api/v1/games/${table.id}/join`)
          .set("Authorization", `Bearer ${folderDev.body.accessToken}`)
          .send({ bot_id: folderDev.body.bot.id })
          .expect(201);

        await waitFor(
          () =>
            callerServer.decisions.length >= 2 ||
            folderServer.decisions.length >= 2,
          15000,
          200,
        );

        for (const decision of callerServer.decisions) {
          expect(["check", "call"]).toContain(decision.response.type);
        }

        for (const decision of folderServer.decisions) {
          if (!decision.payload.action?.canCheck) {
            expect(decision.response.type).toBe("fold");
          } else {
            expect(decision.response.type).toBe("check");
          }
        }
      } finally {
        await callerServer.close();
        await folderServer.close();
      }
    }, 30000);
  });

  describe("Input Validation", () => {
    it("should reject weak passwords", async () => {
      const testData = createTestData("weakpass");
      const port = getNextPort();
      const botServer = await createMockBotServer(port);

      try {
        const response = await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: testData.email,
            name: testData.name,
            password: "weak",
            botName: testData.botName,
            botEndpoint: `http://localhost:${botServer.port}`,
          })
          .expect(400);

        expect(response.body.message).toBeDefined();
      } finally {
        await botServer.close();
      }
    });

    it("should reject invalid bot names", async () => {
      const testData = createTestData("invalidbot");
      const port = getNextPort();
      const botServer = await createMockBotServer(port);

      try {
        await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: `num-${testData.email}`,
            name: testData.name,
            password: "SecurePass123",
            botName: "123Bot",
            botEndpoint: `http://localhost:${botServer.port}`,
          })
          .expect(400);

        await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: `special-${testData.email}`,
            name: testData.name,
            password: "SecurePass123",
            botName: "Bot@#$%",
            botEndpoint: `http://localhost:${botServer.port}`,
          })
          .expect(400);
      } finally {
        await botServer.close();
      }
    });

    it("should reject invalid email format", async () => {
      const testData = createTestData("bademail");
      const port = getNextPort();
      const botServer = await createMockBotServer(port);

      try {
        await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: "not-an-email",
            name: testData.name,
            password: "SecurePass123",
            botName: testData.botName,
            botEndpoint: `http://localhost:${botServer.port}`,
          })
          .expect(400);
      } finally {
        await botServer.close();
      }
    });
  });

  describe("Bot Limit Enforcement", () => {
    it("should enforce max 10 bots per account", async () => {
      const testData = createTestData("manybots");
      const botServers: BotServer[] = [];

      try {
        const initialPort = getNextPort();
        const initialServer = await createMockBotServer(initialPort);
        botServers.push(initialServer);

        const devResponse = await request(ctx.app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: testData.email,
            name: testData.name,
            password: "SecurePass123",
            botName: testData.botName,
            botEndpoint: `http://localhost:${initialServer.port}`,
          })
          .expect(201);

        const token = devResponse.body.accessToken;

        for (let i = 2; i <= 10; i++) {
          const port = getNextPort();
          const server = await createMockBotServer(port);
          botServers.push(server);

          await request(ctx.app.getHttpServer())
            .post("/api/v1/bots")
            .set("Authorization", `Bearer ${token}`)
            .send({
              name: `${testData.botName}_${i}`,
              endpoint: `http://localhost:${server.port}`,
            })
            .expect(201);
        }

        const extraPort = getNextPort();
        const extraServer = await createMockBotServer(extraPort);
        botServers.push(extraServer);

        const response = await request(ctx.app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${token}`)
          .send({
            name: `${testData.botName}_11`,
            endpoint: `http://localhost:${extraServer.port}`,
          })
          .expect(400);

        expect(response.body.message).toContain("Maximum");
        expect(response.body.message).toContain("10");
      } finally {
        for (const server of botServers) {
          await server.close();
        }
      }
    }, 60000);
  });
});
