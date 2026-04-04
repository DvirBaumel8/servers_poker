/**
 * E2E test: Financial System & Matchmaking Orchestrator — Happy Flow
 *
 * Covers the full daily tournament lifecycle:
 * 1. 08:00 cron → daily master tournament created with correct parameters
 * 2. Premium bots auto-registered
 * 3. Non-premium users manually register via HTTP
 * 4. 19 total participants
 * 5. 20:55 cron → tournament locked, shuffled, split into pods
 * 6. Winners determined → 15% ITM payout distribution
 * 7. Winner wallets credited with correct amounts
 *
 * Target: < 60 seconds (no real game simulation — we simulate completion)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { EventEmitter2 } from "@nestjs/event-emitter";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { getSharedApp } from "./shared/app-singleton";
import { MatchmakingService } from "../../src/modules/matchmaking/matchmaking.service";
import { PrizeDistributionService } from "../../src/modules/matchmaking/prize-distribution.service";
import { FinanceService } from "../../src/modules/finance/finance.service";

// ── Test helpers ──────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const PASSWORD_HASH =
  "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.3L8KJ5h1V5OGRC"; // "TestPassword123!"

interface TestUser {
  id: string;
  accessToken: string;
  email: string;
}

interface TestBot {
  id: string;
  name: string;
  userId: string;
}

async function createUser(
  ds: DataSource,
  jwt: JwtService,
  opts: { premium?: boolean; monthlyFee?: number; role?: string } = {},
): Promise<TestUser> {
  const id = uuidv4();
  const tag = uid();
  const email = `user-${tag}@test.local`;
  const name = `User-${tag}`;
  const role = opts.role ?? "user";
  const subStatus = opts.premium ? "active" : "free";
  const subStart = opts.premium ? new Date() : null;
  const subEnd = opts.premium ? new Date(Date.now() + 365 * 86400000) : null;
  const monthlyFee = opts.monthlyFee ?? (opts.premium ? 1000 : 0);

  await ds.query(
    `INSERT INTO users
       (id, email, name, password_hash, role, active, email_verified,
        subscription_status, subscription_start, subscription_end, monthly_fee,
        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,true,true,$6,$7,$8,$9,NOW(),NOW())`,
    [
      id,
      email,
      name,
      PASSWORD_HASH,
      role,
      subStatus,
      subStart,
      subEnd,
      monthlyFee,
    ],
  );

  const accessToken = jwt.sign({ sub: id, email, role }, { expiresIn: "1h" });
  return { id, accessToken, email };
}

async function createBot(
  ds: DataSource,
  userId: string,
  nameOverride?: string,
): Promise<TestBot> {
  const id = uuidv4();
  const name = nameOverride ?? `Bot-${uid()}`;
  const strategy = JSON.stringify({
    version: 1,
    tier: "quick",
    personality: {
      aggression: 50,
      bluffFrequency: 30,
      riskTolerance: 50,
      tightness: 50,
    },
  });

  await ds.query(
    `INSERT INTO bots (id, user_id, name, strategy, active, created_at, updated_at)
     VALUES ($1,$2,$3,$4,true,NOW(),NOW())`,
    [id, userId, name, strategy],
  );

  return { id, name, userId };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Matchmaking & Finance E2E — Happy Flow", () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let matchmaking: MatchmakingService;
  let prizes: PrizeDistributionService;
  let finance: FinanceService;
  let emitter: EventEmitter2;

  // Test data
  const premiumUsers: TestUser[] = [];
  const premiumBots: TestBot[] = [];
  const manualUsers: TestUser[] = [];
  const manualBots: TestBot[] = [];

  beforeAll(async () => {
    const shared = await getSharedApp();
    app = shared.app;
    ds = shared.dataSource;
    jwt = shared.jwtService;
    matchmaking = shared.module.get(MatchmakingService);
    prizes = shared.module.get(PrizeDistributionService);
    finance = shared.module.get(FinanceService);
    emitter = shared.module.get(EventEmitter2);
  }, 60000);

  // ── Step 0: Seed users, bots, wallets ──────────────────────────────────────

  it("should seed 10 premium + 9 non-premium users with bots and wallets", async () => {
    // Create 10 premium users with active subscriptions (monthly_fee = 1000 each)
    for (let i = 0; i < 10; i++) {
      const user = await createUser(ds, jwt, {
        premium: true,
        monthlyFee: 1000,
      });
      premiumUsers.push(user);
      const bot = await createBot(ds, user.id, `PremiumBot-${i + 1}`);
      premiumBots.push(bot);
      // Create wallet with funds
      await finance.createWallet(user.id);
      await finance.deposit(user.id, 50000);
    }

    // Create 9 non-premium users
    for (let i = 0; i < 9; i++) {
      const user = await createUser(ds, jwt, { premium: false });
      manualUsers.push(user);
      const bot = await createBot(ds, user.id, `ManualBot-${i + 1}`);
      manualBots.push(bot);
      await finance.createWallet(user.id);
      await finance.deposit(user.id, 50000);
    }

    expect(premiumUsers).toHaveLength(10);
    expect(manualUsers).toHaveLength(9);

    // Verify wallet balances
    const wallet = await finance.getWallet(premiumUsers[0].id);
    expect(wallet.balance).toBe("50000");
  });

  // ── Step 1: 08:00 Cron — Create daily tournament + auto-register premium ──

  let tournamentId: string;

  it("should create daily master tournament and auto-register premium users", async () => {
    await matchmaking.createDailyMasterTournament();

    // Find today's tournament
    const tournament = await matchmaking.findTodaysMasterTournament();
    expect(tournament).not.toBeNull();
    tournamentId = tournament!.id;

    // Verify tournament parameters
    expect(tournament!.name).toMatch(/^Daily Master \d{4}-\d{2}-\d{2}$/);
    expect(tournament!.type).toBe("scheduled");
    expect(tournament!.status).toBe("registering");
    expect(tournament!.min_players).toBe(2);
    expect(tournament!.rebuys_allowed).toBe(false);

    // Verify premium bots auto-registered
    const entries = await ds.query(
      `SELECT * FROM tournament_entries WHERE tournament_id = $1`,
      [tournamentId],
    );
    expect(entries).toHaveLength(10);

    // Each entry should belong to a premium user's bot
    const entryBotIds = new Set(
      entries.map((e: { bot_id: string }) => e.bot_id),
    );
    for (const bot of premiumBots) {
      expect(entryBotIds.has(bot.id)).toBe(true);
    }
  });

  // ── Step 2: Idempotency — running the cron again should not duplicate ──────

  it("should not create a duplicate tournament on second run", async () => {
    await matchmaking.createDailyMasterTournament();

    const rows = await ds.query(
      `SELECT * FROM tournaments WHERE name LIKE 'Daily Master%'`,
    );
    expect(rows).toHaveLength(1);
  });

  // ── Step 3: Non-premium users manually register via HTTP ───────────────────

  it("should allow 9 non-premium users to register manually via HTTP", async () => {
    for (let i = 0; i < 9; i++) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tournaments/${tournamentId}/register`)
        .set("Authorization", `Bearer ${manualUsers[i].accessToken}`)
        .send({ bot_id: manualBots[i].id });

      expect(res.status).toBe(201);
    }

    // Verify 19 total entries
    const entries = await ds.query(
      `SELECT * FROM tournament_entries WHERE tournament_id = $1`,
      [tournamentId],
    );
    expect(entries).toHaveLength(19);
  });

  // ── Step 4: Duplicate registration should be rejected ──────────────────────

  it("should reject duplicate manual registration", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/tournaments/${tournamentId}/register`)
      .set("Authorization", `Bearer ${manualUsers[0].accessToken}`)
      .send({ bot_id: manualBots[0].id });

    expect(res.status).toBe(400);
  });

  // ── Step 5: 20:55 Cron — Lock tournament, calculate pool, shuffle, split pods

  let podRows: Array<{
    id: string;
    pod_number: number;
    prize_pool: string;
    player_count: number;
    status: string;
  }>;

  it("should lock tournament and create pods at 20:55", async () => {
    await matchmaking.lockAndCreatePods();

    // Tournament should now be "running" (locked)
    const tournament = await ds.query(
      `SELECT * FROM tournaments WHERE id = $1`,
      [tournamentId],
    );
    expect(tournament[0].status).toBe("running");

    // Pods should exist
    podRows = await ds.query(
      `SELECT * FROM tournament_pods WHERE master_tournament_id = $1 ORDER BY pod_number`,
      [tournamentId],
    );

    // 19 players / 9 per pod = 3 pods (7, 6, 6 or similar distribution)
    expect(podRows.length).toBeGreaterThanOrEqual(2);
    expect(podRows.length).toBeLessThanOrEqual(3);

    // Total player count across pods should be 19
    const totalPlayers = podRows.reduce(
      (sum: number, p: { player_count: number }) => sum + p.player_count,
      0,
    );
    expect(totalPlayers).toBe(19);

    // All pods should be "pending"
    for (const pod of podRows) {
      expect(pod.status).toBe("pending");
    }

    // Prize pool should be distributed (60% of 10 * 1000 / 30 = 200)
    const totalPrize = podRows.reduce(
      (sum: bigint, p: { prize_pool: string }) => sum + BigInt(p.prize_pool),
      0n,
    );
    expect(totalPrize).toBe(200n); // 10 users * 1000 monthly * 60% / 30 = 200

    // Each pod should have prize_pool > 0
    for (const pod of podRows) {
      expect(BigInt(pod.prize_pool) > 0n).toBe(true);
    }
  });

  // ── Step 6: Registration should be blocked after lock ──────────────────────

  it("should reject registration after tournament is locked", async () => {
    // Create an extra user+bot
    const lateUser = await createUser(ds, jwt);
    const lateBot = await createBot(ds, lateUser.id, "LatecomerBot");

    const res = await request(app.getHttpServer())
      .post(`/api/v1/tournaments/${tournamentId}/register`)
      .set("Authorization", `Bearer ${lateUser.accessToken}`)
      .send({ bot_id: lateBot.id });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("not accepting registrations");
  });

  // ── Step 7: Simulate tournament completion + prize distribution ─────────────

  it("should distribute prizes to 15% ITM winners when pods finish", async () => {
    // For each pod, simulate the tournament finishing:
    // - Assign finish positions to entries (bot_id → position)
    // - Emit tournament.podFinished event
    // - PrizeDistributionService handles payout atomically

    for (const pod of podRows) {
      const playerCount = pod.player_count;

      // Get entries for this pod's players.
      // Since we don't have a pod→entries FK, we slice from all entries by pod order.
      // In the real system, the TournamentDirector tracks which bots are in each pod.
      // For this test, we'll use the entries in pod order.
      const allEntries = await ds.query(
        `SELECT te.bot_id FROM tournament_entries te
         WHERE te.tournament_id = $1
         ORDER BY te.created_at`,
        [tournamentId],
      );

      // Calculate which slice of entries belongs to this pod
      let offset = 0;
      for (const p of podRows) {
        if (p.id === pod.id) break;
        offset += p.player_count;
      }
      const podEntries = allEntries.slice(offset, offset + playerCount);
      const podBotIds = podEntries.map((e: { bot_id: string }) => e.bot_id);

      // Winner is the first bot, bust order is rest (reversed = last busted is 2nd place)
      const winnerId = podBotIds[0];
      const bustOrder = podBotIds.slice(1).map((botId: string, i: number) => ({
        botId,
        finishPosition: playerCount - i,
        isTied: false,
      }));

      // Emit the event — PrizeDistributionService will handle it
      await prizes.handlePodFinished({
        podId: pod.id,
        bustOrder,
        winnerId,
      });
    }

    // Verify all pods are now "finished"
    const finishedPods = await ds.query(
      `SELECT * FROM tournament_pods WHERE master_tournament_id = $1`,
      [tournamentId],
    );
    for (const pod of finishedPods) {
      expect(pod.status).toBe("finished");
      expect(pod.winner_bot_id).not.toBeNull();
    }
  });

  // ── Step 8: Verify transaction records were created ─────────────────────────

  it("should have created transaction records for all payouts", async () => {
    const txRows = await ds.query(
      `SELECT * FROM transactions WHERE type = 'payout' AND reference_id IN (${podRows.map((_, i) => `$${i + 1}`).join(",")})`,
      podRows.map((p) => p.id),
    );

    // Each pod pays out Math.max(1, floor(playerCount * 0.15)) winners
    let expectedPayouts = 0;
    for (const pod of podRows) {
      expectedPayouts += Math.max(1, Math.floor(pod.player_count * 0.15));
    }

    expect(txRows.length).toBe(expectedPayouts);

    // All payout amounts should be positive
    for (const tx of txRows) {
      expect(BigInt(tx.amount) > 0n).toBe(true);
      expect(tx.type).toBe("payout");
    }
  });

  // ── Step 9: Verify winner wallets were credited ─────────────────────────────

  it("should have credited winner wallets above initial deposit", async () => {
    // The first bot in each pod won — find their owner's wallet
    let offset = 0;
    const allEntries = await ds.query(
      `SELECT te.bot_id, b.user_id FROM tournament_entries te
       JOIN bots b ON b.id = te.bot_id
       WHERE te.tournament_id = $1
       ORDER BY te.created_at`,
      [tournamentId],
    );

    for (const pod of podRows) {
      const winnerBotId = allEntries[offset].bot_id;
      const winnerUserId = allEntries[offset].user_id;

      const wallet = await finance.getWallet(winnerUserId);
      // Initial deposit was 50000, winner got a payout on top
      expect(BigInt(wallet.balance) > 50000n).toBe(true);

      offset += pod.player_count;
    }
  });

  // ── Step 10: Verify non-winners' wallets are unchanged ──────────────────────

  it("should not have changed non-winner wallets", async () => {
    // Get all user IDs who received payouts
    const payoutTxs = await ds.query(
      `SELECT DISTINCT w.user_id FROM transactions t
       JOIN wallets w ON w.id = t.wallet_id
       WHERE t.type = 'payout'`,
    );
    const paidUserIds = new Set(
      payoutTxs.map((t: { user_id: string }) => t.user_id),
    );

    // Check wallets of users who did NOT win
    const allUsers = [...premiumUsers, ...manualUsers];
    for (const user of allUsers) {
      if (!paidUserIds.has(user.id)) {
        const wallet = await finance.getWallet(user.id);
        expect(wallet.balance).toBe("50000"); // unchanged
      }
    }
  });

  // ── Step 11: Verify payout math — total paid out equals total prize pool ────

  it("should have total payouts equal to total prize pool", async () => {
    const totalPrize = podRows.reduce(
      (sum: bigint, p: { prize_pool: string }) => sum + BigInt(p.prize_pool),
      0n,
    );

    const payoutSum = await ds.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'payout'`,
    );
    const totalPaid = BigInt(payoutSum[0].total);

    expect(totalPaid).toBe(totalPrize);
  });

  // ── Step 12: Verify finance endpoints return correct data via HTTP ──────────

  it("should return wallet and transactions via HTTP endpoints", async () => {
    const user = premiumUsers[0];

    // GET wallet
    const walletRes = await request(app.getHttpServer())
      .get("/api/v1/finance/wallet")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);

    expect(walletRes.body.user_id).toBe(user.id);
    expect(walletRes.body.balance).toBeTruthy();

    // GET transactions
    const txRes = await request(app.getHttpServer())
      .get("/api/v1/finance/transactions")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);

    expect(txRes.body.data).toBeInstanceOf(Array);
    expect(txRes.body.total).toBeGreaterThanOrEqual(1); // at least the deposit
    expect(txRes.body.data[0]).toHaveProperty("type");
    expect(txRes.body.data[0]).toHaveProperty("amount");
  });

  // ── Step 13: Verify deposit and withdraw endpoints work ─────────────────────

  it("should handle deposit and withdraw correctly via HTTP", async () => {
    const user = manualUsers[0];

    // Deposit
    const depositRes = await request(app.getHttpServer())
      .post("/api/v1/finance/deposit")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ amount: 5000 })
      .expect(201);

    expect(depositRes.body.type).toBe("deposit");
    expect(depositRes.body.amount).toBe("5000");

    // Verify new balance
    const walletAfterDeposit = await finance.getWallet(user.id);
    expect(walletAfterDeposit.balance).toBe("55000");

    // Withdraw
    const withdrawRes = await request(app.getHttpServer())
      .post("/api/v1/finance/withdraw")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ amount: 3000 })
      .expect(201);

    expect(withdrawRes.body.type).toBe("withdrawal");

    // Verify after withdraw
    const walletAfterWithdraw = await finance.getWallet(user.id);
    expect(walletAfterWithdraw.balance).toBe("52000");
  });

  // ── Step 14: Insufficient balance should fail ───────────────────────────────

  it("should reject withdrawal exceeding balance", async () => {
    const user = manualUsers[1];

    const res = await request(app.getHttpServer())
      .post("/api/v1/finance/withdraw")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ amount: 999999999 })
      .expect(400);

    expect(res.body.message).toContain("Insufficient");
  });

  // ── Step 15: Verify daily pool calculation is correct ───────────────────────

  it("should calculate daily pool correctly from premium subscriptions", async () => {
    const pool = await matchmaking.calculateDailyPool();
    // 10 premium users * 1000 monthly_fee = 10000 total
    // 60% = 6000 / 30 days = 200 per day
    expect(pool).toBe(200n);
  });

  // ── Step 16: Verify shuffle produces all elements ───────────────────────────

  it("should shuffle players without losing any", () => {
    const players = Array.from({ length: 100 }, (_, i) => `p${i}`);
    const shuffled = matchmaking.shufflePlayers([...players]);
    expect(shuffled).toHaveLength(100);
    expect(new Set(shuffled).size).toBe(100);
  });

  // ── Step 17: Verify pod payout math for each pod ────────────────────────────

  it("should calculate correct ITM payouts per pod", () => {
    for (const pod of podRows) {
      const payouts = prizes.calculatePodPayouts(
        BigInt(pod.prize_pool),
        pod.player_count,
      );

      // ITM count = max(1, floor(count * 0.15))
      const expectedItm = Math.max(1, Math.floor(pod.player_count * 0.15));
      expect(payouts).toHaveLength(expectedItm);

      // Sum should equal pod prize pool
      const total = payouts.reduce((s, p) => s + p.amount, 0n);
      expect(total).toBe(BigInt(pod.prize_pool));

      // First place gets the most (if > 1 ITM)
      if (payouts.length > 1) {
        expect(payouts[0].amount > payouts[1].amount).toBe(true);
      }
    }
  });
});
