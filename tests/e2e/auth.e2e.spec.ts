import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import * as request from "supertest";
import { DataSource } from "typeorm";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { User } from "../../src/entities/user.entity";
import { Bot } from "../../src/entities/bot.entity";
import { appConfig } from "../../src/config";

describe("Auth E2E Tests", () => {
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
          entities: [User, Bot],
          synchronize: true,
          dropSchema: true,
        }),
        EventEmitterModule.forRoot(),
        AuthModule,
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
    await dataSource.query('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE');
  });

  describe("User Registration Flow", () => {
    it("should register a new user and return JWT", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "newuser@example.com",
          name: "NewUser",
          password: "SecurePassword123!",
        })
        .expect(201);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("user");
      expect(response.body.user.email).toBe("newuser@example.com");
      expect(response.body.user.name).toBe("NewUser");
      expect(response.body.user.role).toBe("user");

      const users = await dataSource.query(
        'SELECT * FROM "users" WHERE email = $1',
        ["newuser@example.com"],
      );
      expect(users).toHaveLength(1);
    });

    it("should prevent duplicate email registration", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "duplicate@example.com",
          name: "User1",
          password: "SecurePassword123!",
        })
        .expect(201);

      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "duplicate@example.com",
          name: "User2",
          password: "SecurePassword123!",
        })
        .expect(409);
    });

    it("should hash passwords (not store plaintext)", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "hashtest@example.com",
          name: "HashTest",
          password: "MyPlainPassword123!",
        })
        .expect(201);

      const users = await dataSource.query(
        'SELECT * FROM "users" WHERE email = $1',
        ["hashtest@example.com"],
      );

      expect(users[0].api_key_hash).toBeDefined();
      expect(users[0].api_key_hash).not.toBe("MyPlainPassword123!");
      expect(users[0].api_key_hash.length).toBeGreaterThan(20);
    });
  });

  describe("User Login Flow", () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "logintest@example.com",
          name: "LoginTest",
          password: "TestPassword123!",
        });
    });

    it("should login with correct credentials", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email: "logintest@example.com",
          password: "TestPassword123!",
        })
        .expect(200);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body.user.email).toBe("logintest@example.com");
    });

    it("should reject login with wrong password", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email: "logintest@example.com",
          password: "WrongPassword123!",
        })
        .expect(401);
    });

    it("should reject login for non-existent user", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "SomePassword123!",
        })
        .expect(401);
    });
  });

  describe("Protected Routes", () => {
    let accessToken: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "protected@example.com",
          name: "ProtectedTest",
          password: "TestPassword123!",
        });
      accessToken = response.body.accessToken;
    });

    it("should access /me with valid token", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.email).toBe("protected@example.com");
    });

    it("should reject /me without token", async () => {
      await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
    });

    it("should reject /me with invalid token", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);
    });

    it("should regenerate API key", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/regenerate-api-key")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("apiKey");
      expect(response.body.apiKey).toBeDefined();
    });
  });
});
