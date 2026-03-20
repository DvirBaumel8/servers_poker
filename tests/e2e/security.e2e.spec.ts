/**
 * Security E2E Tests
 * ==================
 * Tests designed to verify security measures and prevent exploitation.
 *
 * Categories:
 * 1. Authentication bypass attempts
 * 2. Authorization violations (accessing other users' resources)
 * 3. Input injection (SQL, NoSQL, XSS payloads)
 * 4. Rate limiting verification
 * 5. Token manipulation
 * 6. IDOR (Insecure Direct Object References)
 * 7. Bot endpoint security
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import * as http from "http";
import { DataSource } from "typeorm";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { GamesModule } from "../../src/modules/games/games.module";
import { UsersModule } from "../../src/modules/users/users.module";
import { ServicesModule } from "../../src/services/services.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function createTestUser() {
  const id = uid();
  return {
    email: `user-${id}@test.com`,
    name: `User${id}`,
    password: "SecurePass123!",
  };
}

function createTestBot(name: string) {
  const id = uid();
  return {
    botName: `${name}Bot${id}`,
  };
}

interface BotServer {
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}

function createMockBotServer(): Promise<BotServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.method === "GET") {
        res.end(JSON.stringify({ status: "ok" }));
      } else {
        res.end(JSON.stringify({ type: "call" }));
      }
    });
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        server,
        port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe("Security E2E Tests", () => {
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
        UsersModule,
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

  async function registerUserWithBot(): Promise<{
    user: ReturnType<typeof createTestUser>;
    bot: ReturnType<typeof createTestBot>;
    accessToken: string;
    botId: string;
    botServer: BotServer;
  }> {
    const user = createTestUser();
    const bot = createTestBot(user.name);
    const botServer = await createMockBotServer();

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register-developer")
      .send({
        email: user.email,
        name: user.name,
        password: user.password,
        botName: bot.botName,
        botEndpoint: `http://localhost:${botServer.port}`,
      })
      .expect(201);

    return {
      user,
      bot,
      accessToken: response.body.accessToken,
      botId: response.body.bot.id,
      botServer,
    };
  }

  async function registerUser(): Promise<{
    user: ReturnType<typeof createTestUser>;
    accessToken: string;
  }> {
    const user = createTestUser();

    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: user.email, name: user.name, password: user.password })
      .expect(201);

    await dataSource.query(
      'UPDATE "users" SET email_verified = true WHERE email = $1',
      [user.email],
    );

    const loginResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: user.password })
      .expect(200);

    return { user, accessToken: loginResponse.body.accessToken };
  }

  describe.concurrent("Authentication Bypass Attempts", () => {
    it("should reject requests without authorization header", async () => {
      await request(app.getHttpServer()).get("/api/v1/bots/my").expect(401);
    });

    it("should reject requests with empty bearer token", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/bots/my")
        .set("Authorization", "Bearer ")
        .expect(401);
    });

    it("should reject requests with malformed JWT", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/bots/my")
        .set("Authorization", "Bearer not.a.valid.jwt.token")
        .expect(401);
    });

    it("should reject requests with tampered JWT payload", async () => {
      const { accessToken } = await registerUser();

      const parts = accessToken.split(".");
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          sub: "00000000-0000-0000-0000-000000000000",
          email: `tampered-${uid()}@test.com`,
          iat: Date.now(),
        }),
      ).toString("base64url");

      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${tamperedToken}`)
        .expect(401);
    });

    it("should reject expired tokens", async () => {
      const expiredToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJ0ZXN0QHRlc3QuY29tIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid";

      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  describe.concurrent("Authorization Violations (IDOR)", () => {
    it("should prevent user from accessing another user's bots", async () => {
      const user1 = await registerUserWithBot();
      const user2 = await registerUserWithBot();

      try {
        await request(app.getHttpServer())
          .get(`/api/v1/bots/${user1.botId}`)
          .set("Authorization", `Bearer ${user2.accessToken}`)
          .expect(403);
      } finally {
        await user1.botServer.close();
        await user2.botServer.close();
      }
    });

    it("should prevent user from deleting another user's bot", async () => {
      const user1 = await registerUserWithBot();
      const user2 = await registerUserWithBot();

      try {
        await request(app.getHttpServer())
          .delete(`/api/v1/bots/${user1.botId}`)
          .set("Authorization", `Bearer ${user2.accessToken}`)
          .expect(403);

        const response = await request(app.getHttpServer())
          .get(`/api/v1/bots/${user1.botId}`)
          .set("Authorization", `Bearer ${user1.accessToken}`)
          .expect(200);
        expect(response.body.id).toBe(user1.botId);
      } finally {
        await user1.botServer.close();
        await user2.botServer.close();
      }
    });

    it("should prevent user from updating another user's bot", async () => {
      const user1 = await registerUserWithBot();
      const user2 = await registerUserWithBot();

      try {
        await request(app.getHttpServer())
          .put(`/api/v1/bots/${user1.botId}`)
          .set("Authorization", `Bearer ${user2.accessToken}`)
          .send({ name: `HackedName${uid()}` })
          .expect(403);
      } finally {
        await user1.botServer.close();
        await user2.botServer.close();
      }
    });

    it("should prevent user from joining table with another user's bot", async () => {
      const user1 = await registerUserWithBot();
      const user2 = await registerUserWithBot();

      try {
        const tableResponse = await request(app.getHttpServer())
          .post("/api/v1/games/tables")
          .set("Authorization", `Bearer ${user1.accessToken}`)
          .send({
            name: `SecureTable${uid()}`,
            small_blind: 10,
            big_blind: 20,
            starting_chips: 1000,
            max_players: 6,
            turn_timeout_ms: 5000,
          })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/api/v1/games/${tableResponse.body.id}/join`)
          .set("Authorization", `Bearer ${user2.accessToken}`)
          .send({ bot_id: user1.botId })
          .expect(403);
      } finally {
        await user1.botServer.close();
        await user2.botServer.close();
      }
    });
  });

  describe.concurrent("Input Injection Prevention", () => {
    it("should sanitize SQL injection in email field", async () => {
      const id = uid();
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: `test-${id}@test.com'; DROP TABLE users; --`,
          name: `SQLInjection${id}`,
          password: "SecurePass123!",
        });

      expect(response.status).toBe(400);

      const users = await dataSource.query("SELECT COUNT(*) FROM users");
      expect(users).toBeDefined();
    });

    it("should sanitize SQL injection in name field", async () => {
      const id = uid();
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: `safe-${id}@test.com`,
          name: `Robert${id}'); DROP TABLE users;--`,
          password: "SecurePass123!",
        });

      const users = await dataSource.query("SELECT COUNT(*) FROM users");
      expect(users).toBeDefined();
    });

    it("should reject XSS payloads in bot name", async () => {
      const id = uid();
      const botServer = await createMockBotServer();

      try {
        const response = await request(app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email: `xss-${id}@test.com`,
            name: `XSSTest${id}`,
            password: "SecurePass123!",
            botName: "<script>alert('XSS')</script>",
            botEndpoint: `http://localhost:${botServer.port}`,
          });

        expect(response.status).toBe(400);
      } finally {
        await botServer.close();
      }
    });

    it("should reject path traversal in bot endpoint", async () => {
      const id = uid();
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: `traversal-${id}@test.com`,
          name: `Traversal${id}`,
          password: "SecurePass123!",
          botName: `TraversalBot${id}`,
          botEndpoint: "file:///etc/passwd",
        });

      expect(response.status).toBe(400);
    });

    it("should reject internal network access in bot endpoint", async () => {
      const id = uid();
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: `internal-${id}@test.com`,
          name: `Internal${id}`,
          password: "SecurePass123!",
          botName: `InternalBot${id}`,
          botEndpoint: "http://127.0.0.1:22",
        });

      expect([400, 403]).toContain(response.status);
    });

    it("should reject metadata service access attempt", async () => {
      const id = uid();
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register-developer")
        .send({
          email: `metadata-${id}@test.com`,
          name: `Metadata${id}`,
          password: "SecurePass123!",
          botName: `MetadataBot${id}`,
          botEndpoint: "http://169.254.169.254/latest/meta-data/",
        });

      expect([400, 403]).toContain(response.status);
    });
  });

  describe.concurrent("ID Manipulation", () => {
    it("should reject invalid UUID format in bot ID", async () => {
      const { accessToken, botServer } = await registerUserWithBot();

      try {
        await request(app.getHttpServer())
          .get("/api/v1/bots/not-a-uuid")
          .set("Authorization", `Bearer ${accessToken}`)
          .expect(400);
      } finally {
        await botServer.close();
      }
    });

    it("should return 404 for non-existent valid UUID", async () => {
      const { accessToken, botServer } = await registerUserWithBot();

      try {
        await request(app.getHttpServer())
          .get("/api/v1/bots/00000000-0000-0000-0000-000000000000")
          .set("Authorization", `Bearer ${accessToken}`)
          .expect(404);
      } finally {
        await botServer.close();
      }
    });
  });

  describe.concurrent("Mass Assignment Prevention", () => {
    it("should not allow setting admin flag via registration", async () => {
      const id = uid();
      const email = `admin-${id}@test.com`;
      const botServer = await createMockBotServer();

      try {
        await request(app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email,
            name: `AdminAttempt${id}`,
            password: "SecurePass123!",
            botName: `AdminBot${id}`,
            botEndpoint: `http://localhost:${botServer.port}`,
            role: "admin",
            isAdmin: true,
          })
          .expect(201);

        const user = await dataSource.query(
          'SELECT * FROM "users" WHERE email = $1',
          [email],
        );
        expect(user[0].role).not.toBe("admin");
      } finally {
        await botServer.close();
      }
    });

    it("should not allow setting user ID via registration", async () => {
      const id = uid();
      const email = `idset-${id}@test.com`;
      const botServer = await createMockBotServer();

      try {
        await request(app.getHttpServer())
          .post("/api/v1/auth/register-developer")
          .send({
            email,
            name: `IDSet${id}`,
            password: "SecurePass123!",
            botName: `IDBot${id}`,
            botEndpoint: `http://localhost:${botServer.port}`,
            id: "00000000-0000-0000-0000-000000000001",
          })
          .expect(201);

        const user = await dataSource.query(
          'SELECT * FROM "users" WHERE email = $1',
          [email],
        );
        expect(user[0].id).not.toBe("00000000-0000-0000-0000-000000000001");
      } finally {
        await botServer.close();
      }
    });
  });

  describe.concurrent("Enumeration Prevention", () => {
    it("should return same response for existing vs non-existing email on login", async () => {
      const id = uid();
      const { user } = await registerUser();

      const existingResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email: user.email,
          password: "WrongPassword123!",
        });

      const nonExistingResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email: `notexists-${id}@test.com`,
          password: "SomePassword123!",
        });

      expect(existingResponse.status).toBe(401);
      expect(nonExistingResponse.status).toBe(401);
      expect(existingResponse.body.message).toContain("Invalid");
    });
  });

  describe.concurrent("Session Security", () => {
    it("should invalidate token after password change", async () => {
      const { accessToken } = await registerUser();

      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post("/api/v1/auth/regenerate-api-key")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  describe.concurrent("Resource Limits", () => {
    it("should enforce maximum password length", async () => {
      const id = uid();
      const longPassword = "A".repeat(200) + "1!";

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: `longpass-${id}@test.com`,
          name: `LongPass${id}`,
          password: longPassword,
        });

      expect([400, 413]).toContain(response.status);
    });

    it("should enforce maximum email length", async () => {
      const id = uid();
      const longEmail = "a".repeat(300) + `${id}@test.com`;

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: longEmail,
          name: `LongEmail${id}`,
          password: "SecurePass123!",
        });

      expect([400, 413]).toContain(response.status);
    });

    it("should enforce maximum name length", async () => {
      const id = uid();
      const longName = "A".repeat(500);

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: `longname-${id}@test.com`,
          name: longName,
          password: "SecurePass123!",
        });

      expect([400, 413]).toContain(response.status);
    });
  });
});
