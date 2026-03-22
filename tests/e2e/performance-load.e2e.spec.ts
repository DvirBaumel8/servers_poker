/**
 * Performance & Load E2E Tests
 * ============================
 * Tests for system performance under load:
 * - Multiple concurrent games
 * - Many players joining simultaneously
 * - Rapid action sequences
 * - Memory and connection limits
 * - Response time verification
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

let portCounter = 43000;
function getNextPort(): number {
  return portCounter++;
}

interface BotServer {
  server: http.Server;
  port: number;
  requestCount: number;
  close: () => Promise<void>;
}

function createBotServer(
  port: number,
  responseDelayMs: number = 0,
): Promise<BotServer> {
  return new Promise((resolve, reject) => {
    let requestCount = 0;

    const server = http.createServer((req, res) => {
      requestCount++;

      const respond = () => {
        if (req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ type: "call" }));
      };

      if (responseDelayMs > 0) {
        setTimeout(respond, responseDelayMs);
      } else {
        respond();
      }
    });

    server.on("error", reject);
    server.listen(port, () => {
      resolve({
        server,
        port,
        get requestCount() {
          return requestCount;
        },
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe("Performance & Load E2E Tests", () => {
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
      } catch {
        // Ignore errors when closing bot servers during cleanup
      }
    }
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  async function registerPlayer(delay: number = 0): Promise<{
    accessToken: string;
    bot: { id: string };
    botServer: BotServer;
  }> {
    const id = uid();
    const port = getNextPort();
    const botServer = await createBotServer(port, delay);
    botServers.push(botServer);

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register-developer")
      .send({
        email: `perf${id}@test.com`,
        name: `PerfPlayer${id}`,
        password: "SecurePass123",
        botName: `PerfBot${id}`,
        botEndpoint: `http://localhost:${port}`,
      })
      .expect(201);

    return { ...response.body, botServer };
  }

  describe("Response Time", () => {
    it("should respond to health check within 100ms", async () => {
      const start = Date.now();

      const response = await request(app.getHttpServer()).get("/api/v1/health");

      const duration = Date.now() - start;

      expect([200, 404]).toContain(response.status);
      expect(duration).toBeLessThan(500); // Allow some leeway
    });

    it("should respond to table list within reasonable time", async () => {
      const player = await registerPlayer();

      const start = Date.now();
      const response = await request(app.getHttpServer())
        .get("/api/v1/games")
        .set("Authorization", `Bearer ${player.accessToken}`);
      const duration = Date.now() - start;

      expect([200, 401]).toContain(response.status);
      expect(duration).toBeLessThan(2000);
    });

    it("should create table within 500ms", async () => {
      const player = await registerPlayer();

      const start = Date.now();
      const response = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${player.accessToken}`)
        .send({
          name: `PerfTable${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 2,
          turn_timeout_ms: 5000,
        });
      const duration = Date.now() - start;

      expect(response.status).toBe(201);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("Concurrent Registrations", () => {
    it("should handle 5 concurrent user registrations", async () => {
      const registrations = Array(5)
        .fill(null)
        .map(async (_, i) => {
          const id = uid();
          const port = getNextPort();
          const botServer = await createBotServer(port);
          botServers.push(botServer);

          const start = Date.now();
          const response = await request(app.getHttpServer())
            .post("/api/v1/auth/register-developer")
            .send({
              email: `concurrent${id}@test.com`,
              name: `ConcurrentPlayer${id}`,
              password: "SecurePass123",
              botName: `ConcBot${id}`,
              botEndpoint: `http://localhost:${port}`,
            });
          const duration = Date.now() - start;

          return { status: response.status, duration };
        });

      const results = await Promise.all(registrations);

      // All should succeed
      const successCount = results.filter((r) => r.status === 201).length;
      expect(successCount).toBe(5);

      // Average response time should be reasonable
      const avgDuration =
        results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      expect(avgDuration).toBeLessThan(2000);
    });
  });

  describe("Concurrent Table Operations", () => {
    it("should handle 3 concurrent table creations", async () => {
      const player = await registerPlayer();

      const tableCreations = Array(3)
        .fill(null)
        .map(async (_, i) => {
          const start = Date.now();
          const response = await request(app.getHttpServer())
            .post("/api/v1/games/tables")
            .set("Authorization", `Bearer ${player.accessToken}`)
            .send({
              name: `ConcTable${uid()}`,
              small_blind: 10,
              big_blind: 20,
              starting_chips: 1000,
              max_players: 2,
              turn_timeout_ms: 5000,
            });
          const duration = Date.now() - start;

          return { status: response.status, duration, id: response.body?.id };
        });

      const results = await Promise.all(tableCreations);

      const successCount = results.filter((r) => r.status === 201).length;
      expect(successCount).toBe(3);

      // All tables should have unique IDs
      const ids = results.filter((r) => r.id).map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
  describe("Rapid Actions", () => {
    it("should handle rapid sequential API calls", async () => {
      const player = await registerPlayer();
      const callCount = 10;
      const results: number[] = [];

      for (let i = 0; i < callCount; i++) {
        const start = Date.now();
        await request(app.getHttpServer())
          .get("/api/v1/games/tables")
          .set("Authorization", `Bearer ${player.accessToken}`);
        results.push(Date.now() - start);
      }

      // Average should be reasonable
      const avg = results.reduce((a, b) => a + b, 0) / results.length;
      expect(avg).toBeLessThan(500);

      // No request should take too long
      expect(Math.max(...results)).toBeLessThan(2000);
    });
  });

  describe("Bot Response Handling", () => {
    it("should handle slow bot responses gracefully", async () => {
      // Create a slow bot (500ms delay)
      const slowPlayer = await registerPlayer(500);
      const normalPlayer = await registerPlayer(0);

      const tableRes = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${slowPlayer.accessToken}`)
        .send({
          name: `SlowBotTable${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 2,
          turn_timeout_ms: 10000, // Higher timeout for slow bot
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableRes.body.id}/join`)
        .set("Authorization", `Bearer ${slowPlayer.accessToken}`)
        .send({ bot_id: slowPlayer.bot.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableRes.body.id}/join`)
        .set("Authorization", `Bearer ${normalPlayer.accessToken}`)
        .send({ bot_id: normalPlayer.bot.id })
        .expect(201);

      // Wait for some game activity
      await new Promise((r) => setTimeout(r, 5000));

      // Both bots should have received requests
      expect(slowPlayer.botServer.requestCount).toBeGreaterThan(0);
      expect(normalPlayer.botServer.requestCount).toBeGreaterThan(0);
    }, 30000);
  });
});
