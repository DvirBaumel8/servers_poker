import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import request from "supertest";
import { DataSource } from "typeorm";
import { AuthModule } from "../../src/modules/auth/auth.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
          entities: Object.values(entities),
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

  describe("Input Validation", () => {
    it("should reject registration with weak password (too short)", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "weakpass@test.com",
          name: "WeakPass",
          password: "123", // Only 3 chars, should fail @MinLength(8)
        })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });

    it("should reject registration with invalid email format", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "notanemail", // Not a valid email
          name: "BadEmail",
          password: "ValidPassword123!",
        })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });

    it("should reject registration with missing required fields", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "missing@test.com",
          // Missing name and password
        })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });

    it("should reject registration with password missing uppercase", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "nouppercase@test.com",
          name: "NoUpper",
          password: "password123", // No uppercase letter
        })
        .expect(400);

      expect(response.body.statusCode).toBe(400);
    });
  });

  describe("User Registration Flow", () => {
    it("should register a new user and require email verification", async () => {
      const testEmail = `newuser-${uid()}@example.com`;
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          name: `NewUser-${uid()}`,
          password: "SecurePassword123!",
        })
        .expect(201);

      expect(response.body).toHaveProperty("message");
      expect(response.body).toHaveProperty("email");
      expect(response.body.email).toBe(testEmail);
      expect(response.body.requiresVerification).toBe(true);

      const users = await dataSource.query(
        'SELECT * FROM "users" WHERE email = $1',
        [testEmail],
      );
      expect(users).toHaveLength(1);
      expect(users[0].email_verified).toBe(false);
    });

    it("should prevent duplicate email registration for verified users", async () => {
      const testEmail = `duplicate-${uid()}@example.com`;
      // First registration
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          name: `User1-${uid()}`,
          password: "SecurePassword123!",
        })
        .expect(201);

      // Verify the email
      await dataSource.query(
        'UPDATE "users" SET email_verified = true WHERE email = $1',
        [testEmail],
      );

      // Second registration should fail
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          name: `User2-${uid()}`,
          password: "SecurePassword123!",
        })
        .expect(409);
    });

    it("should prevent duplicate email registration for unverified users", async () => {
      const testEmail = `unverified-${uid()}@example.com`;
      // First registration (unverified)
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          name: `User1-${uid()}`,
          password: "SecurePassword123!",
        })
        .expect(201);

      // Second registration should fail
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          name: `User2-${uid()}`,
          password: "NewPassword123!",
        })
        .expect(409);
    });

    it("should hash passwords (not store plaintext)", async () => {
      const testEmail = `hashtest-${uid()}@example.com`;
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          name: `HashTest-${uid()}`,
          password: "MyPlainPassword123!",
        })
        .expect(201);

      const users = await dataSource.query(
        'SELECT * FROM "users" WHERE email = $1',
        [testEmail],
      );

      expect(users[0].api_key_hash).toBeDefined();
      expect(users[0].api_key_hash).not.toBe("MyPlainPassword123!");
      expect(users[0].api_key_hash.length).toBeGreaterThan(20);
    });
  });

  describe("User Login Flow", () => {
    async function createVerifiedUser() {
      const testEmail = `logintest-${uid()}@example.com`;
      const testPassword = "TestPassword123!";
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          name: `LoginTest-${uid()}`,
          password: testPassword,
        });
      await dataSource.query(
        'UPDATE "users" SET email_verified = true WHERE email = $1',
        [testEmail],
      );
      return { email: testEmail, password: testPassword };
    }

    it("should login with correct credentials", async () => {
      const { email, password } = await createVerifiedUser();
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email,
          password,
        })
        .expect(200);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body.user.email).toBe(email);
    });

    it("should reject login with wrong password", async () => {
      const { email } = await createVerifiedUser();
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email,
          password: "WrongPassword123!",
        })
        .expect(401);
    });

    it("should reject login for non-existent user", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email: `nonexistent-${uid()}@example.com`,
          password: "SomePassword123!",
        })
        .expect(401);
    });
  });

  describe("Protected Routes", () => {
    async function createAuthenticatedUser() {
      const testEmail = `protected-${uid()}@example.com`;
      const testPassword = "TestPassword123!";
      await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          name: `ProtectedTest-${uid()}`,
          password: testPassword,
        });
      await dataSource.query(
        'UPDATE "users" SET email_verified = true WHERE email = $1',
        [testEmail],
      );
      const loginResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: testPassword,
        });
      return { email: testEmail, accessToken: loginResponse.body.accessToken };
    }

    it("should access /me with valid token", async () => {
      const { email, accessToken } = await createAuthenticatedUser();
      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.email).toBe(email);
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
      const { accessToken } = await createAuthenticatedUser();
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/regenerate-api-key")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("apiKey");
      expect(response.body.apiKey).toBeDefined();
    });
  });
});
