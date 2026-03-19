import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import * as request from "supertest";
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

describe("Games E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: string;
  let bot1Id: string;
  let bot2Id: string;

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
          {
            ttl: 60000,
            limit: 1000,
          },
        ]),
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

  beforeEach(async () => {
    const tableNames = dataSource.entityMetadatas
      .map((entity) => `"${entity.tableName}"`)
      .join(", ");

    if (tableNames) {
      await dataSource.query(
        `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`,
      );
    }

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: "gameowner@example.com",
        name: "GameOwner",
        password: "SecurePassword123!",
      });

    accessToken = response.body.accessToken;
    userId = response.body.user.id;

    const bot1Response = await request(app.getHttpServer())
      .post("/api/v1/bots")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "GameBot1",
        endpoint: "http://localhost:19001",
      });

    bot1Id = bot1Response.body.id;

    const bot2Response = await request(app.getHttpServer())
      .post("/api/v1/bots")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "GameBot2",
        endpoint: "http://localhost:19002",
      });

    bot2Id = bot2Response.body.id;
  });

  describe("Table CRUD Operations", () => {
    it("should create a new table", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "TestTable",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        })
        .expect(201);

      expect(response.body.name).toBe("TestTable");
      expect(response.body.small_blind).toBe(10);
      expect(response.body.big_blind).toBe(20);
      expect(response.body.max_players).toBe(6);
    });

    it("should list all tables", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Table1",
          small_blind: 5,
          big_blind: 10,
          starting_chips: 500,
        });

      await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Table2",
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
      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "GetTable",
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
      expect(response.body.name).toBe("GetTable");
    });
  });

  describe("Table Validation", () => {
    it("should reject table with invalid blinds", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "InvalidTable",
          small_blind: -10,
          big_blind: 20,
          starting_chips: 1000,
        })
        .expect(400);
    });

    it("should reject table with missing required fields", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "IncompleteTable",
        })
        .expect(400);
    });

    it("should reject table with too few max players", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "TinyTable",
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
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "JoinTable",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        });

      const tableId = tableResponse.body.id;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/games/tables/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      expect(response.body).toHaveProperty("seat_number");
      expect(response.body.starting_chips).toBe(1000);
    });

    it("should allow multiple bots to join table", async () => {
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "MultiJoinTable",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 6,
        });

      const tableId = tableResponse.body.id;

      const join1 = await request(app.getHttpServer())
        .post(`/api/v1/games/tables/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      const join2 = await request(app.getHttpServer())
        .post(`/api/v1/games/tables/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot2Id,
        })
        .expect(201);

      expect(join1.body.seat_number).not.toBe(join2.body.seat_number);
    });

    it("should reject joining with inactive bot", async () => {
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
          name: "InactiveBotTable",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/games/tables/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(400);
    });

    it("should reject joining same bot twice", async () => {
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "DuplicateJoinTable",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/games/tables/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/games/tables/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(409);
    });

    it("should reject non-existent bot", async () => {
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "FakeBotTable",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/games/tables/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: "non-existent-bot-id",
        })
        .expect(404);
    });
  });

  describe("Game State", () => {
    it("should get table state with seated bots", async () => {
      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "StateTable",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/games/tables/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        });

      await request(app.getHttpServer())
        .post(`/api/v1/games/tables/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot2Id,
        });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/games/tables/${tableId}/state`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("table");
      expect(response.body).toHaveProperty("seats");
    });
  });

  describe("Leaderboard", () => {
    it("should return leaderboard (empty initially)", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/games/leaderboard")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should respect limit parameter", async () => {
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
