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
import { ServicesModule } from "../../src/services/services.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("Bots E2E Tests", () => {
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
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: `botowner-${id}@example.com`,
        name: `BotOwner-${id}`,
        password: "SecurePassword123!",
      });

    return {
      accessToken: response.body.accessToken,
      userId: response.body.user.id,
      id,
    };
  }

  describe.concurrent("Bot CRUD Operations", () => {
    it("should create a new bot", async () => {
      const { accessToken, id } = await createTestUser();
      const botName = `MyPokerBot-${id}`;
      const endpoint = `http://localhost:8080/action-${id}`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: botName,
          endpoint,
          description: "My first poker bot",
        })
        .expect(201);

      expect(response.body.name).toBe(botName);
      expect(response.body.endpoint).toBe(endpoint);
      expect(response.body.active).toBe(true);

      const bots = await dataSource.query(
        'SELECT * FROM "bots" WHERE name = $1',
        [botName],
      );
      expect(bots).toHaveLength(1);
    });

    it("should list user bots", async () => {
      const { accessToken, id } = await createTestUser();

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `Bot1-${id}`,
          endpoint: `http://localhost:8081/bot1-${id}`,
        });

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `Bot2-${id}`,
          endpoint: `http://localhost:8082/bot2-${id}`,
        });

      const response = await request(app.getHttpServer())
        .get("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
    });

    it("should get bot by ID", async () => {
      const { accessToken, id } = await createTestUser();
      const botName = `GetBot-${id}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: botName,
          endpoint: `http://localhost:8083/getbot-${id}`,
        });

      const botId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/bots/${botId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(botId);
      expect(response.body.name).toBe(botName);
    });

    it("should update bot", async () => {
      const { accessToken, id } = await createTestUser();

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `UpdateBot-${id}`,
          endpoint: `http://localhost:8084/updatebot-${id}`,
        });

      const botId = createResponse.body.id;
      const newEndpoint = `http://localhost:9999/updated-${id}`;

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/bots/${botId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          endpoint: newEndpoint,
          description: "Updated description",
        })
        .expect(200);

      expect(response.body.endpoint).toBe(newEndpoint);
      expect(response.body.description).toBe("Updated description");
    });

    it("should deactivate bot", async () => {
      const { accessToken, id } = await createTestUser();

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `DeactivateBot-${id}`,
          endpoint: `http://localhost:8085/deactivate-${id}`,
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
      const { accessToken, id } = await createTestUser();

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `DeleteBot-${id}`,
          endpoint: `http://localhost:8086/delete-${id}`,
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

  describe.concurrent("Bot Validation", () => {
    it("should reject bot with invalid endpoint URL", async () => {
      const { accessToken, id } = await createTestUser();

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `InvalidBot-${id}`,
          endpoint: "not-a-valid-url",
        })
        .expect(400);
    });

    it("should reject bot with missing name", async () => {
      const { accessToken, id } = await createTestUser();

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          endpoint: `http://localhost:8080/missing-name-${id}`,
        })
        .expect(400);
    });

    it("should reject duplicate bot names for same user", async () => {
      const { accessToken, id } = await createTestUser();
      const botName = `DuplicateBot-${id}`;

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: botName,
          endpoint: `http://localhost:8087/dup1-${id}`,
        });

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: botName,
          endpoint: `http://localhost:8088/dup2-${id}`,
        })
        .expect(409);
    });
  });

  describe.concurrent("Bot Ownership", () => {
    it("should not allow updating another user's bot", async () => {
      const { accessToken: ownerToken, id: ownerId } = await createTestUser();
      const { accessToken: otherUserToken } = await createTestUser();

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: `ProtectedBot-${ownerId}`,
          endpoint: `http://localhost:8089/protected-${ownerId}`,
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
      const { accessToken: ownerToken, id: ownerId } = await createTestUser();
      const { accessToken: otherUserToken } = await createTestUser();

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: `ProtectedBot2-${ownerId}`,
          endpoint: `http://localhost:8090/protected2-${ownerId}`,
        });

      const botId = createResponse.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/bots/${botId}`)
        .set("Authorization", `Bearer ${otherUserToken}`)
        .expect(403);
    });

    it("should isolate bot lists by user", async () => {
      const { accessToken: user1Token, id: user1Id } = await createTestUser();
      const { accessToken: user2Token, id: user2Id } = await createTestUser();

      const bot1Name = `User1Bot-${user1Id}`;
      const bot2Name = `User2Bot-${user2Id}`;

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          name: bot1Name,
          endpoint: `http://localhost:8091/user1-${user1Id}`,
        });

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          name: bot2Name,
          endpoint: `http://localhost:8092/user2-${user2Id}`,
        });

      const user1Bots = await request(app.getHttpServer())
        .get("/api/v1/bots")
        .set("Authorization", `Bearer ${user1Token}`);

      const user2Bots = await request(app.getHttpServer())
        .get("/api/v1/bots")
        .set("Authorization", `Bearer ${user2Token}`);

      expect(user1Bots.body).toHaveLength(1);
      expect(user1Bots.body[0].name).toBe(bot1Name);

      expect(user2Bots.body).toHaveLength(1);
      expect(user2Bots.body[0].name).toBe(bot2Name);
    });
  });
});
