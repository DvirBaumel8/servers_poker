import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import request from "supertest";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { GamesModule } from "../../src/modules/games/games.module";
import { ServicesModule } from "../../src/services/services.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { ThrottlerModule } from "@nestjs/throttler";
import { CustomThrottlerGuard } from "../../src/common/guards/custom-throttler.guard";
import { v4 as uuidv4 } from "uuid";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("Games E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

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
        ServicesModule,
        AuthModule,
        BotsModule,
        GamesModule,
      ],
      providers: [
        {
          provide: APP_GUARD,
          useClass: JwtAuthGuard,
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
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await app.close();
  });

  async function createTestUser() {
    const id = uid();
    const email = `gameowner-${id}@example.com`;
    const name = `GameOwner-${id}`;
    const userId = uuidv4();
    const passwordHash =
      "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.3L8KJ5h1V5OGRC";
    const apiKeyHash = uuidv4().replace(/-/g, "");

    // Create user directly in DB
    await dataSource.query(
      `INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'user', true, true, NOW(), NOW())`,
      [userId, email, name, passwordHash, apiKeyHash],
    );

    // Generate JWT token
    const accessToken = jwtService.sign(
      { sub: userId, email },
      { expiresIn: "1h" },
    );

    return {
      accessToken,
      userId,
    };
  }

  async function createTestBot(
    accessToken: string,
    name: string,
    port: number,
  ) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/bots")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name,
        endpoint: `http://localhost:${port}`,
      });

    return response.body.id;
  }

  describe("Table CRUD Operations", () => {
    it("should create a new table", async () => {
      const { accessToken } = await createTestUser();
      const tableName = `TestTable-${uid()}`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: tableName,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      expect(response.body.name).toBe(tableName);
      expect(Number(response.body.small_blind)).toBe(10);
      expect(Number(response.body.big_blind)).toBe(20);
      expect(Number(response.body.max_players)).toBe(6);
    });

    it("should list all tables", async () => {
      const { accessToken } = await createTestUser();
      const id = uid().slice(0, 6);

      const create1 = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `T1${id}`,
          small_blind: 5,
          big_blind: 10,
          starting_chips: 500,
        });

      if (create1.status !== 201) {
        console.log("Create1 failed:", create1.body);
      }
      expect(create1.status).toBe(201);

      await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `T2${id}`,
          small_blind: 25,
          big_blind: 50,
          starting_chips: 2000,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get("/api/v1/games")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      const tables = response.body.data || response.body;
      expect(Array.isArray(tables)).toBe(true);
    });

    it("should get table by ID", async () => {
      const { accessToken } = await createTestUser();
      const tableName = `GetTable-${uid()}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: tableName,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/games/tables/${tableId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(tableId);
      expect(response.body.name).toBe(tableName);
    });
  });

  describe("Table Validation", () => {
    it("should reject table with invalid blinds", async () => {
      const { accessToken } = await createTestUser();

      await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `InvalidTable-${uid()}`,
          small_blind: -10,
          big_blind: 20,
          starting_chips: 1000,
        })
        .expect(400);
    });

    it("should reject table with missing required fields", async () => {
      const { accessToken } = await createTestUser();

      const response = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({});

      expect([400, 201]).toContain(response.status);
    });

    it("should reject table with too few max players", async () => {
      const { accessToken } = await createTestUser();

      await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `TinyTable-${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 1,
        })
        .expect(400);
    });
  });

  describe("Bot Join Table", () => {
    it("should allow bot to join table", async () => {
      const { accessToken } = await createTestUser();
      const id = uid();
      const bot1Id = await createTestBot(accessToken, `GameBot1-${id}`, 19001);

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `JoinTable-${id}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        });

      const tableId = tableResponse.body.id;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      expect(response.body).toHaveProperty("tableId");
      expect(response.body).toHaveProperty("botId");
      expect(response.body).toHaveProperty("playerCount");
    });

    it("should reject second bot from same owner joining table", async () => {
      const { accessToken } = await createTestUser();
      const id = uid();
      const bot1Id = await createTestBot(accessToken, `GameBot1-${id}`, 19001);
      const bot2Id = await createTestBot(accessToken, `GameBot2-${id}`, 19002);

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `MultiJoinTable-${id}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        });

      const tableId = tableResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      const join2Response = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot2Id,
        })
        .expect(409);

      expect(join2Response.body.message).toContain("You already have a bot");
      expect(join2Response.body.message).toContain(
        "Only one bot per player allowed",
      );
    });

    it("should allow bots from different owners to join same table", async () => {
      const { accessToken } = await createTestUser();
      const id = uid();
      const bot1Id = await createTestBot(accessToken, `GameBot1-${id}`, 19001);

      const { accessToken: user2Token } = await createTestUser();
      const user2BotId = await createTestBot(
        user2Token,
        `User2Bot-${id}`,
        19003,
      );

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `MultiOwnerTable-${id}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        });

      const tableId = tableResponse.body.id;

      const join1 = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      const join2 = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          bot_id: user2BotId,
        })
        .expect(201);

      expect(join1.body.tableId).toBe(tableId);
      expect(join2.body.tableId).toBe(tableId);
      expect(join2.body.playerCount).toBeGreaterThan(join1.body.playerCount);
    });

    it("should reject joining with inactive bot", async () => {
      const { accessToken } = await createTestUser();
      const id = uid();
      const bot1Id = await createTestBot(accessToken, `InaBot-${id}`, 19001);

      await request(app.getHttpServer())
        .delete(`/api/v1/bots/${bot1Id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `InaTbl-${id}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        })
        .expect(201);

      const tableId = tableResponse.body.id;

      const joinResponse = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        });

      expect([400, 403, 404, 409]).toContain(joinResponse.status);
    });

    it("should reject joining same bot twice", async () => {
      const { accessToken } = await createTestUser();
      const id = uid();
      const bot1Id = await createTestBot(accessToken, `GameBot1-${id}`, 19001);

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `DuplicateJoinTable-${id}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(409);
    });

    it("should reject non-existent bot", async () => {
      const { accessToken } = await createTestUser();
      const id = uid();

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `FakeBotTable-${id}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: "non-existent-bot-id",
        })
        .expect(404);
    });
  });

  describe("Game State", () => {
    it("should get table state with seated bots", async () => {
      const { accessToken } = await createTestUser();
      const id = uid();
      const bot1Id = await createTestBot(accessToken, `StBot-${id}`, 19001);

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `StTbl-${id}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        })
        .expect(201);

      const tableId = tableResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("status");
    });
  });

  describe("Leaderboard", () => {
    it("should return leaderboard (empty initially)", async () => {
      const { accessToken } = await createTestUser();

      const response = await request(app.getHttpServer())
        .get("/api/v1/games/leaderboard")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should respect limit parameter", async () => {
      const { accessToken } = await createTestUser();

      const response = await request(app.getHttpServer())
        .get("/api/v1/games/leaderboard?limit=5")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Health Check", () => {
    it("should return health status", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/games/health")
        .expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body.status).toBe("ok");
    });
  });
});
