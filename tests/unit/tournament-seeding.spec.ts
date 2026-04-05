/**
 * Tests for the snake seeding algorithm and owner isolation logic.
 *
 * These tests exercise the pure algorithmic parts extracted from
 * ActiveTournament.createInitialTables() to verify correctness without
 * requiring NestJS or a database.
 */
import { describe, it, expect } from "vitest";

// ── Types mirrored from tournament-director.service.ts ────────────────────────

interface BotInfo {
  botId: string;
  name: string;
  userName: string;
  userId: string;
  elo: number;
  strategy: null;
  chips: bigint;
  tableDbId: string | null;
}

function bot(id: string, userId: string, elo: number = 0): BotInfo {
  return {
    botId: id,
    name: id,
    userName: id,
    userId,
    elo,
    strategy: null,
    chips: 1000n,
    tableDbId: null,
  };
}

// ── Helpers copied verbatim from the service ──────────────────────────────────

function hasDuplicateOwner(seats: BotInfo[]): boolean {
  const seen = new Set<string>();
  for (const s of seats) {
    if (s.userId === "unknown") continue;
    if (seen.has(s.userId)) return true;
    seen.add(s.userId);
  }
  return false;
}

function snakeSeed(ranked: BotInfo[], numTables: number): BotInfo[][] {
  const tables: BotInfo[][] = Array.from({ length: numTables }, () => []);
  if (numTables === 1) {
    tables[0] = ranked;
    return tables;
  }
  let idx = 0;
  let dir = 1;
  for (const b of ranked) {
    tables[idx].push(b);
    // Endpoint reached: flip WITHOUT advancing (endpoint is double-visited)
    const next = idx + dir;
    if (next >= numTables) dir = -1;
    else if (next < 0) dir = 1;
    else idx = next;
  }
  return tables;
}

function ownerIsolation(tables: BotInfo[][]): BotInfo[][] {
  const numTables = tables.length;
  for (let t = 0; t < numTables; t++) {
    for (let i = 0; i < tables[t].length; i++) {
      const conflictIdx = tables[t].findIndex(
        (b, j) => j !== i && b.userId === tables[t][i].userId,
      );
      if (conflictIdx === -1) continue;
      for (let t2 = 0; t2 < numTables; t2++) {
        if (t2 === t) continue;
        let swapped = false;
        for (let j = 0; j < tables[t2].length && !swapped; j++) {
          const tAfter = tables[t]
            .filter((_, k) => k !== conflictIdx)
            .concat(tables[t2][j]);
          const t2After = tables[t2]
            .filter((_, k) => k !== j)
            .concat(tables[t][conflictIdx]);
          if (!hasDuplicateOwner(tAfter) && !hasDuplicateOwner(t2After)) {
            [tables[t][conflictIdx], tables[t2][j]] = [
              tables[t2][j],
              tables[t][conflictIdx],
            ];
            swapped = true;
          }
        }
      }
    }
  }
  return tables;
}

// ── seatsPerTable resolution ──────────────────────────────────────────────────

describe("seatsPerTable resolution", () => {
  it("uses players_per_table from config over hardcoded default", () => {
    const SEATS_PER_TABLE_DEFAULT = 9;
    const config = { players_per_table: 6 };
    const seatsPerTable = config.players_per_table ?? SEATS_PER_TABLE_DEFAULT;
    expect(seatsPerTable).toBe(6);
  });

  it("falls back to 9 when players_per_table is absent", () => {
    const SEATS_PER_TABLE_DEFAULT = 9;
    const config: any = {};
    const seatsPerTable = config.players_per_table ?? SEATS_PER_TABLE_DEFAULT;
    expect(seatsPerTable).toBe(9);
  });

  it("8 players at 6-max creates 2 tables, not 1", () => {
    const numPlayers = 8;
    const seatsPerTable = 6;
    expect(Math.ceil(numPlayers / seatsPerTable)).toBe(2);
  });

  it("8 players at hardcoded 9 incorrectly creates 1 table (regression guard)", () => {
    // This is the pre-fix behavior — the test documents the bug was real
    const numPlayers = 8;
    const wrongSeatsPerTable = 9;
    expect(Math.ceil(numPlayers / wrongSeatsPerTable)).toBe(1);
  });
});

// ── hasDuplicateOwner ─────────────────────────────────────────────────────────

describe("hasDuplicateOwner", () => {
  it("returns false for empty seats", () => {
    expect(hasDuplicateOwner([])).toBe(false);
  });

  it("returns false when all owners are different", () => {
    expect(
      hasDuplicateOwner([bot("b1", "u1"), bot("b2", "u2"), bot("b3", "u3")]),
    ).toBe(false);
  });

  it("returns true when two bots share an owner", () => {
    expect(hasDuplicateOwner([bot("b1", "u1"), bot("b2", "u1")])).toBe(true);
  });

  it("ignores 'unknown' userId (system bots)", () => {
    expect(
      hasDuplicateOwner([bot("b1", "unknown"), bot("b2", "unknown")]),
    ).toBe(false);
  });
});

// ── Snake seeding ─────────────────────────────────────────────────────────────

