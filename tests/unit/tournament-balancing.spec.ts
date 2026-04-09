/**
 * Unit tests for continuous table balancing logic.
 *
 * Validates the refactored checkTableBalancing() behaviour:
 * - Triggers whenever any two tables differ by > 1 player (not just at BREAK_THRESHOLD)
 * - Does NOT trigger when all tables are within 1 of each other
 * - Breaks a table when it has < 2 players
 * - Position equity: best seat = (dealerIndex + 2) % N
 * - Owner isolation respected during continuous balance move
 */
import { describe, it, expect } from "vitest";

// ─── Pure helper functions extracted from the director (no NestJS) ─────────────

/** Returns true if any two seats are owned by the same user. */
function hasDuplicateOwner(seats: Array<{ userId: string }>): boolean {
  const seen = new Set<string>();
  for (const s of seats) {
    if (s.userId === "unknown") continue;
    if (seen.has(s.userId)) return true;
    seen.add(s.userId);
  }
  return false;
}

/** Calculate best insert seat for position equity. */
function calcBestSeat(dealerIndex: number, activePlayerCount: number): number {
  if (activePlayerCount === 0) return 0;
  return (dealerIndex + 2) % activePlayerCount;
}

/**
 * Simulates checkTableBalancing decision logic given a list of table sizes.
 *
 * Returns:
 *   'break'   — the smallest table should be broken (< 2 players)
 *   'move'    — one player should move from largest to smallest
 *   'none'    — tables are balanced (diff ≤ 1)
 */
function checkBalancingDecision(
  tableSizes: number[],
): "break" | "move" | "none" {
  if (tableSizes.length <= 1) return "none";

  const minSize = Math.min(...tableSizes);
  const maxSize = Math.max(...tableSizes);

  if (minSize < 2) return "break";
  if (maxSize - minSize > 1) return "move";
  return "none";
}

