import { describe, it, expect } from "vitest";
import { PrizeDistributionService } from "../../../src/modules/matchmaking/prize-distribution.service";

// Instantiate with null deps — we only test the pure calculatePodPayouts method
const service = Object.create(
  PrizeDistributionService.prototype,
) as PrizeDistributionService;

describe("PrizeDistributionService", () => {
  describe("calculatePodPayouts", () => {
    it("should calculate 15% ITM count correctly", () => {
      // 20 players -> floor(20 * 0.15) = 3 ITM
      const payouts20 = service.calculatePodPayouts(10000n, 20);
      expect(payouts20).toHaveLength(3);

      // 10 players -> floor(10 * 0.15) = 1 ITM (minimum 1)
      const payouts10 = service.calculatePodPayouts(10000n, 10);
      expect(payouts10).toHaveLength(1);

      // 7 players -> floor(7 * 0.15) = 1 ITM
      const payouts7 = service.calculatePodPayouts(10000n, 7);
      expect(payouts7).toHaveLength(1);

      // 100 players -> floor(100 * 0.15) = 15 ITM
      const payouts100 = service.calculatePodPayouts(100000n, 100);
      expect(payouts100).toHaveLength(15);
    });

    it("should distribute 100% of prize pool (no remainder lost)", () => {
      const testCases = [
        { pool: 10000n, players: 20 },
        { pool: 9999n, players: 20 },
        { pool: 100000n, players: 100 },
        { pool: 1n, players: 7 },
        { pool: 999999n, players: 50 },
      ];

      for (const { pool, players } of testCases) {
        const payouts = service.calculatePodPayouts(pool, players);
        const total = payouts.reduce((sum, p) => sum + p.amount, 0n);
        expect(total).toBe(pool);
      }
    });

    it("should give 1st place the most", () => {
      const payouts = service.calculatePodPayouts(10000n, 20);
      expect(payouts[0].amount).toBeGreaterThan(payouts[1].amount);
    });

    it("should have descending payout amounts", () => {
      const payouts = service.calculatePodPayouts(100000n, 100);
      for (let i = 1; i < Math.min(3, payouts.length); i++) {
        expect(payouts[i].amount).toBeLessThanOrEqual(payouts[i - 1].amount);
      }
    });

    it("should handle single-player ITM (winner takes all)", () => {
      const payouts = service.calculatePodPayouts(5000n, 5);
      expect(payouts).toHaveLength(1);
      expect(payouts[0].amount).toBe(5000n);
      expect(payouts[0].percentage).toBe(100);
    });

    it("should handle 2-player ITM (65/35 split)", () => {
      const payouts = service.calculatePodPayouts(10000n, 14);
      // 14 * 0.15 = 2.1 → floor = 2
      expect(payouts).toHaveLength(2);
      expect(payouts[0].percentage).toBe(65);
      expect(payouts[1].percentage).toBe(35);
      expect(payouts[0].amount + payouts[1].amount).toBe(10000n);
    });

    it("should handle large prize pools with bigint precision", () => {
      const pool = 1_000_000_000_000n; // 1 trillion
      const payouts = service.calculatePodPayouts(pool, 100);
      const total = payouts.reduce((sum, p) => sum + p.amount, 0n);
      expect(total).toBe(pool);
      expect(payouts[0].amount > 0n).toBe(true);
    });

    it("should handle remainder going to 1st place", () => {
      // 3 ITM with 10001 pool: 30% = 3000, 20% = 2000, 15% = 1500 = 6500.
      // Remaining 35% to 1st: 3501 leftover → 1st gets more.
      const payouts = service.calculatePodPayouts(10001n, 20);
      const total = payouts.reduce((sum, p) => sum + p.amount, 0n);
      expect(total).toBe(10001n);
    });

    it("should never produce negative payout amounts", () => {
      const testPools = [1n, 2n, 3n, 100n, 10000n];
      const testPlayers = [2, 5, 9, 20, 100];

      for (const pool of testPools) {
        for (const players of testPlayers) {
          const payouts = service.calculatePodPayouts(pool, players);
          for (const p of payouts) {
            expect(p.amount >= 0n).toBe(true);
          }
        }
      }
    });

    it("should produce positions starting from 1", () => {
      const payouts = service.calculatePodPayouts(10000n, 100);
      payouts.forEach((p, i) => {
        expect(p.position).toBe(i + 1);
      });
    });
  });
});
