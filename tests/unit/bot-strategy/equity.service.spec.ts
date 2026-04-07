import { describe, it, expect, beforeEach } from "vitest";
import {
  estimateEquityHeuristic,
  estimateEquityMonteCarlo,
  countOuts,
  computeCallEV,
  isProfitableCall,
  clearEquityMemo,
  isBoardPlays,
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

  it("accepts letter-suit notation (regression: Scenario Lab cards)", () => {
    // Cards from the frontend use 'As', 'Kh', 'Qd', 'Jc' format.
    // cardToInt must parse these without returning -1.
    const eq = estimateEquityMonteCarlo(["As", "Kh"], [], 1, 200, 42);
    expect(eq).toBeGreaterThanOrEqual(0.55);
    expect(eq).toBeLessThanOrEqual(0.85);
  });

  it("letter-suit and unicode-suit give the same equity", () => {
    const eqLetter = estimateEquityMonteCarlo(["As", "Ah"], [], 1, 500, 42);
    const eqUnicode = estimateEquityMonteCarlo(["A♠", "A♥"], [], 1, 500, 42);
    // Should be identical — same cards, same seed
    expect(eqLetter).toBe(eqUnicode);
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

// ─── isBoardPlays / board-plays equity ──────────────────────────────────────

describe("isBoardPlays", () => {
  it("returns true when hole cards contribute nothing (classic board-plays scenario)", () => {
    // 8♠6♠ on K♠A♥9♦9♣A♣: best 5 is AA99K — neither 8 nor 6 appears
    expect(isBoardPlays(["8♠", "6♠"], ["K♠", "A♥", "9♦", "9♣", "A♣"])).toBe(
      true,
    );
  });

  it("returns true for K♠Q♥ on K♣A♦A♥A♠K♥ (the screenshot scenario: KQ on AAAKK)", () => {
    // K♠ shares rank with board kings — old card-presence check was unreliable here.
    // The score-comparison fix must correctly detect that KQ doesn't improve AAAKK.
    expect(isBoardPlays(["K♠", "Q♥"], ["K♣", "A♦", "A♥", "A♠", "K♥"])).toBe(
      true,
    );
  });

  it("returns true for another board-plays hand (2♣3♦ on A♣A♥9♠9♦K♥)", () => {
    // 2-3 low cards on paired board — board plays
    expect(isBoardPlays(["2♣", "3♦"], ["A♣", "A♥", "9♠", "9♦", "K♥"])).toBe(
      true,
    );
  });

  it("returns false when hole pair contributes to full house (9♠9♥ on A♣A♥9♦2♠7♣)", () => {
    // Bot has pocket 9s — makes FULL HOUSE (999AA), hole 9s ARE in best 5
    expect(isBoardPlays(["9♠", "9♥"], ["A♣", "A♥", "9♦", "2♠", "7♣"])).toBe(
      false,
    );
  });

  it("returns false when hole ace contributes to full house (A♠K♦ on A♥9♦9♣A♣2♥)", () => {
    // Bot has A♠ — combines with board to make AAA99 full house, hole A IS in best 5
    expect(isBoardPlays(["A♠", "K♦"], ["A♥", "9♦", "9♣", "A♣", "2♥"])).toBe(
      false,
    );
  });

  it("returns false when fewer than 5 community cards", () => {
    // Cannot be board plays on flop/turn — always false
    expect(isBoardPlays(["8♠", "6♠"], ["K♠", "A♥", "9♦"])).toBe(false);
    expect(isBoardPlays(["8♠", "6♠"], ["K♠", "A♥", "9♦", "9♣"])).toBe(false);
    expect(isBoardPlays(["8♠", "6♠"], [])).toBe(false);
  });
});

describe("board-plays equity correction", () => {
  it("8♠6♠ on K♠A♥9♦9♣A♣ river: equity is low (< 0.25), not ~0.48 (two pair)", () => {
    // Without the fix, inferHandStrength returns 'two_pair' → ~0.48
    // With the fix, isBoardPlays returns true → 0.12^exponent ≈ 0.21
    const eq = estimateEquityHeuristic(
      ["8♠", "6♠"],
      ["K♠", "A♥", "9♦", "9♣", "A♣"],
      1,
    );
    expect(eq).toBeLessThan(0.25);
    // Also verify it's meaningfully lower than the two_pair baseline (~0.48)
    expect(eq).toBeLessThan(0.3);
  });

  it("2♣3♦ on A♣A♥9♠9♦K♥ river: equity is low (< 0.25)", () => {
    const eq = estimateEquityHeuristic(
      ["2♣", "3♦"],
      ["A♣", "A♥", "9♠", "9♦", "K♥"],
      1,
    );
    expect(eq).toBeLessThan(0.25);
  });

  it("9♠9♥ on A♣A♥9♦2♠7♣ river: equity is high (> 0.80) — bot made full house", () => {
    // Pocket 9s + one 9 on board = FULL HOUSE (999AA), bot's cards contribute
    const eq = estimateEquityHeuristic(
      ["9♠", "9♥"],
      ["A♣", "A♥", "9♦", "2♠", "7♣"],
      1,
    );
    expect(eq).toBeGreaterThan(0.8);
  });

  it("A♠K♦ on A♥9♦9♣A♣2♥ river: equity is high (> 0.70) — bot has full house via hole A", () => {
    // Bot's A♠ makes it AAA99 full house — hole card contributes, not board plays
    const eq = estimateEquityHeuristic(
      ["A♠", "K♦"],
      ["A♥", "9♦", "9♣", "A♣", "2♥"],
      1,
    );
    expect(eq).toBeGreaterThan(0.7);
  });

  it("board-plays equity decreases with more opponents (multi-way discount applies)", () => {
    const eq1 = estimateEquityHeuristic(
      ["8♠", "6♠"],
      ["K♠", "A♥", "9♦", "9♣", "A♣"],
      1,
    );
    const eq3 = estimateEquityHeuristic(
      ["8♠", "6♠"],
      ["K♠", "A♥", "9♦", "9♣", "A♣"],
      3,
    );
    expect(eq1).toBeGreaterThan(eq3);
  });

  it("K♠Q♥ on K♣A♦A♥A♠K♥ (AAAKK full-house board): equity is near 0.46 — almost certain split", () => {
    // Board has Aces full of Kings. Only the remaining A♣ in a random hand beats it.
    // Expected: boardWinRate(full_house=0.92) × 0.5 = 0.46
    const eq = estimateEquityHeuristic(
      ["K♠", "Q♥"],
      ["K♣", "A♦", "A♥", "A♠", "K♥"],
      1,
    );
    // Must be much higher than the old 0.12^0.74 ≈ 0.21 and close to the split-pot floor
    expect(eq).toBeGreaterThan(0.35);
    expect(eq).toBeLessThan(0.5);
  });

  it("Monte Carlo for K♠Q♥ on AAAKK: equity ≈ 0.48 (mostly ties, not 34.5%)", () => {
    // The screenshot bug: Monte Carlo should return ~48% equity when facing 1 opponent.
    // The board has 3 Aces — only A♣ remaining can beat hero (quads). ~96% ties.
    const eq = estimateEquityMonteCarlo(
      ["K♠", "Q♥"],
      ["K♣", "A♦", "A♥", "A♠", "K♥"],
      1, // 1 opponent (correct for 1v1 all-in scenario)
      5000,
      42,
    );
    // (wins + 0.5 × ties) / total ≈ 0 + 0.5 × 0.956 = 0.478
    expect(eq).toBeGreaterThan(0.42);
    expect(eq).toBeLessThan(0.52);
  });
});

// ─── estimateEquityMonteCarlo (fast integer evaluator) ───────────────────────

describe("estimateEquityMonteCarlo (fast eval)", () => {
  it("AA preflop vs 1 random opponent: equity ≥ 0.75", () => {
    const eq = estimateEquityMonteCarlo(["A♠", "A♥"], [], 1, 5000, 1);
    expect(eq).toBeGreaterThanOrEqual(0.75);
    expect(eq).toBeLessThanOrEqual(0.95);
  });

  it("72o preflop vs 1 random opponent: equity ≤ 0.40", () => {
    const eq = estimateEquityMonteCarlo(["7♠", "2♦"], [], 1, 5000, 1);
    expect(eq).toBeLessThanOrEqual(0.4);
    expect(eq).toBeGreaterThanOrEqual(0.25);
  });

  it("nut flush draw on flop vs 1 opponent: equity in [0.50, 0.80]", () => {
    // A♠ 5♠ on K♠ 8♠ 3♦ — nut flush draw + A high (overcards vs random)
    // Realistic equity ~68%: flush draw + pair outs + A-high wins uncontested
    const eq = estimateEquityMonteCarlo(
      ["A♠", "5♠"],
      ["K♠", "8♠", "3♦"],
      1,
      5000,
      1,
    );
    expect(eq).toBeGreaterThanOrEqual(0.5);
    expect(eq).toBeLessThanOrEqual(0.8);
  });

  it("made flush on river vs 1 opponent: equity ≥ 0.75", () => {
    // A♠ K♠ on Q♠ J♠ 9♠ 2♦ 3♣ — hero has nut flush
    const eq = estimateEquityMonteCarlo(
      ["A♠", "K♠"],
      ["Q♠", "J♠", "9♠", "2♦", "3♣"],
      1,
      5000,
      1,
    );
    expect(eq).toBeGreaterThanOrEqual(0.75);
  });

  it("is deterministic with the same seed", () => {
    const eq1 = estimateEquityMonteCarlo(
      ["A♠", "K♥"],
      ["Q♦", "J♣", "2♠"],
      1,
      1000,
      77,
    );
    const eq2 = estimateEquityMonteCarlo(
      ["A♠", "K♥"],
      ["Q♦", "J♣", "2♠"],
      1,
      1000,
      77,
    );
    expect(eq1).toBe(eq2);
  });

  it("different seeds produce different results", () => {
    const eq1 = estimateEquityMonteCarlo(
      ["A♠", "K♥"],
      ["Q♦", "J♣", "2♠"],
      1,
      500,
      1,
    );
    const eq2 = estimateEquityMonteCarlo(
      ["A♠", "K♥"],
      ["Q♦", "J♣", "2♠"],
      1,
      500,
      9999,
    );
    // Different seeds should produce somewhat different results
    expect(Math.abs(eq1 - eq2)).toBeGreaterThan(0);
  });

  it("range-aware simulation differs from uniform when LUT filters hands", () => {
    // Tight LUT: only AA (index 12) is in range → opponent rarely has a strong hand
    const tightLUT = new Uint8Array(169).fill(0);
    tightLUT[12] = 3; // Only AA in range

    const equityUniform = estimateEquityMonteCarlo(
      ["7♠", "2♦"],
      [],
      1,
      2000,
      42,
    );
    const equityRangeAware = estimateEquityMonteCarlo(
      ["7♠", "2♦"],
      [],
      1,
      2000,
      42,
      tightLUT,
    );

    // Against only AA, 72o should have much lower equity vs tight range
    // (opponent always has AA) than vs random hands
    expect(equityRangeAware).toBeLessThan(equityUniform);
  });

  it("performance: 5000 iterations on river board completes in < 50ms", () => {
    const start = performance.now();
    estimateEquityMonteCarlo(
      ["A♠", "K♥"],
      ["Q♦", "J♣", "2♠", "7♥", "3♦"],
      1,
      5000,
      42,
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("performance: 5000 iterations on flop completes in < 50ms", () => {
    const start = performance.now();
    estimateEquityMonteCarlo(["A♠", "K♥"], ["Q♦", "J♣", "2♠"], 1, 5000, 42);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("returns 0 for invalid input (not 2 hole cards)", () => {
    expect(estimateEquityMonteCarlo(["A♠"], [], 1)).toBe(0);
  });

  it("equity is in [0, 1]", () => {
    const eq = estimateEquityMonteCarlo(["A♠", "A♥"], [], 3, 1000, 1);
    expect(eq).toBeGreaterThanOrEqual(0);
    expect(eq).toBeLessThanOrEqual(1);
  });
});

// ─── Board-awareness: inferHandStrength must not overrate shared board hands ──

describe("estimateEquityHeuristic — board-awareness (shared board hands)", () => {
  // QQQ on board with 84o: board trips, hero only has kicker advantage
  // Should be rated as near high_card, NOT trips (0.70 equity)
  it("84o on QQQ96 river: much lower equity than genuine trips", () => {
    const boardTripsEq = estimateEquityHeuristic(
      ["8d", "4s"],
      ["Qh", "Qd", "Qs", "9d", "6d"],
      1,
    );
    // Genuine trips (e.g. set of nines) should be ~0.65-0.70
    // Board trips with weak kickers should be much lower
    expect(boardTripsEq).toBeLessThan(0.25);
  });

  it("99 on QQQ96 board: full house (pocket pair + board trips) is genuinely strong", () => {
    const fullHouseEq = estimateEquityHeuristic(
      ["9c", "9s"],
      ["Qh", "Qd", "Qs", "9d", "6d"],
      1,
    );
    // QQQ99 full house is very strong
    expect(fullHouseEq).toBeGreaterThan(0.7);
  });

  it("Q8 on QQQ96 board: player has quads (one Q in hand + three on board)", () => {
    const quadsEq = estimateEquityHeuristic(
      ["Qc", "8d"],
      ["Qh", "Qd", "Qs", "9d", "6d"],
      1,
    );
    // Quads are very strong
    expect(quadsEq).toBeGreaterThan(0.85);
  });

  it("A2 on QQQ96 board: board trips but A kicker — still kicker-only situation", () => {
    const aceKickerEq = estimateEquityHeuristic(
      ["As", "2c"],
      ["Qh", "Qd", "Qs", "9d", "6d"],
      1,
    );
    // Even with A kicker (best kicker), board trips only — still limited
    expect(aceKickerEq).toBeLessThan(0.4);
  });

  it("board trips equity < genuine trips equity", () => {
    const boardTrips = estimateEquityHeuristic(
      ["8d", "4s"],
      ["Qh", "Qd", "Qs", "9d", "6d"],
      1,
    );
    // Genuine trips: player holds matching card (e.g. 9 in hand with 99 on board)
    const genuineTrips = estimateEquityHeuristic(
      ["9c", "7s"],
      ["9h", "9d", "Ks", "3d", "2c"],
      1,
    );
    expect(boardTrips).toBeLessThan(genuineTrips);
  });

  it("board pair without hole match: near high_card equity (pure kicker game)", () => {
    // Board: KK93A — everyone has a pair of kings, competing on kickers
    const boardPairEq = estimateEquityHeuristic(
      ["8d", "4s"],
      ["Kh", "Kd", "9s", "3c", "Ac"],
      1,
    );
    // Should be very low — 84 kicker loses to almost any random hand
    expect(boardPairEq).toBeLessThan(0.25);
  });
});

// ─── Fix 3: Monte Carlo precision (Seq 170 regression) ───────────────────────

describe("estimateEquityMonteCarlo — precision over heuristic buckets", () => {
  it("returns precise decimal (not a rounded bucket like 0.45 or 0.75)", () => {
    // The heuristic returns lookup table values like 0.75, 0.45, 0.6.
    // Monte Carlo should return precise values like 0.7342, 0.5118, etc.
    const eq = estimateEquityMonteCarlo(
      ["A♠", "K♥"],
      ["Q♦", "J♣", "2♠"],
      1,
      5000,
      42,
    );
    // Check it is NOT a common heuristic bucket value
    const heuristicBuckets = [
      0.09, 0.15, 0.3, 0.45, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9,
    ];
    const isExactBucket = heuristicBuckets.some(
      (b) => Math.abs(eq - b) < 0.001,
    );
    expect(isExactBucket).toBe(false);
  });

  it("Seq 170 regression: made flush on flop has equity > 0.70 (not 0.53 heuristic bucket)", () => {
    // A♠K♠ on Q♠J♠9♠ — nut flush already made on flop
    // Heuristic may return the 'flush' bucket (0.65-0.70) but MC should be accurate
    const mcEq = estimateEquityMonteCarlo(
      ["A♠", "K♠"],
      ["Q♠", "J♠", "9♠"],
      1,
      5000,
      42,
    );
    expect(mcEq).toBeGreaterThan(0.7);
  });

  it("pocket aces on dry flop has equity > 0.75 with precise MC value", () => {
    // A♠A♥ on 7♦3♣2♠ — overpair, strong hand
    const mcEq = estimateEquityMonteCarlo(
      ["A♠", "A♥"],
      ["7♦", "3♣", "2♠"],
      1,
      5000,
      42,
    );
    expect(mcEq).toBeGreaterThan(0.75);
    // Should NOT be the exact heuristic bucket (0.80 for 'full_house' or 0.75 for 'quads')
    expect(Math.abs(mcEq - 0.75)).toBeGreaterThan(0.001);
  });

  it("is consistent across multiple runs with same seed (deterministic)", () => {
    const eq1 = estimateEquityMonteCarlo(
      ["A♠", "K♥"],
      ["Q♦", "J♣", "2♠"],
      1,
      5000,
      1337,
    );
    const eq2 = estimateEquityMonteCarlo(
      ["A♠", "K♥"],
      ["Q♦", "J♣", "2♠"],
      1,
      5000,
      1337,
    );
    expect(eq1).toBe(eq2);
    // And must be in valid range
    expect(eq1).toBeGreaterThan(0);
    expect(eq1).toBeLessThanOrEqual(1);
  });
});
