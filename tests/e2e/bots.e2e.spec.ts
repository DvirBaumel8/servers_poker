import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { ServicesModule } from "../../src/services/services.module";
import { createTestApp, closeTestApp, TestAppContext } from "./shared/test-app";
import { createTestUser, authHeader } from "./shared/test-factories";

describe("Bots E2E Tests", () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  beforeAll(async () => {
    ctx = await createTestApp({
      imports: [ServicesModule, AuthModule, BotsModule],
    });
    app = ctx.app;
    dataSource = ctx.dataSource;
    jwtService = ctx.jwtService;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  describe("Bot CRUD Operations", () => {
    it("should create a new bot", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const botName = `MyPokerBot-${user.id.slice(0, 8)}`;
      const endpoint = `http://localhost:8080/action-${user.id.slice(0, 8)}`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user.accessToken))
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
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user.accessToken))
        .send({
          name: `Bot1-${id}`,
          endpoint: `http://localhost:8081/bot1-${id}`,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user.accessToken))
        .send({
          name: `Bot2-${id}`,
          endpoint: `http://localhost:8082/bot2-${id}`,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get("/api/v1/bots/my")
        .set(authHeader(user.accessToken))
        .expect(200);

      const bots = response.body.data || response.body;
      expect(bots).toHaveLength(2);
    });

    it("should get bot by ID", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);
      const botName = `GetBot-${id}`;

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          endpoint: `http://localhost:8083/getbot-${id}`,
        })
        .expect(201);

      const botId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      expect(response.body.id).toBe(botId);
      expect(response.body.name).toBe(botName);
    });

    it("should update bot", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user.accessToken))
        .send({
          name: `UpdBot-${id}`,
          endpoint: `http://localhost:8084/updatebot-${id}`,
        })
        .expect(201);

      const botId = createResponse.body.id;
      const newEndpoint = `http://localhost:9999/updated-${id}`;

      const response = await request(app.getHttpServer())
        .put(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .send({
          endpoint: newEndpoint,
          description: "Updated description",
        })
        .expect(200);

      expect(response.body.endpoint).toBe(newEndpoint);
      expect(response.body.description).toBe("Updated description");
    });

    it("should deactivate bot", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user.accessToken))
        .send({
          name: `DeactBot-${id}`,
          endpoint: `http://localhost:8085/deactivate-${id}`,
        })
        .expect(201);

      const botId = createResponse.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/bots/${botId}`)
        .set(authHeader(user.accessToken))
        .expect(200);

      expect(response.body.active).toBe(false);
    });
  });

  describe("Bot Validation", () => {
    it("should reject bot with invalid endpoint URL", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user.accessToken))
        .send({
          name: `InvBot-${id}`,
          endpoint: "not-a-valid-url",
        })
        .expect(400);
    });

    it("should reject bot with missing name", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user.accessToken))
        .send({
          endpoint: `http://localhost:8080/missing-name-${id}`,
        })
        .expect(400);
    });

    it("should reject duplicate bot names for same user", async () => {
      const user = await createTestUser(dataSource, jwtService);
      const id = user.id.slice(0, 8);
      const botName = `DupBot-${id}`;

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          endpoint: `http://localhost:8087/dup1-${id}`,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user.accessToken))
        .send({
          name: botName,
          endpoint: `http://localhost:8088/dup2-${id}`,
        })
        .expect(409);
    });
  });

  describe("Bot Ownership", () => {
    it("should not allow updating another user's bot", async () => {
      const owner = await createTestUser(dataSource, jwtService);
      const otherUser = await createTestUser(dataSource, jwtService);
      const ownerId = owner.id.slice(0, 8);

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(owner.accessToken))
        .send({
          name: `ProtBot-${ownerId}`,
          endpoint: `http://localhost:8089/protected-${ownerId}`,
        })
        .expect(201);

      const botId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .put(`/api/v1/bots/${botId}`)
        .set(authHeader(otherUser.accessToken))
        .send({
          endpoint: "http://localhost:9999",
        });

      expect([403, 404]).toContain(response.status);
    });

    it("should not allow deleting another user's bot", async () => {
      const owner = await createTestUser(dataSource, jwtService);
      const otherUser = await createTestUser(dataSource, jwtService);
      const ownerId = owner.id.slice(0, 8);

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(owner.accessToken))
        .send({
          name: `ProtBot2-${ownerId}`,
          endpoint: `http://localhost:8090/protected2-${ownerId}`,
        })
        .expect(201);

      const botId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/bots/${botId}`)
        .set(authHeader(otherUser.accessToken));

      expect([403, 404]).toContain(response.status);
    });

    it("should isolate bot lists by user", async () => {
      const user1 = await createTestUser(dataSource, jwtService);
      const user2 = await createTestUser(dataSource, jwtService);
      const id1 = user1.id.slice(0, 8);
      const id2 = user2.id.slice(0, 8);

      const bot1Name = `U1Bot-${id1}`;
      const bot2Name = `U2Bot-${id2}`;

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user1.accessToken))
        .send({
          name: bot1Name,
          endpoint: `http://localhost:8091/user1-${id1}`,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set(authHeader(user2.accessToken))
        .send({
          name: bot2Name,
          endpoint: `http://localhost:8092/user2-${id2}`,
        })
        .expect(201);

      const user1Bots = await request(app.getHttpServer())
        .get("/api/v1/bots/my")
        .set(authHeader(user1.accessToken))
        .expect(200);

      const user2Bots = await request(app.getHttpServer())
        .get("/api/v1/bots/my")
        .set(authHeader(user2.accessToken))
        .expect(200);

      const bots1 = user1Bots.body.data || user1Bots.body;
      const bots2 = user2Bots.body.data || user2Bots.body;

      expect(bots1).toHaveLength(1);
      expect(bots1[0].name).toBe(bot1Name);

      expect(bots2).toHaveLength(1);
      expect(bots2[0].name).toBe(bot2Name);
    });
  });
});
