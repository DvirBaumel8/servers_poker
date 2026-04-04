import { describe, it, expect, beforeEach } from "vitest";
import { PotManager, BettingRound } from "../../src/domain/betting";

interface TestPlayer {
  id: string;
  chips: bigint;
  folded: boolean;
  allIn: boolean;
}

describe("BettingRound - Advanced Scenarios", () => {
  describe("pre-flop betting sequence", () => {
    it("should handle standard pre-flop: post blinds, call, check", () => {
      const players: TestPlayer[] = [
        { id: "btn", chips: 1000n, folded: false, allIn: false },
        { id: "sb", chips: 1000n, folded: false, allIn: false },
        { id: "bb", chips: 1000n, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 10n,
        bigBlind: 20n,
        isPreFlop: true,
        dealerIndex: 0,
      });

      round.betsThisRound["sb"] = 10n;
      players[1].chips -= 10n;
      round.betsThisRound["bb"] = 20n;
      players[2].chips -= 20n;
      round.currentMaxBet = 20n;

      const btnCall = round.applyAction(players[0], { type: "call" });
      expect(btnCall.valid).toBe(true);
      expect(btnCall.amountAdded).toBe(20n);

      const sbCall = round.applyAction(players[1], { type: "call" });
      expect(sbCall.valid).toBe(true);
      expect(sbCall.amountAdded).toBe(10n);

      const bbCheck = round.applyAction(players[2], { type: "check" });
      expect(bbCheck.valid).toBe(true);

      expect(round.isBettingComplete()).toBe(true);
    });
  });

  describe("3-bet scenario", () => {
    it("should handle raise → re-raise → call", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 1000n, folded: false, allIn: false },
        { id: "p2", chips: 1000n, folded: false, allIn: false },
        { id: "p3", chips: 1000n, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 10n,
        bigBlind: 20n,
        isPreFlop: false,
        dealerIndex: 0,
      });

      const raise1 = round.applyAction(players[0], {
        type: "raise",
        amount: 50,
      });
      expect(raise1.valid).toBe(true);
      expect(round.currentMaxBet).toBe(50n);

      const reRaise = round.applyAction(players[1], {
        type: "raise",
        amount: 100,
      });
      expect(reRaise.valid).toBe(true);
      expect(round.currentMaxBet > 50n).toBe(true);

      const call = round.applyAction(players[2], { type: "call" });
      expect(call.valid).toBe(true);

      const p1Call = round.applyAction(players[0], { type: "call" });
      expect(p1Call.valid).toBe(true);

      expect(round.isBettingComplete()).toBe(true);
    });
  });

  describe("all-in scenarios", () => {
    it("should handle short stack all-in correctly", () => {
      const players: TestPlayer[] = [
        { id: "short", chips: 50n, folded: false, allIn: false },
        { id: "big", chips: 1000n, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 10n,
        bigBlind: 20n,
        isPreFlop: false,
        dealerIndex: 0,
      });

      const raise = round.applyAction(players[1], {
        type: "raise",
        amount: 100,
      });
      expect(raise.valid).toBe(true);

      const allIn = round.applyAction(players[0], { type: "call" });
      expect(allIn.valid).toBe(true);
      expect(players[0].allIn).toBe(true);
      expect(players[0].chips).toBe(0n);

      expect(round.isBettingComplete()).toBe(true);
    });

    it("should handle both players all-in", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 500n, folded: false, allIn: false },
        { id: "p2", chips: 300n, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 10n,
        bigBlind: 20n,
        isPreFlop: false,
        dealerIndex: 0,
      });

      const raise = round.applyAction(players[0], {
        type: "raise",
        amount: 500,
      });
      expect(raise.valid).toBe(true);
      expect(players[0].allIn).toBe(true);

      const call = round.applyAction(players[1], { type: "call" });
      expect(call.valid).toBe(true);
      expect(players[1].allIn).toBe(true);

      expect(round.isBettingComplete()).toBe(true);
    });
  });

  describe("fold scenarios", () => {
    it("should complete betting when all but one folds", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 1000n, folded: false, allIn: false },
        { id: "p2", chips: 1000n, folded: false, allIn: false },
        { id: "p3", chips: 1000n, folded: false, allIn: false },
      ];

      const round = new BettingRound({
        players,
        smallBlind: 10n,
        bigBlind: 20n,
        isPreFlop: false,
        dealerIndex: 0,
      });

      round.applyAction(players[0], { type: "raise", amount: 50 });
      round.applyAction(players[1], { type: "fold" });
      round.applyAction(players[2], { type: "fold" });

      expect(round.isBettingComplete()).toBe(true);
    });
  });

  describe("chip conservation in betting", () => {
    it("should conserve total chips across all actions", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 1000n, folded: false, allIn: false },
        { id: "p2", chips: 1000n, folded: false, allIn: false },
        { id: "p3", chips: 500n, folded: false, allIn: false },
      ];

      const startingTotal = players.reduce((s, p) => s + p.chips, 0n);

      const round = new BettingRound({
        players,
        smallBlind: 10n,
        bigBlind: 20n,
        isPreFlop: false,
        dealerIndex: 0,
      });

      let totalBet = 0n;
      const r1 = round.applyAction(players[0], {
        type: "raise",
        amount: 200,
      });
      totalBet += r1.amountAdded;

      const r2 = round.applyAction(players[1], { type: "call" });
      totalBet += r2.amountAdded;

      const r3 = round.applyAction(players[2], { type: "call" });
      totalBet += r3.amountAdded;

      const remainingChips = players.reduce((s, p) => s + p.chips, 0n);
      expect(remainingChips + totalBet).toBe(startingTotal);
    });
  });
});

