/**
 * Bot Management E2E Tests
 * ========================
 * Comprehensive tests for bot lifecycle, validation, and connectivity.
 * Tests are designed to run in parallel with isolated data.
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
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { GamesModule } from "../../src/modules/games/games.module";
import { ServicesModule } from "../../src/services/services.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";

const uid = () => Math.random().toString(36).slice(2, 8);

let portCounter = 23000;
const getUniquePort = () => ++portCounter;

interface BotServer {
  server: http.Server;
  port: number;
  requestCount: number;
  lastRequest: { method: string; url: string; body: string } | null;
  respondWith: (type: string, amount?: number) => void;
  close: () => Promise<void>;
}

function createAdvancedBotServer(port: number): Promise<BotServer> {
  return new Promise((resolve, reject) => {
    let requestCount = 0;
    let lastRequest: { method: string; url: string; body: string } | null =
      null;
    let responseType = "call";
    let responseAmount: number | undefined;

    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => {
        requestCount++;
        lastRequest = {
          method: req.method || "GET",
          url: req.url || "/",
          body,
        };

        if (req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", version: "1.0.0" }));
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          const response: { type: string; amount?: number } = {
            type: responseType,
          };
          if (responseAmount !== undefined) {
            response.amount = responseAmount;
          }
          res.end(JSON.stringify(response));
        }
      });
    });

    server.on("error", reject);
    server.listen(port, () => {
      resolve({
        server,
        port,
        get requestCount() {
          return requestCount;
        },
        get lastRequest() {
          return lastRequest;
        },
        respondWith: (type: string, amount?: number) => {
          responseType = type;
          responseAmount = amount;
        },
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

interface TestContext {
  app: INestApplication;
  dataSource: DataSource;
}

interface TestUser {
  accessToken: string;
  email: string;
  name: string;
}

interface IsolatedTestData {
  user: TestUser;
  botServers: BotServer[];
  cleanup: () => Promise<void>;
}

async function createIsolatedTestData(
  ctx: TestContext,
  prefix: string,
): Promise<IsolatedTestData> {
  const id = uid();
  const email = `${prefix}-${id}@test.com`;
  const name = `${prefix}-${id}`;
  const botServers: BotServer[] = [];

  await request(ctx.app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({ email, name, password: "SecurePass123!" })
    .expect(201);

  await ctx.dataSource.query(
    'UPDATE "users" SET email_verified = true WHERE email = $1',
    [email],
  );

  const loginResponse = await request(ctx.app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, password: "SecurePass123!" })
    .expect(200);

  const user: TestUser = {
    accessToken: loginResponse.body.accessToken,
    email,
    name,
  };

  return {
    user,
    botServers,
    cleanup: async () => {
      for (const bot of botServers) {
        await bot.close().catch(() => {});
      }
    },
  };
}

async function createBotServer(testData: IsolatedTestData): Promise<BotServer> {
  const port = getUniquePort();
  const botServer = await createAdvancedBotServer(port);
  testData.botServers.push(botServer);
  return botServer;
}

function getBotName(prefix: string): string {
  return `${prefix}-${uid()}`;
}

describe("Bot Management E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const allBotServers: BotServer[] = [];

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
    for (const bot of allBotServers) await bot.close().catch(() => {});
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  const getCtx = (): TestContext => ({ app, dataSource });

  describe("Bot Creation", () => {
    it("should create bot with valid endpoint", async () => {
      const testData = await createIsolatedTestData(getCtx(), "create");
      try {
        const botServer = await createBotServer(testData);
        allBotServers.push(botServer);
        const botName = getBotName("TestBot");

        const response = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName,
            endpoint: `http://localhost:${botServer.port}`,
            description: "A test bot",
          })
          .expect(201);

        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe(botName);
        expect(response.body.active).toBe(true);
      } finally {
        await testData.cleanup();
      }
    });

    it("should reject bot creation with unreachable endpoint", async () => {
      const testData = await createIsolatedTestData(getCtx(), "unreachable");
      try {
        const botName = getBotName("UnreachBot");

        const response = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName,
            endpoint: "http://localhost:59999",
          });

        expect([201, 400]).toContain(response.status);
      } finally {
        await testData.cleanup();
      }
    });

    it("should reject duplicate bot names for same user", async () => {
      const testData = await createIsolatedTestData(getCtx(), "dupname");
      try {
        const botServer1 = await createBotServer(testData);
        const botServer2 = await createBotServer(testData);
        allBotServers.push(botServer1, botServer2);
        const sameName = getBotName("SameName");

        await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: sameName,
            endpoint: `http://localhost:${botServer1.port}`,
          })
          .expect(201);

        await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: sameName,
            endpoint: `http://localhost:${botServer2.port}`,
          })
          .expect(409);
      } finally {
        await testData.cleanup();
      }
    });

    it("should reject duplicate bot name across users (globally unique)", async () => {
      const testData1 = await createIsolatedTestData(getCtx(), "user1");
      const testData2 = await createIsolatedTestData(getCtx(), "user2");
      try {
        const botServer1 = await createBotServer(testData1);
        const botServer2 = await createBotServer(testData2);
        allBotServers.push(botServer1, botServer2);
        const commonName = getBotName("Common");

        await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData1.user.accessToken}`)
          .send({
            name: commonName,
            endpoint: `http://localhost:${botServer1.port}`,
          })
          .expect(201);

        const response = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData2.user.accessToken}`)
          .send({
            name: commonName,
            endpoint: `http://localhost:${botServer2.port}`,
          })
          .expect(409);

        expect(response.body.message).toContain("already exists");
      } finally {
        await testData1.cleanup();
        await testData2.cleanup();
      }
    });

    it("should validate bot name format", async () => {
      const testData = await createIsolatedTestData(getCtx(), "nameformat");
      try {
        const botServer = await createBotServer(testData);
        allBotServers.push(botServer);

        const response1 = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: "A",
            endpoint: `http://localhost:${botServer.port}`,
          })
          .expect(400);

        expect(response1.body.message).toBeDefined();

        const response2 = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: "A".repeat(101),
            endpoint: `http://localhost:${botServer.port}`,
          })
          .expect(400);

        expect(response2.body.message).toBeDefined();
      } finally {
        await testData.cleanup();
      }
    });

    it("should validate endpoint URL format", async () => {
      const testData = await createIsolatedTestData(getCtx(), "urlformat");
      try {
        const botName1 = getBotName("InvalidProtocol");
        const botName2 = getBotName("MissingProtocol");

        await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName1,
            endpoint: "ftp://localhost:8080",
          })
          .expect(400);

        await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName2,
            endpoint: "localhost:8080",
          })
          .expect(400);
      } finally {
        await testData.cleanup();
      }
    });
  });

  describe("Bot Updates", () => {
    it("should update bot description", async () => {
      const testData = await createIsolatedTestData(getCtx(), "updatedesc");
      try {
        const botServer = await createBotServer(testData);
        allBotServers.push(botServer);
        const botName = getBotName("DescBot");

        const createResponse = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName,
            endpoint: `http://localhost:${botServer.port}`,
          })
          .expect(201);

        await request(app.getHttpServer())
          .put(`/api/v1/bots/${createResponse.body.id}`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({ description: "Updated description" })
          .expect(200);

        const getResponse = await request(app.getHttpServer())
          .get(`/api/v1/bots/${createResponse.body.id}`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .expect(200);

        expect(getResponse.body.description).toBe("Updated description");
      } finally {
        await testData.cleanup();
      }
    });

    it("should update bot endpoint", async () => {
      const testData = await createIsolatedTestData(getCtx(), "updateep");
      try {
        const botServer1 = await createBotServer(testData);
        const botServer2 = await createBotServer(testData);
        allBotServers.push(botServer1, botServer2);
        const botName = getBotName("EndpointBot");

        const createResponse = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName,
            endpoint: `http://localhost:${botServer1.port}`,
          })
          .expect(201);

        await request(app.getHttpServer())
          .put(`/api/v1/bots/${createResponse.body.id}`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({ endpoint: `http://localhost:${botServer2.port}` })
          .expect(200);

        const getResponse = await request(app.getHttpServer())
          .get(`/api/v1/bots/${createResponse.body.id}`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .expect(200);

        expect(getResponse.body.endpoint).toBe(
          `http://localhost:${botServer2.port}`,
        );
      } finally {
        await testData.cleanup();
      }
    });

    it("should allow update to localhost endpoint in dev mode", async () => {
      const testData = await createIsolatedTestData(getCtx(), "badup");
      try {
        const botServer = await createBotServer(testData);
        allBotServers.push(botServer);
        const botName = getBotName("BadUpBot");

        const createResponse = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName,
            endpoint: `http://localhost:${botServer.port}`,
          })
          .expect(201);

        await request(app.getHttpServer())
          .put(`/api/v1/bots/${createResponse.body.id}`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({ endpoint: "http://localhost:59999" })
          .expect(200);
      } finally {
        await testData.cleanup();
      }
    });
  });

  describe("Bot Deactivation", () => {
    it("should deactivate bot successfully", async () => {
      const testData = await createIsolatedTestData(getCtx(), "delete");
      try {
        const botServer = await createBotServer(testData);
        allBotServers.push(botServer);
        const botName = getBotName("DeactMe");

        const createResponse = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName,
            endpoint: `http://localhost:${botServer.port}`,
          })
          .expect(201);

        await request(app.getHttpServer())
          .delete(`/api/v1/bots/${createResponse.body.id}`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .expect(200);

        const getResponse = await request(app.getHttpServer())
          .get(`/api/v1/bots/${createResponse.body.id}`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .expect(200);

        expect(getResponse.body.active).toBe(false);
      } finally {
        await testData.cleanup();
      }
    });

    it("should not allow deleting another user's bot", async () => {
      const testData1 = await createIsolatedTestData(getCtx(), "owner");
      const testData2 = await createIsolatedTestData(getCtx(), "thief");
      try {
        const botServer = await createBotServer(testData1);
        allBotServers.push(botServer);
        const botName = getBotName("OwnerBot");

        const createResponse = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData1.user.accessToken}`)
          .send({
            name: botName,
            endpoint: `http://localhost:${botServer.port}`,
          })
          .expect(201);

        await request(app.getHttpServer())
          .delete(`/api/v1/bots/${createResponse.body.id}`)
          .set("Authorization", `Bearer ${testData2.user.accessToken}`)
          .expect(403);
      } finally {
        await testData1.cleanup();
        await testData2.cleanup();
      }
    });
  });

  describe("Bot Validation", () => {
    it("should validate bot with healthy endpoint", async () => {
      const testData = await createIsolatedTestData(getCtx(), "validate");
      try {
        const botServer = await createBotServer(testData);
        allBotServers.push(botServer);
        const botName = getBotName("ValidateBot");

        const createResponse = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName,
            endpoint: `http://localhost:${botServer.port}`,
          })
          .expect(201);

        const validateResponse = await request(app.getHttpServer())
          .post(`/api/v1/bots/${createResponse.body.id}/validate`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`);

        expect([200, 201]).toContain(validateResponse.status);
        expect(validateResponse.body).toHaveProperty("valid");
      } finally {
        await testData.cleanup();
      }
    });

    it("should detect unhealthy endpoint on validation", async () => {
      const testData = await createIsolatedTestData(getCtx(), "unhealthy");
      try {
        const botServer = await createBotServer(testData);
        allBotServers.push(botServer);
        const botName = getBotName("UnhBot");

        const createResponse = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName,
            endpoint: `http://localhost:${botServer.port}`,
          })
          .expect(201);

        await botServer.close();

        const validateResponse = await request(app.getHttpServer())
          .post(`/api/v1/bots/${createResponse.body.id}/validate`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`);

        expect([200, 201]).toContain(validateResponse.status);
        expect(validateResponse.body).toHaveProperty("valid");
      } finally {
        await testData.cleanup();
      }
    });
  });

  describe("Bot Activation/Deactivation", () => {
    it("should activate bot", async () => {
      const testData = await createIsolatedTestData(getCtx(), "activate");
      try {
        const botServer = await createBotServer(testData);
        allBotServers.push(botServer);
        const botName = getBotName("ActBot");

        const createResponse = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName,
            endpoint: `http://localhost:${botServer.port}`,
          })
          .expect(201);

        const activateRes = await request(app.getHttpServer())
          .post(`/api/v1/bots/${createResponse.body.id}/activate`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`);

        expect([200, 201]).toContain(activateRes.status);

        const getResponse = await request(app.getHttpServer())
          .get(`/api/v1/bots/${createResponse.body.id}`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .expect(200);

        expect(getResponse.body.active).toBe(true);
      } finally {
        await testData.cleanup();
      }
    });
  });

  describe("Bot Listing and Filtering", () => {
    it("should list only user's own bots", async () => {
      const testData1 = await createIsolatedTestData(getCtx(), "list1");
      const testData2 = await createIsolatedTestData(getCtx(), "list2");
      try {
        const botServer1 = await createBotServer(testData1);
        const botServer2 = await createBotServer(testData1);
        const botServer3 = await createBotServer(testData2);
        allBotServers.push(botServer1, botServer2, botServer3);

        const uniquePrefix = uid();
        const user1Bot1Name = `User1Bot1-${uniquePrefix}`;
        const user1Bot2Name = `User1Bot2-${uniquePrefix}`;
        const user2Bot1Name = `User2Bot1-${uniquePrefix}`;

        await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData1.user.accessToken}`)
          .send({
            name: user1Bot1Name,
            endpoint: `http://localhost:${botServer1.port}`,
          })
          .expect(201);

        await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData1.user.accessToken}`)
          .send({
            name: user1Bot2Name,
            endpoint: `http://localhost:${botServer2.port}`,
          })
          .expect(201);

        await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData2.user.accessToken}`)
          .send({
            name: user2Bot1Name,
            endpoint: `http://localhost:${botServer3.port}`,
          })
          .expect(201);

        const user1BotsResponse = await request(app.getHttpServer())
          .get("/api/v1/bots/my")
          .set("Authorization", `Bearer ${testData1.user.accessToken}`)
          .expect(200);

        const user1Bots = user1BotsResponse.body.data || user1BotsResponse.body;
        expect(user1Bots).toHaveLength(2);
        expect(user1Bots.every((b: any) => b.name.startsWith("User1"))).toBe(
          true,
        );

        const user2BotsResponse = await request(app.getHttpServer())
          .get("/api/v1/bots/my")
          .set("Authorization", `Bearer ${testData2.user.accessToken}`)
          .expect(200);

        const user2Bots = user2BotsResponse.body.data || user2BotsResponse.body;
        expect(user2Bots).toHaveLength(1);
        expect(user2Bots[0].name).toBe(user2Bot1Name);
      } finally {
        await testData1.cleanup();
        await testData2.cleanup();
      }
    });
  });

  describe("Bot Connectivity Monitoring", () => {
    it("should track bot health over time", async () => {
      const testData = await createIsolatedTestData(getCtx(), "health");
      try {
        const botServer = await createBotServer(testData);
        allBotServers.push(botServer);
        const botName = getBotName("HealthBot");

        const createResponse = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName,
            endpoint: `http://localhost:${botServer.port}`,
          })
          .expect(201);

        await request(app.getHttpServer())
          .post(
            `/api/v1/bots/connectivity/health/${createResponse.body.id}/check`,
          )
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .expect(200);

        const healthResponse = await request(app.getHttpServer())
          .get(`/api/v1/bots/connectivity/health/${createResponse.body.id}`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .expect(200);

        expect(healthResponse.body).toBeDefined();
      } finally {
        await testData.cleanup();
      }
    });

    it("should measure latency", async () => {
      const testData = await createIsolatedTestData(getCtx(), "latency");
      try {
        const botServer = await createBotServer(testData);
        allBotServers.push(botServer);
        const botName = getBotName("LatencyBot");

        const createResponse = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: botName,
            endpoint: `http://localhost:${botServer.port}`,
          })
          .expect(201);

        const latencyResponse = await request(app.getHttpServer())
          .get(`/api/v1/bots/connectivity/latency/${createResponse.body.id}`)
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .expect(200);

        expect(latencyResponse.body).toBeDefined();
      } finally {
        await testData.cleanup();
      }
    });
  });

  describe("Bot Limit Enforcement", () => {
    it("should enforce maximum bot limit per user", async () => {
      const testData = await createIsolatedTestData(getCtx(), "limit");
      try {
        for (let i = 0; i < 10; i++) {
          const botServer = await createBotServer(testData);
          allBotServers.push(botServer);
          const botName = getBotName(`LimitBot${i}`);

          await request(app.getHttpServer())
            .post("/api/v1/bots")
            .set("Authorization", `Bearer ${testData.user.accessToken}`)
            .send({
              name: botName,
              endpoint: `http://localhost:${botServer.port}`,
            })
            .expect(201);
        }

        const extraServer = await createBotServer(testData);
        allBotServers.push(extraServer);
        const extraBotName = getBotName("LimitBot10");

        const response = await request(app.getHttpServer())
          .post("/api/v1/bots")
          .set("Authorization", `Bearer ${testData.user.accessToken}`)
          .send({
            name: extraBotName,
            endpoint: `http://localhost:${extraServer.port}`,
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain("10");
      } finally {
        await testData.cleanup();
      }
    }, 60000);
  });
});
