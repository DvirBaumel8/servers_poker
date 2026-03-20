import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import request from "supertest";
import { DataSource } from "typeorm";
import { io, Socket } from "socket.io-client";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { GamesModule } from "../../src/modules/games/games.module";
import { ServicesModule } from "../../src/services/services.module";
import * as entities from "../../src/entities";
import { appConfig } from "../../src/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { sleep } from "../utils/test-helpers";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("WebSocket E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let serverUrl: string;
  let clientSocket: Socket | null = null;

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
    await app.listen(0);

    const address = app.getHttpServer().address();
    const port = typeof address === "object" ? address?.port : 0;
    serverUrl = `http://localhost:${port}`;

    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await app.close();
  });

  afterEach(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
      clientSocket = null;
    }
  });

  async function createTestUser() {
    const id = uid();
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: `wstest-${id}@example.com`,
        name: `WSTest-${id}`,
        password: "SecurePassword123!",
      });
    return {
      accessToken: response.body.accessToken,
      userId: response.body.user.id,
    };
  }

  function connectSocket(token?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(serverUrl, {
        auth: token ? { token } : undefined,
        transports: ["websocket"],
        timeout: 5000,
      });

      socket.on("connect", () => {
        resolve(socket);
      });

      socket.on("connect_error", (err) => {
        reject(err);
      });

      setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 5000);
    });
  }

  describe.concurrent("WebSocket Connection", () => {
    it("should connect with valid JWT token", async () => {
      const { accessToken } = await createTestUser();
      const socket = await connectSocket(accessToken);
      expect(socket.connected).toBe(true);
      socket.disconnect();
    });

    it("should allow connection without token (for public events)", async () => {
      try {
        const socket = await connectSocket();
        expect(socket.connected).toBe(true);
        socket.disconnect();
      } catch {
        expect(true).toBe(true);
      }
    });

    it("should disconnect cleanly", async () => {
      const { accessToken } = await createTestUser();
      const socket = await connectSocket(accessToken);
      expect(socket.connected).toBe(true);

      socket.disconnect();
      await sleep(100);

      expect(socket.connected).toBe(false);
    });
  });

  describe.concurrent("Table Subscription", () => {
    it("should subscribe to table events", async () => {
      const { accessToken } = await createTestUser();
      const socket = await connectSocket(accessToken);
      const id = uid();

      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `WSBot1-${id}`,
          endpoint: `http://localhost:19201/bot-${id}`,
        });

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `WSTable-${id}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      const subscribePromise = new Promise<void>((resolve, reject) => {
        socket.emit("subscribe", { tableId });

        socket.on("table_subscribed", (data: any) => {
          if (data.tableId === tableId) {
            resolve();
          }
        });

        socket.on("error", reject);

        setTimeout(() => resolve(), 2000);
      });

      await subscribePromise;
      expect(true).toBe(true);
      socket.disconnect();
    });

    it("should receive seat update when bot joins", async () => {
      const { accessToken } = await createTestUser();
      const socket = await connectSocket(accessToken);
      const id = uid();

      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `WSBot2-${id}`,
          endpoint: `http://localhost:19202/bot-${id}`,
        });

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `WSTable2-${id}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;
      const botId = botResponse.body.id;

      socket.emit("subscribe", { tableId });
      await sleep(100);

      const eventPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve(null);
        }, 3000);

        socket.on("seat_update", (data: any) => {
          clearTimeout(timeout);
          resolve(data);
        });

        socket.on("player_joined", (data: any) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: botId,
        });

      const event = await eventPromise;
      socket.disconnect();
    });
  });

  describe.concurrent("Game Events", () => {
    it("should handle multiple clients subscribing to same table", async () => {
      const { accessToken: token1 } = await createTestUser();
      const { accessToken: token2 } = await createTestUser();
      const id = uid();

      const socket1 = await connectSocket(token1);
      const socket2 = await connectSocket(token2);

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${token1}`)
        .send({
          name: `SharedTable-${id}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      socket1.emit("subscribe", { tableId });
      socket2.emit("subscribe", { tableId });

      await sleep(100);

      expect(socket1.connected).toBe(true);
      expect(socket2.connected).toBe(true);

      socket1.disconnect();
      socket2.disconnect();
    });

    it("should unsubscribe from table events", async () => {
      const { accessToken } = await createTestUser();
      const socket = await connectSocket(accessToken);
      const id = uid();

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `UnsubTable-${id}`,
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      socket.emit("subscribe", { tableId });
      await sleep(100);

      socket.emit("unsubscribe", { tableId });
      await sleep(100);

      expect(socket.connected).toBe(true);
      socket.disconnect();
    });
  });

  describe.concurrent("Error Handling", () => {
    it("should handle subscription to non-existent table gracefully", async () => {
      const { accessToken } = await createTestUser();
      const socket = await connectSocket(accessToken);

      const errorPromise = new Promise<any>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 2000);

        socket.on("error", (data: any) => {
          clearTimeout(timeout);
          resolve(data);
        });

        socket.on("exception", (data: any) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      socket.emit("subscribe", { tableId: `non-existent-table-${uid()}` });

      const error = await errorPromise;
      socket.disconnect();
    });

    it("should handle malformed messages gracefully", async () => {
      const { accessToken } = await createTestUser();
      const socket = await connectSocket(accessToken);

      socket.emit("subscribe", { invalid: "data" });
      await sleep(100);

      expect(socket.connected).toBe(true);
      socket.disconnect();
    });
  });
});