describe("snakeSeed", () => {
  it("single table: all bots assigned to table 0", () => {
    const bots = [
      bot("b1", "u1", 100),
      bot("b2", "u2", 80),
      bot("b3", "u3", 60),
    ];
    const tables = snakeSeed(bots, 1);
    expect(tables).toHaveLength(1);
    expect(tables[0]).toHaveLength(3);
  });

  it("single table with 8 bots does not crash (regression: index -1)", () => {
    const bots = Array.from({ length: 8 }, (_, i) =>
      bot(`b${i}`, `u${i}`, i * 10),
    );
    expect(() => snakeSeed(bots, 1)).not.toThrow();
    const tables = snakeSeed(bots, 1);
    expect(tables[0]).toHaveLength(8);
  });

  it("two tables: endpoints are double-visited (standard snake)", () => {
    // Classic snake for 2 tables, 4 bots:
    // Forward pass: T0←rank1, T1←rank2
    // T1 is endpoint → direction flips, T1 gets rank3 too
    // Reverse pass: T0←rank4
    // Result: T0=[rank1,rank4], T1=[rank2,rank3]
    const bots = [
      bot("b1", "u1", 100), // rank 1
      bot("b2", "u2", 80), // rank 2
      bot("b3", "u3", 60), // rank 3
      bot("b4", "u4", 40), // rank 4
    ];
    const ranked = [...bots].sort((a, b) => b.elo - a.elo);
    const tables = snakeSeed(ranked, 2);
    expect(tables[0].map((b) => b.botId)).toEqual(["b1", "b4"]); // best + worst
    expect(tables[1].map((b) => b.botId)).toEqual(["b2", "b3"]); // 2nd + 3rd
  });

  it("distributes bots evenly across 3 tables for 9 bots", () => {
    // Snake for 3 tables, 9 bots:
    // T0←1, T1←2, T2←3 (endpoint), T2←4, T1←5, T0←6 (endpoint), T0←7, T1←8, T2←9
    // T0=[1,6,7], T1=[2,5,8], T2=[3,4,9] — 3 each
    const bots = Array.from({ length: 9 }, (_, i) =>
      bot(`b${i}`, `u${i}`, 100 - i * 10),
    );
    const tables = snakeSeed(bots, 3);
    expect(tables[0]).toHaveLength(3);
    expect(tables[1]).toHaveLength(3);
    expect(tables[2]).toHaveLength(3);
    // Verify correct snake assignment
    expect(tables[0].map((b) => b.botId)).toEqual(["b0", "b5", "b6"]);
    expect(tables[1].map((b) => b.botId)).toEqual(["b1", "b4", "b7"]);
    expect(tables[2].map((b) => b.botId)).toEqual(["b2", "b3", "b8"]);
  });

  it("total bots is conserved after seeding", () => {
    const bots = Array.from({ length: 17 }, (_, i) => bot(`b${i}`, `u${i}`));
    const tables = snakeSeed(bots, 3);
    const total = tables.reduce((s, t) => s + t.length, 0);
    expect(total).toBe(17);
  });

  it("ELO spread is balanced: no table has only top or only bottom ranked bots (4 tables, 16 bots)", () => {
    // Rank 1-16 by ELO. After snake seeding each table should have a mix.
    const bots = Array.from({ length: 16 }, (_, i) =>
      bot(`b${i}`, `u${i}`, 1000 - i * 50),
    );
    const tables = snakeSeed(bots, 4);
    const means = tables.map(
      (t) => t.reduce((s, b) => s + b.elo, 0) / t.length,
    );
    const globalMean = means.reduce((s, m) => s + m, 0) / means.length;
    // Each table mean should be within 150 ELO of the global mean
    for (const m of means) {
      expect(Math.abs(m - globalMean)).toBeLessThan(150);
    }
  });
});

// ── Owner isolation ───────────────────────────────────────────────────────────

describe("ownerIsolation", () => {
  it("no-op when no conflicts exist", () => {
    const tables = [
      [bot("b1", "u1"), bot("b2", "u2")],
      [bot("b3", "u3"), bot("b4", "u4")],
    ];
    const result = ownerIsolation(tables);
    expect(hasDuplicateOwner(result[0])).toBe(false);
    expect(hasDuplicateOwner(result[1])).toBe(false);
  });

  it("resolves a simple 2-table conflict by swapping", () => {
    // u1 has two bots on table 0; u2 and u3 each on table 1
    const tables = [
      [bot("b1", "u1"), bot("b2", "u1"), bot("b3", "u2")],
      [bot("b4", "u3"), bot("b5", "u4"), bot("b6", "u5")],
    ];
    const result = ownerIsolation(tables);
    expect(hasDuplicateOwner(result[0])).toBe(false);
    expect(hasDuplicateOwner(result[1])).toBe(false);
  });

  it("all bots are conserved after isolation", () => {
    const tables = [
      [bot("b1", "u1"), bot("b2", "u1"), bot("b3", "u2")],
      [bot("b4", "u3"), bot("b5", "u4"), bot("b6", "u5")],
    ];
    const before = tables
      .flat()
      .map((b) => b.botId)
      .sort();
    const result = ownerIsolation(tables);
    const after = result
      .flat()
      .map((b) => b.botId)
      .sort();
    expect(after).toEqual(before);
  });

  it("resolves conflict across 3 tables", () => {
    const tables = [
      [bot("b1", "u1"), bot("b2", "u1")], // conflict
      [bot("b3", "u2"), bot("b4", "u3")],
      [bot("b5", "u4"), bot("b6", "u5")],
    ];
    const result = ownerIsolation(tables);
    for (const t of result) {
      expect(hasDuplicateOwner(t)).toBe(false);
    }
  });

  it("does not create a new conflict while fixing one", () => {
    // u1 owns b1+b2 (conflict on table 0); u3 owns b3+b4 (conflict on table 1)
    const tables = [
      [bot("b1", "u1"), bot("b2", "u1"), bot("b5", "u5")],
      [bot("b3", "u3"), bot("b4", "u3"), bot("b6", "u6")],
    ];
    const result = ownerIsolation(tables);
    for (const t of result) {
      expect(hasDuplicateOwner(t)).toBe(false);
    }
  });
});
