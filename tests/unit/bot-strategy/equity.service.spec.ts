import { describe, it, expect, beforeEach } from "vitest";
import {
  estimateEquityHeuristic,
  estimateEquityMonteCarlo,
  countOuts,
  computeCallEV,
  isProfitableCall,
  clearEquityMemo,
} from "../../../src/modules/bot-strategy/evaluators/equity.service";

beforeEach(() => {
  clearEquityMemo();
});

// ─── estimateEquityHeuristic ─────────────────────────────────────────────────

describe("estimateEquityHeuristic", () => {
  describe("preflop", () => {
    it("AA vs 1 opponent: high equity", () => {
      const eq = estimateEquityHeuristic(["A♠", "A♥"], [], 1);
      expect(eq).toBeGreaterThanOrEqual(0.7);
      expect(eq).toBeLessThanOrEqual(0.9);
    });

    it("72o vs 1 opponent: low equity", () => {
      const eq = estimateEquityHeuristic(["7♠", "2♦"], [], 1);
      expect(eq).toBeGreaterThanOrEqual(0.15);
      expect(eq).toBeLessThanOrEqual(0.4);
    });

    it("AKs vs 1 opponent: strong equity", () => {
      const eq = estimateEquityHeuristic(["A♠", "K♠"], [], 1);
      expect(eq).toBeGreaterThanOrEqual(0.55);
      expect(eq).toBeLessThanOrEqual(0.8);
    });

    it("equity decreases with more opponents", () => {
      const eq1 = estimateEquityHeuristic(["A♠", "K♥"], [], 1);
      const eq3 = estimateEquityHeuristic(["A♠", "K♥"], [], 3);
      const eq6 = estimateEquityHeuristic(["A♠", "K♥"], [], 6);
      expect(eq1).toBeGreaterThan(eq3);
      expect(eq3).toBeGreaterThan(eq6);
    });

    it("returns value in [0, 1]", () => {
      const eq = estimateEquityHeuristic(["2♠", "3♦"], [], 8);
      expect(eq).toBeGreaterThanOrEqual(0);
      expect(eq).toBeLessThanOrEqual(1);
    });

    it("0 opponents returns high equity", () => {
      const eq = estimateEquityHeuristic(["A♠", "A♥"], [], 0);
      // numOpponents is clamped to 1 internally
      expect(eq).toBeGreaterThan(0.5);
    });
  });

  describe("flop", () => {
    it("nut flush draw: significant draw equity (~36%)", () => {
      // Hero: A♠ 5♠, Board: K♠ 8♠ 3♦ (flush draw, 9 outs)
      const eq = estimateEquityHeuristic(["A♠", "5♠"], ["K♠", "8♠", "3♦"], 1);
      // Should include draw equity from 9 outs × 4 = 36%
      expect(eq).toBeGreaterThanOrEqual(0.3);
    });

    it("open-ended straight draw: draw equity (~32%)", () => {
      // Hero: 9♠ 8♥, Board: 7♦ 6♣ 2♠ (OESD, 8 outs)
      const eq = estimateEquityHeuristic(["9♠", "8♥"], ["7♦", "6♣", "2♠"], 1);
      // 8 outs × 4 = 32% draw equity
      expect(eq).toBeGreaterThanOrEqual(0.25);
    });

    it("combo draw (flush + straight): highest draw equity", () => {
      // Hero: J♠ 10♠, Board: 9♠ 8♣ 2♠ (flush draw + OESD)
      const eq = estimateEquityHeuristic(["J♠", "10♠"], ["9♠", "8♣", "2♠"], 1);
      // Should be higher than either draw alone
      expect(eq).toBeGreaterThanOrEqual(0.4);
    });

    it("made flush on flop: high equity", () => {
      // Hero: A♠ K♠, Board: Q♠ 7♠ 3♠
      const eq = estimateEquityHeuristic(["A♠", "K♠"], ["Q♠", "7♠", "3♠"], 1);
      expect(eq).toBeGreaterThanOrEqual(0.7);
    });

    it("no draw, high card only: low equity", () => {
      // Hero: 2♣ 4♦, Board: A♠ K♥ 9♦ (no draws, no pair)
      const eq = estimateEquityHeuristic(["2♣", "4♦"], ["A♠", "K♥", "9♦"], 1);
      expect(eq).toBeLessThanOrEqual(0.3);
    });

    it("top pair on dry board: moderate equity", () => {
      // Hero: A♠ K♥, Board: A♦ 7♣ 2♠
      const eq = estimateEquityHeuristic(["A♠", "K♥"], ["A♦", "7♣", "2♠"], 1);
      expect(eq).toBeGreaterThanOrEqual(0.25);
    });
  });

  describe("turn", () => {
    it("flush draw on turn: ~18% draw equity (rule of 2)", () => {
      // Hero: A♠ 5♠, Board: K♠ 8♠ 3♦ J♥ (still flush draw, 9 outs)
      const eq = estimateEquityHeuristic(
        ["A♠", "5♠"],
        ["K♠", "8♠", "3♦", "J♥"],
        1,
      );
      // 9 outs × 2 = 18% draw equity — less than on flop
      const flopEq = estimateEquityHeuristic(
        ["A♠", "5♠"],
        ["K♠", "8♠", "3♦"],
        1,
      );
      expect(eq).toBeLessThan(flopEq);
    });
  });

  describe("river", () => {
    it("no draw equity on river (all cards dealt)", () => {
      // Hero: A♠ 5♠, Board: K♠ 8♠ 3♦ J♥ 2♣ (missed flush draw)
      const eq = estimateEquityHeuristic(
        ["A♠", "5♠"],
        ["K♠", "8♠", "3♦", "J♥", "2♣"],
        1,
      );
      // Just high card — low equity, no draw contribution
      expect(eq).toBeLessThanOrEqual(0.25);
    });

    it("made hand equity purely from hand strength", () => {
      // Hero: A♠ A♥, Board: K♦ 7♣ 2♠ 9♥ 4♦ (overpair)
      const eq = estimateEquityHeuristic(
        ["A♠", "A♥"],
        ["K♦", "7♣", "2♠", "9♥", "4♦"],
        1,
      );
      expect(eq).toBeGreaterThanOrEqual(0.25);
    });
  });

  describe("edge cases", () => {
    it("empty community cards uses preflop path", () => {
      const eq = estimateEquityHeuristic(["A♠", "A♥"], [], 1);
      expect(eq).toBeGreaterThan(0.5);
    });

    it("invalid hole cards returns 0", () => {
      const eq = estimateEquityHeuristic(["A♠"], [], 1);
      expect(eq).toBe(0);
    });

    it("single opponent vs 8 opponents: different equity", () => {
      const eq1 = estimateEquityHeuristic(["A♠", "K♥"], ["Q♦", "J♣", "2♠"], 1);
      const eq8 = estimateEquityHeuristic(["A♠", "K♥"], ["Q♦", "J♣", "2♠"], 8);
      expect(eq1).toBeGreaterThan(eq8);
    });
  });
});

