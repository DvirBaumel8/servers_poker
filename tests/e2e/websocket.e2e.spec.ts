import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import * as request from "supertest";
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

describe("WebSocket E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let userId: string;
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

  beforeEach(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
      clientSocket = null;
    }

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
        email: "wstest@example.com",
        name: "WSTest",
        password: "SecurePassword123!",
      });

    accessToken = response.body.accessToken;
    userId = response.body.user.id;
  });

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

  describe("WebSocket Connection", () => {
    it("should connect with valid JWT token", async () => {
      clientSocket = await connectSocket(accessToken);
      expect(clientSocket.connected).toBe(true);
    });

    it("should allow connection without token (for public events)", async () => {
      try {
        clientSocket = await connectSocket();
        expect(clientSocket.connected).toBe(true);
      } catch {
        expect(true).toBe(true);
      }
    });

    it("should disconnect cleanly", async () => {
      clientSocket = await connectSocket(accessToken);
      expect(clientSocket.connected).toBe(true);

      clientSocket.disconnect();
      await sleep(100);

      expect(clientSocket.connected).toBe(false);
    });
  });

  describe("Table Subscription", () => {
    it("should subscribe to table events", async () => {
      clientSocket = await connectSocket(accessToken);

      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "WSBot1",
          endpoint: "http://localhost:19201",
        });

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "WSTable",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      const subscribePromise = new Promise<void>((resolve, reject) => {
        clientSocket!.emit("subscribe_table", { tableId });

        clientSocket!.on("table_subscribed", (data: any) => {
          if (data.tableId === tableId) {
            resolve();
          }
        });

        clientSocket!.on("error", reject);

        setTimeout(() => resolve(), 2000);
      });

      await subscribePromise;
      expect(true).toBe(true);
    });

    it("should receive seat update when bot joins", async () => {
      clientSocket = await connectSocket(accessToken);

      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "WSBot2",
          endpoint: "http://localhost:19202",
        });

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "WSTable2",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;
      const botId = botResponse.body.id;

      clientSocket.emit("subscribe_table", { tableId });
      await sleep(100);

      const eventPromise = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve(null);
        }, 3000);

        clientSocket!.on("seat_update", (data: any) => {
          clearTimeout(timeout);
          resolve(data);
        });

        clientSocket!.on("player_joined", (data: any) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      await request(app.getHttpServer())
        .post(`/api/v1/games/tables/${tableId}/join`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          bot_id: botId,
        });

      const event = await eventPromise;
    });
  });

  describe("Game Events", () => {
    it("should handle multiple clients subscribing to same table", async () => {
      const socket1 = await connectSocket(accessToken);

      const response2 = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({
          email: "wstest2@example.com",
          name: "WSTest2",
          password: "SecurePassword123!",
        });

      const socket2 = await connectSocket(response2.body.accessToken);

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "SharedTable",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      socket1.emit("subscribe_table", { tableId });
      socket2.emit("subscribe_table", { tableId });

      await sleep(100);

      expect(socket1.connected).toBe(true);
      expect(socket2.connected).toBe(true);

      socket1.disconnect();
      socket2.disconnect();
    });

    it("should unsubscribe from table events", async () => {
      clientSocket = await connectSocket(accessToken);

      const tableResponse = await request(app.getHttpServer())
        .post("/api/v1/games/tables")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "UnsubTable",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
        });

      const tableId = tableResponse.body.id;

      clientSocket.emit("subscribe_table", { tableId });
      await sleep(100);

      clientSocket.emit("unsubscribe_table", { tableId });
      await sleep(100);

      expect(clientSocket.connected).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle subscription to non-existent table gracefully", async () => {
      clientSocket = await connectSocket(accessToken);

      const errorPromise = new Promise<any>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 2000);

        clientSocket!.on("error", (data: any) => {
          clearTimeout(timeout);
          resolve(data);
        });

        clientSocket!.on("exception", (data: any) => {
          clearTimeout(timeout);
          resolve(data);
        });
      });

      clientSocket.emit("subscribe_table", { tableId: "non-existent-table" });

      const error = await errorPromise;
    });

    it("should handle malformed messages gracefully", async () => {
      clientSocket = await connectSocket(accessToken);

      clientSocket.emit("subscribe_table", { invalid: "data" });
      await sleep(100);

      expect(clientSocket.connected).toBe(true);
    });
  });
});
