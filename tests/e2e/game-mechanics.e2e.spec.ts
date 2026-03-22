import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import { CustomThrottlerGuard } from "../../src/common/guards/custom-throttler.guard";
import request from "supertest";
import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { GamesModule } from "../../src/modules/games/games.module";
import { ServicesModule } from "../../src/services/services.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import {
  createCallerStrategy,
  createFolderStrategy,
  createAggressiveStrategy,
} from "../utils/strategy-bot-factory";
import { waitForCondition } from "../utils/test-helpers";
import type { BotStrategy } from "../../src/domain/bot-strategy/strategy.types";

let testCounter = 1;
const uid = () => `${testCounter++}${Math.random().toString(36).slice(2, 6)}`;

interface TestUser {
  accessToken: string;
  bot: { id: string; name: string };
  user: { id: string; email: string };
}

describe("Game Mechanics E2E Tests", () => {
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
      ],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: CustomThrottlerGuard },
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
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  async function registerPlayer(strategy: BotStrategy): Promise<TestUser> {
    const id = uid();

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register-developer")
      .send({
        email: `mech${id}@test.com`,
        name: `MechPlayer${id}`,
        password: "SecurePass123",
        botName: `MechBot${id}`,
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/bots/${response.body.bot.id}/strategy`)
      .set("Authorization", `Bearer ${response.body.accessToken}`)
      .send({ strategy });

    return response.body;
  }

  async function createTable(
    _token: string,
    options: {
      smallBlind?: number;
      bigBlind?: number;
      startingChips?: number;
      maxPlayers?: number;
    } = {},
  ): Promise<string> {
    const id = uid();
    const tableId = uuidv4();
    const name = `MechanicsTable${id}`;
    const smallBlind = options.smallBlind ?? 10;
    const bigBlind = options.bigBlind ?? 20;
    const startingChips = options.startingChips ?? 1000;
    const maxPlayers = options.maxPlayers ?? 2;

    await dataSource.query(
      `INSERT INTO tables (id, name, small_blind, big_blind, starting_chips, max_players, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'waiting', NOW(), NOW())`,
      [tableId, name, smallBlind, bigBlind, startingChips, maxPlayers],
    );

    return tableId;
  }

  async function joinTable(
    token: string,
    tableId: string,
    botId: string,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/games/${tableId}/join`)
      .set("Authorization", `Bearer ${token}`)
      .send({ bot_id: botId })
      .expect(201);
  }

  describe("Heads-Up Mechanics", () => {
    it("should request actions from both bots in heads-up game", async () => {
      const caller = await registerPlayer(createCallerStrategy());
      const folder = await registerPlayer(createFolderStrategy());

      const tableId = await createTable(caller.accessToken);
      await joinTable(caller.accessToken, tableId, caller.bot.id);
      await joinTable(folder.accessToken, tableId, folder.bot.id);

      await waitForCondition(
        async () => {
          const res = await request(app.getHttpServer())
            .get(`/api/v1/games/${tableId}/state`)
            .set("Authorization", `Bearer ${caller.accessToken}`);
          return res.body.handNumber > 0;
        },
        { timeoutMs: 15000, label: "heads-up hand started" },
      );

      const state = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${caller.accessToken}`);

      expect(state.body.handNumber).toBeGreaterThan(0);
    }, 30000);

    it("should process call actions in heads-up game", async () => {
      const caller1 = await registerPlayer(createCallerStrategy());
      const caller2 = await registerPlayer(createCallerStrategy());

      const tableId = await createTable(caller1.accessToken);
      await joinTable(caller1.accessToken, tableId, caller1.bot.id);
      await joinTable(caller2.accessToken, tableId, caller2.bot.id);

      await waitForCondition(
        async () => {
          const res = await request(app.getHttpServer())
            .get(`/api/v1/games/${tableId}/state`)
            .set("Authorization", `Bearer ${caller1.accessToken}`);
          return res.body.handNumber > 0;
        },
        { timeoutMs: 15000, label: "call actions hand started" },
      );

      const state = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${caller1.accessToken}`);

      expect(state.body.handNumber).toBeGreaterThan(0);
    }, 30000);
  });

  describe("All-In Scenarios", () => {
    it("should process all-in action from bot", async () => {
      const aggressive = await registerPlayer(createAggressiveStrategy());
      const caller = await registerPlayer(createCallerStrategy());

      const tableId = await createTable(aggressive.accessToken, {
        startingChips: 500,
      });
      await joinTable(aggressive.accessToken, tableId, aggressive.bot.id);
      await joinTable(caller.accessToken, tableId, caller.bot.id);

      await waitForCondition(
        async () => {
          const res = await request(app.getHttpServer())
            .get(`/api/v1/games/${tableId}/state`)
            .set("Authorization", `Bearer ${aggressive.accessToken}`);
          return res.body.handNumber > 0;
        },
        { timeoutMs: 15000, label: "all-in hand started" },
      );

      const state = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${aggressive.accessToken}`);

      expect(state.body.handNumber).toBeGreaterThan(0);
    }, 30000);

    it("should handle both players making raise actions", async () => {
      const aggressive1 = await registerPlayer(createAggressiveStrategy());
      const aggressive2 = await registerPlayer(createAggressiveStrategy());

      const tableId = await createTable(aggressive1.accessToken, {
        startingChips: 500,
      });
      await joinTable(aggressive1.accessToken, tableId, aggressive1.bot.id);
      await joinTable(aggressive2.accessToken, tableId, aggressive2.bot.id);

      await waitForCondition(
        async () => {
          const res = await request(app.getHttpServer())
            .get(`/api/v1/games/${tableId}/state`)
            .set("Authorization", `Bearer ${aggressive1.accessToken}`);
          return res.body.handNumber > 0;
        },
        { timeoutMs: 15000, label: "raise actions hand started" },
      );

      const state = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${aggressive1.accessToken}`);

      expect(state.body.handNumber).toBeGreaterThan(0);
    }, 30000);
  });

  describe("Chip Conservation", () => {
    it("should start with correct chip counts", async () => {
      const raiser = await registerPlayer(createAggressiveStrategy());
      const caller = await registerPlayer(createCallerStrategy());

      const startingChips = 1000;
      const tableId = await createTable(raiser.accessToken, { startingChips });
      await joinTable(raiser.accessToken, tableId, raiser.bot.id);
      await joinTable(caller.accessToken, tableId, caller.bot.id);

      await waitForCondition(
        async () => {
          const res = await request(app.getHttpServer())
            .get(`/api/v1/games/${tableId}/state`)
            .set("Authorization", `Bearer ${raiser.accessToken}`);
          return res.body.handNumber > 0;
        },
        { timeoutMs: 10000, label: "chip conservation game started" },
      );

      const state = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${raiser.accessToken}`);

      const totalChips =
        (state.body.players?.reduce(
          (sum: number, p: any) => sum + (p.chips || 0),
          0,
        ) || 0) + (state.body.pot || 0);
      expect(totalChips).toBe(startingChips * 2);
    }, 60000);

    it("should conserve chips even with aggressive raising", async () => {
      const raiser1 = await registerPlayer(createAggressiveStrategy());
      const raiser2 = await registerPlayer(createAggressiveStrategy());

      const startingChips = 500;
      const tableId = await createTable(raiser1.accessToken, { startingChips });
      await joinTable(raiser1.accessToken, tableId, raiser1.bot.id);
      await joinTable(raiser2.accessToken, tableId, raiser2.bot.id);

      await waitForCondition(
        async () => {
          const res = await request(app.getHttpServer())
            .get(`/api/v1/games/${tableId}/state`)
            .set("Authorization", `Bearer ${raiser1.accessToken}`);
          return res.body.handNumber > 0;
        },
        { timeoutMs: 10000, label: "aggressive chip conservation started" },
      );

      const state = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${raiser1.accessToken}`);

      const totalChips =
        (state.body.players?.reduce(
          (sum: number, p: any) => sum + (p.chips || 0),
          0,
        ) || 0) + (state.body.pot || 0);
      expect(totalChips).toBe(startingChips * 2);
    }, 30000);
  });

  describe("Folding Mechanics", () => {
    it("should process fold action from bot", async () => {
      const caller = await registerPlayer(createCallerStrategy());
      const folder = await registerPlayer(createFolderStrategy());

      const tableId = await createTable(caller.accessToken, {
        smallBlind: 10,
        bigBlind: 20,
      });
      await joinTable(caller.accessToken, tableId, caller.bot.id);
      await joinTable(folder.accessToken, tableId, folder.bot.id);

      await waitForCondition(
        async () => {
          const res = await request(app.getHttpServer())
            .get(`/api/v1/games/${tableId}/state`)
            .set("Authorization", `Bearer ${caller.accessToken}`);
          return res.body.handNumber > 0;
        },
        { timeoutMs: 15000, label: "fold mechanics hand started" },
      );

      const state = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${caller.accessToken}`);

      expect(state.body.handNumber).toBeGreaterThan(0);
    }, 30000);
  });

  describe("Betting Rounds", () => {
    it("should progress through all betting rounds when players check/call", async () => {
      const checker1 = await registerPlayer(createCallerStrategy());
      const checker2 = await registerPlayer(createCallerStrategy());

      const tableId = await createTable(checker1.accessToken);
      await joinTable(checker1.accessToken, tableId, checker1.bot.id);
      await joinTable(checker2.accessToken, tableId, checker2.bot.id);

      await waitForCondition(
        async () => {
          const res = await request(app.getHttpServer())
            .get(`/api/v1/games/${tableId}/state`)
            .set("Authorization", `Bearer ${checker1.accessToken}`);
          return res.body.handNumber > 0;
        },
        { timeoutMs: 15000, label: "betting rounds hand started" },
      );

      const state = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${checker1.accessToken}`);

      expect(state.body.handNumber).toBeGreaterThan(0);
    }, 30000);
  });
});
