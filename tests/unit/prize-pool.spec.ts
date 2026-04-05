import { describe, it, expect, beforeEach } from "vitest";
import {
  PrizePoolService,
  PayoutResult,
} from "../../src/services/prize-pool.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

function sumAmounts(payouts: PayoutResult[]): number {
  return payouts.reduce((acc, p) => acc + p.amount, 0);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let service: PrizePoolService;

beforeEach(() => {
  service = new PrizePoolService();
});

// ── Tier 1: 1–6 players ───────────────────────────────────────────────────────

describe("Tier 1–6 players", () => {
  it("single player: 1 payout at 100%", () => {
    const payouts = service.calculatePayouts(10000, 1);
    expect(payouts).toHaveLength(1);
    expect(payouts[0].rank).toBe(1);
    expect(payouts[0].percentage).toBe(100);
    expect(payouts[0].amount).toBe(10000);
  });

  it("6 players: 1 payout at 100%", () => {
    const payouts = service.calculatePayouts(5000, 6);
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amount).toBe(5000);
  });

  it("sum equals pool for tier 1", () => {
    const pool = 9999;
    expect(sumAmounts(service.calculatePayouts(pool, 4))).toBe(pool);
  });
});

// ── Tier 2: 7–15 players ─────────────────────────────────────────────────────

describe("Tier 7–15 players", () => {
  it("7 players: 2 payouts, 70/30 split", () => {
    const payouts = service.calculatePayouts(10000, 7);
    expect(payouts).toHaveLength(2);
    expect(payouts[0].percentage).toBe(70);
    expect(payouts[1].percentage).toBe(30);
    expect(payouts[0].amount).toBe(7000);
    expect(payouts[1].amount).toBe(3000);
  });

  it("15 players: still 2 payouts", () => {
    const payouts = service.calculatePayouts(10000, 15);
    expect(payouts).toHaveLength(2);
  });

  it("sum equals pool for tier 2", () => {
    const pool = 7777;
    expect(sumAmounts(service.calculatePayouts(pool, 10))).toBe(pool);
  });
});

// ── Tier 3: 16–30 players ────────────────────────────────────────────────────

describe("Tier 16–30 players", () => {
  it("16 players: 3 payouts, 50/30/20 split", () => {
    const payouts = service.calculatePayouts(10000, 16);
    expect(payouts).toHaveLength(3);
    expect(payouts[0].percentage).toBe(50);
    expect(payouts[1].percentage).toBe(30);
    expect(payouts[2].percentage).toBe(20);
  });

  it("30 players: still 3 payouts", () => {
    const payouts = service.calculatePayouts(10000, 30);
    expect(payouts).toHaveLength(3);
  });

  it("sum equals pool for tier 3", () => {
    const pool = 3001;
    expect(sumAmounts(service.calculatePayouts(pool, 20))).toBe(pool);
  });
});

// ── Tier 4: 31–50 players ────────────────────────────────────────────────────

describe("Tier 31–50 players", () => {
  it("31 players: 5 payouts, [40,25,15,12,8]", () => {
    const payouts = service.calculatePayouts(10000, 31);
    expect(payouts).toHaveLength(5);
    expect(payouts.map((p) => p.percentage)).toEqual([40, 25, 15, 12, 8]);
  });

  it("50 players: still 5 payouts", () => {
    const payouts = service.calculatePayouts(10000, 50);
    expect(payouts).toHaveLength(5);
  });

  it("sum equals pool for tier 4", () => {
    const pool = 12345;
    expect(sumAmounts(service.calculatePayouts(pool, 40))).toBe(pool);
  });
});

// ── Tier 5: 51–99 players ────────────────────────────────────────────────────

describe("Tier 51–99 players", () => {
  it("51 players: 8 payouts, [30,20,15,10,8,7,5,5]", () => {
    const payouts = service.calculatePayouts(10000, 51);
    expect(payouts).toHaveLength(8);
    expect(payouts.map((p) => p.percentage)).toEqual([
      30, 20, 15, 10, 8, 7, 5, 5,
    ]);
  });

  it("99 players: still 8 payouts", () => {
    const payouts = service.calculatePayouts(10000, 99);
    expect(payouts).toHaveLength(8);
  });

  it("sum equals pool for tier 5", () => {
    const pool = 50001;
    expect(sumAmounts(service.calculatePayouts(pool, 75))).toBe(pool);
  });
});

// ── Tier 6: 100+ players ─────────────────────────────────────────────────────

