import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import request from "supertest";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { AnalyticsModule } from "../../src/modules/analytics/analytics.module";
import { ServicesModule } from "../../src/services/services.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import { ThrottlerModule } from "@nestjs/throttler";
import { CustomThrottlerGuard } from "../../src/common/guards/custom-throttler.guard";
import { v4 as uuidv4 } from "uuid";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("Analytics E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let adminToken: string;
  let userToken: string;
  let adminUserId: string;
  let regularUserId: string;

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
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        ServicesModule,
        AuthModule,
        AnalyticsModule,
      ],
      providers: [
        {
          provide: APP_GUARD,
          useClass: JwtAuthGuard,
        },
        {
          provide: APP_GUARD,
          useClass: RolesGuard,
        },
        {
          provide: APP_GUARD,
          useClass: CustomThrottlerGuard,
        },
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
    jwtService = moduleFixture.get(JwtService);

    // Create admin user
    adminUserId = uuidv4();
    const adminEmail = `admin-${uid()}@example.com`;
    const passwordHash =
      "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.3L8KJ5h1V5OGRC";
    const apiKeyHash = uuidv4().replace(/-/g, "");

    await dataSource.query(
      `INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'admin', true, true, NOW(), NOW())`,
      [adminUserId, adminEmail, "Admin User", passwordHash, apiKeyHash],
    );

    adminToken = jwtService.sign({
      sub: adminUserId,
      email: adminEmail,
      role: "admin",
    });

    // Create regular user
    regularUserId = uuidv4();
    const userEmail = `user-${uid()}@example.com`;

    await dataSource.query(
      `INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'user', true, true, NOW(), NOW())`,
      [regularUserId, userEmail, "Regular User", passwordHash, apiKeyHash],
    );

    userToken = jwtService.sign({
      sub: regularUserId,
      email: userEmail,
      role: "user",
    });

    // Create some test data
    await createTestData(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await app.close();
  });

  async function createTestData(ds: DataSource) {
    // Create a bot
    const botId = uuidv4();
    await ds.query(
      `INSERT INTO bots (id, name, endpoint, active, user_id, created_at, updated_at)
       VALUES ($1, $2, $3, true, $4, NOW(), NOW())`,
      [botId, "TestBot", "http://localhost:4000/action", adminUserId],
    );

    // Create a table
    const tableId = uuidv4();
    await ds.query(
      `INSERT INTO tables (id, name, small_blind, big_blind, starting_chips, max_players, turn_timeout_ms, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [tableId, "Test Table", 10, 20, 1000, 9, 10000, "waiting"],
    );

    // Create a game
    const gameId = uuidv4();
    await ds.query(
      `INSERT INTO games (id, table_id, status, total_hands, created_at, updated_at, finished_at)
       VALUES ($1, $2, 'finished', 50, NOW() - INTERVAL '1 hour', NOW(), NOW())`,
      [gameId, tableId],
    );

    // Create some hands
    for (let i = 0; i < 10; i++) {
      const handId = uuidv4();
      await ds.query(
        `INSERT INTO hands (id, game_id, hand_number, small_blind, big_blind, ante, pot, stage, created_at, updated_at)
         VALUES ($1, $2, $3, 10, 20, 0, 100, 'showdown', NOW(), NOW())`,
        [handId, gameId, i + 1],
      );
    }

    // Create a tournament
    const tournamentId = uuidv4();
    await ds.query(
      `INSERT INTO tournaments (id, name, type, status, buy_in, starting_chips, min_players, max_players, players_per_table, turn_timeout_ms, created_at, updated_at, finished_at)
       VALUES ($1, $2, 'rolling', 'finished', 100, 1000, 2, 9, 9, 10000, NOW() - INTERVAL '2 hours', NOW(), NOW())`,
      [tournamentId, "Test Tournament"],
    );
  }

  describe("GET /api/v1/analytics/platform/stats", () => {
    it("should return platform stats without authentication (public)", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/analytics/platform/stats")
        .expect(200);

      expect(response.body).toHaveProperty("lifetime");
      expect(response.body).toHaveProperty("today");
      expect(response.body).toHaveProperty("live");
      expect(response.body).toHaveProperty("health");
      expect(response.body).toHaveProperty("generatedAt");
    });

    it("should return correct data structure", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/analytics/platform/stats")
        .expect(200);

      const { lifetime, today, live, health } = response.body;

      // Lifetime stats
      expect(typeof lifetime.totalUsers).toBe("number");
      expect(typeof lifetime.totalBots).toBe("number");
      expect(typeof lifetime.totalHandsDealt).toBe("number");
      expect(typeof lifetime.totalTournaments).toBe("number");
      expect(typeof lifetime.totalGames).toBe("number");

      // Today stats
      expect(typeof today.newUsers).toBe("number");
      expect(typeof today.activeUsers).toBe("number");
      expect(typeof today.gamesPlayed).toBe("number");

      // Live stats
      expect(typeof live.activeGames).toBe("number");
      expect(typeof live.activeTournaments).toBe("number");

      // Health stats
      expect(typeof health.avgBotResponseMs).toBe("number");
      expect(typeof health.errorRate).toBe("string");
    });

    it("should return non-zero values for seeded data", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/analytics/platform/stats")
        .expect(200);

      expect(response.body.lifetime.totalUsers).toBeGreaterThan(0);
      expect(response.body.lifetime.totalBots).toBeGreaterThan(0);
      expect(response.body.lifetime.totalHandsDealt).toBeGreaterThan(0);
      expect(response.body.lifetime.totalTournaments).toBeGreaterThan(0);
    });
  });

  describe("GET /api/v1/analytics/admin/stats", () => {
    it("should require authentication", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/analytics/admin/stats")
        .expect(401);
    });

    it("should require admin role", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/analytics/admin/stats")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);
    });

    it("should return admin stats for admin user", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/analytics/admin/stats")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("lifetime");
      expect(response.body).toHaveProperty("today");
      expect(response.body).toHaveProperty("live");
      expect(response.body).toHaveProperty("health");
      expect(response.body).toHaveProperty("topPerformers");
      expect(response.body).toHaveProperty("metricsHistory");
      expect(Array.isArray(response.body.topPerformers)).toBe(true);
      expect(Array.isArray(response.body.metricsHistory)).toBe(true);
    });

    it("should accept days query parameter", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/analytics/admin/stats?days=7")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("metricsHistory");
    });
  });

  describe("POST /api/v1/analytics/events", () => {
    it("should accept analytics event without authentication", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/analytics/events")
        .send({
          event_type: "page_view",
          session_id: uuidv4(),
          page_url: "/home",
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it("should accept event with event_data", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/analytics/events")
        .send({
          event_type: "bot_created",
          session_id: uuidv4(),
          event_data: { botId: "bot-123", botName: "TestBot" },
          page_url: "/bots",
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it("should associate event with authenticated user", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/analytics/events")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          event_type: "login",
          session_id: uuidv4(),
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it("should validate event_type", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/analytics/events")
        .send({
          event_type: "invalid_event_type",
          session_id: uuidv4(),
        })
        .expect(400);
    });

    it("should require session_id", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/analytics/events")
        .send({
          event_type: "page_view",
        })
        .expect(400);
    });

    it("should require valid UUID for session_id", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/analytics/events")
        .send({
          event_type: "page_view",
          session_id: "invalid-uuid",
        })
        .expect(400);
    });
  });

  describe("POST /api/v1/analytics/admin/trigger-summary", () => {
    it("should require admin role", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/analytics/admin/trigger-summary")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);
    });

    it("should allow admin to trigger summary", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/analytics/admin/trigger-summary")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(201);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("POST /api/v1/analytics/admin/save-metrics", () => {
    it("should require admin role", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/analytics/admin/save-metrics")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);
    });

    it("should allow admin to save metrics snapshot", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/analytics/admin/save-metrics")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /api/v1/analytics/events/summary", () => {
    it("should require admin role", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/analytics/events/summary")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);
    });

    it("should return event counts for admin", async () => {
      // First record some events
      await request(app.getHttpServer()).post("/api/v1/analytics/events").send({
        event_type: "page_view",
        session_id: uuidv4(),
      });

      await request(app.getHttpServer()).post("/api/v1/analytics/events").send({
        event_type: "page_view",
        session_id: uuidv4(),
      });

      const response = await request(app.getHttpServer())
        .get("/api/v1/analytics/events/summary")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(typeof response.body).toBe("object");
      expect(response.body.page_view).toBeGreaterThanOrEqual(2);
    });
  });

  describe("GET /api/v1/analytics/metrics/history", () => {
    it("should require admin role", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/analytics/metrics/history")
        .set("Authorization", `Bearer ${userToken}`)
        .expect(403);
    });

    it("should return metrics history for admin", async () => {
      // Save a metrics snapshot first
      await request(app.getHttpServer())
        .post("/api/v1/analytics/admin/save-metrics")
        .set("Authorization", `Bearer ${adminToken}`);

      const response = await request(app.getHttpServer())
        .get("/api/v1/analytics/metrics/history")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should accept days parameter", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/analytics/metrics/history?days=7")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
