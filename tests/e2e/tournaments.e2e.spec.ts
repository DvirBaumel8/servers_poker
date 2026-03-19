import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import * as request from "supertest";
import { DataSource } from "typeorm";
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

describe("Tournaments E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: string;
  let bot1Id: string;
  let bot2Id: string;
  let bot3Id: string;

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
        ThrottlerModule.forRoot([
          {
            ttl: 60000,
            limit: 1000,
          },
        ]),
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
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await app.close();
  });

  beforeEach(async () => {
    const tableNames = dataSource.entityMetadatas
      .map((entity) => `"${entity.tableName}"`)
      .join(", ");

    if (tableNames) {
      await dataSource.query(
        `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`,
      );
    }

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: "tournamentowner@example.com",
        name: "TournamentOwner",
        password: "SecurePassword123!",
      });

    accessToken = response.body.accessToken;
    userId = response.body.user.id;

    const bot1 = await request(app.getHttpServer())
      .post("/api/v1/bots")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "TourneyBot1",
        endpoint: "http://localhost:19101",
      });
    bot1Id = bot1.body.id;

    const bot2 = await request(app.getHttpServer())
      .post("/api/v1/bots")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "TourneyBot2",
        endpoint: "http://localhost:19102",
      });
    bot2Id = bot2.body.id;

    const bot3 = await request(app.getHttpServer())
      .post("/api/v1/bots")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "TourneyBot3",
        endpoint: "http://localhost:19103",
      });
    bot3Id = bot3.body.id;
  });

  describe("Tournament CRUD Operations", () => {
    it("should create a scheduled tournament", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Weekly Tournament",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 100,
        })
        .expect(201);

      expect(response.body.name).toBe("Weekly Tournament");
      expect(response.body.type).toBe("scheduled");
      expect(response.body.buy_in).toBe(100);
      expect(response.body.status).toBe("registering");
    });

    it("should create a sit-n-go tournament", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "SNG Tournament",
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
      await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Tournament1",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        });

      await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Tournament2",
          type: "sit_n_go",
          buy_in: 50,
          starting_chips: 500,
          min_players: 2,
          max_players: 9,
        });

      const response = await request(app.getHttpServer())
        .get("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    it("should get tournament by ID", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "GetTournament",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        });

      const tournamentId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/${tournamentId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(tournamentId);
      expect(response.body.name).toBe("GetTournament");
    });
  });

  describe("Tournament Validation", () => {
    it("should reject tournament with invalid type", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "InvalidTournament",
          type: "invalid_type",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        })
        .expect(400);
    });

    it("should reject tournament with negative buy-in", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "NegativeBuyIn",
          type: "scheduled",
          buy_in: -50,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        })
        .expect(400);
    });

    it("should reject tournament with min_players > max_players", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "InvalidPlayers",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 20,
          max_players: 10,
        })
        .expect(400);
    });
  });

  describe("Tournament Registration", () => {
    it("should allow bot to register for tournament", async () => {
      const tournamentResponse = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "RegistrationTournament",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        });

      const tournamentId = tournamentResponse.body.id;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      expect(response.body).toHaveProperty("success");
      expect(response.body.success).toBe(true);
    });

    it("should reject duplicate registration", async () => {
      const tournamentResponse = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "DuplicateRegTournament",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        });

      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(409);
    });

    it("should reject second bot from same owner registering for tournament", async () => {
      const tournamentResponse = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "MultiRegTournament",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        });

      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      const reg2Response = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot2Id,
        })
        .expect(400);

      expect(reg2Response.body.message).toContain(
        "You already have a bot",
      );
      expect(reg2Response.body.message).toContain(
        "Only one bot per player allowed",
      );
    });

    it("should allow bots from different owners to register", async () => {
      // Create second user with their own bot
      const user2Response = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "tournamentowner2@example.com",
          name: "TournamentOwner2",
          password: "SecurePassword123!",
        });

      const user2Token = user2Response.body.accessToken;

      const user2BotResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          name: "User2TournamentBot",
          endpoint: "http://localhost:19003",
        });

      const user2BotId = user2BotResponse.body.id;

      const tournamentResponse = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "MultiOwnerTournament",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        });

      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          bot_id: user2BotId,
        })
        .expect(201);
    });

    it("should allow bot to unregister from tournament", async () => {
      const tournamentResponse = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "UnregisterTournament",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        });

      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/tournaments/${tournamentId}/register/${bot1Id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(201);
    });
  });

  describe("Tournament Status", () => {
    it("should get tournament state", async () => {
      const tournamentResponse = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "StateTournament",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        });

      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        });

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot2Id,
        });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/${tournamentId}/state`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty("tournament");
      expect(response.body).toHaveProperty("entries");
    });

    it("should get tournament leaderboard", async () => {
      const tournamentResponse = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "LeaderboardTournament",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        });

      const tournamentId = tournamentResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/tournaments/${tournamentId}/leaderboard`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe("Tournament Access Control", () => {
    it("should reject registration for non-existent tournament", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/tournaments/non-existent-id/register")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: bot1Id,
        })
        .expect(404);
    });

    it("should reject registration for non-existent bot", async () => {
      const tournamentResponse = await request(app.getHttpServer())
        .post("/api/v1/tournaments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "FakeBotTournament",
          type: "scheduled",
          buy_in: 100,
          starting_chips: 1000,
          min_players: 2,
          max_players: 50,
        });

      const tournamentId = tournamentResponse.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: "non-existent-bot-id",
        })
        .expect(404);
    });
  });
});
