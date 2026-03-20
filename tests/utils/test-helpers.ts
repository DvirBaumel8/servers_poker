import request from "supertest";
import { INestApplication } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

export interface TestUser {
  id: string;
  email: string;
  name: string;
  password: string;
  apiKey: string;
  accessToken?: string;
}

export interface TestBot {
  id: string;
  name: string;
  endpoint: string;
  userId: string;
}

export async function createTestUser(
  app: INestApplication,
  overrides: Partial<TestUser> = {},
): Promise<TestUser> {
  const uniqueId = uuidv4().slice(0, 8);
  const user: TestUser = {
    id: "",
    email: overrides.email || `test-${uniqueId}@example.com`,
    name: overrides.name || `TestUser_${uniqueId}`,
    password: overrides.password || "TestPassword123!",
    apiKey: "",
  };

  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/register")
    .send({
      email: user.email,
      name: user.name,
      password: user.password,
    })
    .expect(201);

  user.id = response.body.user.id;
  user.accessToken = response.body.accessToken;
  user.apiKey = response.body.apiKey || "";

  return user;
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
    endpoint: string;
    description: string;
  }> = {},
): Promise<TestBot> {
  const uniqueId = uuidv4().slice(0, 8);

  const response = await request(app.getHttpServer())
    .post("/api/v1/bots")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      name: overrides.name || `TestBot_${uniqueId}`,
      endpoint: overrides.endpoint || `http://localhost:9999/bot-${uniqueId}`,
      description: overrides.description || "Test bot for E2E testing",
    })
    .expect(201);

  return {
    id: response.body.id,
    name: response.body.name,
    endpoint: response.body.endpoint,
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
