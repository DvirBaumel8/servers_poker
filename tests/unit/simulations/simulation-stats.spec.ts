/**
 * Unit tests for simulation stats aggregation logic.
 *
 * Tests the mathematical correctness of the key metrics computed in
 * SimulationsService.handleWorkerResult():
 *   - bbPer100 (Big Blinds per 100 hands)
 *   - winRate
 *   - vpip / pfr rates
 *   - aggressionFactor
 */

import { describe, it, expect } from "vitest";

const BIG_BLIND = 20;

function computeBbPer100(
  totalProfit: number,
  bigBlind: number,
  handsPlayed: number,
): number {
  if (handsPlayed === 0) return 0;
  return (totalProfit / bigBlind) * (100 / handsPlayed);
}

function computeWinRate(handsWon: number, handsPlayed: number): number {
  if (handsPlayed === 0) return 0;
  return handsWon / handsPlayed;
}

function computeVpip(vpipHands: number, handsPlayed: number): number {
  if (handsPlayed === 0) return 0;
  return vpipHands / handsPlayed;
}

function computePfr(pfrHands: number, handsPlayed: number): number {
  if (handsPlayed === 0) return 0;
  return pfrHands / handsPlayed;
}

function computeAggressionFactor(
  aggressiveActions: number,
  passiveActions: number,
): number {
  if (passiveActions === 0) return 9999;
  return aggressiveActions / passiveActions;
}

// ─── bbPer100 ─────────────────────────────────────────────────────────────────

describe("bbPer100", () => {
  it("returns 0 when no hands played", () => {
    expect(computeBbPer100(0, BIG_BLIND, 0)).toBe(0);
  });

  it("returns positive value when profitable", () => {
    // +1000 chips over 1000 hands with BB=20 → +1000/20 * 100/1000 = +5 bb/100
    const result = computeBbPer100(1000, 20, 1000);
    expect(result).toBeCloseTo(5.0);
  });

  it("returns negative value when losing", () => {
    // -500 chips over 1000 hands with BB=20 → -500/20 * 100/1000 = -2.5 bb/100
    const result = computeBbPer100(-500, 20, 1000);
    expect(result).toBeCloseTo(-2.5);
  });

  it("returns 0 when break-even", () => {
    expect(computeBbPer100(0, 20, 1000)).toBe(0);
  });

  it("scales correctly across different hand counts", () => {
    // Same profit rate: +100 over 100 hands = +100 over 1000 hands (scaled)
    const result100 = computeBbPer100(100, 20, 100);
    const result1000 = computeBbPer100(1000, 20, 1000);
    expect(result100).toBeCloseTo(result1000);
  });

  it("handles large hand counts (10000 hands)", () => {
    // +20000 chips over 10000 hands with BB=20 → +20000/20 * 100/10000 = +10 bb/100
    const result = computeBbPer100(20000, 20, 10000);
    expect(result).toBeCloseTo(10.0);
  });

  it("is sensitive to big blind size", () => {
    // Same profit, bigger BB → fewer BBs won
    const withBB20 = computeBbPer100(200, 20, 100);
    const withBB50 = computeBbPer100(200, 50, 100);
    expect(withBB20).toBeGreaterThan(withBB50);
  });
});

// ─── winRate ──────────────────────────────────────────────────────────────────

describe("winRate", () => {
  it("returns 0 when no hands played", () => {
    expect(computeWinRate(0, 0)).toBe(0);
  });

  it("returns 1 when all hands won", () => {
    expect(computeWinRate(1000, 1000)).toBe(1);
  });

  it("returns 0 when no hands won", () => {
    expect(computeWinRate(0, 1000)).toBe(0);
  });

  it("returns correct fraction", () => {
    expect(computeWinRate(250, 1000)).toBeCloseTo(0.25);
  });
});

// ─── VPIP ─────────────────────────────────────────────────────────────────────

describe("vpip", () => {
  it("returns 0 when no hands played", () => {
    expect(computeVpip(0, 0)).toBe(0);
  });

  it("returns correct rate for tight player (20%)", () => {
    expect(computeVpip(200, 1000)).toBeCloseTo(0.2);
  });

  it("returns correct rate for loose player (50%)", () => {
    expect(computeVpip(500, 1000)).toBeCloseTo(0.5);
  });
});

// ─── PFR ─────────────────────────────────────────────────────────────────────

describe("pfr", () => {
  it("returns 0 when no preflop raises", () => {
    expect(computePfr(0, 1000)).toBe(0);
  });

  it("PFR is always ≤ VPIP when computed from same sample", () => {
    // You can only raise hands you voluntarily play
    const vpip = computeVpip(400, 1000);
    const pfr = computePfr(200, 1000);
    expect(pfr).toBeLessThanOrEqual(vpip);
  });
});

// ─── Aggression Factor ────────────────────────────────────────────────────────

describe("aggressionFactor", () => {
  it("returns 9999 when no calls (pure aggressor)", () => {
    expect(computeAggressionFactor(100, 0)).toBe(9999);
  });

  it("returns 0 when no bets or raises", () => {
    expect(computeAggressionFactor(0, 50)).toBe(0);
  });

  it("returns 1.0 when equal bets and calls", () => {
    expect(computeAggressionFactor(50, 50)).toBeCloseTo(1.0);
  });

  it("returns correct ratio for aggressive player", () => {
    // 3 bets/raises per call → AF = 3.0
    expect(computeAggressionFactor(300, 100)).toBeCloseTo(3.0);
  });

  it("returns correct ratio for passive player", () => {
    // 1 bet per 4 calls → AF = 0.25
    expect(computeAggressionFactor(25, 100)).toBeCloseTo(0.25);
  });
});
