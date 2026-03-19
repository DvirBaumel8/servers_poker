import { describe, it, expect, beforeEach } from "vitest";
import {
  ChipInvariantChecker,
  TransactionAuditLog,
} from "../../src/game/invariants";

describe("ChipInvariantChecker", () => {
  let checker: ChipInvariantChecker;

  beforeEach(() => {
    checker = new ChipInvariantChecker();
  });

  describe("assertChipConservation", () => {
    it("should pass when chips are conserved", () => {
      const gameState = {
        players: [
          { id: "p1", name: "Player1", chips: 800 },
          { id: "p2", name: "Player2", chips: 700 },
          { id: "p3", name: "Player3", chips: 300 },
        ],
        potManager: { getTotalPot: () => 200 },
        expectedTotalChips: 2000,
        handNumber: 1,
        stage: "flop",
      };

      expect(() => checker.assertChipConservation(gameState)).not.toThrow();
    });

    it("should throw ChipConservationError when chips not conserved", () => {
      const gameState = {
        players: [
          { id: "p1", name: "Player1", chips: 800 },
          { id: "p2", name: "Player2", chips: 700 },
          { id: "p3", name: "Player3", chips: 300 },
        ],
        potManager: { getTotalPot: () => 100 },
        expectedTotalChips: 2000,
        handNumber: 1,
        stage: "flop",
      };

      expect(() => checker.assertChipConservation(gameState)).toThrow(
        /Chip conservation violated/,
      );
    });

    it("should handle zero pot correctly", () => {
      const gameState = {
        players: [
          { id: "p1", name: "Player1", chips: 1000 },
          { id: "p2", name: "Player2", chips: 1000 },
        ],
        potManager: { getTotalPot: () => 0 },
        expectedTotalChips: 2000,
        handNumber: 0,
        stage: "pre-flop",
      };

      expect(() => checker.assertChipConservation(gameState)).not.toThrow();
    });
  });

  describe("assertNonNegativeChips", () => {
    it("should pass for positive chips", () => {
      expect(() =>
        checker.assertNonNegativeChips({ id: "p1", name: "Test", chips: 100 }),
      ).not.toThrow();
    });

    it("should pass for zero chips", () => {
      expect(() =>
        checker.assertNonNegativeChips({ id: "p1", name: "Test", chips: 0 }),
      ).not.toThrow();
    });

    it("should throw for negative chips", () => {
      expect(() =>
        checker.assertNonNegativeChips({ id: "p1", name: "Test", chips: -100 }),
      ).toThrow(/negative chips/);
    });
  });

  describe("validateAction", () => {
    it("should validate fold action", () => {
      const result = checker.validateAction({
        action: "fold",
        playerChips: 1000,
        toCall: 100,
        minRaise: 20,
        currentBet: 100,
        playerBet: 0,
      });

      expect(result.valid).toBe(true);
    });

    it("should validate check when no bet to call", () => {
      const result = checker.validateAction({
        action: "check",
        playerChips: 1000,
        toCall: 0,
        minRaise: 20,
        currentBet: 0,
        playerBet: 0,
      });

      expect(result.valid).toBe(true);
    });

    it("should reject check when there is a bet to call", () => {
      const result = checker.validateAction({
        action: "check",
        playerChips: 1000,
        toCall: 100,
        minRaise: 20,
        currentBet: 100,
        playerBet: 0,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot check");
    });

    it("should validate call action", () => {
      const result = checker.validateAction({
        action: "call",
        playerChips: 1000,
        toCall: 100,
        minRaise: 20,
        currentBet: 100,
        playerBet: 0,
      });

      expect(result.valid).toBe(true);
    });

    it("should validate valid raise", () => {
      const result = checker.validateAction({
        action: "raise",
        amount: 50,
        playerChips: 1000,
        toCall: 100,
        minRaise: 20,
        currentBet: 100,
        playerBet: 0,
      });

      expect(result.valid).toBe(true);
    });

    it("should reject raise below minimum", () => {
      const result = checker.validateAction({
        action: "raise",
        amount: 10,
        playerChips: 1000,
        toCall: 100,
        minRaise: 20,
        currentBet: 100,
        playerBet: 0,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Minimum raise");
    });

    it("should reject raise with insufficient chips", () => {
      const result = checker.validateAction({
        action: "raise",
        amount: 500,
        playerChips: 200,
        toCall: 100,
        minRaise: 20,
        currentBet: 100,
        playerBet: 0,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Insufficient chips");
    });

    it("should validate all-in action", () => {
      const result = checker.validateAction({
        action: "all_in",
        playerChips: 500,
        toCall: 100,
        minRaise: 20,
        currentBet: 100,
        playerBet: 0,
      });

      expect(result.valid).toBe(true);
    });

    it("should reject all-in with no chips", () => {
      const result = checker.validateAction({
        action: "all_in",
        playerChips: 0,
        toCall: 100,
        minRaise: 20,
        currentBet: 100,
        playerBet: 0,
      });

      expect(result.valid).toBe(false);
    });

    it("should reject unknown action", () => {
      const result = checker.validateAction({
        action: "unknown",
        playerChips: 1000,
        toCall: 0,
        minRaise: 20,
        currentBet: 0,
        playerBet: 0,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unknown action");
    });
  });

  describe("computeExpectedTotal", () => {
    it("should sum player chips and pot", () => {
      const players = [
        { id: "p1", name: "P1", chips: 500 },
        { id: "p2", name: "P2", chips: 300 },
      ];
      const potManager = { getTotalPot: () => 200 };

      const total = checker.computeExpectedTotal(players, potManager);
      expect(total).toBe(1000);
    });

    it("should handle missing pot manager", () => {
      const players = [
        { id: "p1", name: "P1", chips: 500 },
        { id: "p2", name: "P2", chips: 300 },
      ];

      const total = checker.computeExpectedTotal(players);
      expect(total).toBe(800);
    });
  });
});

describe("TransactionAuditLog", () => {
  let auditLog: TransactionAuditLog;

  beforeEach(() => {
    auditLog = new TransactionAuditLog();
  });

  it("should log transactions", () => {
    auditLog.log("bet", "p1", 100, 1000, 900, 1);

    const entries = auditLog.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("bet");
    expect(entries[0].playerId).toBe("p1");
    expect(entries[0].amount).toBe(100);
    expect(entries[0].balanceBefore).toBe(1000);
    expect(entries[0].balanceAfter).toBe(900);
  });

  it("should filter entries by hand number", () => {
    auditLog.log("bet", "p1", 100, 1000, 900, 1);
    auditLog.log("win", "p1", 200, 900, 1100, 1);
    auditLog.log("bet", "p1", 50, 1100, 1050, 2);

    const hand1Entries = auditLog.getEntriesForHand(1);
    expect(hand1Entries).toHaveLength(2);
  });

  it("should filter entries by player", () => {
    auditLog.log("bet", "p1", 100, 1000, 900, 1);
    auditLog.log("bet", "p2", 100, 1000, 900, 1);
    auditLog.log("win", "p1", 200, 900, 1100, 1);

    const p1Entries = auditLog.getEntriesForPlayer("p1");
    expect(p1Entries).toHaveLength(2);
  });

  it("should verify balance correctly", () => {
    auditLog.log("bet", "p1", 100, 1000, 900, 1);

    expect(auditLog.verifyBalance("p1", 900)).toBe(true);
    expect(auditLog.verifyBalance("p1", 1000)).toBe(false);
  });

  it("should clear entries", () => {
    auditLog.log("bet", "p1", 100, 1000, 900, 1);
    auditLog.clear();

    expect(auditLog.getEntries()).toHaveLength(0);
  });
});