// ─── countOuts ───────────────────────────────────────────────────────────────

describe("countOuts", () => {
  it("flush draw = 9 outs", () => {
    const result = countOuts(["A♠", "5♠"], ["K♠", "8♠", "3♦"]);
    expect(result.flushOuts).toBe(9);
  });

  it("open-ended straight draw = 8 outs", () => {
    const result = countOuts(["9♠", "8♥"], ["7♦", "6♣", "2♠"]);
    expect(result.straightOuts).toBe(8);
  });

  it("gutshot = 4 outs", () => {
    // Hero: 9♠ 5♥, Board: 8♦ 7♣ 3♠ (need a 6 for the straight, gutshot)
    const result = countOuts(["9♠", "5♥"], ["8♦", "7♣", "3♠"]);
    expect(result.straightOuts).toBe(4);
  });

  it("combo draw deducts overlap", () => {
    // Hero: J♠ 10♠, Board: 9♠ 8♣ 2♠ (flush draw + OESD)
    // J(11) and 10 are above highest board card (9) → 6 overcard outs
    const result = countOuts(["J♠", "10♠"], ["9♠", "8♣", "2♠"]);
    expect(result.flushOuts).toBe(9);
    expect(result.straightOuts).toBe(8);
    expect(result.overCardOuts).toBe(6);
    // Total deducts combo overlap: 9 + 8 + 6 - 2 = 21
    expect(result.totalOuts).toBe(9 + 8 + 6 - 2);
  });

  it("overcard outs when hole cards above board", () => {
    // Hero: A♠ K♥, Board: 8♦ 5♣ 2♠
    const result = countOuts(["A♠", "K♥"], ["8♦", "5♣", "2♠"]);
    expect(result.overCardOuts).toBe(6); // 3 per overcard
  });

  it("no outs on empty community", () => {
    const result = countOuts(["A♠", "K♥"], []);
    expect(result.totalOuts).toBe(0);
  });

  it("no outs on river (5 community cards)", () => {
    const result = countOuts(["A♠", "5♠"], ["K♠", "8♠", "3♦", "J♥", "2♣"]);
    expect(result.totalOuts).toBe(0);
  });
});

// ─── estimateEquityMonteCarlo ────────────────────────────────────────────────