describe("Tier 100+ players", () => {
  it("100 players: ITM = 10, top-3 percentages = [25, 15, 10]", () => {
    const payouts = service.calculatePayouts(100000, 100);
    expect(payouts).toHaveLength(10);
    expect(payouts[0].percentage).toBe(25);
    expect(payouts[1].percentage).toBe(15);
    expect(payouts[2].percentage).toBe(10);
  });

  it("100 players: 4th–10th place have decreasing amounts (decay)", () => {
    const payouts = service.calculatePayouts(100000, 100);
    const tail = payouts.slice(3);
    for (let i = 0; i < tail.length - 1; i++) {
      expect(tail[i].amount).toBeGreaterThanOrEqual(tail[i + 1].amount);
    }
  });

  it("150 players: ITM = 15, has 12 decay slots", () => {
    const payouts = service.calculatePayouts(100000, 150);
    expect(payouts).toHaveLength(15);
  });

  it("200 players: ITM = 20", () => {
    const payouts = service.calculatePayouts(100000, 200);
    expect(payouts).toHaveLength(20);
  });

  it("sum equals pool for tier 6 (100 players)", () => {
    const pool = 100000;
    expect(sumAmounts(service.calculatePayouts(pool, 100))).toBe(pool);
  });

  it("sum equals pool for tier 6 (500 players)", () => {
    const pool = 999999;
    expect(sumAmounts(service.calculatePayouts(pool, 500))).toBe(pool);
  });
});

// ── Remainder / rounding safety ───────────────────────────────────────────────

describe("Remainder safety", () => {
  it("odd pool (101) sums exactly to 101 — tier 2", () => {
    const payouts = service.calculatePayouts(101, 10);
    expect(sumAmounts(payouts)).toBe(101);
    expect(payouts[0].amount).toBeGreaterThan(payouts[1].amount);
  });

  it("prime pool (997) across all tiers sums exactly", () => {
    const pool = 997;
    for (const n of [1, 7, 16, 31, 51, 100]) {
      expect(sumAmounts(service.calculatePayouts(pool, n))).toBe(pool);
    }
  });

  it("remainder always goes to rank 1 (not rank 2)", () => {
    // 101 × 70% = 70.7 → 70, 101 × 30% = 30.3 → 30, remaining = 1 → goes to rank 1
    const payouts = service.calculatePayouts(101, 10);
    expect(payouts[0].rank).toBe(1);
    expect(payouts[0].amount).toBeGreaterThanOrEqual(payouts[1].amount);
  });
});

// ── Boundary checks ───────────────────────────────────────────────────────────

describe("Tier boundary switches", () => {
  it("6 players → 1 payout; 7 players → 2 payouts", () => {
    expect(service.calculatePayouts(1000, 6)).toHaveLength(1);
    expect(service.calculatePayouts(1000, 7)).toHaveLength(2);
  });

  it("15 players → 2 payouts; 16 players → 3 payouts", () => {
    expect(service.calculatePayouts(1000, 15)).toHaveLength(2);
    expect(service.calculatePayouts(1000, 16)).toHaveLength(3);
  });

  it("30 players → 3 payouts; 31 players → 5 payouts", () => {
    expect(service.calculatePayouts(1000, 30)).toHaveLength(3);
    expect(service.calculatePayouts(1000, 31)).toHaveLength(5);
  });

  it("50 players → 5 payouts; 51 players → 8 payouts", () => {
    expect(service.calculatePayouts(1000, 50)).toHaveLength(5);
    expect(service.calculatePayouts(1000, 51)).toHaveLength(8);
  });

  it("99 players → 8 payouts; 100 players → 10 payouts", () => {
    expect(service.calculatePayouts(1000, 99)).toHaveLength(8);
    expect(service.calculatePayouts(1000, 100)).toHaveLength(10);
  });
});

// ── Structural invariants ─────────────────────────────────────────────────────

describe("Structural invariants", () => {
  it("ranks are 1-indexed and sequential", () => {
    const payouts = service.calculatePayouts(10000, 100);
    payouts.forEach((p, i) => expect(p.rank).toBe(i + 1));
  });

  it("first place always pays the most", () => {
    for (const n of [1, 7, 16, 31, 51, 100]) {
      const payouts = service.calculatePayouts(100000, n);
      const max = Math.max(...payouts.map((p) => p.amount));
      expect(payouts[0].amount).toBe(max);
    }
  });

  it("all amounts are positive integers", () => {
    const payouts = service.calculatePayouts(10000, 100);
    payouts.forEach((p) => {
      expect(Number.isInteger(p.amount)).toBe(true);
      expect(p.amount).toBeGreaterThan(0);
    });
  });
});

// ── Input validation ──────────────────────────────────────────────────────────

describe("Input validation", () => {
  it("throws if totalPool is 0", () => {
    expect(() => service.calculatePayouts(0, 10)).toThrow();
  });

  it("throws if totalPool is negative", () => {
    expect(() => service.calculatePayouts(-1, 10)).toThrow();
  });

  it("throws if participantCount is 0", () => {
    expect(() => service.calculatePayouts(1000, 0)).toThrow();
  });

  it("throws if participantCount is negative", () => {
    expect(() => service.calculatePayouts(1000, -5)).toThrow();
  });
});
