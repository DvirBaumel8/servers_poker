import { describe, it, expect, beforeEach } from "vitest";
import { PotManager, BettingRound } from "../../src/betting";

interface TestPlayer {
  id: string;
  chips: number;
  folded: boolean;
  allIn: boolean;
}

describe("PotManager", () => {
  let potManager: PotManager;

  beforeEach(() => {
    potManager = new PotManager();
  });

  describe.concurrent("addBet", () => {
    it("should track bets correctly", () => {
      potManager.addBet("player1", 100);
      potManager.addBet("player2", 100);

      expect(potManager.getPlayerBetThisRound("player1")).toBe(100);
      expect(potManager.getPlayerBetThisRound("player2")).toBe(100);
      expect(potManager.getPlayerTotalBet("player1")).toBe(100);
      expect(potManager.getPlayerTotalBet("player2")).toBe(100);
    });

    it("should accumulate bets across multiple calls", () => {
      potManager.addBet("player1", 50);
      potManager.addBet("player1", 50);

      expect(potManager.getPlayerBetThisRound("player1")).toBe(100);
      expect(potManager.getPlayerTotalBet("player1")).toBe(100);
    });
  });

  describe.concurrent("calculatePots", () => {
    it("should create single pot when all bets equal", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 900, folded: false, allIn: false },
        { id: "p2", chips: 900, folded: false, allIn: false },
        { id: "p3", chips: 900, folded: false, allIn: false },
      ];

      potManager.addBet("p1", 100);
      potManager.addBet("p2", 100);
      potManager.addBet("p3", 100);
      potManager.calculatePots(players);

      expect(potManager.pots.length).toBe(1);
      expect(potManager.pots[0].amount).toBe(300);
      expect(potManager.pots[0].eligiblePlayerIds).toContain("p1");
      expect(potManager.pots[0].eligiblePlayerIds).toContain("p2");
      expect(potManager.pots[0].eligiblePlayerIds).toContain("p3");
    });

    it("should create side pot for all-in with smaller stack", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 0, folded: false, allIn: true },
        { id: "p2", chips: 950, folded: false, allIn: false },
        { id: "p3", chips: 950, folded: false, allIn: false },
      ];

      potManager.addBet("p1", 50);
      potManager.addBet("p2", 100);
      potManager.addBet("p3", 100);
      potManager.calculatePots(players);

      expect(potManager.pots.length).toBe(2);
      
      const mainPot = potManager.pots[0];
      expect(mainPot.amount).toBe(150);
      expect(mainPot.eligiblePlayerIds).toHaveLength(3);

      const sidePot = potManager.pots[1];
      expect(sidePot.amount).toBe(100);
      expect(sidePot.eligiblePlayerIds).toHaveLength(2);
      expect(sidePot.eligiblePlayerIds).not.toContain("p1");
    });

    it("should handle multiple side pots with different all-in amounts", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 0, folded: false, allIn: true },
        { id: "p2", chips: 0, folded: false, allIn: true },
        { id: "p3", chips: 700, folded: false, allIn: false },
      ];

      potManager.addBet("p1", 100);
      potManager.addBet("p2", 200);
      potManager.addBet("p3", 300);
      potManager.calculatePots(players);

      expect(potManager.pots.length).toBe(3);
      expect(potManager.getTotalPot()).toBe(600);
    });

    it("should exclude folded players from pot eligibility", () => {
      const players: TestPlayer[] = [
        { id: "p1", chips: 900, folded: true, allIn: false },
        { id: "p2", chips: 900, folded: false, allIn: false },
        { id: "p3", chips: 900, folded: false, allIn: false },
      ];

      potManager.addBet("p1", 50);
      potManager.addBet("p2", 100);
      potManager.addBet("p3", 100);
      potManager.calculatePots(players);

      expect(potManager.pots[0].eligiblePlayerIds).not.toContain("p1");
      expect(potManager.pots[0].eligiblePlayerIds).toContain("p2");
      expect(potManager.pots[0].eligiblePlayerIds).toContain("p3");
    });
  });

  describe.concurrent("getTotalPot", () => {
    it("should return sum of all pots", () => {
      potManager.pots = [
        { amount: 300, eligiblePlayerIds: ["p1", "p2", "p3"] },
        { amount: 200, eligiblePlayerIds: ["p1", "p2"] },
      ];

      expect(potManager.getTotalPot()).toBe(500);
    });

    it("should return 0 for empty pots", () => {
      potManager.pots = [];
      expect(potManager.getTotalPot()).toBe(0);
    });
  });
});

