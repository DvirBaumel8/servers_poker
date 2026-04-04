import { describe, it, expect, beforeEach } from "vitest";
import { PotManager } from "../../src/domain/betting";

interface TestPlayer {
  id: string;
  chips: bigint;
  folded: boolean;
  allIn: boolean;
}

describe("PotManager - Side Pot Calculations", () => {
  let potManager: PotManager;

  beforeEach(() => {
    potManager = new PotManager();
  });

  describe("simple all-in scenarios", () => {
    it("should handle three players with one short all-in", () => {
      const players: TestPlayer[] = [
        { id: "short", chips: 0n, folded: false, allIn: true },
        { id: "medium", chips: 500n, folded: false, allIn: false },
        { id: "big", chips: 500n, folded: false, allIn: false },
      ];

      potManager.addBet("short", 100n);
      potManager.addBet("medium", 300n);
      potManager.addBet("big", 300n);
      potManager.calculatePots(players);

      expect(potManager.getTotalPot()).toBe(700n);
      expect(potManager.pots.length).toBe(2);

      const mainPot = potManager.pots[0];
      expect(mainPot.amount).toBe(300n);
      expect(mainPot.eligiblePlayerIds).toEqual(["short", "medium", "big"]);

      const sidePot = potManager.pots[1];
      expect(sidePot.amount).toBe(400n);
      expect(sidePot.eligiblePlayerIds).toEqual(["medium", "big"]);
    });

    it("should handle two all-ins with different stacks", () => {
      const players: TestPlayer[] = [
        { id: "tiny", chips: 0n, folded: false, allIn: true },
        { id: "small", chips: 0n, folded: false, allIn: true },
        { id: "big", chips: 400n, folded: false, allIn: false },
      ];

      potManager.addBet("tiny", 50n);
      potManager.addBet("small", 150n);
      potManager.addBet("big", 500n);
      potManager.calculatePots(players);

      expect(potManager.getTotalPot()).toBe(700n);
      expect(potManager.pots.length).toBe(3);

      expect(potManager.pots[0].amount).toBe(150n);
      expect(potManager.pots[0].eligiblePlayerIds).toHaveLength(3);

      expect(potManager.pots[1].amount).toBe(200n);
      expect(potManager.pots[1].eligiblePlayerIds).toHaveLength(2);
      expect(potManager.pots[1].eligiblePlayerIds).not.toContain("tiny");

      expect(potManager.pots[2].amount).toBe(350n);
      expect(potManager.pots[2].eligiblePlayerIds).toHaveLength(1);
      expect(potManager.pots[2].eligiblePlayerIds).toContain("big");
    });
  });

  describe("folded player scenarios", () => {
    it("should include folded player contributions but exclude from eligibility", () => {
      const players: TestPlayer[] = [
        { id: "folder", chips: 900n, folded: true, allIn: false },
        { id: "active1", chips: 800n, folded: false, allIn: false },
        { id: "active2", chips: 800n, folded: false, allIn: false },
      ];

      potManager.addBet("folder", 100n);
      potManager.addBet("active1", 200n);
      potManager.addBet("active2", 200n);
      potManager.calculatePots(players);

      expect(potManager.getTotalPot()).toBe(500n);

      for (const pot of potManager.pots) {
        expect(pot.eligiblePlayerIds).not.toContain("folder");
      }
    });

    it("should handle all but one player folding", () => {
      const players: TestPlayer[] = [
        { id: "folder1", chips: 900n, folded: true, allIn: false },
        { id: "folder2", chips: 900n, folded: true, allIn: false },
        { id: "winner", chips: 800n, folded: false, allIn: false },
      ];

      potManager.addBet("folder1", 50n);
      potManager.addBet("folder2", 100n);
      potManager.addBet("winner", 200n);
      potManager.calculatePots(players);

      expect(potManager.getTotalPot()).toBe(350n);

      const eligibleCounts = potManager.pots.map(
        (p) => p.eligiblePlayerIds.length,
      );
      expect(eligibleCounts.every((c) => c === 1)).toBe(true);

      for (const pot of potManager.pots) {
        expect(pot.eligiblePlayerIds).toContain("winner");
      }
    });
  });

  describe("chip conservation", () => {
    it("should conserve chips in simple scenario", () => {
      const startingChips = {
        p1: 1000n,
        p2: 1000n,
        p3: 1000n,
      };
      const bets = {
        p1: 200n,
        p2: 200n,
        p3: 200n,
      };

      const players: TestPlayer[] = [
        {
          id: "p1",
          chips: startingChips.p1 - bets.p1,
          folded: false,
          allIn: false,
        },
        {
          id: "p2",
          chips: startingChips.p2 - bets.p2,
          folded: false,
          allIn: false,
        },
        {
          id: "p3",
          chips: startingChips.p3 - bets.p3,
          folded: false,
          allIn: false,
        },
      ];

      potManager.addBet("p1", bets.p1);
      potManager.addBet("p2", bets.p2);
      potManager.addBet("p3", bets.p3);
      potManager.calculatePots(players);

      const totalStarting = Object.values(startingChips).reduce(
        (a, b) => a + b,
        0n,
      );
      const totalRemaining = players.reduce((s, p) => s + p.chips, 0n);
      const totalInPot = potManager.getTotalPot();

      expect(totalRemaining + totalInPot).toBe(totalStarting);
    });

    it("should conserve chips in complex multi-pot scenario", () => {
      const startingChips = {
        p1: 100n,
        p2: 300n,
        p3: 500n,
        p4: 1000n,
      };

      const players: TestPlayer[] = [
        { id: "p1", chips: 0n, folded: false, allIn: true },
        { id: "p2", chips: 0n, folded: false, allIn: true },
        { id: "p3", chips: 0n, folded: false, allIn: true },
        { id: "p4", chips: 500n, folded: false, allIn: false },
      ];

      potManager.addBet("p1", 100n);
      potManager.addBet("p2", 300n);
      potManager.addBet("p3", 500n);
      potManager.addBet("p4", 500n);
      potManager.calculatePots(players);

      const totalStarting = Object.values(startingChips).reduce(
        (a, b) => a + b,
        0n,
      );
      const totalRemaining = players.reduce((s, p) => s + p.chips, 0n);
      const totalInPot = potManager.getTotalPot();

      expect(totalRemaining + totalInPot).toBe(totalStarting);
    });
  });

  describe("odd chip distribution", () => {
    it("should handle odd chip remainders in split pots", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 900n, folded: false, allIn: false },
        { id: "p2", chips: 900n, folded: false, allIn: false },
        { id: "p3", chips: 900n, folded: false, allIn: false },
      ];

      potManager.addBet("p1", 100n);
      potManager.addBet("p2", 100n);
      potManager.addBet("p3", 101n);
      potManager.calculatePots(players);

      expect(potManager.getTotalPot()).toBe(301n);
    });
  });

  describe("edge cases", () => {
    it("should handle zero bets", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 1000n, folded: false, allIn: false },
        { id: "p2", chips: 1000n, folded: false, allIn: false },
      ];

      potManager.calculatePots(players);

      expect(potManager.getTotalPot()).toBe(0n);
    });

    it("should handle single player bet (others folded preflop)", () => {
      const players: TestPlayer[] = [
        { id: "winner", chips: 990n, folded: false, allIn: false },
        { id: "folder", chips: 1000n, folded: true, allIn: false },
      ];

      potManager.addBet("winner", 10n);
      potManager.calculatePots(players);

      expect(potManager.getTotalPot()).toBe(10n);
      expect(potManager.pots[0].eligiblePlayerIds).toContain("winner");
    });

    it("should handle all players folded scenario", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 990n, folded: true, allIn: false },
        { id: "p2", chips: 980n, folded: true, allIn: false },
      ];

      potManager.addBet("p1", 10n);
      potManager.addBet("p2", 20n);
      potManager.calculatePots(players);

      expect(potManager.getTotalPot()).toBe(30n);
      for (const pot of potManager.pots) {
        expect(pot.eligiblePlayerIds).toHaveLength(0);
      }
    });
  });
});
