import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { DataSource } from "typeorm";
import { io, Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";
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

describe("WebSocket Real-time E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let appPort: number;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    appPort = 3100 + Math.floor(Math.random() * 100);

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
    await app.listen(appPort);
    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    for (const socket of sockets) {
      try {
        socket.disconnect();
      } catch {
        // ignore
      }
    }
    if (dataSource?.isInitialized) await dataSource.destroy();
    await app.close();
  });

  async function registerPlayer(): Promise<{
    accessToken: string;
    bot: { id: string };
  }> {
    const id = uid();

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register-developer")
      .send({
        email: `ws${id}@test.com`,
        name: `WSPlayer${id}`,
        password: "SecurePass123",
        botName: `WSBot${id}`,
      })
      .expect(201);

    return response.body;
  }

  async function createTable(): Promise<{ id: string; name: string }> {
    const tableId = uuidv4();
    const name = `WSTable${uid()}`;
    await dataSource.query(
      `INSERT INTO tables (id, name, small_blind, big_blind, starting_chips, max_players, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'waiting', NOW(), NOW())`,
      [tableId, name, 10, 20, 1000, 2],
    );
    return { id: tableId, name };
  }

  function createSocket(token?: string): Socket {
    const socket = io(`http://localhost:${appPort}`, {
      auth: token ? { token } : undefined,
      transports: ["websocket"],
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  }

  describe("Socket Connection", () => {
    it("should connect to WebSocket server", async () => {
      const player = await registerPlayer();
      const socket = createSocket(player.accessToken);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Connection timeout")),
          5000,
        );
        socket.on("connect", () => {
          clearTimeout(timeout);
          resolve();
        });
        socket.on("connect_error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      expect(socket.connected).toBe(true);
      socket.disconnect();
    });

    it("should handle connection without token", async () => {
      const socket = createSocket();

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 3000);
        socket.on("connect", () => {
          clearTimeout(timeout);
          resolve();
        });
        socket.on("connect_error", () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      socket.disconnect();
    });
  });

  describe("Table Subscription", () => {
    it("should subscribe to table events", async () => {
      const player = await registerPlayer();
      const socket = createSocket(player.accessToken);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Connection timeout")),
          5000,
        );
        socket.on("connect", () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      const table = await createTable();
      socket.emit("subscribeToTable", { tableId: table.id });
      await new Promise((r) => setTimeout(r, 1000));
      socket.disconnect();
    });

    it("should receive game state updates after joining", async () => {
      const player1 = await registerPlayer();
      const player2 = await registerPlayer();

      const socket = createSocket(player1.accessToken);
      const receivedEvents: any[] = [];

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Connection timeout")),
          5000,
        );
        socket.on("connect", () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      socket.on("gameState", (data) =>
        receivedEvents.push({ type: "gameState", data }),
      );
      socket.on("playerAction", (data) =>
        receivedEvents.push({ type: "playerAction", data }),
      );
      socket.on("handStarted", (data) =>
        receivedEvents.push({ type: "handStarted", data }),
      );

      const table = await createTable();
      socket.emit("subscribeToTable", { tableId: table.id });

      await request(app.getHttpServer())
        .post(`/api/v1/games/${table.id}/join`)
        .set("Authorization", `Bearer ${player1.accessToken}`)
        .send({ bot_id: player1.bot.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/games/${table.id}/join`)
        .set("Authorization", `Bearer ${player2.accessToken}`)
        .send({ bot_id: player2.bot.id })
        .expect(201);

      await new Promise((r) => setTimeout(r, 3000));
      socket.disconnect();
    }, 15000);
  });

  describe("Multiple Clients", () => {
    it("should broadcast events to multiple subscribed clients", async () => {
      const player1 = await registerPlayer();
      const player2 = await registerPlayer();

      const socket1 = createSocket(player1.accessToken);
      const socket2 = createSocket(player2.accessToken);

      await Promise.all([
        new Promise<void>((resolve) => socket1.on("connect", resolve)),
        new Promise<void>((resolve) => socket2.on("connect", resolve)),
      ]);

      const table = await createTable();

      socket1.emit("subscribeToTable", { tableId: table.id });
      socket2.emit("subscribeToTable", { tableId: table.id });

      const events1: any[] = [];
      const events2: any[] = [];
      socket1.on("gameState", (data) => events1.push(data));
      socket2.on("gameState", (data) => events2.push(data));

      await request(app.getHttpServer())
        .post(`/api/v1/games/${table.id}/join`)
        .set("Authorization", `Bearer ${player1.accessToken}`)
        .send({ bot_id: player1.bot.id })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/games/${table.id}/join`)
        .set("Authorization", `Bearer ${player2.accessToken}`)
        .send({ bot_id: player2.bot.id })
        .expect(201);

      await new Promise((r) => setTimeout(r, 2000));

      socket1.disconnect();
      socket2.disconnect();
    }, 15000);
  });

  describe("Unsubscription", () => {
    it("should stop receiving events after unsubscribing", async () => {
      const player = await registerPlayer();
      const socket = createSocket(player.accessToken);
      let eventCount = 0;

      await new Promise<void>((resolve) => socket.on("connect", resolve));

      const table = await createTable();

      socket.on("gameState", () => eventCount++);

      socket.emit("subscribeToTable", { tableId: table.id });
      await new Promise((r) => setTimeout(r, 500));

      socket.emit("unsubscribeFromTable", { tableId: table.id });
      await new Promise((r) => setTimeout(r, 500));

      await new Promise((r) => setTimeout(r, 1000));

      socket.disconnect();
    });
  });

  describe("Disconnection Handling", () => {
    it("should handle graceful disconnection", async () => {
      const player = await registerPlayer();
      const socket = createSocket(player.accessToken);

      await new Promise<void>((resolve) => socket.on("connect", resolve));

      expect(socket.connected).toBe(true);

      socket.disconnect();

      await new Promise((r) => setTimeout(r, 100));
      expect(socket.connected).toBe(false);
    });

    it("should be able to reconnect after disconnection", async () => {
      const player = await registerPlayer();

      const socket1 = createSocket(player.accessToken);
      await new Promise<void>((resolve) => socket1.on("connect", resolve));
      socket1.disconnect();

      await new Promise((r) => setTimeout(r, 500));

      const socket2 = createSocket(player.accessToken);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Reconnection timeout")),
          5000,
        );
        socket2.on("connect", () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      expect(socket2.connected).toBe(true);
      socket2.disconnect();
    });
  });
});