describe("PotManager - Advanced Scenarios", () => {
  describe("complex side pot calculations", () => {
    it("should handle 4-player all-in with different stacks", () => {
      const potManager = new PotManager();
      const players: TestPlayer[] = [
        { id: "p1", chips: 0n, folded: false, allIn: true },
        { id: "p2", chips: 0n, folded: false, allIn: true },
        { id: "p3", chips: 0n, folded: false, allIn: true },
        { id: "p4", chips: 0n, folded: false, allIn: true },
      ];

      potManager.addBet("p1", 100n);
      potManager.addBet("p2", 200n);
      potManager.addBet("p3", 300n);
      potManager.addBet("p4", 400n);
      potManager.calculatePots(players);

      expect(potManager.pots).toHaveLength(4);
      expect(potManager.getTotalPot()).toBe(1000n);

      expect(potManager.pots[0].amount).toBe(400n);
      expect(potManager.pots[0].eligiblePlayerIds).toHaveLength(4);

      expect(potManager.pots[1].amount).toBe(300n);
      expect(potManager.pots[1].eligiblePlayerIds).toHaveLength(3);

      expect(potManager.pots[2].amount).toBe(200n);
      expect(potManager.pots[2].eligiblePlayerIds).toHaveLength(2);

      expect(potManager.pots[3].amount).toBe(100n);
      expect(potManager.pots[3].eligiblePlayerIds).toHaveLength(1);
    });

    it("should handle pot distribution with odd chips across 3 winners", () => {
      const potManager = new PotManager();
      const distribution = potManager.distributePot(
        100n,
        [
          { id: "p1", handRank: 1 },
          { id: "p2", handRank: 1 },
          { id: "p3", handRank: 1 },
        ],
        ["p1", "p2", "p3"],
        0,
      );

      const totalDistributed = Object.values(distribution).reduce(
        (s, v) => s + v,
        0n,
      );
      expect(totalDistributed).toBe(100n);

      expect(distribution["p1"]).toBe(33n);
      expect(distribution["p2"]).toBe(34n);
      expect(distribution["p3"]).toBe(33n);
    });

    it("should give odd chip to player closest to dealer+1", () => {
      const potManager = new PotManager();
      const distribution = potManager.distributePot(
        101n,
        [
          { id: "p1", handRank: 1 },
          { id: "p2", handRank: 1 },
        ],
        ["p1", "p2", "p3"],
        2,
      );

      expect(distribution["p1"]).toBe(51n);
      expect(distribution["p2"]).toBe(50n);
    });
  });

  describe("multi-round pot tracking", () => {
    it("should track bets across multiple betting rounds", () => {
      const potManager = new PotManager();

      potManager.addBet("p1", 10n);
      potManager.addBet("p2", 10n);
      potManager.resetRound();

      potManager.addBet("p1", 20n);
      potManager.addBet("p2", 20n);

      expect(potManager.getPlayerBetThisRound("p1")).toBe(20n);
      expect(potManager.getPlayerTotalBet("p1")).toBe(30n);
      expect(potManager.getPlayerTotalBet("p2")).toBe(30n);
    });
  });
});
