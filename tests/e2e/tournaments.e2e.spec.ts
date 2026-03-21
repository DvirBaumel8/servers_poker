import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import request from "supertest";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { GamesModule } from "../../src/modules/games/games.module";
import { TournamentsModule } from "../../src/modules/tournaments/tournaments.module";
import { ServicesModule } from "../../src/services/services.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { v4 as uuidv4 } from "uuid";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface TestUser {
  accessToken: string;
  userId: string;
}

interface TestBot {
  id: string;
  name: string;
}

interface TestContext {
  user: TestUser;
  bots: TestBot[];
}

describe("Tournaments E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  async function createTestUser(
    emailPrefix = "tournamentowner",
  ): Promise<TestUser> {
    const id = uid();
    const email = `${emailPrefix}-${id}@example.com`;
    const name = `TournamentOwner-${id}`;
    const userId = uuidv4();
    const passwordHash =
      "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.3L8KJ5h1V5OGRC";
    const apiKeyHash = uuidv4().replace(/-/g, "");

    // Create user directly in DB
    await dataSource.query(
      `INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'user', true, true, NOW(), NOW())`,
      [userId, email, name, passwordHash, apiKeyHash],
    );

    // Generate JWT token
    const accessToken = jwtService.sign(
      { sub: userId, email },
      { expiresIn: "1h" },
    );

    return {
      accessToken,
      userId,
    };
  }

  async function createTestBot(
    accessToken: string,
    namePrefix = "TourneyBot",
  ): Promise<TestBot> {
    const id = uid();
    const port = 19000 + Math.floor(Math.random() * 1000);
    const response = await request(app.getHttpServer())
      .post("/api/v1/bots")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: `${namePrefix}-${id}`,
        endpoint: `http://localhost:${port}`,
      });

    return {
      id: response.body.id,
      name: response.body.name,
    };
  }

  async function createTestContext(botCount = 3): Promise<TestContext> {
    const user = await createTestUser();
    const bots: TestBot[] = [];

    for (let i = 0; i < botCount; i++) {
      const bot = await createTestBot(user.accessToken, `TourneyBot${i + 1}`);
      bots.push(bot);
    }

    return { user, bots };
  }

  async function createTestTournament(
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
        GamesModule,
        TournamentsModule,
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
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await app.close();
  });

  describe.concurrent("Tournament CRUD Operations", () => {
    it("should create a scheduled tournament", async () => {
      const { user } = await createTestContext(0);

      const response = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          name: `Weekly-Tournament-${uid()}`,
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 100,
        })
        .expect(201);

      expect(response.body.name).toMatch(/^Weekly-Tournament-/);
      expect(response.body.type).toBe("scheduled");
      expect(response.body.buy_in).toBe(100);
      expect(response.body.status).toBe("registering");
    });

    it("should create a sit-n-go tournament", async () => {
      const { user } = await createTestContext(0);

      const response = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          name: `SNG-Tournament-${uid()}`,
          type: "sit_n_go",
          buy_in: 50,
          starting_chips: 500,
          min_players: 3,
          max_players: 9,
        })
        .expect(201);

      expect(response.body.type).toBe("sit_n_go");
      expect(response.body.min_players).toBe(3);
    });

    it("should list all tournaments", async () => {
      const { user } = await createTestContext(0);

      await createTestTournament(user.accessToken, {
        name: `Tournament1-${uid()}`,
      });
      await createTestTournament(user.accessToken, {
        name: `Tournament2-${uid()}`,
        type: "sit_n_go",
        buy_in: 50,
        starting_chips: 500,
        max_players: 9,
      });

      const response = await request(app.getHttpServer())
        .get("/api/v1/tournaments")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    it("should get tournament by ID", async () => {
      const { user } = await createTestContext(0);
      const tournamentName = `GetTournament-${uid()}`;

      const createResponse = await createTestTournament(user.accessToken, {
        name: tournamentName,
      });
      const tournamentId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/${tournamentId}`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(tournamentId);
      expect(response.body.name).toBe(tournamentName);
    });
  });

  describe.concurrent("Tournament Validation", () => {
    it("should reject tournament with invalid type", async () => {
      const { user } = await createTestContext(0);

      await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          name: `InvalidTournament-${uid()}`,
          type: "invalid_type",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        })
        .expect(400);
    });

    it("should reject tournament with negative buy-in", async () => {
      const { user } = await createTestContext(0);

      await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          name: `NegativeBuyIn-${uid()}`,
          type: "scheduled",
          buy_in: -50,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        })
        .expect(400);
    });

    it("should reject tournament with min_players > max_players", async () => {
      const { user } = await createTestContext(0);

      await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          name: `InvalidPlayers-${uid()}`,
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 20,
          max_players: 10,
        })
        .expect(400);
    });
  });

  describe.concurrent("Tournament Registration", () => {
    it("should allow bot to register for tournament", async () => {
      const { user, bots } = await createTestContext(1);

      const tournamentResponse = await createTestTournament(user.accessToken, {
        name: `RegistrationTournament-${uid()}`,
      });
      const tournamentId = tournamentResponse.body.id;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          bot_id: bots[0].id,
        })
        .expect(201);

      expect(response.body).toHaveProperty("success");
      expect(response.body.success).toBe(true);
    });

    it("should reject duplicate registration", async () => {
      const { user, bots } = await createTestContext(1);

      const tournamentResponse = await createTestTournament(user.accessToken, {
        name: `DuplicateRegTournament-${uid()}`,
      });
      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          bot_id: bots[0].id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          bot_id: bots[0].id,
        })
        .expect(409);
    });

    it("should reject second bot from same owner registering for tournament", async () => {
      const { user, bots } = await createTestContext(2);

      const tournamentResponse = await createTestTournament(user.accessToken, {
        name: `MultiRegTournament-${uid()}`,
      });
      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          bot_id: bots[0].id,
        })
        .expect(201);

      const reg2Response = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          bot_id: bots[1].id,
        })
        .expect(400);

      expect(reg2Response.body.message).toContain("You already have a bot");
      expect(reg2Response.body.message).toContain(
        "Only one bot per player allowed",
      );
    });

    it("should allow bots from different owners to register", async () => {
      const { user: user1, bots: bots1 } = await createTestContext(1);
      const user2 = await createTestUser("tournamentowner2");
      const user2Bot = await createTestBot(
        user2.accessToken,
        "User2TournamentBot",
      );

      const tournamentResponse = await createTestTournament(user1.accessToken, {
        name: `MultiOwnerTournament-${uid()}`,
      });
      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user1.accessToken}`)
        .send({
          bot_id: bots1[0].id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user2.accessToken}`)
        .send({
          bot_id: user2Bot.id,
        })
        .expect(201);
    });

    it("should allow bot to unregister from tournament", async () => {
      const { user, bots } = await createTestContext(1);

      const tournamentResponse = await createTestTournament(user.accessToken, {
        name: `UnregisterTournament-${uid()}`,
      });
      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          bot_id: bots[0].id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/tournaments/${tournamentId}/register/${bots[0].id}`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          bot_id: bots[0].id,
        })
        .expect(201);
    });
  });

  describe.concurrent("Tournament Status", () => {
    it("should get tournament state", async () => {
      const user1 = await createTestUser("stateowner1");
      const user2 = await createTestUser("stateowner2");
      const bot1 = await createTestBot(user1.accessToken, "StateBot1");
      const bot2 = await createTestBot(user2.accessToken, "StateBot2");

      const tournamentResponse = await createTestTournament(user1.accessToken, {
        name: `StateTournament-${uid()}`,
      });
      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user1.accessToken}`)
        .send({
          bot_id: bot1.id,
        });

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user2.accessToken}`)
        .send({
          bot_id: bot2.id,
        });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/${tournamentId}/state`)
        .set("Authorization", `Bearer ${user1.accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("tournament");
      expect(response.body).toHaveProperty("entries");
    });

    it("should get tournament leaderboard", async () => {
      const { user } = await createTestContext(0);

      const tournamentResponse = await createTestTournament(user.accessToken, {
        name: `LeaderboardTournament-${uid()}`,
      });
      const tournamentId = tournamentResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/${tournamentId}/leaderboard`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe.concurrent("Tournament Access Control", () => {
    it("should reject registration for non-existent tournament", async () => {
      const { user, bots } = await createTestContext(1);

      await request(app.getHttpServer())
        .post("/api/v1/tournaments/non-existent-id/register")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          bot_id: bots[0].id,
        })
        .expect(404);
    });

    it("should reject registration for non-existent bot", async () => {
      const { user } = await createTestContext(0);

      const tournamentResponse = await createTestTournament(user.accessToken, {
        name: `FakeBotTournament-${uid()}`,
      });
      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          bot_id: "non-existent-bot-id",
        })
        .expect(404);
    });
  });
});
