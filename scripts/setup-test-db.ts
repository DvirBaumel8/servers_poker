#!/usr/bin/env npx ts-node
/**
 * Test Database Setup Script
 *
 * Sets up a fresh test database with schema and seed data for QA Monster tests.
 * This ensures tests have a consistent starting state with known test accounts.
 *
 * Usage:
 *   npx ts-node scripts/setup-test-db.ts
 *   npm run test:db:setup
 *
 * Environment variables (with defaults for local dev):
 *   TEST_DB_HOST=localhost
 *   TEST_DB_PORT=5432
 *   TEST_DB_USERNAME=postgres
 *   TEST_DB_PASSWORD=postgres
 *   TEST_DB_NAME=poker_test
 */

import { DataSource } from "typeorm";
import { v4 as uuid } from "uuid";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import * as dotenv from "dotenv";
import * as entities from "../src/entities";

dotenv.config();

const TEST_DB_CONFIG = {
  host: process.env.TEST_DB_HOST || "localhost",
  port: parseInt(process.env.TEST_DB_PORT || "5432", 10),
  username: process.env.TEST_DB_USERNAME || "postgres",
  password: process.env.TEST_DB_PASSWORD || "postgres",
  database: process.env.TEST_DB_NAME || "poker_test",
};

const SALT_ROUNDS = 12;
const TEST_PASSWORD = "TestPassword123!";

function hashApiKey(key: string): string {
  const hashSecret =
    process.env.API_KEY_HMAC_SECRET || "development-api-key-hash-secret";
  return crypto
    .pbkdf2Sync(key, hashSecret, 210000, 32, "sha256")
    .toString("hex");
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

interface TestAccount {
  email: string;
  name: string;
  role: "admin" | "user";
  password: string;
}

const TEST_ACCOUNTS: TestAccount[] = [
  { email: "admin@poker.io", name: "Admin User", role: "admin", password: TEST_PASSWORD },
  { email: "test@test.local", name: "Test User", role: "user", password: TEST_PASSWORD },
  { email: "alice@example.com", name: "Alice", role: "user", password: TEST_PASSWORD },
  { email: "bob@example.com", name: "Bob", role: "user", password: TEST_PASSWORD },
];

async function setupTestDatabase(): Promise<void> {
  console.log("🔧 Test Database Setup");
  console.log("=".repeat(50));
  console.log(`Host: ${TEST_DB_CONFIG.host}:${TEST_DB_CONFIG.port}`);
  console.log(`Database: ${TEST_DB_CONFIG.database}`);
  console.log();

  const dataSource = new DataSource({
    type: "postgres",
    ...TEST_DB_CONFIG,
    entities: Object.values(entities),
    synchronize: true,
    dropSchema: true,
    logging: false,
  });

  try {
    console.log("📦 Connecting to database...");
    await dataSource.initialize();
    console.log("✅ Connected and schema synchronized\n");

    const queryRunner = dataSource.createQueryRunner();

    console.log("👤 Creating test accounts...");
    const passwordHash = await hashPassword(TEST_PASSWORD);

    for (const account of TEST_ACCOUNTS) {
      const userId = uuid();
      const apiKey = `api_${uuid().replace(/-/g, "")}`;
      const apiKeyHash = hashApiKey(apiKey);

      await queryRunner.query(
        `INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW(), NOW())
         ON CONFLICT (email) DO UPDATE SET password_hash = $4, email_verified = true`,
        [userId, account.email, account.name, passwordHash, apiKeyHash, account.role]
      );
      console.log(`   ✓ ${account.email} (${account.role})`);
    }

    console.log("\n🎰 Creating sample data...");

    // Create sample tournaments
    const tournaments = [
      { name: "Test Tournament 1", status: "registering", buyIn: 100, startingChips: 1000 },
      { name: "Test Tournament 2", status: "running", buyIn: 50, startingChips: 500 },
      { name: "Test Tournament 3", status: "finished", buyIn: 200, startingChips: 2000 },
    ];

    for (const t of tournaments) {
      const tid = uuid();
      await queryRunner.query(
        `INSERT INTO tournaments (id, name, type, status, buy_in, starting_chips, min_players, max_players, players_per_table, created_at, updated_at)
         VALUES ($1, $2, 'rolling', $3, $4, $5, 2, 10, 9, NOW(), NOW())`,
        [tid, t.name, t.status, t.buyIn, t.startingChips]
      );
      console.log(`   ✓ ${t.name} (${t.status})`);
    }

    // Create sample tables
    const tables = [
      { name: "Test Table 1", smallBlind: 10, bigBlind: 20, maxPlayers: 9 },
      { name: "Test Table 2", smallBlind: 25, bigBlind: 50, maxPlayers: 6 },
    ];

    for (const table of tables) {
      await queryRunner.query(
        `INSERT INTO tables (id, name, small_blind, big_blind, max_players, starting_chips, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 1000, 'waiting', NOW(), NOW())`,
        [uuid(), table.name, table.smallBlind, table.bigBlind, table.maxPlayers]
      );
      console.log(`   ✓ ${table.name}`);
    }

    console.log("\n" + "=".repeat(50));
    console.log("✅ Test database setup complete!\n");
    console.log("Test accounts (all passwords: " + TEST_PASSWORD + "):");
    for (const account of TEST_ACCOUNTS) {
      console.log(`   - ${account.email} (${account.role})`);
    }
    console.log();

    await dataSource.destroy();
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupTestDatabase();
}

export { setupTestDatabase, TEST_ACCOUNTS, TEST_PASSWORD };
