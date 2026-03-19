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
import { User } from "../../src/entities/user.entity";
import { Bot } from "../../src/entities/bot.entity";
import { BotStats } from "../../src/entities/bot-stats.entity";
import { BotEvent } from "../../src/entities/bot-event.entity";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";

describe("Bots E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: string;

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
          entities: [User, Bot, BotStats, BotEvent],
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
        AuthModule,
        BotsModule,
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
    await dataSource.query('TRUNCATE TABLE "bots" RESTART IDENTITY CASCADE');
    await dataSource.query('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: "botowner@example.com",
        name: "BotOwner",
        password: "SecurePassword123!",
      });

    accessToken = response.body.accessToken;
    userId = response.body.user.id;
  });

  describe("Bot CRUD Operations", () => {
    it("should create a new bot", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "MyPokerBot",
          endpoint: "http://localhost:8080/action",
          description: "My first poker bot",
        })
        .expect(201);

      expect(response.body.name).toBe("MyPokerBot");
      expect(response.body.endpoint).toBe("http://localhost:8080/action");
      expect(response.body.active).toBe(true);

      const bots = await dataSource.query(
        'SELECT * FROM "bots" WHERE name = $1',
        ["MyPokerBot"],
      );
      expect(bots).toHaveLength(1);
    });

    it("should list user bots", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Bot1",
          endpoint: "http://localhost:8081",
        });

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Bot2",
          endpoint: "http://localhost:8082",
        });

      const response = await request(app.getHttpServer())
        .get("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
    });

    it("should get bot by ID", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "GetBot",
          endpoint: "http://localhost:8083",
        });

      const botId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/bots/${botId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(botId);
      expect(response.body.name).toBe("GetBot");
    });

    it("should update bot", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "UpdateBot",
          endpoint: "http://localhost:8084",
        });

      const botId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/bots/${botId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          endpoint: "http://localhost:9999",
          description: "Updated description",
        })
        .expect(200);

      expect(response.body.endpoint).toBe("http://localhost:9999");
      expect(response.body.description).toBe("Updated description");
    });

    it("should deactivate bot", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "DeactivateBot",
          endpoint: "http://localhost:8085",
        });

      const botId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/bots/${botId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          active: false,
        })
        .expect(200);

      expect(response.body.active).toBe(false);
    });

    it("should delete bot", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "DeleteBot",
          endpoint: "http://localhost:8086",
        });

      const botId = createResponse.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/bots/${botId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/bots/${botId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe("Bot Validation", () => {
    it("should reject bot with invalid endpoint URL", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "InvalidBot",
          endpoint: "not-a-valid-url",
        })
        .expect(400);
    });

    it("should reject bot with missing name", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          endpoint: "http://localhost:8080",
        })
        .expect(400);
    });

    it("should reject duplicate bot names for same user", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "DuplicateBot",
          endpoint: "http://localhost:8087",
        });

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "DuplicateBot",
          endpoint: "http://localhost:8088",
        })
        .expect(409);
    });
  });

  describe("Bot Ownership", () => {
    let otherUserToken: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "otheruser@example.com",
          name: "OtherUser",
          password: "SecurePassword123!",
        });

      otherUserToken = response.body.accessToken;
    });

    it("should not allow updating another user's bot", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "ProtectedBot",
          endpoint: "http://localhost:8089",
        });

      const botId = createResponse.body.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/bots/${botId}`)
        .set("Authorization", `Bearer ${otherUserToken}`)
        .send({
          endpoint: "http://hacked.com",
        })
        .expect(403);
    });

    it("should not allow deleting another user's bot", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "ProtectedBot2",
          endpoint: "http://localhost:8090",
        });

      const botId = createResponse.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/bots/${botId}`)
        .set("Authorization", `Bearer ${otherUserToken}`)
        .expect(403);
    });

    it("should isolate bot lists by user", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "User1Bot",
          endpoint: "http://localhost:8091",
        });

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${otherUserToken}`)
        .send({
          name: "User2Bot",
          endpoint: "http://localhost:8092",
        });

      const user1Bots = await request(app.getHttpServer())
        .get("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`);

      const user2Bots = await request(app.getHttpServer())
        .get("/api/v1/bots")
        .set("Authorization", `Bearer ${otherUserToken}`);

      expect(user1Bots.body).toHaveLength(1);
      expect(user1Bots.body[0].name).toBe("User1Bot");

      expect(user2Bots.body).toHaveLength(1);
      expect(user2Bots.body[0].name).toBe("User2Bot");
    });
  });
});
