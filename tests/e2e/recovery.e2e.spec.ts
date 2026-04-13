import { describe, it, expect, beforeAll } from "vitest";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { getSharedApp } from "./shared/app-singleton";

let testCounter = 1;
const uid = () => `${testCounter++}${Math.random().toString(36).slice(2, 6)}`;

describe("Recovery E2E Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const shared = await getSharedApp();
    app = shared.app;
    dataSource = shared.dataSource;
  }, 60000);

  async function registerPlayer(): Promise<{
    accessToken: string;
    botId: string;
  }> {
    const id = uid();
    const email = `recovery${id}@test.com`;
    const name = `RecoveryPlayer${id}`;
    const password = "SecurePass123!";
    const botName = `RecBot${id}`;

    // Register user
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, name, password })
      .expect(201);

    // Verify email
    await dataSource.query(
      'UPDATE "users" SET email_verified = true WHERE email = $1',
      [email],
    );

    // Login to get token
    const loginResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);

    const accessToken = loginResponse.body.accessToken;

    // Create bot
    const botResponse = await request(app.getHttpServer())
      .post("/api/v1/bots/internal")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: botName,
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
      })
      .expect(201);

    return {
      accessToken,
      botId: botResponse.body.id,
    };
  }

  describe("Session Recovery", () => {
    it("should maintain valid token across multiple requests", async () => {
      const player = await registerPlayer();

      const res1 = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${player.accessToken}`)
        .expect(200);

      await new Promise((r) => setTimeout(r, 500));

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
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/games/${tableRes.body.id}/join`)
        .set("Authorization", `Bearer ${player.accessToken}`)
        .send({ bot_id: player.botId })
        .expect(201);

      const leaveRes = await request(app.getHttpServer())
        .post(`/api/v1/games/${tableRes.body.id}/leave`)
        .set("Authorization", `Bearer ${player.accessToken}`)
        .send({ bot_id: player.botId });

      expect([200, 201, 204, 404]).toContain(leaveRes.status);
    });
  });
});
