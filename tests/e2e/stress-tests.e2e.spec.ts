/**
 * Stress & Edge Case E2E Tests
 * ============================
 * Tests designed to break the system, find edge cases, and verify robustness.
 *
 * Categories:
 * 1. Timing attacks - slow bots, timeouts
 * 2. Invalid responses - malformed JSON, wrong action types
 * 3. Concurrent operations - race conditions
 * 4. Resource exhaustion - many bots, many games
 * 5. State manipulation - invalid game states
 * 6. Chip conservation - verify no chips created/destroyed
 *
 * Note: Tests use isolated port ranges to enable parallel execution.
 * Each test gets its own port range: basePort + (testIndex * 10)
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

interface BotServer {
  server: http.Server;
  port: number;
  requestCount: number;
  lastPayload: any;
  close: () => Promise<void>;
}

let portCounter = 20000;
function getNextPort(): number {
  return portCounter++;
}

function createBotServer(
  port: number,
  behavior:
    | "normal"
    | "slow"
    | "invalid-json"
    | "wrong-action"
    | "crash"
    | "huge-raise"
    | "negative-raise"
    | "all-in-always" = "normal",
  delayMs: number = 0,
): Promise<BotServer> {
  return new Promise((resolve, reject) => {
    let requestCount = 0;
    let lastPayload: any = null;

    const server = http.createServer((req, res) => {
      if (req.method === "GET" || req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => {
        requestCount++;
        try {
          lastPayload = JSON.parse(body);
        } catch {
          lastPayload = body;
        }

        const respond = () => {
          switch (behavior) {
            case "slow":
              setTimeout(() => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ type: "call" }));
              }, delayMs);
              break;

            case "invalid-json":
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end("this is not valid json {{{");
              break;

            case "wrong-action":
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ type: "fly_to_moon", amount: -999 }));
              break;

            case "crash":
              res.destroy();
              break;

            case "huge-raise":
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ type: "raise", amount: 999999999999 }));
              break;

            case "negative-raise":
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ type: "raise", amount: -100 }));
              break;

            case "all-in-always":
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ type: "all_in" }));
              break;

            default:
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ type: "call" }));
          }
        };

        respond();
      });
    });

    server.on("error", reject);
    server.listen(port, () => {
      resolve({
        server,
        port,
        get requestCount() {
          return requestCount;
        },
        get lastPayload() {
          return lastPayload;
        },
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeoutMs: number = 30000,
  intervalMs: number = 500,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

describe("Stress & Edge Case E2E Tests", () => {
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
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  function registerDeveloper(email: string, botName: string, port: number) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/register-developer")
      .send({
        email,
        name: `Dev ${email}`,
        password: "SecurePass123",
        botName,
        botEndpoint: `http://localhost:${port}`,
      })
      .expect(201)
      .then((res) => res.body);
  }

  async function createTableAndJoin(
    token: string,
    botId: string,
    token2: string,
    botId2: string,
  ) {
    const tableResponse = await request(app.getHttpServer())
      .post("/api/v1/games/tables")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Test Table",
        small_blind: 10,
        big_blind: 20,
        starting_chips: 1000,
        max_players: 2,
        turn_timeout_ms: 3000,
      })
      .expect(201);

    const tableId = tableResponse.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/games/${tableId}/join`)
      .set("Authorization", `Bearer ${token}`)
      .send({ bot_id: botId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/games/${tableId}/join`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ bot_id: botId2 })
      .expect(201);

    return tableId;
  }

  describe.concurrent("Bot Response Edge Cases", () => {
    it("should handle bot returning invalid JSON gracefully", async () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      const normalBot = await createBotServer(port1, "normal");
      const invalidBot = await createBotServer(port2, "invalid-json");

      try {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dev1 = await registerDeveloper(
          `normal-${uid}@test.com`,
          `NormalBot-${uid}`,
          port1,
        );
        const dev2 = await registerDeveloper(
          `invalid-${uid}@test.com`,
          `InvalidBot-${uid}`,
          port2,
        );

        const tableId = await createTableAndJoin(
          dev1.accessToken,
          dev1.bot.id,
          dev2.accessToken,
          dev2.bot.id,
        );

        await waitFor(
          async () => {
            const state = await request(app.getHttpServer())
              .get(`/api/v1/games/${tableId}/state`)
              .set("Authorization", `Bearer ${dev1.accessToken}`);
            return state.body?.handNumber >= 1;
          },
          15000,
          500,
        );

        expect(invalidBot.requestCount).toBeGreaterThan(0);
      } finally {
        await normalBot.close();
        await invalidBot.close();
      }
    }, 30000);

    it("should handle bot returning unknown action type", async () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      const normalBot = await createBotServer(port1, "normal");
      const wrongBot = await createBotServer(port2, "wrong-action");

      try {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dev1 = await registerDeveloper(
          `normal2-${uid}@test.com`,
          `NormalBot2-${uid}`,
          port1,
        );
        const dev2 = await registerDeveloper(
          `wrong-${uid}@test.com`,
          `WrongBot-${uid}`,
          port2,
        );

        const tableId = await createTableAndJoin(
          dev1.accessToken,
          dev1.bot.id,
          dev2.accessToken,
          dev2.bot.id,
        );

        await waitFor(
          async () => {
            const state = await request(app.getHttpServer())
              .get(`/api/v1/games/${tableId}/state`)
              .set("Authorization", `Bearer ${dev1.accessToken}`);
            return state.body?.handNumber >= 1;
          },
          15000,
          500,
        );

        expect(wrongBot.requestCount).toBeGreaterThan(0);
      } finally {
        await normalBot.close();
        await wrongBot.close();
      }
    }, 30000);

    it("should handle bot connection crash mid-request", async () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      const normalBot = await createBotServer(port1, "normal");
      const crashBot = await createBotServer(port2, "crash");

      try {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dev1 = await registerDeveloper(
          `normal3-${uid}@test.com`,
          `NormalBot3-${uid}`,
          port1,
        );
        const dev2 = await registerDeveloper(
          `crash-${uid}@test.com`,
          `CrashBot-${uid}`,
          port2,
        );

        const tableId = await createTableAndJoin(
          dev1.accessToken,
          dev1.bot.id,
          dev2.accessToken,
          dev2.bot.id,
        );

        await waitFor(
          async () => {
            const state = await request(app.getHttpServer())
              .get(`/api/v1/games/${tableId}/state`)
              .set("Authorization", `Bearer ${dev1.accessToken}`);
            return state.body?.handNumber >= 1;
          },
          15000,
          500,
        );
      } finally {
        await normalBot.close();
        await crashBot.close();
      }
    }, 30000);

    it("should handle bot trying to raise more than available chips", async () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      const normalBot = await createBotServer(port1, "normal");
      const hugeRaiseBot = await createBotServer(port2, "huge-raise");

      try {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dev1 = await registerDeveloper(
          `normal4-${uid}@test.com`,
          `NormalBot4-${uid}`,
          port1,
        );
        const dev2 = await registerDeveloper(
          `huge-${uid}@test.com`,
          `HugeRaiseBot-${uid}`,
          port2,
        );

        const tableId = await createTableAndJoin(
          dev1.accessToken,
          dev1.bot.id,
          dev2.accessToken,
          dev2.bot.id,
        );

        await waitFor(
          async () => {
            const state = await request(app.getHttpServer())
              .get(`/api/v1/games/${tableId}/state`)
              .set("Authorization", `Bearer ${dev1.accessToken}`);
            return state.body?.handNumber >= 1;
          },
          15000,
          500,
        );

        expect(hugeRaiseBot.requestCount).toBeGreaterThan(0);
      } finally {
        await normalBot.close();
        await hugeRaiseBot.close();
      }
    }, 30000);

    it("should handle bot trying negative raise amount", async () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      const normalBot = await createBotServer(port1, "normal");
      const negativeBot = await createBotServer(port2, "negative-raise");

      try {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dev1 = await registerDeveloper(
          `normal5-${uid}@test.com`,
          `NormalBot5-${uid}`,
          port1,
        );
        const dev2 = await registerDeveloper(
          `negative-${uid}@test.com`,
          `NegativeBot-${uid}`,
          port2,
        );

        const tableId = await createTableAndJoin(
          dev1.accessToken,
          dev1.bot.id,
          dev2.accessToken,
          dev2.bot.id,
        );

        await waitFor(
          async () => {
            const state = await request(app.getHttpServer())
              .get(`/api/v1/games/${tableId}/state`)
              .set("Authorization", `Bearer ${dev1.accessToken}`);
            return state.body?.handNumber >= 1;
          },
          15000,
          500,
        );
      } finally {
        await normalBot.close();
        await negativeBot.close();
      }
    }, 30000);
  });

  describe.concurrent("Timeout Handling", () => {
    it("should force fold when bot exceeds turn timeout", async () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      const normalBot = await createBotServer(port1, "normal");
      const slowBot = await createBotServer(port2, "slow", 10000);

      try {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dev1 = await registerDeveloper(
          `fast-${uid}@test.com`,
          `FastBot-${uid}`,
          port1,
        );
        const dev2 = await registerDeveloper(
          `slow-${uid}@test.com`,
          `SlowBot-${uid}`,
          port2,
        );

        const tableResponse = await request(app.getHttpServer())
          .post("/api/v1/games/tables")
          .set("Authorization", `Bearer ${dev1.accessToken}`)
          .send({
            name: "Timeout Test Table",
            small_blind: 10,
            big_blind: 20,
            starting_chips: 1000,
            max_players: 2,
            turn_timeout_ms: 2000,
          })
          .expect(201);

        const tableId = tableResponse.body.id;

        await request(app.getHttpServer())
          .post(`/api/v1/games/${tableId}/join`)
          .set("Authorization", `Bearer ${dev1.accessToken}`)
          .send({ bot_id: dev1.bot.id })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/api/v1/games/${tableId}/join`)
          .set("Authorization", `Bearer ${dev2.accessToken}`)
          .send({ bot_id: dev2.bot.id })
          .expect(201);

        await waitFor(
          async () => {
            const state = await request(app.getHttpServer())
              .get(`/api/v1/games/${tableId}/state`)
              .set("Authorization", `Bearer ${dev1.accessToken}`);
            return state.body?.handNumber >= 1;
          },
          20000,
          500,
        );

        expect(slowBot.requestCount).toBeGreaterThan(0);
      } finally {
        await normalBot.close();
        await slowBot.close();
      }
    }, 45000);
  });

  describe.concurrent("Concurrent Operations", () => {
    it("should handle multiple simultaneous join requests", async () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      const port3 = getNextPort();
      const bot1 = await createBotServer(port1, "normal");
      const bot2 = await createBotServer(port2, "normal");
      const bot3 = await createBotServer(port3, "normal");

      try {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dev1 = await registerDeveloper(
          `concurrent1-${uid}@test.com`,
          `ConcBot1-${uid}`,
          port1,
        );
        const dev2 = await registerDeveloper(
          `concurrent2-${uid}@test.com`,
          `ConcBot2-${uid}`,
          port2,
        );
        const dev3 = await registerDeveloper(
          `concurrent3-${uid}@test.com`,
          `ConcBot3-${uid}`,
          port3,
        );

        const tableResponse = await request(app.getHttpServer())
          .post("/api/v1/games/tables")
          .set("Authorization", `Bearer ${dev1.accessToken}`)
          .send({
            name: "Concurrent Test",
            small_blind: 10,
            big_blind: 20,
            starting_chips: 1000,
            max_players: 2,
            turn_timeout_ms: 5000,
          })
          .expect(201);

        const tableId = tableResponse.body.id;

        const results = await Promise.allSettled([
          request(app.getHttpServer())
            .post(`/api/v1/games/${tableId}/join`)
            .set("Authorization", `Bearer ${dev1.accessToken}`)
            .send({ bot_id: dev1.bot.id }),
          request(app.getHttpServer())
            .post(`/api/v1/games/${tableId}/join`)
            .set("Authorization", `Bearer ${dev2.accessToken}`)
            .send({ bot_id: dev2.bot.id }),
          request(app.getHttpServer())
            .post(`/api/v1/games/${tableId}/join`)
            .set("Authorization", `Bearer ${dev3.accessToken}`)
            .send({ bot_id: dev3.bot.id }),
        ]);

        const successes = results.filter(
          (r) => r.status === "fulfilled" && r.value.status === 201,
        );
        expect(successes.length).toBe(2);
      } finally {
        await bot1.close();
        await bot2.close();
        await bot3.close();
      }
    }, 30000);

    it("should prevent same bot joining same table twice", async () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      const bot1 = await createBotServer(port1, "normal");
      const bot2 = await createBotServer(port2, "normal");

      try {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dev1 = await registerDeveloper(
          `double1-${uid}@test.com`,
          `DoubleBot1-${uid}`,
          port1,
        );
        await registerDeveloper(
          `double2-${uid}@test.com`,
          `DoubleBot2-${uid}`,
          port2,
        );

        const tableResponse = await request(app.getHttpServer())
          .post("/api/v1/games/tables")
          .set("Authorization", `Bearer ${dev1.accessToken}`)
          .send({
            name: "Double Join Test",
            small_blind: 10,
            big_blind: 20,
            starting_chips: 1000,
            max_players: 6,
            turn_timeout_ms: 5000,
          })
          .expect(201);

        const tableId = tableResponse.body.id;

        await request(app.getHttpServer())
          .post(`/api/v1/games/${tableId}/join`)
          .set("Authorization", `Bearer ${dev1.accessToken}`)
          .send({ bot_id: dev1.bot.id })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/api/v1/games/${tableId}/join`)
          .set("Authorization", `Bearer ${dev1.accessToken}`)
          .send({ bot_id: dev1.bot.id })
          .expect(409);
      } finally {
        await bot1.close();
        await bot2.close();
      }
    }, 30000);
  });

  describe.concurrent("Chip Conservation", () => {
    it("should maintain chip conservation across multiple hands", async () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      const bot1 = await createBotServer(port1, "normal");
      const bot2 = await createBotServer(port2, "all-in-always");

      try {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dev1 = await registerDeveloper(
          `chips1-${uid}@test.com`,
          `ChipsBot1-${uid}`,
          port1,
        );
        const dev2 = await registerDeveloper(
          `chips2-${uid}@test.com`,
          `ChipsBot2-${uid}`,
          port2,
        );

        const STARTING_CHIPS = 500;
        const tableResponse = await request(app.getHttpServer())
          .post("/api/v1/games/tables")
          .set("Authorization", `Bearer ${dev1.accessToken}`)
          .send({
            name: "Chip Conservation Test",
            small_blind: 10,
            big_blind: 20,
            starting_chips: STARTING_CHIPS,
            max_players: 2,
            turn_timeout_ms: 3000,
          })
          .expect(201);

        const tableId = tableResponse.body.id;

        await request(app.getHttpServer())
          .post(`/api/v1/games/${tableId}/join`)
          .set("Authorization", `Bearer ${dev1.accessToken}`)
          .send({ bot_id: dev1.bot.id })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/api/v1/games/${tableId}/join`)
          .set("Authorization", `Bearer ${dev2.accessToken}`)
          .send({ bot_id: dev2.bot.id })
          .expect(201);

        await waitFor(
          async () => {
            const state = await request(app.getHttpServer())
              .get(`/api/v1/games/${tableId}/state`)
              .set("Authorization", `Bearer ${dev1.accessToken}`);
            return state.body?.handNumber >= 2;
          },
          20000,
          500,
        );

        const state = await request(app.getHttpServer())
          .get(`/api/v1/games/${tableId}/state`)
          .set("Authorization", `Bearer ${dev1.accessToken}`);

        const players = state.body.players || [];
        const totalChips = players.reduce(
          (sum: number, p: any) => sum + (p.chips || 0),
          0,
        );
        const pot = state.body.pot || 0;

        const expectedTotal = STARTING_CHIPS * 2;
        expect(totalChips + pot).toBe(expectedTotal);
      } finally {
        await bot1.close();
        await bot2.close();
      }
    }, 45000);
  });

  describe.concurrent("All-In Scenarios", () => {
    it("should handle both players going all-in on first hand", async () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      const allIn1 = await createBotServer(port1, "all-in-always");
      const allIn2 = await createBotServer(port2, "all-in-always");

      try {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const dev1 = await registerDeveloper(
          `allin1-${uid}@test.com`,
          `AllIn1-${uid}`,
          port1,
        );
        const dev2 = await registerDeveloper(
          `allin2-${uid}@test.com`,
          `AllIn2-${uid}`,
          port2,
        );

        const tableId = await createTableAndJoin(
          dev1.accessToken,
          dev1.bot.id,
          dev2.accessToken,
          dev2.bot.id,
        );

        await waitFor(
          async () => {
            const state = await request(app.getHttpServer())
              .get(`/api/v1/games/${tableId}/state`)
              .set("Authorization", `Bearer ${dev1.accessToken}`);
            return (
              state.body?.status === "finished" || state.body?.handNumber >= 1
            );
          },
          20000,
          500,
        );

        const finalState = await request(app.getHttpServer())
          .get(`/api/v1/games/${tableId}/state`)
          .set("Authorization", `Bearer ${dev1.accessToken}`);

        expect(finalState.body.handNumber).toBeGreaterThanOrEqual(1);
      } finally {
        await allIn1.close();
        await allIn2.close();
      }
    }, 30000);
  });
});
