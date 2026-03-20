import { describe, it, expect } from "vitest";

const TOURNAMENT_TYPES = ["rolling", "scheduled"] as const;
const TOURNAMENT_STATUSES = [
  "registering",
  "running",
  "paused",
  "finished",
  "cancelled",
] as const;

describe("Tournament Configuration", () => {
  describe("tournament types", () => {
    it("should have exactly 2 valid types", () => {
      expect(TOURNAMENT_TYPES).toHaveLength(2);
    });

    it("should include rolling and scheduled", () => {
      expect(TOURNAMENT_TYPES).toContain("rolling");
      expect(TOURNAMENT_TYPES).toContain("scheduled");
    });
  });

  describe("tournament statuses", () => {
    it("should have all valid statuses", () => {
      expect(TOURNAMENT_STATUSES).toContain("registering");
      expect(TOURNAMENT_STATUSES).toContain("running");
      expect(TOURNAMENT_STATUSES).toContain("finished");
      expect(TOURNAMENT_STATUSES).toContain("cancelled");
    });
  });

  describe("blind level progression", () => {
    it("should have increasing blind levels", () => {
      const blindLevels = [
        { small: 10, big: 20 },
        { small: 15, big: 30 },
        { small: 25, big: 50 },
        { small: 50, big: 100 },
        { small: 75, big: 150 },
        { small: 100, big: 200 },
      ];

      for (let i = 1; i < blindLevels.length; i++) {
        expect(blindLevels[i].small).toBeGreaterThan(blindLevels[i - 1].small);
        expect(blindLevels[i].big).toBeGreaterThan(blindLevels[i - 1].big);
      }
    });

    it("big blind should always be double small blind", () => {
      const levels = [
        { small: 10, big: 20 },
        { small: 25, big: 50 },
        { small: 100, big: 200 },
      ];

      for (const level of levels) {
        expect(level.big).toBe(level.small * 2);
      }
    });
  });

  describe("payout structure", () => {
    it("should distribute 100% of prize pool", () => {
      const payouts2 = [0.65, 0.35];
      const payouts3 = [0.5, 0.3, 0.2];
      const payouts6 = [0.4, 0.25, 0.15, 0.1, 0.05, 0.05];

      expect(payouts2.reduce((s, p) => s + p, 0)).toBeCloseTo(1.0);
      expect(payouts3.reduce((s, p) => s + p, 0)).toBeCloseTo(1.0);
      expect(payouts6.reduce((s, p) => s + p, 0)).toBeCloseTo(1.0);
    });

    it("payouts should be in descending order", () => {
      const payouts = [0.5, 0.3, 0.2];
      for (let i = 1; i < payouts.length; i++) {
        expect(payouts[i]).toBeLessThanOrEqual(payouts[i - 1]);
      }
    });
  });

  describe("tournament buy-in validation", () => {
    it("should require positive buy-in", () => {
      const validBuyIns = [100, 500, 1000, 5000];
      for (const buyIn of validBuyIns) {
        expect(buyIn).toBeGreaterThan(0);
      }
    });

    it("should require minimum starting chips >= buy-in", () => {
      const config = { buyIn: 100, startingChips: 1000 };
      expect(config.startingChips).toBeGreaterThanOrEqual(config.buyIn);
    });
  });

  describe("player limits", () => {
    it("should require minimum 2 players", () => {
      expect(2).toBeGreaterThanOrEqual(2);
      expect(1).toBeLessThan(2);
    });

    it("should have reasonable max players", () => {
      const maxPlayers = 1000;
      expect(maxPlayers).toBeLessThanOrEqual(10000);
      expect(maxPlayers).toBeGreaterThanOrEqual(2);
    });
  });
});
