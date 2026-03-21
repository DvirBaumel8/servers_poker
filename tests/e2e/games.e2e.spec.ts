import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
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
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("Games E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;

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
          useClass: ThrottlerGuard,
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
    const password = "SecurePassword123!";

    // Step 1: Register
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email,
        name: `GameOwner-${id}`,
        password,
      });

    // Step 2: Get verification code from database
    const userRecord = await dataSource.query(
      `SELECT id, verification_code FROM users WHERE email = $1`,
      [email],
    );

    // Step 3: Verify email
    const verifyResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .send({
        email,
        code: userRecord[0].verification_code,
      });

    return {
      accessToken: verifyResponse.body.accessToken,
      userId: verifyResponse.body.user.id,
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

  describe.concurrent("Table CRUD Operations", () => {
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
      expect(response.body.small_blind).toBe(10);
      expect(response.body.big_blind).toBe(20);
      expect(response.body.max_players).toBe(6);
    });

    it("should list all tables", async () => {
      const { accessToken } = await createTestUser();
      const id = uid();

      await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `Table1-${id}`,
          small_blind: 5,
          big_blind: 10,
          starting_chips: 500,
        });

      await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `Table2-${id}`,
          small_blind: 25,
          big_blind: 50,
          starting_chips: 2000,
        });

      const response = await request(app.getHttpServer())
        .get("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
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

  describe.concurrent("Table Validation", () => {
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

      await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `IncompleteTable-${uid()}`,
        })
        .expect(400);
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

  describe.concurrent("Bot Join Table", () => {
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

      expect(response.body).toHaveProperty("seat_number");
      expect(response.body.starting_chips).toBe(1000);
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

      expect(join1.body.seat_number).not.toBe(join2.body.seat_number);
    });

    it("should reject joining with inactive bot", async () => {
      const { accessToken } = await createTestUser();
      const id = uid();
      const bot1Id = await createTestBot(accessToken, `GameBot1-${id}`, 19001);

      await request(app.getHttpServer())
        .patch(`/api/v1/bots/${bot1Id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          active: false,
        });

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `InactiveBotTable-${id}`,
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
        .expect(400);
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

  describe.concurrent("Game State", () => {
    it("should get table state with seated bots", async () => {
      const { accessToken } = await createTestUser();
      const id = uid();
      const bot1Id = await createTestBot(accessToken, `GameBot1-${id}`, 19001);

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `StateTable-${id}`,
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
        });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("table");
      expect(response.body).toHaveProperty("seats");
    });
  });

  describe.concurrent("Leaderboard", () => {
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

  describe.concurrent("Health Check", () => {
    it("should return health status", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/games/health")
        .expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body.status).toBe("ok");
    });
  });
});
