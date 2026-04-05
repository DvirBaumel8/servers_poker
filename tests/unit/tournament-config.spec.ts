import { describe, it, expect } from "vitest";
import {
  calculatePrizes,
  getBlindLevel,
  BLIND_LEVELS,
} from "../../src/config/tournaments.config";

describe("calculatePrizes", () => {
  it("distributes 100% of the prize pool (no funds lost)", () => {
    const cases = [
      { pool: 10000n, players: 5 },
      { pool: 10000n, players: 9 },
      { pool: 10000n, players: 20 },
      { pool: 9999n, players: 20 }, // odd number — remainder to 1st
      { pool: 100000n, players: 100 },
      { pool: 1n, players: 7 },
    ];
    for (const { pool, players } of cases) {
      const payouts = calculatePrizes(pool, players);
      const total = payouts.reduce((s, p) => s + p.amount, 0n);
      expect(total).toBe(pool);
    }
  });

  it("small fields (≤6 players): winner takes all", () => {
    for (const n of [1, 2, 3, 5, 6]) {
      const payouts = calculatePrizes(1000n, n);
      expect(payouts).toHaveLength(1);
      expect(payouts[0].amount).toBe(1000n);
      expect(payouts[0].position).toBe(1);
    }
  });

  it("13 players → 1 ITM (floor(13*0.15)=1): winner takes all", () => {
    const payouts = calculatePrizes(5000n, 13);
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amount).toBe(5000n);
  });

  it("14 players → 2 ITM: 65/35 split", () => {
    const payouts = calculatePrizes(10000n, 14);
    expect(payouts).toHaveLength(2);
    expect(payouts[0].percentage).toBe(65);
    expect(payouts[1].percentage).toBe(35);
    expect(payouts[0].amount + payouts[1].amount).toBe(10000n);
  });

  it("20 players → 3 ITM: 65% / 20% / 15%", () => {
    const payouts = calculatePrizes(10000n, 20);
    expect(payouts).toHaveLength(3);
    expect(payouts[0].percentage).toBe(65); // 30 + 35 leftover
    expect(payouts[1].percentage).toBe(20);
    expect(payouts[2].percentage).toBe(15);
  });

  it("27 players → 4 ITM: 4th place must NOT exceed 1st (regression for bug fix)", () => {
    const payouts = calculatePrizes(10000n, 27);
    expect(payouts).toHaveLength(4);
    expect(payouts[0].amount).toBeGreaterThan(payouts[3].amount);
    // 4th capped at 15% (last curve value), leftover goes to 1st
    expect(payouts[3].percentage).toBe(15);
    expect(payouts[0].percentage).toBe(50); // 30 + 20 leftover
  });

  it("34 players → 5 ITM: 4th and 5th capped at 15%", () => {
    const payouts = calculatePrizes(10000n, 34);
    expect(payouts).toHaveLength(5);
    expect(payouts[3].percentage).toBe(15);
    expect(payouts[4].percentage).toBe(15);
    expect(payouts[0].percentage).toBe(35); // 30 + 5 leftover
  });

  it("100 players → 15 ITM", () => {
    const payouts = calculatePrizes(100000n, 100);
    expect(payouts).toHaveLength(15);
  });

  it("payouts are in non-increasing order for all realistic field sizes", () => {
    for (const n of [5, 9, 14, 20, 27, 34, 50, 100]) {
      const payouts = calculatePrizes(100000n, n);
      for (let i = 1; i < payouts.length; i++) {
        expect(payouts[i].amount).toBeLessThanOrEqual(payouts[i - 1].amount);
      }
    }
  });

  it("1st place always gets the most", () => {
    for (const n of [14, 20, 27, 34, 50, 100]) {
      const payouts = calculatePrizes(100000n, n);
      if (payouts.length > 1) {
        expect(payouts[0].amount).toBeGreaterThan(payouts[1].amount);
      }
    }
  });

  it("positions are sequential starting from 1", () => {
    const payouts = calculatePrizes(10000n, 100);
    payouts.forEach((p, i) => expect(p.position).toBe(i + 1));
  });

  it("never produces negative amounts", () => {
    for (const pool of [1n, 2n, 3n, 100n]) {
      for (const n of [2, 5, 14, 20]) {
        for (const p of calculatePrizes(pool, n)) {
          expect(p.amount >= 0n).toBe(true);
        }
      }
    }
  });

  it("handles large prize pools with bigint precision", () => {
    const pool = 1_000_000_000_000n;
    const payouts = calculatePrizes(pool, 100);
    const total = payouts.reduce((s, p) => s + p.amount, 0n);
    expect(total).toBe(pool);
  });
});

describe("getBlindLevel", () => {
  it("level 1 returns the first blind level", () => {
    const level = getBlindLevel(1);
    expect(level).toEqual(BLIND_LEVELS[0]);
  });

  it("beyond the last level returns the final level (capped)", () => {
    const last = BLIND_LEVELS[BLIND_LEVELS.length - 1];
    expect(getBlindLevel(999)).toEqual(last);
  });

  it("each blind level has big = 2x small", () => {
    for (const level of BLIND_LEVELS) {
      expect(level.big_blind).toBe(level.small_blind * 2);
    }
  });

  it("blind levels strictly increase", () => {
    for (let i = 1; i < BLIND_LEVELS.length; i++) {
      expect(BLIND_LEVELS[i].small_blind).toBeGreaterThan(
        BLIND_LEVELS[i - 1].small_blind,
      );
    }
  });
});
