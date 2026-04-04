/**
 * Unit tests for pure helper functions used by the simulation worker.
 * The worker itself runs in a Worker Thread; these tests target the logic
 * extracted from it (card conversion, blind-level lookup, table balancing).
 *
 * NOTE: The worker module imports GameInstance which has side effects (Logger, EventEmitter2).
 * We test the helpers by importing only their logic inline rather than the worker file.
 */
import { describe, it, expect } from "vitest";
import type { SimBlindLevel } from "../../src/workers/simulation.types";

// ── Card-format conversion helper (mirrors worker's toCardData) ───────────────

function toCardData(card: any): { rank: string; suit: string } {
  if (typeof card === "string") {
    const chars = [...card];
    const suit = chars.pop()!;
    const rank = chars.join("");
    return { rank, suit };
  }
  return { rank: String(card.rank ?? "?"), suit: String(card.suit ?? "?") };
}

// ── Blind-level lookup (mirrors worker's getCurrentBlinds) ────────────────────

function getCurrentBlinds(
  blindLevels: SimBlindLevel[],
  handsPlayed: number,
): { smallBlind: number; bigBlind: number; ante: number; level: number } {
  if (!blindLevels.length)
    return { smallBlind: 25, bigBlind: 50, ante: 0, level: 1 };
  let cumulative = 0;
  for (const lvl of blindLevels) {
    cumulative += lvl.handsPerLevel;
    if (handsPlayed < cumulative) {
      return {
        smallBlind: lvl.smallBlind,
        bigBlind: lvl.bigBlind,
        ante: lvl.ante,
        level: lvl.level,
      };
    }
  }
  const last = blindLevels[blindLevels.length - 1];
  return {
    smallBlind: last.smallBlind,
    bigBlind: last.bigBlind,
    ante: last.ante,
    level: last.level,
  };
}

// ── Table-assignment helper (mirrors worker's assignToTables) ─────────────────

function assignToTables<T>(bots: T[], seatsPerTable: number): T[][] {
  if (bots.length === 0) return [];
  const numTables = Math.max(1, Math.ceil(bots.length / seatsPerTable));
  const tables: T[][] = Array.from({ length: numTables }, () => []);
  bots.forEach((bot, i) => tables[i % numTables].push(bot));
  return tables;
}

// ── normalizeStage helper ─────────────────────────────────────────────────────

const VALID_STAGES = new Set(["preflop", "flop", "turn", "river"]);

function normalizeStage(stage: string): string {
  const s = stage.toLowerCase().replace("-", "");
  if (s === "preflop" || s === "pre-flop") return "preflop";
  return VALID_STAGES.has(s) ? s : "preflop";
}

// ─────────────────────────────────────────────────────────────────────────────

describe("simulation worker helpers", () => {
  // ── toCardData ──────────────────────────────────────────────────────────────
  describe("toCardData", () => {
    it("converts object cards", () => {
      expect(toCardData({ rank: "A", suit: "♥" })).toEqual({
        rank: "A",
        suit: "♥",
      });
      expect(toCardData({ rank: "10", suit: "♠" })).toEqual({
        rank: "10",
        suit: "♠",
      });
    });

    it("converts string cards (splits at last Unicode char)", () => {
      expect(toCardData("A♥")).toEqual({ rank: "A", suit: "♥" });
      expect(toCardData("10♠")).toEqual({ rank: "10", suit: "♠" });
      expect(toCardData("K♦")).toEqual({ rank: "K", suit: "♦" });
      expect(toCardData("2♣")).toEqual({ rank: "2", suit: "♣" });
    });
  });

  // ── getCurrentBlinds ────────────────────────────────────────────────────────
  describe("getCurrentBlinds", () => {
    const levels: SimBlindLevel[] = [
      { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, handsPerLevel: 10 },
      { level: 2, smallBlind: 50, bigBlind: 100, ante: 10, handsPerLevel: 10 },
      { level: 3, smallBlind: 100, bigBlind: 200, ante: 20, handsPerLevel: 10 },
    ];

    it("starts at level 1 with 0 hands played", () => {
      const result = getCurrentBlinds(levels, 0);
      expect(result.level).toBe(1);
      expect(result.smallBlind).toBe(25);
      expect(result.bigBlind).toBe(50);
    });

    it("stays at level 1 through hand 9", () => {
      expect(getCurrentBlinds(levels, 9).level).toBe(1);
    });

    it("advances to level 2 at hand 10", () => {
      const result = getCurrentBlinds(levels, 10);
      expect(result.level).toBe(2);
      expect(result.smallBlind).toBe(50);
    });

    it("advances to level 3 at hand 20", () => {
      expect(getCurrentBlinds(levels, 20).level).toBe(3);
    });

    it("stays at last level beyond all hands", () => {
      const result = getCurrentBlinds(levels, 9999);
      expect(result.level).toBe(3);
      expect(result.smallBlind).toBe(100);
    });

    it("returns defaults for empty blind levels", () => {
      const result = getCurrentBlinds([], 0);
      expect(result.smallBlind).toBe(25);
      expect(result.bigBlind).toBe(50);
    });
  });

  // ── assignToTables ──────────────────────────────────────────────────────────
  describe("assignToTables", () => {
    it("returns empty for no bots", () => {
      expect(assignToTables([], 9)).toEqual([]);
    });

    it("puts all bots on one table when count ≤ seatsPerTable", () => {
      const bots = [1, 2, 3, 4, 5];
      const tables = assignToTables(bots, 9);
      expect(tables).toHaveLength(1);
      expect(tables[0]).toHaveLength(5);
    });

    it("creates exactly 2 tables for 10 bots with 9 seats", () => {
      const bots = Array.from({ length: 10 }, (_, i) => i);
      const tables = assignToTables(bots, 9);
      expect(tables).toHaveLength(2);
      // Round-robin: 10 bots → 5 + 5
      expect(tables[0].length + tables[1].length).toBe(10);
    });

    it("distributes bots evenly across tables", () => {
      const bots = Array.from({ length: 18 }, (_, i) => i);
      const tables = assignToTables(bots, 9);
      expect(tables).toHaveLength(2);
      expect(tables[0]).toHaveLength(9);
      expect(tables[1]).toHaveLength(9);
    });

    it("creates 3 tables for 27 bots with 9 seats", () => {
      const bots = Array.from({ length: 27 }, (_, i) => i);
      const tables = assignToTables(bots, 9);
      expect(tables).toHaveLength(3);
      const allBots = tables.flat();
      expect(allBots).toHaveLength(27);
    });

    it("each bot appears on exactly one table", () => {
      const bots = Array.from({ length: 13 }, (_, i) => i);
      const tables = assignToTables(bots, 9);
      const allBots = tables.flat();
      expect(new Set(allBots).size).toBe(13);
      expect(allBots).toHaveLength(13);
    });
  });

  // ── normalizeStage ──────────────────────────────────────────────────────────
  describe("normalizeStage", () => {
    it("normalizes pre-flop variants", () => {
      expect(normalizeStage("pre-flop")).toBe("preflop");
      expect(normalizeStage("preflop")).toBe("preflop");
      expect(normalizeStage("PRE-FLOP")).toBe("preflop");
    });

    it("passes through valid stages unchanged", () => {
      expect(normalizeStage("flop")).toBe("flop");
      expect(normalizeStage("turn")).toBe("turn");
      expect(normalizeStage("river")).toBe("river");
    });

    it("defaults unknown stages to preflop", () => {
      expect(normalizeStage("showdown")).toBe("preflop");
      expect(normalizeStage("unknown")).toBe("preflop");
    });
  });
});
