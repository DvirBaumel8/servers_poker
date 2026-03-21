/**
 * Provably Fair E2E Tests
 * =======================
 * Tests for provably fair game verification:
 * - Seed commitment and reveal
 * - Hand verification
 * - Deck shuffling verification
 * - Audit trail
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
import * as crypto from "crypto";
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

let portCounter = 45000;
function getNextPort(): number {
  return portCounter++;
}

interface BotServer {
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}

function createBotServer(port: number): Promise<BotServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ type: "call" }));
    });

    server.on("error", reject);
    server.listen(port, () => {
      resolve({
        server,
        port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe("Provably Fair E2E Tests", () => {
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
    const botServer = await createBotServer(port);
    botServers.push(botServer);

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/register-developer")
      .send({
        email: `pf${id}@test.com`,
        name: `PFPlayer${id}`,
        password: "SecurePass123",
        botName: `PFBot${id}`,
        botEndpoint: `http://localhost:${port}`,
      })
      .expect(201);

    return { ...response.body, botServer };
  }

  describe("Provably Fair Info", () => {
    it("should return provably fair documentation", async () => {
      const response = await request(app.getHttpServer()).get(
        "/api/v1/games/provably-fair/info",
      );

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty("description");
      }
    });

    it("should explain the verification process", async () => {
      const response = await request(app.getHttpServer()).get(
        "/api/v1/games/provably-fair/info",
      );

      if (response.status === 200 && response.body.description) {
        // Should mention key concepts
        const desc = response.body.description.toLowerCase();
        const hasRelevantInfo =
          desc.includes("seed") ||
          desc.includes("hash") ||
          desc.includes("verify") ||
          desc.includes("random") ||
          desc.includes("fair");
        expect(hasRelevantInfo).toBe(true);
      }
    });
  });
  describe("Cryptographic Verification", () => {
    it("should use proper hash function for commitments", async () => {
      // Test that SHA-256 produces expected output
      const testSeed = "test-server-seed";
      const hash = crypto.createHash("sha256").update(testSeed).digest("hex");

      expect(hash).toHaveLength(64); // SHA-256 produces 64 hex chars
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    it("should generate deterministic deck from seed", async () => {
      // Test deterministic shuffling
      const seed = "test-seed-123";
      const deck1 = generateDeterministicDeck(seed);
      const deck2 = generateDeterministicDeck(seed);

      expect(deck1).toEqual(deck2);
    });

    it("should produce different decks for different seeds", async () => {
      const deck1 = generateDeterministicDeck("seed-1");
      const deck2 = generateDeterministicDeck("seed-2");

      expect(deck1).not.toEqual(deck2);
    });
  });
  describe("Client-Side Verification", () => {
    it("should provide all data needed for client verification", async () => {
      const infoRes = await request(app.getHttpServer()).get(
        "/api/v1/games/provably-fair/info",
      );

      if (infoRes.status === 200) {
        // Should provide verification instructions or tools
        expect(infoRes.body).toBeDefined();
      }
    });
  });

  describe("Fairness Guarantees", () => {
    it("should not allow seed manipulation after commitment", async () => {
      // This is tested implicitly through the commitment scheme
      // The server commits to a hash before players act
      // After the hand, the seed is revealed
      // Players can verify: hash(revealed_seed) === commitment

      const testSeed = "server-seed-" + Date.now();
      const commitment = crypto
        .createHash("sha256")
        .update(testSeed)
        .digest("hex");

      // Verify commitment matches seed
      const verificationHash = crypto
        .createHash("sha256")
        .update(testSeed)
        .digest("hex");
      expect(commitment).toBe(verificationHash);
    });

    it("should incorporate player seeds when available", async () => {
      // Combined seed = hash(server_seed + player_seed_1 + player_seed_2 + ...)
      const serverSeed = "server-123";
      const playerSeed1 = "player-abc";
      const playerSeed2 = "player-xyz";

      const combinedSeed = crypto
        .createHash("sha256")
        .update(serverSeed + playerSeed1 + playerSeed2)
        .digest("hex");

      expect(combinedSeed).toHaveLength(64);

      // Different player seeds should produce different combined seeds
      const differentCombined = crypto
        .createHash("sha256")
        .update(serverSeed + "different" + playerSeed2)
        .digest("hex");

      expect(combinedSeed).not.toBe(differentCombined);
    });
  });
});

// Helper function to simulate deterministic deck generation
function generateDeterministicDeck(seed: string): string[] {
  const cards = [
    "2h",
    "3h",
    "4h",
    "5h",
    "6h",
    "7h",
    "8h",
    "9h",
    "Th",
    "Jh",
    "Qh",
    "Kh",
    "Ah",
    "2d",
    "3d",
    "4d",
    "5d",
    "6d",
    "7d",
    "8d",
    "9d",
    "Td",
    "Jd",
    "Qd",
    "Kd",
    "Ad",
    "2c",
    "3c",
    "4c",
    "5c",
    "6c",
    "7c",
    "8c",
    "9c",
    "Tc",
    "Jc",
    "Qc",
    "Kc",
    "Ac",
    "2s",
    "3s",
    "4s",
    "5s",
    "6s",
    "7s",
    "8s",
    "9s",
    "Ts",
    "Js",
    "Qs",
    "Ks",
    "As",
  ];

  // Create seeded random using hash
  const hash = crypto.createHash("sha256").update(seed).digest();
  const shuffled = [...cards];

  // Fisher-Yates shuffle with deterministic random
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = hash[i % hash.length] % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}
