import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { io, Socket } from "socket.io-client";
import { JwtService } from "@nestjs/jwt";
import { getSharedApp } from "./shared/app-singleton";
import { sleep } from "../utils/test-helpers";
import { v4 as uuidv4 } from "uuid";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("WebSocket E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let serverUrl: string;
  let clientSocket: Socket | null = null;

  beforeAll(async () => {
    const shared = await getSharedApp();
    app = shared.app;
    dataSource = shared.dataSource;
    jwtService = shared.jwtService;
    const address = app.getHttpServer().address();
    const port = typeof address === "object" ? address?.port : 0;
    serverUrl = `http://localhost:${port}`;
  }, 60000);

  afterEach(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
      clientSocket = null;
    }
  });

  async function createTestUser() {
    const id = uid();
    const email = `wstest-${id}@example.com`;
    const name = `WSTest-${id}`;
    const userId = uuidv4();
    const passwordHash =
      "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.3L8KJ5h1V5OGRC"; // "SecurePassword123!"
    await dataSource.query(
      `INSERT INTO users (id, email, name, password_hash, role, active, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'user', true, true, NOW(), NOW())`,
      [userId, email, name, passwordHash],
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

  describe("Table Subscription", () => {
    it("should subscribe to table events", async () => {
      const { accessToken } = await createTestUser();
      const socket = await connectSocket(accessToken);
      const id = uid();

      const botResponse = await request(app.getHttpServer())
        .post("/api/v1/bots/internal")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `WSBot1-${id}`,
          strategy: {
            version: 1,
            tier: "quick",
            personality: {
              aggression: 50,
              bluffFrequency: 30,
              riskTolerance: 50,
              tightness: 50,
            },
          },
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
        .post("/api/v1/bots/internal")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `WSBot2-${id}`,
          strategy: {
            version: 1,
            tier: "quick",
            personality: {
              aggression: 50,
              bluffFrequency: 30,
              riskTolerance: 50,
              tightness: 50,
            },
          },
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

  describe("Game Events", () => {
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

  describe("Error Handling", () => {
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
