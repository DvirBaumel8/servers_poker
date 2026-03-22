import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";

export interface TestUser {
  id: string;
  email: string;
  name: string;
  password: string;
  accessToken?: string;
}

export interface TestBot {
  id: string;
  name: string;
  strategy: Record<string, any>;
  userId: string;
}

/**
 * Creates a test user with email verification flow.
 * Requires dataSource to read verification code from DB.
 */
export async function createTestUser(
  app: INestApplication,
  overrides: Partial<TestUser> = {},
  dataSource?: DataSource,
): Promise<TestUser> {
  const uniqueId = uuidv4().slice(0, 8);
  const user: TestUser = {
    id: "",
    email: overrides.email || `test-${uniqueId}@example.com`,
    name: overrides.name || `TestUser_${uniqueId}`,
    password: overrides.password || "TestPassword123!",
  };

  // Step 1: Register user
  await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({
      email: user.email,
      name: user.name,
      password: user.password,
    })
    .expect(201);

  // Step 2: Get verification code from database
  if (!dataSource) {
    throw new Error("dataSource required to get verification code");
  }

  const userRecord = await dataSource.query(
    `SELECT id, verification_code FROM users WHERE email = $1`,
    [user.email],
  );

  if (!userRecord?.[0]?.verification_code) {
    throw new Error(`No verification code found for ${user.email}`);
  }

  // Step 3: Verify email
  const verifyResponse = await request(app.getHttpServer())
    .post("/api/v1/auth/verify-email")
    .send({
      email: user.email,
      code: userRecord[0].verification_code,
    })
    .expect(200);

  user.id = verifyResponse.body.user.id;
  user.accessToken = verifyResponse.body.accessToken;

  return user;
}

/**
 * Creates a test user directly in the database (bypasses verification).
 * Use this for faster tests that don't need to test the auth flow.
 */
export async function createTestUserDirect(
  dataSource: DataSource,
  overrides: Partial<{ email: string; name: string; password: string }> = {},
): Promise<{ id: string; email: string; name: string }> {
  const uniqueId = uuidv4().slice(0, 8);
  const email = overrides.email || `test-${uniqueId}@example.com`;
  const name = overrides.name || `TestUser_${uniqueId}`;
  const passwordHash =
    "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.3L8KJ5h1V5OGRC"; // "TestPassword123!"

  const result = await dataSource.query(
    `INSERT INTO users (email, name, password_hash, role, active, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, 'user', true, true, NOW(), NOW())
     RETURNING id, email, name`,
    [email, name, passwordHash],
  );

  return result[0];
}

export async function loginUser(
  app: INestApplication,
  email: string,
  password: string,
): Promise<{ accessToken: string; user: any }> {
  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, password })
    .expect(200);

  return {
    accessToken: response.body.accessToken,
    user: response.body.user,
  };
}

export async function createTestBot(
  app: INestApplication,
  accessToken: string,
  overrides: Partial<{
    name: string;
    strategy: Record<string, any>;
    description: string;
  }> = {},
): Promise<TestBot> {
  const uniqueId = uuidv4().slice(0, 8);

  const response = await request(app.getHttpServer())
    .post("/api/v1/bots/internal")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      name: overrides.name || `TestBot_${uniqueId}`,
      description: overrides.description || "Test bot for E2E testing",
      strategy: overrides.strategy || {
        version: 1,
        tier: "quick",
        personality: {
          aggression: 50,
          bluffFrequency: 30,
          riskTolerance: 50,
          tightness: 50,
        },
      },
    })
    .expect(201);

  return {
    id: response.body.id,
    name: response.body.name,
    strategy: response.body.strategy,
    userId: response.body.user_id,
  };
}

export async function createTestTable(
  app: INestApplication,
  accessToken: string,
  overrides: Partial<{
    name: string;
    small_blind: number;
    big_blind: number;
    starting_chips: number;
    max_players: number;
  }> = {},
): Promise<any> {
  const uniqueId = uuidv4().slice(0, 8);

  const response = await request(app.getHttpServer())
    .post("/api/v1/games/tables")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      name: overrides.name || `TestTable_${uniqueId}`,
      small_blind: overrides.small_blind ?? 10,
      big_blind: overrides.big_blind ?? 20,
      starting_chips: overrides.starting_chips ?? 1000,
      max_players: overrides.max_players ?? 9,
    })
    .expect(201);

  return response.body;
}

export async function createTestTournament(
  app: INestApplication,
  accessToken: string,
  overrides: Partial<{
    name: string;
    type: string;
    buy_in: number;
    starting_chips: number;
    min_players: number;
    max_players: number;
  }> = {},
): Promise<any> {
  const uniqueId = uuidv4().slice(0, 8);

  const response = await request(app.getHttpServer())
    .post("/api/v1/tournaments")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      name: overrides.name || `TestTournament_${uniqueId}`,
      type: overrides.type || "scheduled",
      buy_in: overrides.buy_in ?? 100,
      starting_chips: overrides.starting_chips ?? 1000,
      min_players: overrides.min_players ?? 2,
      max_players: overrides.max_players ?? 100,
    })
    .expect(201);

  return response.body;
}

export function authHeader(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls a condition function until it returns true or timeout is reached.
 * Preferred over fixed sleep() calls in E2E tests.
 */
export async function waitForCondition(
  conditionFn: () => Promise<boolean> | boolean,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const { timeoutMs = 10000, intervalMs = 200, label = "condition" } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      if (await conditionFn()) return;
    } catch {
      // Condition threw — retry
    }
    await sleep(intervalMs);
  }

  throw new Error(`waitForCondition timed out after ${timeoutMs}ms: ${label}`);
}
