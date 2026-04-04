import { describe, it, expect } from "vitest";
import { PrizeDistributionService } from "../../src/modules/matchmaking/prize-distribution.service";
import { MatchmakingService } from "../../src/modules/matchmaking/matchmaking.service";

/**
 * Integration test covering the full flow from prize calculation through
 * pod splitting. Uses the pure (non-DB) methods to verify math accuracy
 * end-to-end without requiring a running database.
 */

const prizeService = Object.create(
  PrizeDistributionService.prototype,
) as PrizeDistributionService;
const matchService = Object.create(
  MatchmakingService.prototype,
) as MatchmakingService;

describe("Finance + Tournament Integration Flow", () => {
  it("should split players into pods and distribute prizes correctly", () => {
    // Simulate 45 premium users paying 1000/month each
    const monthlyRevenue = 45n * 1000n;
    const dailyPool = (monthlyRevenue * 60n) / 100n / 30n; // 60% / 30 days = 900

    // Split 45 players into pods of 9
    const podSizes = matchService.calculatePodSplit(45, 9);
    expect(podSizes).toEqual([9, 9, 9, 9, 9]);

    // Distribute daily pool across 5 pods
    const podCount = BigInt(podSizes.length);
    const basePrize = dailyPool / podCount;
    const remainder = dailyPool - basePrize * podCount;
    const podPrizes = podSizes.map(
      (_, i) => basePrize + (i === 0 ? remainder : 0n),
    );

    // Total should equal daily pool
    const totalDistributed = podPrizes.reduce((a, b) => a + b, 0n);
    expect(totalDistributed).toBe(dailyPool);

    // Each pod pays out 15% ITM: floor(9 * 0.15) = 1 winner
    for (const prize of podPrizes) {
      const payouts = prizeService.calculatePodPayouts(prize, 9);
      expect(payouts).toHaveLength(1);
      expect(payouts[0].amount).toBe(prize);
      expect(payouts[0].percentage).toBe(100);
    }
  });

  it("should handle large field with multi-position ITM", () => {
    const dailyPool = 50000n;

    // 100 players → 12 pods of ~8-9 each
    const podSizes = matchService.calculatePodSplit(100, 9);
    const totalPlayers = podSizes.reduce((a, b) => a + b, 0);
    expect(totalPlayers).toBe(100);

    // Prize per pod
    const podCount = BigInt(podSizes.length);
    const basePrize = dailyPool / podCount;

    for (let i = 0; i < podSizes.length; i++) {
      const payouts = prizeService.calculatePodPayouts(basePrize, podSizes[i]);
      const total = payouts.reduce((sum, p) => sum + p.amount, 0n);
      expect(total).toBe(basePrize);
      // 1st place should get the most
      if (payouts.length > 1) {
        expect(payouts[0].amount > payouts[1].amount).toBe(true);
      }
    }
  });

  it("should handle shuffle + split without losing any players", () => {
    const players = Array.from({ length: 1000 }, (_, i) => `player-${i}`);
    const shuffled = matchService.shufflePlayers([...players]);

    // All players present
    expect(shuffled).toHaveLength(1000);
    expect(new Set(shuffled).size).toBe(1000);

    // Split into pods
    const podSizes = matchService.calculatePodSplit(1000, 9);
    const podTotal = podSizes.reduce((a, b) => a + b, 0);
    expect(podTotal).toBe(1000);

    // No pod too small
    for (const size of podSizes) {
      expect(size).toBeGreaterThanOrEqual(2);
    }
  });

  it("should handle minimum viable tournament (2 players)", () => {
    const podSizes = matchService.calculatePodSplit(2, 9);
    expect(podSizes).toEqual([2]);

    const payouts = prizeService.calculatePodPayouts(1000n, 2);
    expect(payouts).toHaveLength(1); // floor(2 * 0.15) = 0 → minimum 1
    expect(payouts[0].amount).toBe(1000n);
  });

  it("should handle edge case: 1 player", () => {
    const podSizes = matchService.calculatePodSplit(1, 9);
    expect(podSizes).toEqual([1]);

    const payouts = prizeService.calculatePodPayouts(500n, 1);
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amount).toBe(500n);
  });
});
