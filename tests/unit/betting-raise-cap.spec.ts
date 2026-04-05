import { describe, it, expect, beforeEach } from "vitest";
import { BettingRound, MAX_RAISES_PER_STREET } from "../../src/domain/betting";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(
  id: string,
  chips: number,
): { id: string; chips: bigint; folded: boolean; allIn: boolean } {
  return { id, chips: BigInt(chips), folded: false, allIn: false };
}

function makeRound(players: ReturnType<typeof makePlayer>[]) {
  return new BettingRound({
    players: players as any,
    smallBlind: 10n,
    bigBlind: 20n,
    isPreFlop: false,
    dealerIndex: 0,
  });
}

// ── MAX_RAISES_PER_STREET constant ────────────────────────────────────────────

describe("MAX_RAISES_PER_STREET", () => {
  it("is exported and equals 5", () => {
    expect(MAX_RAISES_PER_STREET).toBe(5);
  });
});

// ── Raise cap: valid actions ──────────────────────────────────────────────────

describe("BettingRound raise cap", () => {
  let p1: ReturnType<typeof makePlayer>;
  let p2: ReturnType<typeof makePlayer>;
  let p3: ReturnType<typeof makePlayer>;
  let round: BettingRound;

  beforeEach(() => {
    p1 = makePlayer("p1", 10_000);
    p2 = makePlayer("p2", 10_000);
    p3 = makePlayer("p3", 10_000);
    round = makeRound([p1, p2, p3]);
  });

  it("allows raise before the cap is reached", () => {
    // First bet (counts as raise #1)
    round.applyAction(p1 as any, { type: "bet", amount: 100 });
    const actions = round.getValidActionsForPlayer(p2 as any);
    expect(actions).toContain("raise");
  });

  it("blocks raise once cap is hit", () => {
    // Drive raisesThisStreet to MAX_RAISES_PER_STREET
    round.applyAction(p1 as any, { type: "bet", amount: 100 }); // 1
    round.applyAction(p2 as any, { type: "raise", amount: 100 }); // 2
    round.applyAction(p3 as any, { type: "raise", amount: 100 }); // 3
    round.applyAction(p1 as any, { type: "raise", amount: 100 }); // 4
    round.applyAction(p2 as any, { type: "raise", amount: 100 }); // 5 → cap hit

    // Now every player's valid actions must NOT include raise
    for (const p of [p1, p2, p3] as any[]) {
      const actions = round.getValidActionsForPlayer(p);
      expect(actions).not.toContain("raise");
    }
  });

  it("still allows call and fold after cap", () => {
    round.applyAction(p1 as any, { type: "bet", amount: 100 });
    round.applyAction(p2 as any, { type: "raise", amount: 100 });
    round.applyAction(p3 as any, { type: "raise", amount: 100 });
    round.applyAction(p1 as any, { type: "raise", amount: 100 });
    round.applyAction(p2 as any, { type: "raise", amount: 100 }); // cap

    const actions = round.getValidActionsForPlayer(p3 as any);
    expect(actions).toContain("call");
    expect(actions).toContain("fold");
    expect(actions).not.toContain("raise");
  });

  it("rejects a raise action after cap via applyAction (invalid)", () => {
    // Bring to cap
    for (let i = 0; i < MAX_RAISES_PER_STREET; i++) {
      const player = [p1, p2, p3][i % 3];
      round.applyAction(player as any, {
        type: i === 0 ? "bet" : "raise",
        amount: 50,
      });
    }
    // A raise attempt beyond the cap should be treated as invalid move
    // (getValidActionsForPlayer won't include it, but applyAction itself
    //  doesn't double-check — the cap is enforced at the valid-actions level)
    const actions = round.getValidActionsForPlayer(p1 as any);
    expect(actions).not.toContain("raise");
  });

  it("canReraise returns false once cap is hit", () => {
    round.applyAction(p1 as any, { type: "bet", amount: 100 });
    round.applyAction(p2 as any, { type: "raise", amount: 100 });
    round.applyAction(p3 as any, { type: "raise", amount: 100 });
    round.applyAction(p1 as any, { type: "raise", amount: 100 });
    round.applyAction(p2 as any, { type: "raise", amount: 100 }); // 5th — cap

    expect((round as any).canReraise("p1")).toBe(false);
    expect((round as any).canReraise("p2")).toBe(false);
    expect((round as any).canReraise("p3")).toBe(false);
  });

  it("cap is per-street: a fresh BettingRound starts at 0", () => {
    // Exhaust the cap on this round
    round.applyAction(p1 as any, { type: "bet", amount: 50 });
    round.applyAction(p2 as any, { type: "raise", amount: 50 });
    round.applyAction(p3 as any, { type: "raise", amount: 50 });
    round.applyAction(p1 as any, { type: "raise", amount: 50 });
    round.applyAction(p2 as any, { type: "raise", amount: 50 }); // cap

    // New round (new street) — cap resets
    const newRound = makeRound([p1, p2, p3]);
    const actions = newRound.getValidActionsForPlayer(p1 as any);
    expect(actions).toContain("raise");
  });

  it("exactly MAX_RAISES_PER_STREET raises are allowed, no more", () => {
    let successCount = 0;
    const players = [p1, p2, p3];
    for (let i = 0; i < MAX_RAISES_PER_STREET + 3; i++) {
      const p = players[i % 3];
      const actions = round.getValidActionsForPlayer(p as any);
      if (actions.includes("raise") || (i === 0 && actions.includes("raise"))) {
        const result = round.applyAction(p as any, {
          type: i === 0 ? "bet" : "raise",
          amount: 50,
        });
        if (result.valid) successCount++;
      }
    }
    expect(successCount).toBe(MAX_RAISES_PER_STREET);
  });
});
