import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { v4 as uuidv4 } from "uuid";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Well-known test credentials that match seed data.
 * Use these for tests that need a pre-existing admin user.
 */
export const SEED_ADMIN = {
  email: "admin@poker.io",
  password: "TestPassword123!",
  name: "Admin User",
  role: "admin" as const,
};

export const SEED_TEST_USER = {
  email: "test@test.local",
  password: "TestPassword123!",
  name: "Test User",
  role: "user" as const,
};

export interface TestUser {
  id: string;
  email: string;
  name: string;
  accessToken: string;
}

export interface TestBot {
  id: string;
  name: string;
  endpoint: string;
  userId: string;
}

export async function createTestUser(
  dataSource: DataSource,
  jwtService: JwtService,
  overrides: Partial<{ email: string; name: string; role: string }> = {},
): Promise<TestUser> {
  const id = uid();
  const userId = uuidv4();
  const email = overrides.email || `testuser-${id}@example.com`;
  const name = overrides.name || `TestUser-${id}`;
  const role = overrides.role || "user";
  const passwordHash =
    "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.3L8KJ5h1V5OGRC"; // "TestPassword123!"
  const apiKeyHash = uuidv4().replace(/-/g, "");

  await dataSource.query(
    `INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW(), NOW())`,
    [userId, email, name, passwordHash, apiKeyHash, role],
  );

  const accessToken = jwtService.sign({ sub: userId, email });

  return { id: userId, email, name, accessToken };
}

export async function createTestAdmin(
  dataSource: DataSource,
  jwtService: JwtService,
): Promise<TestUser> {
  return createTestUser(dataSource, jwtService, { role: "admin" });
}

export async function createTestBot(
  dataSource: DataSource,
  userId: string,
  overrides: Partial<{ name: string; endpoint: string }> = {},
): Promise<TestBot> {
  const id = uid();
  const botId = uuidv4();
  const name = overrides.name || `TestBot-${id}`;
  const endpoint = overrides.endpoint || `http://localhost:9999/bot-${id}`;

  await dataSource.query(
    `INSERT INTO bots (id, user_id, name, endpoint, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
    [botId, userId, name, endpoint],
  );

  return { id: botId, name, endpoint, userId };
}

export async function createTestTable(
  dataSource: DataSource,
  overrides: Partial<{
    name: string;
    smallBlind: number;
    bigBlind: number;
    startingChips: number;
    maxPlayers: number;
  }> = {},
): Promise<{ id: string; name: string }> {
  const id = uid();
  const tableId = uuidv4();
  const name = overrides.name || `TestTable-${id}`;
  const smallBlind = overrides.smallBlind ?? 10;
  const bigBlind = overrides.bigBlind ?? 20;
  const startingChips = overrides.startingChips ?? 1000;
  const maxPlayers = overrides.maxPlayers ?? 9;

  await dataSource.query(
    `INSERT INTO tables (id, name, small_blind, big_blind, starting_chips, max_players, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'waiting', NOW(), NOW())`,
    [tableId, name, smallBlind, bigBlind, startingChips, maxPlayers],
  );

  return { id: tableId, name };
}

export async function createTestTournament(
  dataSource: DataSource,
  overrides: Partial<{
    name: string;
    type: string;
    buyIn: number;
    startingChips: number;
    minPlayers: number;
    maxPlayers: number;
    status: string;
  }> = {},
): Promise<{ id: string; name: string; status: string }> {
  const id = uid();
  const tournamentId = uuidv4();
  const name = overrides.name || `TestTournament-${id}`;
  const type = overrides.type || "scheduled";
  const buyIn = overrides.buyIn ?? 100;
  const startingChips = overrides.startingChips ?? 1000;
  const minPlayers = overrides.minPlayers ?? 2;
  const maxPlayers = overrides.maxPlayers ?? 100;
  const status = overrides.status || "registering";

  await dataSource.query(
    `INSERT INTO tournaments (id, name, type, buy_in, starting_chips, min_players, max_players, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
    [
      tournamentId,
      name,
      type,
      buyIn,
      startingChips,
      minPlayers,
      maxPlayers,
      status,
    ],
  );

  return { id: tournamentId, name, status };
}

export function authHeader(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
