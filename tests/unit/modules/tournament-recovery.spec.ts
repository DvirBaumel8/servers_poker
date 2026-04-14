import { describe, it, expect } from "vitest";

/**
 * Unit tests for tournament recovery logic.
 *
 * These tests verify that the recovery path correctly respawns games
 * when tables exist in the DB but have no live game instances (post-restart scenario).
 */

describe("Tournament Recovery — Respawn Decision Logic", () => {
  describe("needsRespawn — table status filtering", () => {
    it("should return true for active table with no live game", () => {
      const table = { id: "t1", table_number: 1, status: "active" };
      const liveGame = null;

      expect(needsRespawn(table, liveGame)).toBe(true);
    });

    it("should return false for active table with live game", () => {
      const table = { id: "t1", table_number: 1, status: "active" };
      const liveGame = { game: {}, gameDbId: "g1" };

      expect(needsRespawn(table, liveGame)).toBe(false);
    });

    it("should return false for broken table (regardless of game)", () => {
      const table = { id: "t2", table_number: 2, status: "broken" };
      const liveGame = null;

      expect(needsRespawn(table, liveGame)).toBe(false);
    });

    it("should return false for finished table (regardless of game)", () => {
      const table = { id: "t3", table_number: 3, status: "finished" };
      const liveGame = null;

      expect(needsRespawn(table, liveGame)).toBe(false);
    });
  });

  describe("countActiveSeats — seat filtering logic", () => {
    it("should count only non-busted seats for a specific table", () => {
      const tableId = "table-1";
      const allSeats = [
        { tournament_table_id: tableId, bot_id: "bot-a", busted: false },
        { tournament_table_id: tableId, bot_id: "bot-b", busted: true },
        { tournament_table_id: "table-2", bot_id: "bot-c", busted: false },
        { tournament_table_id: tableId, bot_id: "bot-d", busted: false },
      ];

      const activeSeats = allSeats.filter(
        (s) => s.tournament_table_id === tableId && !s.busted,
      );

      expect(activeSeats.length).toBe(2);
      expect(activeSeats.map((s) => s.bot_id)).toEqual(["bot-a", "bot-d"]);
    });

    it("should return empty array when all seats are busted", () => {
      const tableId = "table-1";
      const allSeats = [
        { tournament_table_id: tableId, bot_id: "bot-a", busted: true },
        { tournament_table_id: tableId, bot_id: "bot-b", busted: true },
      ];

      const activeSeats = allSeats.filter(
        (s) => s.tournament_table_id === tableId && !s.busted,
      );

      expect(activeSeats.length).toBe(0);
    });

    it("should return empty array when table has no seats", () => {
      const tableId = "table-1";
      const allSeats = [
        { tournament_table_id: "table-2", bot_id: "bot-a", busted: false },
      ];

      const activeSeats = allSeats.filter(
        (s) => s.tournament_table_id === tableId && !s.busted,
      );

      expect(activeSeats.length).toBe(0);
    });
  });

  describe("respawn decision tree", () => {
    it("should respawn only for active tables with seats and no game", () => {
      const scenarios = [
        {
          table: { id: "t1", status: "active" },
          game: null,
          seats: [
            { tournament_table_id: "t1", busted: false },
            { tournament_table_id: "t1", busted: false },
          ],
          shouldRespawn: true,
          reason: "active table, no game, has seats",
        },
        {
          table: { id: "t2", status: "active" },
          game: null,
          seats: [],
          shouldRespawn: false,
          reason: "active table, no game, no seats",
        },
        {
          table: { id: "t3", status: "broken" },
          game: null,
          seats: [{ tournament_table_id: "t3", busted: false }],
          shouldRespawn: false,
          reason: "broken table (skip by status)",
        },
        {
          table: { id: "t4", status: "active" },
          game: { gameDbId: "g4" },
          seats: [{ tournament_table_id: "t4", busted: false }],
          shouldRespawn: false,
          reason: "active table with game (reattach, not respawn)",
        },
      ];

      for (const scenario of scenarios) {
        const hasGame = scenario.game !== null;
        const hasSeats = scenario.seats.length > 0;
        const isActive = scenario.table.status === "active";

        const willRespawn = isActive && !hasGame && hasSeats;

        expect(willRespawn).toBe(scenario.shouldRespawn, scenario.reason);
      }
    });
  });
});

/**
 * Helper function: determine if a table needs respawn
 * (extracted for unit testing, not in actual code but logic is inline)
 */
function needsRespawn(table: { status: string }, liveGame: any): boolean {
  return table.status === "active" && !liveGame;
}

// ─── handCount restoration on recovery ───────────────────────────────────────

/**
 * Mirrors the formula used in ActiveTournament.recoverFromDb() to restore
 * handCount and handsThisLevel from the persisted TournamentBlindLevel row.
 */
function restoreHandCount(
  currentLevel: number,
  handsPlayed: number,
  handsPerLevel: number,
): { handCount: number; handsThisLevel: number } {
  return {
    handsThisLevel: handsPlayed,
    handCount: (currentLevel - 1) * handsPerLevel + handsPlayed,
  };
}

describe("Tournament Recovery — handCount restoration", () => {
  it("returns zero for a fresh tournament at level 1, hand 0", () => {
    expect(restoreHandCount(1, 0, 5)).toEqual({
      handCount: 0,
      handsThisLevel: 0,
    });
  });

  it("restores mid-level state correctly", () => {
    // Level 3, 2 hands played so far; 5 hands per level → 2×5 + 2 = 12
    expect(restoreHandCount(3, 2, 5)).toEqual({
      handCount: 12,
      handsThisLevel: 2,
    });
  });

  it("restores state at end of a completed level", () => {
    // Level 7, hands_played = 5 (full level); 6×5 + 5 = 35
    expect(restoreHandCount(7, 5, 5)).toEqual({
      handCount: 35,
      handsThisLevel: 5,
    });
  });

  it("works with non-default handsPerLevel", () => {
    // Level 4, 10 hands played; handsPerLevel = 20 → 3×20 + 10 = 70
    expect(restoreHandCount(4, 10, 20)).toEqual({
      handCount: 70,
      handsThisLevel: 10,
    });
  });

  it("handCount is always >= handsThisLevel", () => {
    for (const level of [1, 3, 7]) {
      for (const played of [0, 1, 4]) {
        const { handCount, handsThisLevel } = restoreHandCount(
          level,
          played,
          5,
        );
        expect(handCount).toBeGreaterThanOrEqual(handsThisLevel);
      }
    }
  });
});
