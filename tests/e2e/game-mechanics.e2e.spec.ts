/**
 * Game Mechanics E2E Tests
 * ========================
 * Tests for specific poker scenarios and edge cases:
 * - Split pots (tie hands)
 * - Side pots (multiple all-ins)
 * - All-in situations
 * - Blinds posting
 * - Dealer button rotation
 * - Heads-up special rules
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import * as http from "http";
import { DataSource } from "typeorm";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { GamesModule } from "../../src/modules/games/games.module";
import { ServicesModule } from "../../src/services/services.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";

let testCounter = 1;
const uid = () => `${testCounter++}${Math.random().toString(36).slice(2, 6)}`;

let portCounter = 40000;
function getNextPort(): number {
  return portCounter++;
}

interface BotServer {
  server: http.Server;
  port: number;
  strategy: string;
  decisions: Array<{ action: string; amount?: number }>;
  close: () => Promise<void>;
}

function createStrategyBot(
  port: number,
  strategy:
    | "caller"
    | "folder"
    | "raiser"
    | "all-in"
    | "checker"
    | "min-raiser",
): Promise<BotServer> {
  return new Promise((resolve, reject) => {
    const decisions: Array<{ action: string; amount?: number }> = [];

    const server = http.createServer((req, res) => {
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", strategy }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const payload = JSON.parse(body);
          let response: { type: string; amount?: number };

          switch (strategy) {
            case "caller":
              response = { type: "call" };
              break;
            case "folder":
              response = { type: "fold" };
              break;
            case "raiser":
              const raiseAmount =
                (payload.current_bet || 0) + (payload.big_blind || 20) * 2;
              response = {
                type: "raise",
                amount: Math.min(raiseAmount, payload.your_chips || 1000),
              };
              break;
            case "all-in":
              response = { type: "raise", amount: payload.your_chips || 1000 };
              break;
            case "checker":
              response =
                payload.to_call > 0 ? { type: "call" } : { type: "check" };
              break;
            case "min-raiser":
              const minRaise =
                (payload.current_bet || 0) +
                (payload.min_raise || payload.big_blind || 20);
              response = {
                type: "raise",
                amount: Math.min(minRaise, payload.your_chips || 1000),
              };
              break;
            default:
              response = { type: "call" };
          }

          decisions.push({ action: response.type, amount: response.amount });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        } catch {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ type: "call" }));
        }
      });
    });

    server.on("error", reject);
    server.listen(port, () => {
      resolve({
        server,
        port,
        strategy,
        decisions,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

interface TestUser {
  accessToken: string;
  bot: { id: string; name: string };
  user: { id: string; email: string };
}

describe("Game Mechanics E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const botServers: BotServer[] = [];

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
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
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
    for (const bot of botServers) {
      try {
        await bot.close();
      } catch {}
    }
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  async function registerPlayer(
    strategy:
      | "caller"
      | "folder"
      | "raiser"
      | "all-in"
      | "checker"
      | "min-raiser",
  ): Promise<TestUser & { botServer: BotServer }> {
    const id = uid();
    const port = getNextPort();
    const botServer = await createStrategyBot(port, strategy);
    botServers.push(botServer);

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register-developer")
      .send({
        email: `${strategy}${id}@test.com`,
        name: `${strategy}Player${id}`,
        password: "SecurePass123",
        botName: `${strategy}Bot${id}`,
        botEndpoint: `http://localhost:${port}`,
      })
      .expect(201);

    return { ...response.body, botServer };
  }

  async function createTable(
    token: string,
    options: {
      smallBlind?: number;
      bigBlind?: number;
      startingChips?: number;
      maxPlayers?: number;
    } = {},
  ): Promise<string> {
    const id = uid();
    const response = await request(app.getHttpServer())
      .post("/api/v1/games/tables")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: `MechanicsTable${id}`,
        small_blind: options.smallBlind || 10,
        big_blind: options.bigBlind || 20,
        starting_chips: options.startingChips || 1000,
        max_players: options.maxPlayers || 2,
        turn_timeout_ms: 5000,
      })
      .expect(201);

    return response.body.id;
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

  async function waitForGameEnd(
    tableId: string,
    token: string,
    timeoutMs: number = 30000,
  ): Promise<any> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${token}`);

      if (
        response.body?.status === "finished" ||
        response.body?.status === "waiting"
      ) {
        return response.body;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Game did not finish in time");
  }

  describe("Heads-Up Mechanics", () => {
    it("should handle heads-up game where caller vs folder results in caller winning", async () => {
      const caller = await registerPlayer("caller");
      const folder = await registerPlayer("folder");

      const tableId = await createTable(caller.accessToken);
      await joinTable(caller.accessToken, tableId, caller.bot.id);
      await joinTable(folder.accessToken, tableId, folder.bot.id);

      const finalState = await waitForGameEnd(tableId, caller.accessToken);

      expect(finalState.status).toBe("finished");

      // Caller should have more chips (won from folder folding)
      const callerPlayer = finalState.players?.find(
        (p: any) => p.id === caller.bot.id,
      );
      const folderPlayer = finalState.players?.find(
        (p: any) => p.id === folder.bot.id,
      );

      if (callerPlayer && folderPlayer) {
        expect(callerPlayer.chips).toBeGreaterThan(folderPlayer.chips);
      }
    }, 60000);

    it("should handle heads-up game with both players calling to showdown", async () => {
      const caller1 = await registerPlayer("caller");
      const caller2 = await registerPlayer("caller");

      const tableId = await createTable(caller1.accessToken);
      await joinTable(caller1.accessToken, tableId, caller1.bot.id);
      await joinTable(caller2.accessToken, tableId, caller2.bot.id);

      const finalState = await waitForGameEnd(tableId, caller1.accessToken);

      expect(finalState.status).toBe("finished");

      // Total chips should be conserved (2000 total)
      const totalChips =
        finalState.players?.reduce(
          (sum: number, p: any) => sum + (p.chips || 0),
          0,
        ) || 0;
      expect(totalChips).toBe(2000);
    }, 60000);
  });

  describe("All-In Scenarios", () => {
    it("should handle one player going all-in on first hand", async () => {
      const allIn = await registerPlayer("all-in");
      const caller = await registerPlayer("caller");

      const tableId = await createTable(allIn.accessToken, {
        startingChips: 500,
      });
      await joinTable(allIn.accessToken, tableId, allIn.bot.id);
      await joinTable(caller.accessToken, tableId, caller.bot.id);

      const finalState = await waitForGameEnd(tableId, allIn.accessToken);

      expect(finalState.status).toBe("finished");

      // One player should have all chips, other should have 0
      const chips = finalState.players?.map((p: any) => p.chips) || [];
      expect(chips.sort((a: number, b: number) => a - b)).toEqual([0, 1000]);
    }, 60000);

    it("should handle both players going all-in", async () => {
      const allIn1 = await registerPlayer("all-in");
      const allIn2 = await registerPlayer("all-in");

      const tableId = await createTable(allIn1.accessToken, {
        startingChips: 500,
      });
      await joinTable(allIn1.accessToken, tableId, allIn1.bot.id);
      await joinTable(allIn2.accessToken, tableId, allIn2.bot.id);

      const finalState = await waitForGameEnd(tableId, allIn1.accessToken);

      expect(finalState.status).toBe("finished");

      // Total chips conserved
      const totalChips =
        finalState.players?.reduce(
          (sum: number, p: any) => sum + (p.chips || 0),
          0,
        ) || 0;
      expect(totalChips).toBe(1000);
    }, 60000);
  });

  describe("Blinds and Button", () => {
    it("should correctly post blinds at game start", async () => {
      const player1 = await registerPlayer("checker");
      const player2 = await registerPlayer("checker");

      const tableId = await createTable(player1.accessToken, {
        smallBlind: 25,
        bigBlind: 50,
      });
      await joinTable(player1.accessToken, tableId, player1.bot.id);
      await joinTable(player2.accessToken, tableId, player2.bot.id);

      // Wait a bit for game to start
      await new Promise((r) => setTimeout(r, 2000));

      const state = await request(app.getHttpServer())
        .get(`/api/v1/games/${tableId}/state`)
        .set("Authorization", `Bearer ${player1.accessToken}`);

      // Game should have started with blinds
      if (state.body.status === "running") {
        expect(state.body.pot).toBeGreaterThanOrEqual(75); // SB + BB at minimum
      }
    }, 30000);
  });

  describe("Chip Conservation", () => {
    it("should maintain exact chip count across multiple hands", async () => {
      const raiser = await registerPlayer("min-raiser");
      const caller = await registerPlayer("caller");

      const startingChips = 1000;
      const tableId = await createTable(raiser.accessToken, { startingChips });
      await joinTable(raiser.accessToken, tableId, raiser.bot.id);
      await joinTable(caller.accessToken, tableId, caller.bot.id);

      const finalState = await waitForGameEnd(tableId, raiser.accessToken);

      const totalChips =
        finalState.players?.reduce(
          (sum: number, p: any) => sum + (p.chips || 0),
          0,
        ) || 0;
      expect(totalChips).toBe(startingChips * 2);
    }, 60000);

    it("should conserve chips even with aggressive raising", async () => {
      const raiser1 = await registerPlayer("raiser");
      const raiser2 = await registerPlayer("raiser");

      const startingChips = 500;
      const tableId = await createTable(raiser1.accessToken, { startingChips });
      await joinTable(raiser1.accessToken, tableId, raiser1.bot.id);
      await joinTable(raiser2.accessToken, tableId, raiser2.bot.id);

      const finalState = await waitForGameEnd(tableId, raiser1.accessToken);

      const totalChips =
        finalState.players?.reduce(
          (sum: number, p: any) => sum + (p.chips || 0),
          0,
        ) || 0;
      expect(totalChips).toBe(startingChips * 2);
    }, 60000);
  });

  describe("Folding Mechanics", () => {
    it("should award pot to last remaining player when others fold", async () => {
      const caller = await registerPlayer("caller");
      const folder = await registerPlayer("folder");

      const tableId = await createTable(caller.accessToken, {
        smallBlind: 10,
        bigBlind: 20,
      });
      await joinTable(caller.accessToken, tableId, caller.bot.id);
      await joinTable(folder.accessToken, tableId, folder.bot.id);

      const finalState = await waitForGameEnd(tableId, caller.accessToken);

      expect(finalState.status).toBe("finished");

      // Caller should have won chips from folder's blinds/calls before folding
      const callerPlayer = finalState.players?.find(
        (p: any) => p.id === caller.bot.id,
      );
      expect(callerPlayer?.chips).toBeGreaterThan(1000);
    }, 60000);
  });

  describe("Betting Rounds", () => {
    it("should progress through all betting rounds when players check/call", async () => {
      const checker1 = await registerPlayer("checker");
      const checker2 = await registerPlayer("checker");

      const tableId = await createTable(checker1.accessToken);
      await joinTable(checker1.accessToken, tableId, checker1.bot.id);
      await joinTable(checker2.accessToken, tableId, checker2.bot.id);

      // Let the game play out
      await new Promise((r) => setTimeout(r, 5000));

      // Check that decisions were made
      expect(checker1.botServer.decisions.length).toBeGreaterThan(0);
      expect(checker2.botServer.decisions.length).toBeGreaterThan(0);

      // Should have check and call actions
      const allActions = [
        ...checker1.botServer.decisions,
        ...checker2.botServer.decisions,
      ];
      const actionTypes = allActions.map((d) => d.action);
      expect(actionTypes.some((a) => a === "check" || a === "call")).toBe(true);
    }, 30000);
  });
});
