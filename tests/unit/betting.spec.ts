import { describe, it, expect, beforeEach } from "vitest";
import { PotManager, BettingRound } from "../../src/domain/betting";

interface TestPlayer {
  id: string;
  chips: bigint;
  folded: boolean;
  allIn: boolean;
}

describe("PotManager", () => {
  let potManager: PotManager;

  beforeEach(() => {
    potManager = new PotManager();
  });

  describe("addBet", () => {
    it("should track bets correctly", () => {
      potManager.addBet("player1", 100n);
      potManager.addBet("player2", 100n);

      expect(potManager.getPlayerBetThisRound("player1")).toBe(100n);
      expect(potManager.getPlayerBetThisRound("player2")).toBe(100n);
      expect(potManager.getPlayerTotalBet("player1")).toBe(100n);
      expect(potManager.getPlayerTotalBet("player2")).toBe(100n);
    });

    it("should accumulate bets across multiple calls", () => {
      potManager.addBet("player1", 50n);
      potManager.addBet("player1", 50n);

      expect(potManager.getPlayerBetThisRound("player1")).toBe(100n);
      expect(potManager.getPlayerTotalBet("player1")).toBe(100n);
    });
  });

  describe("calculatePots", () => {
    it("should create single pot when all bets equal", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 900n, folded: false, allIn: false },
        { id: "p2", chips: 900n, folded: false, allIn: false },
        { id: "p3", chips: 900n, folded: false, allIn: false },
      ];

      potManager.addBet("p1", 100n);
      potManager.addBet("p2", 100n);
      potManager.addBet("p3", 100n);
      potManager.calculatePots(players);

      expect(potManager.pots.length).toBe(1);
      expect(potManager.pots[0].amount).toBe(300n);
      expect(potManager.pots[0].eligiblePlayerIds).toContain("p1");
      expect(potManager.pots[0].eligiblePlayerIds).toContain("p2");
      expect(potManager.pots[0].eligiblePlayerIds).toContain("p3");
    });

    it("should create side pot for all-in with smaller stack", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 0n, folded: false, allIn: true },
        { id: "p2", chips: 950n, folded: false, allIn: false },
        { id: "p3", chips: 950n, folded: false, allIn: false },
      ];

      potManager.addBet("p1", 50n);
      potManager.addBet("p2", 100n);
      potManager.addBet("p3", 100n);
      potManager.calculatePots(players);

      expect(potManager.pots.length).toBe(2);

      const mainPot = potManager.pots[0];
      expect(mainPot.amount).toBe(150n);
      expect(mainPot.eligiblePlayerIds).toHaveLength(3);

      const sidePot = potManager.pots[1];
      expect(sidePot.amount).toBe(100n);
      expect(sidePot.eligiblePlayerIds).toHaveLength(2);
      expect(sidePot.eligiblePlayerIds).not.toContain("p1");
    });

    it("should handle multiple side pots with different all-in amounts", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 0n, folded: false, allIn: true },
        { id: "p2", chips: 0n, folded: false, allIn: true },
        { id: "p3", chips: 700n, folded: false, allIn: false },
      ];

      potManager.addBet("p1", 100n);
      potManager.addBet("p2", 200n);
      potManager.addBet("p3", 300n);
      potManager.calculatePots(players);

      expect(potManager.pots.length).toBe(3);
      expect(potManager.getTotalPot()).toBe(600n);
    });

    it("should exclude folded players from pot eligibility", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 900n, folded: true, allIn: false },
        { id: "p2", chips: 900n, folded: false, allIn: false },
        { id: "p3", chips: 900n, folded: false, allIn: false },
      ];

      potManager.addBet("p1", 50n);
      potManager.addBet("p2", 100n);
      potManager.addBet("p3", 100n);
      potManager.calculatePots(players);

      expect(potManager.pots[0].eligiblePlayerIds).not.toContain("p1");
      expect(potManager.pots[0].eligiblePlayerIds).toContain("p2");
      expect(potManager.pots[0].eligiblePlayerIds).toContain("p3");
    });
  });

  describe("getTotalPot", () => {
    it("should return sum of all player bets", () => {
      potManager.addBet("p1", 300n);
      potManager.addBet("p2", 200n);

      expect(potManager.getTotalPot()).toBe(500n);
    });

    it("should return 0 when no bets placed", () => {
      expect(potManager.getTotalPot()).toBe(0n);
    });
  });
});

