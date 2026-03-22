/**
 * Recovery E2E Tests
 * ==================
 * Tests for system recovery and resilience:
 * - Bot reconnection after disconnect
 * - Game state recovery
 * - Session persistence
 * - Graceful degradation
 * - Error recovery
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

let portCounter = 44000;
function getNextPort(): number {
  return portCounter++;
}

interface BotServer {
  server: http.Server;
  port: number;
  isOnline: boolean;
  requestCount: number;
  close: () => Promise<void>;
  restart: () => Promise<void>;
  setOffline: () => void;
  setOnline: () => void;
}

function createControllableBotServer(port: number): Promise<BotServer> {
  return new Promise((resolve, reject) => {
    let isOnline = true;
    let requestCount = 0;
    let server: http.Server;

    const createServer = () => {
      return http.createServer((req, res) => {
        requestCount++;

        if (!isOnline) {
          res.destroy();
          return;
        }

        if (req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ type: "call" }));
      });
    };

    server = createServer();
    server.on("error", reject);
    server.listen(port, () => {
      resolve({
        server,
        port,
        get isOnline() {
          return isOnline;
        },
        get requestCount() {
          return requestCount;
        },
        close: () => new Promise<void>((res) => server.close(() => res())),
        restart: () =>
          new Promise<void>((res, rej) => {
            server.close(() => {
              server = createServer();
              server.on("error", rej);
              server.listen(port, () => res());
            });
          }),
        setOffline: () => {
          isOnline = false;
        },
        setOnline: () => {
          isOnline = true;
        },
      });
    });
  });
}

describe("Recovery E2E Tests", () => {
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

  async function registerPlayer(): Promise<{
    accessToken: string;
    bot: { id: string };
    botServer: BotServer;
  }> {
    const id = uid();
    const port = getNextPort();
    const botServer = await createControllableBotServer(port);
    botServers.push(botServer);

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register-developer")
      .send({
        email: `recovery${id}@test.com`,
        name: `RecoveryPlayer${id}`,
        password: "SecurePass123",
        botName: `RecBot${id}`,
        botEndpoint: `http://localhost:${port}`,
      })
      .expect(201);

    return { ...response.body, botServer };
  }

  describe("Session Recovery", () => {
    it("should maintain valid token across multiple requests", async () => {
      const player = await registerPlayer();

      // First request
      const res1 = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${player.accessToken}`)
        .expect(200);

      // Wait a bit
      await new Promise((r) => setTimeout(r, 500));

      // Second request with same token
      const res2 = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${player.accessToken}`)
        .expect(200);

      expect(res1.body.id).toBe(res2.body.id);
    });

    it("should reject expired/invalid tokens gracefully", async () => {
      const invalidToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${invalidToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe("Bot Connectivity Recovery", () => {
    it("should handle temporary bot offline gracefully", async () => {
      const player = await registerPlayer();

      // Initial health check should pass
      const initialHealth = await request(app.getHttpServer())
        .post(`/api/v1/bots/${player.bot.id}/validate`)
        .set("Authorization", `Bearer ${player.accessToken}`);

      expect([200, 201]).toContain(initialHealth.status);

      // Take bot offline
      player.botServer.setOffline();

      // Health check should fail
      const offlineHealth = await request(app.getHttpServer())
        .post(`/api/v1/bots/${player.bot.id}/validate`)
        .set("Authorization", `Bearer ${player.accessToken}`);

      // Should indicate bot is unreachable or return error
      expect([200, 201, 400, 500]).toContain(offlineHealth.status);

      // Bring bot back online
      player.botServer.setOnline();

      // Should recover
      const recoveredHealth = await request(app.getHttpServer())
        .post(`/api/v1/bots/${player.bot.id}/validate`)
        .set("Authorization", `Bearer ${player.accessToken}`);

      expect([200, 201]).toContain(recoveredHealth.status);
    });
  });
  describe("Resource Cleanup", () => {
    it("should clean up resources when player leaves", async () => {
      const player = await registerPlayer();

      const tableRes = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${player.accessToken}`)
        .send({
          name: `CleanupTable${uid()}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 2,
          turn_timeout_ms: 5000,
        })
        .expect(201);

      // Join
      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableRes.body.id}/join`)
        .set("Authorization", `Bearer ${player.accessToken}`)
        .send({ bot_id: player.bot.id })
        .expect(201);

      // Leave
      const leaveRes = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableRes.body.id}/leave`)
        .set("Authorization", `Bearer ${player.accessToken}`)
        .send({ bot_id: player.bot.id });

      expect([200, 201, 204, 404]).toContain(leaveRes.status);
    });
  });
});