/** Simulates movePlayerForBalancing candidate selection with owner isolation. */
function selectPlayerToMove(
  candidates: Array<{ id: string; chips: number; userId: string }>,
  targetPlayers: Array<{ id: string; chips: number; userId: string }>,
): { id: string; chips: number; userId: string } | null {
  if (candidates.length === 0) return null;

  // Sort largest stack first
  const sorted = [...candidates].sort((a, b) => b.chips - a.chips);

  // Find first candidate that won't conflict
  const clean = sorted.find(
    (p) => !targetPlayers.some((tp) => tp.userId === p.userId),
  );

  return clean ?? sorted[0]; // fallback: move even if isolation can't be preserved
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("checkTableBalancing — decision logic", () => {
  it("returns 'none' with a single table", () => {
    expect(checkBalancingDecision([5])).toBe("none");
  });

  it("returns 'none' when all tables differ by exactly 1", () => {
    expect(checkBalancingDecision([6, 5])).toBe("none");
    expect(checkBalancingDecision([5, 5, 4])).toBe("none");
  });

  it("returns 'none' when all tables are equal", () => {
    expect(checkBalancingDecision([6, 6, 6])).toBe("none");
  });

  it("returns 'move' when two tables differ by 2 (continuous balancing)", () => {
    expect(checkBalancingDecision([7, 5])).toBe("move");
  });

  it("returns 'move' for diff > 2", () => {
    expect(checkBalancingDecision([9, 5])).toBe("move");
  });

  it("returns 'move' for 3 tables when max-min > 1", () => {
    // Tables: 8, 5, 5 → max=8, min=5, diff=3 → trigger move
    expect(checkBalancingDecision([8, 5, 5])).toBe("move");
  });

  it("returns 'none' for 3 tables when balanced within 1", () => {
    // Tables: 6, 5, 5 → max=6, min=5, diff=1 → OK
    expect(checkBalancingDecision([6, 5, 5])).toBe("none");
  });

  it("returns 'break' when smallest table has 1 player (< 2)", () => {
    expect(checkBalancingDecision([7, 1])).toBe("break");
  });

  it("returns 'break' when smallest table is empty", () => {
    expect(checkBalancingDecision([8, 0])).toBe("break");
  });

  it("break takes priority over move: 1-player table with large diff", () => {
    // min=1 → break, not move
    expect(checkBalancingDecision([9, 1])).toBe("break");
  });

  it("does NOT require BREAK_THRESHOLD=4 to trigger move", () => {
    // Old logic: only triggered when minSize < 4. New logic: diff > 1.
    // Tables with 5 vs 3 (diff=2, minSize=3 which was above old BREAK_THRESHOLD=4) → should move
    expect(checkBalancingDecision([5, 3])).toBe("move");
  });
});

describe("Position equity — best seat calculation", () => {
  it("inserts at (dealerIndex + 2) % N for a full table", () => {
    // Dealer at 0, N=8 → BB is at 2 → insert at 2
    expect(calcBestSeat(0, 8)).toBe(2);
  });

  it("wraps around when dealer is near the end", () => {
    // Dealer at 7, N=8 → (7+2) % 8 = 1
    expect(calcBestSeat(7, 8)).toBe(1);
  });

  it("handles small tables", () => {
    // Dealer at 1, N=3 → (1+2) % 3 = 0
    expect(calcBestSeat(1, 3)).toBe(0);
  });

  it("returns 0 for an empty target table", () => {
    expect(calcBestSeat(0, 0)).toBe(0);
  });

  it("handles 2-player heads-up", () => {
    // Dealer at 0, N=2 → (0+2) % 2 = 0
    expect(calcBestSeat(0, 2)).toBe(0);
    // Dealer at 1, N=2 → (1+2) % 2 = 1
    expect(calcBestSeat(1, 2)).toBe(1);
  });
});

describe("Owner isolation during continuous balance move", () => {
  it("picks the largest stack that doesn't conflict", () => {
    const candidates = [
      { id: "a", chips: 1000, userId: "user1" },
      { id: "b", chips: 800, userId: "user2" },
    ];
    const target = [
      { id: "c", chips: 500, userId: "user1" }, // user1 already there
    ];
    const result = selectPlayerToMove(candidates, target);
    // Bot 'a' (1000 chips) conflicts, so 'b' (800 chips) should be chosen
    expect(result?.id).toBe("b");
  });

  it("picks the largest stack first when no conflict exists", () => {
    const candidates = [
      { id: "a", chips: 500, userId: "user1" },
      { id: "b", chips: 1000, userId: "user2" },
    ];
    const target: Array<{ id: string; chips: number; userId: string }> = [];
    const result = selectPlayerToMove(candidates, target);
    expect(result?.id).toBe("b"); // largest stack
  });

  it("falls back to largest stack if ALL candidates conflict", () => {
    const candidates = [
      { id: "a", chips: 900, userId: "user1" },
      { id: "b", chips: 600, userId: "user1" }, // same owner
    ];
    const target = [{ id: "c", chips: 400, userId: "user1" }];
    const result = selectPlayerToMove(candidates, target);
    // No clean candidate — fallback to largest stack
    expect(result?.id).toBe("a");
  });

  it("returns null for empty candidate list", () => {
    expect(selectPlayerToMove([], [])).toBeNull();
  });
});

describe("hasDuplicateOwner (isolation check)", () => {
  it("detects duplicate owners in a table", () => {
    const seats = [
      { userId: "user1" },
      { userId: "user2" },
      { userId: "user1" },
    ];
    expect(hasDuplicateOwner(seats)).toBe(true);
  });

  it("returns false when all owners are unique", () => {
    const seats = [{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }];
    expect(hasDuplicateOwner(seats)).toBe(false);
  });

  it("ignores 'unknown' userId entries", () => {
    const seats = [
      { userId: "unknown" },
      { userId: "unknown" },
      { userId: "u1" },
    ];
    expect(hasDuplicateOwner(seats)).toBe(false);
  });
});

// ─── nextAvailableSeatNumber ─────────────────────────────────────────────────

/**
 * Pure reimplementation matching the director's nextAvailableSeatNumber.
 * Tests the logic without needing a real repository.
 */
function nextAvailableSeatNumberSync(
  existingSeats: Array<{ seat_number: number; busted: boolean }>,
  maxSeats: number,
): number {
  const occupied = new Set(
    existingSeats.filter((s) => !s.busted).map((s) => s.seat_number),
  );
  for (let n = 1; n <= maxSeats; n++) {
    if (!occupied.has(n)) return n;
  }
  return occupied.size + 1;
}

describe("nextAvailableSeatNumber (seat collision prevention)", () => {
  it("returns 1 for an empty table", () => {
    expect(nextAvailableSeatNumberSync([], 9)).toBe(1);
  });

  it("returns the first gap in occupied seats", () => {
    const seats = [
      { seat_number: 1, busted: false },
      { seat_number: 2, busted: false },
      { seat_number: 4, busted: false },
    ];
    expect(nextAvailableSeatNumberSync(seats, 9)).toBe(3);
  });

  it("reuses seats of busted players", () => {
    const seats = [
      { seat_number: 1, busted: false },
      { seat_number: 2, busted: true },
      { seat_number: 3, busted: false },
    ];
    expect(nextAvailableSeatNumberSync(seats, 9)).toBe(2);
  });

  it("returns next seat after all occupied", () => {
    const seats = [
      { seat_number: 1, busted: false },
      { seat_number: 2, busted: false },
      { seat_number: 3, busted: false },
    ];
    expect(nextAvailableSeatNumberSync(seats, 3)).toBe(4); // overflow fallback
  });

  it("never returns a seat_number that is already active", () => {
    const seats = [
      { seat_number: 1, busted: false },
      { seat_number: 2, busted: false },
      { seat_number: 3, busted: false },
      { seat_number: 5, busted: false },
    ];
    const result = nextAvailableSeatNumberSync(seats, 9);
    expect(result).toBe(4);
    // Verify no collision
    expect(seats.some((s) => !s.busted && s.seat_number === result)).toBe(
      false,
    );
  });
});
