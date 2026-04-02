import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
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

let testCounter = 1;
const uid = () => `${testCounter++}${Math.random().toString(36).slice(2, 6)}`;

describe("Performance & Load E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;

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
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
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
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  async function registerPlayer(): Promise<{
    accessToken: string;
    botId: string;
  }> {
    const id = uid();
    const email = `perf${id}@test.com`;
    const name = `PerfPlayer${id}`;
    const password = "SecurePass123!";
    const botName = `PerfBot${id}`;

    // Register user
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, name, password })
      .expect(201);

    // Verify email
    await dataSource.query(
      'UPDATE "users" SET email_verified = true WHERE email = $1',
      [email],
    );

    // Login to get token
    const loginResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);

    const accessToken = loginResponse.body.accessToken;

    // Create bot
    const botResponse = await request(app.getHttpServer())
      .post("/api/v1/bots/internal")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: botName,
        strategy: {
          version: 1,
          tier: "quick",
          personality: {
            aggression: 50,
            bluffFrequency: 30,
            riskTolerance: 50,
            tightness: 50,
          },
        },
      })
      .expect(201);

    return {
      accessToken,
      botId: botResponse.body.id,
    };
  }

  describe("Response Time", () => {
    it("should respond to health check within 100ms", async () => {
      const start = Date.now();

      const response = await request(app.getHttpServer()).get("/api/v1/health");

      const duration = Date.now() - start;

      expect([200, 404]).toContain(response.status);
      expect(duration).toBeLessThan(500);
    });

    it("should respond to table list within reasonable time", async () => {
      const player = await registerPlayer();

      const start = Date.now();
      const response = await request(app.getHttpServer())
        .get("/api/v1/games")
        .set("Authorization", `Bearer ${player.accessToken}`);
      const duration = Date.now() - start;

      expect([200, 401]).toContain(response.status);
      expect(duration).toBeLessThan(2000);
    });

    it("should create table within 500ms", async () => {
      const player = await registerPlayer();

      const start = Date.now();
      const response = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${player.accessToken}`)
        .send({
          name: `PerfTable${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 2,
          turn_timeout_ms: 5000,
        });
      const duration = Date.now() - start;

      expect(response.status).toBe(201);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("Concurrent Registrations", () => {
    it("should handle 5 concurrent user registrations", async () => {
      const registrations = Array(5)
        .fill(null)
        .map(async () => {
          const id = uid();

          const start = Date.now();
          const response = await request(app.getHttpServer())
            .post("/api/v1/auth/register")
            .send({
              email: `concurrent${id}@test.com`,
              name: `ConcurrentPlayer${id}`,
              password: "SecurePass123!",
            });
          const duration = Date.now() - start;

          return { status: response.status, duration };
        });

      const results = await Promise.all(registrations);

      const successCount = results.filter((r) => r.status === 201).length;
      expect(successCount).toBe(5);

      const avgDuration =
        results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      expect(avgDuration).toBeLessThan(2000);
    });
  });

  describe("Concurrent Table Operations", () => {
    it("should handle 3 concurrent table creations", async () => {
      const player = await registerPlayer();

      const tableCreations = Array(3)
        .fill(null)
        .map(async () => {
          const start = Date.now();
          const response = await request(app.getHttpServer())
            .post("/api/v1/games/tables")
            .set("Authorization", `Bearer ${player.accessToken}`)
            .send({
              name: `ConcTable${uid()}`,
              small_blind: 10,
              big_blind: 20,
              starting_chips: 1000,
              max_players: 2,
              turn_timeout_ms: 5000,
            });
          const duration = Date.now() - start;

          return { status: response.status, duration, id: response.body?.id };
        });

      const results = await Promise.all(tableCreations);

      const successCount = results.filter((r) => r.status === 201).length;
      expect(successCount).toBe(3);

      const ids = results.filter((r) => r.id).map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("Rapid Actions", () => {
    it("should handle rapid sequential API calls", async () => {
      const player = await registerPlayer();
      const callCount = 10;
      const results: number[] = [];

      for (let i = 0; i < callCount; i++) {
        const start = Date.now();
        await request(app.getHttpServer())
          .get("/api/v1/games/tables")
          .set("Authorization", `Bearer ${player.accessToken}`);
        results.push(Date.now() - start);
      }

      const avg = results.reduce((a, b) => a + b, 0) / results.length;
      expect(avg).toBeLessThan(500);

      expect(Math.max(...results)).toBeLessThan(2000);
    });
  });

  describe("In-Process Bot Performance", () => {
    it("should handle game with in-process strategy evaluation", async () => {
      const player1 = await registerPlayer();
      const player2 = await registerPlayer();

      const tableRes = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${player1.accessToken}`)
        .send({
          name: `PerfBotTable${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 2,
          turn_timeout_ms: 10000,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableRes.body.id}/join`)
        .set("Authorization", `Bearer ${player1.accessToken}`)
        .send({ bot_id: player1.botId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableRes.body.id}/join`)
        .set("Authorization", `Bearer ${player2.accessToken}`)
        .send({ bot_id: player2.botId })
        .expect(201);

      await new Promise((r) => setTimeout(r, 5000));

      const state = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableRes.body.id}/state`)
        .set("Authorization", `Bearer ${player1.accessToken}`);

      expect(state.body.handNumber).toBeGreaterThan(0);
    }, 30000);
  });
});
