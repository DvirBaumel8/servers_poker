import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule, EventEmitter2 } from "@nestjs/event-emitter";
import request from "supertest";
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
import {
  createCallerStrategy,
  createFolderStrategy,
  createDefaultStrategy,
} from "../utils/strategy-bot-factory";

let uidCounter = 1;
const uid = () => `${uidCounter++}${Math.random().toString(36).slice(2, 8)}`;

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
  strategy?: Record<string, unknown>,
) {
  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/register-developer")
    .send({
      email: data.email,
      name: data.name,
      password: "SecurePass123",
      botName: data.botName,
      botDescription: "Test bot",
    })
    .expect(201);

  const devResponse = response.body;

  if (strategy) {
    await request(app.getHttpServer())
      .put(`/api/v1/bots/${devResponse.bot.id}/strategy`)
      .set("Authorization", `Bearer ${devResponse.accessToken}`)
      .send({ strategy });
  }

  return devResponse;
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

      const response = await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: testData.email,
          name: testData.name,
          password: "SecurePass123",
          botName: testData.botName,
          botDescription: "My test bot",
        })
        .expect(201);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body.user).toHaveProperty("id");
      expect(response.body.user.email).toBe(testData.email);
      expect(response.body.bot).toHaveProperty("id");
      expect(response.body.bot.name).toBe(testData.botName);
    });

    it("should reject duplicate email registration", async () => {
      const testData = createTestData("dupemail");

      await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: testData.email,
          name: "First Dev",
          password: "SecurePass123",
          botName: `${testData.botName}_1`,
        })
        .expect(201);

      const response = await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: testData.email,
          name: "Second Dev",
          password: "SecurePass123",
          botName: `${testData.botName}_2`,
        })
        .expect(409);

      expect(response.body.message).toContain("Email already registered");
    });

    it("should reject duplicate bot name", async () => {
      const testData = createTestData("dupbot");

      await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: `dev1-${testData.email}`,
          name: "Dev One",
          password: "SecurePass123",
          botName: testData.botName,
        })
        .expect(201);

      const response = await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: `dev2-${testData.email}`,
          name: "Dev Two",
          password: "SecurePass123",
          botName: testData.botName,
        })
        .expect(409);

      expect(response.body.message).toContain("already exists");
    });
  });

  describe("Complete Game Flow", () => {
    it("should complete full flow: register → join table → play hands", async () => {
      const testData1 = createTestData("player1");
      const testData2 = createTestData("player2");

      const dev1 = await registerDeveloper(
        ctx.app,
        testData1,
        createCallerStrategy(),
      );
      const dev2 = await registerDeveloper(
        ctx.app,
        testData2,
        createCallerStrategy(),
      );

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
    }, 30000);

    it("should handle bot with different strategies correctly", async () => {
      const callerData = createTestData("caller");
      const folderData = createTestData("folder");

      const callerDev = await registerDeveloper(
        ctx.app,
        callerData,
        createCallerStrategy(),
      );
      const folderDev = await registerDeveloper(
        ctx.app,
        folderData,
        createFolderStrategy(),
      );

      const table = await createTable(
        ctx.app,
        callerDev.accessToken,
        callerData.tableName,
        {
          starting_chips: 500,
          max_players: 2,
          turn_timeout_ms: 5000,
        },
      );

      await request(ctx.app.getHttpServer())
        .post(`/api/v1/games/${table.id}/join`)
        .set("Authorization", `Bearer ${callerDev.accessToken}`)
        .send({ bot_id: callerDev.bot.id })
        .expect(201);

      await request(ctx.app.getHttpServer())
        .post(`/api/v1/games/${table.id}/join`)
        .set("Authorization", `Bearer ${folderDev.accessToken}`)
        .send({ bot_id: folderDev.bot.id })
        .expect(201);

      await waitFor(
        async () => {
          const stateResponse = await request(ctx.app.getHttpServer())
            .get(`/api/v1/games/${table.id}/state`)
            .set("Authorization", `Bearer ${callerDev.accessToken}`);
          return stateResponse.body?.handNumber > 0;
        },
        15000,
        200,
      );
    }, 30000);
  });

  describe("Input Validation", () => {
    it("should reject weak passwords", async () => {
      const testData = createTestData("weakpass");

      const response = await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: testData.email,
          name: testData.name,
          password: "weak",
          botName: testData.botName,
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it("should reject invalid bot names", async () => {
      const testData = createTestData("invalidbot");

      await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: `num-${testData.email}`,
          name: testData.name,
          password: "SecurePass123",
          botName: "123Bot",
        })
        .expect(400);

      await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: `special-${testData.email}`,
          name: testData.name,
          password: "SecurePass123",
          botName: "Bot@#$%",
        })
        .expect(400);
    });

    it("should reject invalid email format", async () => {
      const testData = createTestData("bademail");

      await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: "not-an-email",
          name: testData.name,
          password: "SecurePass123",
          botName: testData.botName,
        })
        .expect(400);
    });
  });

  describe("Bot Limit Enforcement", () => {
    it("should enforce max 10 bots per account", async () => {
      const testData = createTestData("manybots");

      const devResponse = await request(ctx.app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: testData.email,
          name: testData.name,
          password: "SecurePass123",
          botName: testData.botName,
        })
        .expect(201);

      const token = devResponse.body.accessToken;

      for (let i = 2; i <= 10; i++) {
        await request(ctx.app.getHttpServer())
          .post("/api/v1/bots/internal")
          .set("Authorization", `Bearer ${token}`)
          .send({
            name: `${testData.botName}_${i}`,
            strategy: createDefaultStrategy(),
          })
          .expect(201);
      }

      const response = await request(ctx.app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: `${testData.botName}_11`,
          strategy: createDefaultStrategy(),
        })
        .expect(400);

      expect(response.body.message).toContain("Maximum");
      expect(response.body.message).toContain("10");
    }, 60000);
  });
});
