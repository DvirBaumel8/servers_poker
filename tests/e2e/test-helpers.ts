/**
 * Shared E2E test helpers
 * Used by multiple E2E test files for consistent user/bot/tournament creation
 */

import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import request from "supertest";

export const uid = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export interface TestUser {
  accessToken: string;
  userId: string;
}

export interface TestBot {
  id: string;
  name: string;
}

export interface TestContext {
  user: TestUser;
  bots: TestBot[];
}

/**
 * Create a test user in the database and generate a JWT token
 * Default role is "admin" for test convenience
 */
export async function createTestUser(
  app: INestApplication,
  dataSource: DataSource,
  jwtService: JwtService,
  emailPrefix = "testuser",
  role = "admin",
): Promise<TestUser> {
  const id = uid();
  const email = `${emailPrefix}-${id}@example.com`;
  const name = `TestUser-${id}`;
  const userId = uuidv4();
  const passwordHash =
    "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.3L8KJ5h1V5OGRC";

  await dataSource.query(
    `INSERT INTO users (id, email, name, password_hash, role, active, email_verified, subscription_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, true, 'active', NOW(), NOW())`,
    [userId, email, name, passwordHash, role],
  );

  // Generate JWT token
  const accessToken = jwtService.sign(
    { sub: userId, email, role },
    { expiresIn: "1h" },
  );

  return {
    accessToken,
    userId,
  };
}

/**
 * Create a test bot via POST /bots/internal
 */
export async function createTestBot(
  app: INestApplication,
  accessToken: string,
  namePrefix = "TestBot",
): Promise<TestBot> {
  const id = uid();
  const botName = `${namePrefix}${id}`.replace(/-/g, "");
  const response = await request(app.getHttpServer())
    .post("/api/v1/bots/internal")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      name: botName,
      strategy: {
        version: 1,
        tier: "quick",
        personality: {
          aggression: 50,
          bluffFrequency: 30,
          riskTolerance: 50,
          tightness: 50,
        },
      },
    });

  if (response.status !== 201) {
    throw new Error(
      `Failed to create bot: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return {
    id: response.body.id,
    name: response.body.name,
  };
}

/**
 * Create a tournament via POST /tournaments
 */
export async function createTestTournament(
  app: INestApplication,
  accessToken: string,
  overrides: Record<string, unknown> = {},
) {
  const id = uid();
  const response = await request(app.getHttpServer())
    .post("/api/v1/tournaments")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      name: `Tournament-${id}`,
      type: "scheduled",
      buy_in: 100,
      starting_chips: 1000,
      min_players: 2,
      max_players: 50,
      ...overrides,
    });

  return response;
}

/**
 * Create a test context with a user and multiple bots
 */
export async function createTestContext(
  app: INestApplication,
  dataSource: DataSource,
  jwtService: JwtService,
  botCount = 3,
): Promise<TestContext> {
  const user = await createTestUser(app, dataSource, jwtService);
  const bots: TestBot[] = [];

  for (let i = 0; i < botCount; i++) {
    const bot = await createTestBot(app, user.accessToken, `Bot${i + 1}`);
    bots.push(bot);
  }

  return { user, bots };
}

/**
 * Create a tournament with 2 players and instantly mark it as finished in the database
 * Useful for testing tournament results endpoints without waiting for actual game completion
 *
 * @returns { tournamentId, user1, user2, bot1, bot2 }
 */
export async function createAndCompleteTournament(
  app: INestApplication,
  dataSource: DataSource,
  jwtService: JwtService,
): Promise<{
  tournamentId: string;
  user1: TestUser;
  user2: TestUser;
  bot1: TestBot;
  bot2: TestBot;
}> {
  // Create 2 users and 2 bots
  const user1 = await createTestUser(
    app,
    dataSource,
    jwtService,
    "tournament-p1",
  );
  const user2 = await createTestUser(
    app,
    dataSource,
    jwtService,
    "tournament-p2",
  );
  const bot1 = await createTestBot(app, user1.accessToken, "TourneyBot1");
  const bot2 = await createTestBot(app, user2.accessToken, "TourneyBot2");

  // Create tournament
  const tournamentResponse = await createTestTournament(
    app,
    user1.accessToken,
    {
      name: `QuickTournament-${uid()}`,
      min_players: 2,
      max_players: 2,
      starting_chips: 100,
    },
  );

  if (tournamentResponse.status !== 201) {
    throw new Error(
      `Failed to create tournament: ${tournamentResponse.status}`,
    );
  }

  const tournamentId = tournamentResponse.body.id;

  // Register both bots
  await request(app.getHttpServer())
    .post(`/api/v1/tournaments/${tournamentId}/register`)
    .set("Authorization", `Bearer ${user1.accessToken}`)
    .send({ bot_id: bot1.id })
    .expect(201);

  await request(app.getHttpServer())
    .post(`/api/v1/tournaments/${tournamentId}/register`)
    .set("Authorization", `Bearer ${user2.accessToken}`)
    .send({ bot_id: bot2.id })
    .expect(201);

  // Wait 1 second for tournament to start
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Mark tournament as finished in database (simulate instant completion)
  await dataSource.query(
    `UPDATE tournaments SET status = 'finished', finished_at = NOW() WHERE id = $1`,
    [tournamentId],
  );

  // Create tournament entries for results
  await dataSource.query(
    `UPDATE tournament_entries
     SET finish_position = CASE WHEN bot_id = $1 THEN 1 ELSE 2 END,
         payout = CASE WHEN bot_id = $1 THEN 300 ELSE 0 END
     WHERE tournament_id = $2`,
    [bot1.id, tournamentId],
  );

  return {
    tournamentId,
    user1,
    user2,
    bot1,
    bot2,
  };
}