describe("estimateEquityMonteCarlo", () => {
  it("AA vs random hand: high equity", () => {
    const eq = estimateEquityMonteCarlo(["A♠", "A♥"], [], 1, 200, 12345);
    expect(eq).toBeGreaterThanOrEqual(0.75);
    expect(eq).toBeLessThanOrEqual(0.95);
  });

  it("72o vs random hand: low equity", () => {
    const eq = estimateEquityMonteCarlo(["7♠", "2♦"], [], 1, 200, 12345);
    expect(eq).toBeGreaterThanOrEqual(0.2);
    expect(eq).toBeLessThanOrEqual(0.5);
  });

  it("deterministic with same seed", () => {
    const eq1 = estimateEquityMonteCarlo(["A♠", "K♥"], [], 1, 100, 42);
    const eq2 = estimateEquityMonteCarlo(["A♠", "K♥"], [], 1, 100, 42);
    expect(eq1).toBe(eq2);
  });

  it("different seeds produce different results", () => {
    const eq1 = estimateEquityMonteCarlo(["A♠", "K♥"], [], 1, 100, 42);
    const eq2 = estimateEquityMonteCarlo(["A♠", "K♥"], [], 1, 100, 999);
    // Very unlikely to be exactly equal with different seeds
    expect(eq1).not.toBe(eq2);
  });

  it("invalid hole cards returns 0", () => {
    const eq = estimateEquityMonteCarlo(["A♠"], [], 1, 100, 42);
    expect(eq).toBe(0);
  });
});

// ─── computeCallEV ───────────────────────────────────────────────────────────

describe("computeCallEV", () => {
  it("positive EV when equity exceeds pot odds", () => {
    // 50% equity, pot = 100, toCall = 50 → EV = 0.5*150 - 0.5*50 = 75 - 25 = 50
    const ev = computeCallEV(0.5, 100, 50);
    expect(ev).toBe(50);
  });

  it("negative EV when equity below pot odds", () => {
    // 10% equity, pot = 100, toCall = 100 → EV = 0.1*200 - 0.9*100 = 20 - 90 = -70
    const ev = computeCallEV(0.1, 100, 100);
    expect(ev).toBe(-70);
  });

  it("zero EV at breakeven point", () => {
    // Breakeven: equity = toCall / (pot + toCall) = 50/150 = 0.333...
    // EV = 0.333*150 - 0.667*50 ≈ 50 - 33.33 ≈ 16.67 (not exactly zero due to rounding)
    // True zero: equity = 0.25, pot = 100, toCall = 100/3
    // Simpler: equity = 0.5, pot = 0, toCall = 100 → EV = 0.5*100 - 0.5*100 = 0
    const ev = computeCallEV(0.5, 0, 100);
    expect(ev).toBe(0);
  });
});

// ─── isProfitableCall ────────────────────────────────────────────────────────

describe("isProfitableCall", () => {
  it("true when equity > potOdds + safetyBuffer", () => {
    // equity 0.40, potOdds 0.30, buffer 0.05 → 0.40 > 0.35 = true
    expect(isProfitableCall(0.4, 0.3)).toBe(true);
  });

  it("false when equity < potOdds + safetyBuffer", () => {
    // equity 0.33, potOdds 0.30, buffer 0.05 → 0.33 > 0.35 = false
    expect(isProfitableCall(0.33, 0.3)).toBe(false);
  });

  it("uses default 0.05 safety buffer", () => {
    // Exactly at boundary: equity 0.35, potOdds 0.30 → 0.35 > 0.35 = false
    expect(isProfitableCall(0.35, 0.3)).toBe(false);
    // Just above: equity 0.351
    expect(isProfitableCall(0.351, 0.3)).toBe(true);
  });

  it("respects custom safety buffer", () => {
    // equity 0.33, potOdds 0.30, buffer 0.02 → 0.33 > 0.32 = true
    expect(isProfitableCall(0.33, 0.3, 0.02)).toBe(true);
    // Same with buffer 0.10 → 0.33 > 0.40 = false
    expect(isProfitableCall(0.33, 0.3, 0.1)).toBe(false);
  });
});

// ─── Memoization ─────────────────────────────────────────────────────────────

describe("memoization", () => {
  it("returns same result for identical inputs", () => {
    const eq1 = estimateEquityHeuristic(["A♠", "K♥"], ["Q♦", "J♣", "2♠"], 2);
    const eq2 = estimateEquityHeuristic(["A♠", "K♥"], ["Q♦", "J♣", "2♠"], 2);
    expect(eq1).toBe(eq2);
  });

  it("clearEquityMemo resets the cache", () => {
    const eq1 = estimateEquityHeuristic(["A♠", "K♥"], [], 1);
    clearEquityMemo();
    // Should still return same value (deterministic), but cache was cleared
    const eq2 = estimateEquityHeuristic(["A♠", "K♥"], [], 1);
    expect(eq1).toBe(eq2);
  });
});