describe("BettingRound", () => {
  let players: TestPlayer[];
  let bettingRound: BettingRound;

  beforeEach(() => {
    players = [
      { id: "p1", chips: 1000, folded: false, allIn: false },
      { id: "p2", chips: 1000, folded: false, allIn: false },
      { id: "p3", chips: 1000, folded: false, allIn: false },
    ];
    bettingRound = new BettingRound({
      players,
      smallBlind: 10,
      bigBlind: 20,
      isPreFlop: false,
      dealerIndex: 0,
    });
  });

  describe.concurrent("getCallAmount", () => {
    it("should return 0 when no bet to call", () => {
      expect(bettingRound.getCallAmount(players[0])).toBe(0);
    });

    it("should return difference between current bet and player bet", () => {
      bettingRound.currentBet = 100;
      bettingRound.betsThisRound["p1"] = 50;
      
      expect(bettingRound.getCallAmount(players[0])).toBe(50);
    });

    it("should cap call amount to player chips", () => {
      players[0].chips = 30;
      bettingRound.currentBet = 100;
      
      expect(bettingRound.getCallAmount(players[0])).toBe(30);
    });
  });

  describe.concurrent("canCheck", () => {
    it("should allow check when player bet equals current bet", () => {
      expect(bettingRound.canCheck(players[0])).toBe(true);
    });

    it("should not allow check when there is a bet to call", () => {
      bettingRound.currentBet = 100;
      expect(bettingRound.canCheck(players[0])).toBe(false);
    });
  });

  describe.concurrent("applyAction", () => {
    describe.concurrent("fold", () => {
      it("should mark player as folded", () => {
        const result = bettingRound.applyAction(players[0], { type: "fold" });
        
        expect(result.valid).toBe(true);
        expect(result.amountAdded).toBe(0);
        expect(players[0].folded).toBe(true);
      });
    });

    describe.concurrent("check", () => {
      it("should allow check when no bet to call", () => {
        const result = bettingRound.applyAction(players[0], { type: "check" });
        
        expect(result.valid).toBe(true);
        expect(result.amountAdded).toBe(0);
      });

      it("should reject check when there is a bet to call", () => {
        bettingRound.currentBet = 100;
        const result = bettingRound.applyAction(players[0], { type: "check" });
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain("call");
      });
    });

    describe.concurrent("call", () => {
      it("should deduct correct amount for call", () => {
        bettingRound.currentBet = 100;
        const chipsBefore = players[0].chips;
        
        const result = bettingRound.applyAction(players[0], { type: "call" });
        
        expect(result.valid).toBe(true);
        expect(result.amountAdded).toBe(100);
        expect(players[0].chips).toBe(chipsBefore - 100);
      });

      it("should put player all-in when calling with insufficient chips", () => {
        players[0].chips = 50;
        bettingRound.currentBet = 100;
        
        const result = bettingRound.applyAction(players[0], { type: "call" });
        
        expect(result.valid).toBe(true);
        expect(result.amountAdded).toBe(50);
        expect(players[0].chips).toBe(0);
        expect(players[0].allIn).toBe(true);
      });
    });

    describe.concurrent("raise", () => {
      it("should apply valid raise", () => {
        bettingRound.currentBet = 20;
        bettingRound.betsThisRound["p1"] = 0;
        const chipsBefore = players[0].chips;
        
        const result = bettingRound.applyAction(players[0], { 
          type: "raise", 
          amount: 30,
        });
        
        expect(result.valid).toBe(true);
        expect(result.amountAdded).toBe(50);
        expect(players[0].chips).toBe(chipsBefore - 50);
        expect(bettingRound.currentBet).toBe(50);
      });

      it("should reject raise below minimum", () => {
        bettingRound.currentBet = 20;
        bettingRound.minRaise = 20;
        
        const result = bettingRound.applyAction(players[0], { 
          type: "raise", 
          amount: 10,
        });
        
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Minimum raise");
      });

      it("should allow all-in raise below minimum", () => {
        players[0].chips = 25;
        bettingRound.currentBet = 20;
        bettingRound.minRaise = 20;
        
        const result = bettingRound.applyAction(players[0], { 
          type: "raise", 
          amount: 5,
        });
        
        expect(result.valid).toBe(true);
        expect(players[0].allIn).toBe(true);
      });
    });
  });

  describe.concurrent("isBettingComplete", () => {
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
      bettingRound.currentBet = 20;
      
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