describe("BettingRound", () => {
  let players: TestPlayer[];
  let bettingRound: BettingRound;

  beforeEach(() => {
    players = [
      { id: "p1", chips: 1000n, folded: false, allIn: false },
      { id: "p2", chips: 1000n, folded: false, allIn: false },
      { id: "p3", chips: 1000n, folded: false, allIn: false },
    ];
    bettingRound = new BettingRound({
      players,
      smallBlind: 10n,
      bigBlind: 20n,
      isPreFlop: false,
      dealerIndex: 0,
    });
  });

  describe("getCallAmount", () => {
    it("should return 0 when no bet to call", () => {
      expect(bettingRound.getCallAmount(players[0])).toBe(0n);
    });

    it("should return difference between current bet and player bet", () => {
      bettingRound.currentMaxBet = 100n;
      bettingRound.betsThisRound["p1"] = 50n;

      expect(bettingRound.getCallAmount(players[0])).toBe(50n);
    });

    it("should cap call amount to player chips", () => {
      players[0].chips = 30n;
      bettingRound.currentMaxBet = 100n;

      expect(bettingRound.getCallAmount(players[0])).toBe(30n);
    });
  });

  describe("canCheck", () => {
    it("should allow check when player bet equals current bet", () => {
      expect(bettingRound.canCheck(players[0])).toBe(true);
    });

    it("should not allow check when there is a bet to call", () => {
      bettingRound.currentMaxBet = 100n;
      expect(bettingRound.canCheck(players[0])).toBe(false);
    });
  });

  describe("applyAction", () => {
    describe("fold", () => {
      it("should mark player as folded", () => {
        const result = bettingRound.applyAction(players[0], { type: "fold" });

        expect(result.valid).toBe(true);
        expect(result.amountAdded).toBe(0n);
        expect(players[0].folded).toBe(true);
      });
    });

    describe("check", () => {
      it("should allow check when no bet to call", () => {
        const result = bettingRound.applyAction(players[0], { type: "check" });

        expect(result.valid).toBe(true);
        expect(result.amountAdded).toBe(0n);
      });

      it("should reject check when there is a bet to call", () => {
        bettingRound.currentMaxBet = 100n;
        const result = bettingRound.applyAction(players[0], { type: "check" });

        expect(result.valid).toBe(false);
        expect(result.error).toContain("call");
      });
    });

    describe("call", () => {
      it("should deduct correct amount for call", () => {
        bettingRound.currentMaxBet = 100n;
        const chipsBefore = players[0].chips;

        const result = bettingRound.applyAction(players[0], { type: "call" });

        expect(result.valid).toBe(true);
        expect(result.amountAdded).toBe(100n);
        expect(players[0].chips).toBe(chipsBefore - 100n);
      });

      it("should put player all-in when calling with insufficient chips", () => {
        players[0].chips = 50n;
        bettingRound.currentMaxBet = 100n;

        const result = bettingRound.applyAction(players[0], { type: "call" });

        expect(result.valid).toBe(true);
        expect(result.amountAdded).toBe(50n);
        expect(players[0].chips).toBe(0n);
        expect(players[0].allIn).toBe(true);
      });
    });

    describe("raise", () => {
      it("should apply valid raise", () => {
        bettingRound.currentMaxBet = 20n;
        bettingRound.betsThisRound["p1"] = 0n;
        const chipsBefore = players[0].chips;

        const result = bettingRound.applyAction(players[0], {
          type: "raise",
          amount: 30,
        });

        expect(result.valid).toBe(true);
        expect(result.amountAdded).toBe(50n);
        expect(players[0].chips).toBe(chipsBefore - 50n);
        expect(bettingRound.currentMaxBet).toBe(50n);
      });

      it("should reject raise below minimum", () => {
        bettingRound.currentMaxBet = 20n;
        bettingRound.lastRaiseDelta = 20n;

        const result = bettingRound.applyAction(players[0], {
          type: "raise",
          amount: 10,
        });

        expect(result.valid).toBe(false);
        expect(result.error).toContain("Minimum raise");
      });

      it("should allow all-in raise below minimum", () => {
        players[0].chips = 25n;
        bettingRound.currentMaxBet = 20n;
        bettingRound.lastRaiseDelta = 20n;

        const result = bettingRound.applyAction(players[0], {
          type: "raise",
          amount: 5,
        });

        expect(result.valid).toBe(true);
        expect(players[0].allIn).toBe(true);
      });

      it("should enforce delta rule: next raise must be >= currentMaxBet + lastRaiseDelta", () => {
        // A bets 100 (raise from 0, delta = 100)
        const raise1 = bettingRound.applyAction(players[0], {
          type: "raise",
          amount: 100,
        });
        expect(raise1.valid).toBe(true);
        expect(bettingRound.currentMaxBet).toBe(100n);
        expect(bettingRound.lastRaiseDelta).toBe(100n);

        // B tries to raise to only 150 (delta = 50, min required = 100) — invalid
        const tooSmall = bettingRound.applyAction(players[1], {
          type: "raise",
          amount: 50,
        });
        expect(tooSmall.valid).toBe(false);
        expect(tooSmall.error).toContain("200"); // min raise-to = 100 + 100 = 200

        // B raises to 200 (delta = 100, exactly the minimum) — valid
        const raise2 = bettingRound.applyAction(players[1], {
          type: "raise",
          amount: 100,
        });
        expect(raise2.valid).toBe(true);
        expect(bettingRound.currentMaxBet).toBe(200n);
        expect(bettingRound.lastRaiseDelta).toBe(100n);
      });

      it("should enforce Math.max(bigBlind, delta) floor on lastRaiseDelta", () => {
        // bigBlind = 20n; raise delta should never drop below BB
        const raise1 = bettingRound.applyAction(players[0], {
          type: "raise",
          amount: 20,
        });
        expect(raise1.valid).toBe(true);
        expect(bettingRound.lastRaiseDelta).toBe(20n); // max(20n, 20n) = 20n
      });

      it("should allow first bet in round via getValidActionsForPlayer", () => {
        // No one has raised yet — all active players should see 'raise' as valid
        const actions = bettingRound.getValidActionsForPlayer(players[0]);
        expect(actions).toContain("raise");
      });

      it("short all-in should not update lastRaiseDelta", () => {
        // Player 1 raises by 100 (full raise, lastRaiseDelta = 100)
        bettingRound.applyAction(players[0], { type: "raise", amount: 100 });
        expect(bettingRound.lastRaiseDelta).toBe(100n);

        // Player 2 has only 50 chips and goes all-in (short raise, delta 50 < 100)
        players[1].chips = 50n;
        bettingRound.applyAction(players[1], { type: "raise", amount: 50 });

        // lastRaiseDelta must stay at 100 (short all-in doesn't update it)
        expect(bettingRound.lastRaiseDelta).toBe(100n);
      });
    });
  });

  describe("isBettingComplete", () => {
    it("should return true when only one player left", () => {
      players[0].folded = true;
      players[1].folded = true;

      expect(bettingRound.isBettingComplete()).toBe(true);
    });

    it("should return true when all players are all-in", () => {
      players[0].allIn = true;
      players[1].allIn = true;
      players[2].allIn = true;

      expect(bettingRound.isBettingComplete()).toBe(true);
    });

    it("should return false when players have not acted", () => {
      bettingRound.currentMaxBet = 20n;

      expect(bettingRound.isBettingComplete()).toBe(false);
    });

    it("should return true when all players have acted and matched bet", () => {
      bettingRound.actedPlayers.add("p1");
      bettingRound.actedPlayers.add("p2");
      bettingRound.actedPlayers.add("p3");

      expect(bettingRound.isBettingComplete()).toBe(true);
    });
  });
});
