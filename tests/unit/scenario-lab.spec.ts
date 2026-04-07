import { describe, it, expect } from "vitest";
import * as crypto from "crypto";

// ─── Helpers extracted from bots.service.ts (same logic, tested in isolation) ──

const VALID_CARD_COUNTS = [0, 3, 4, 5];

function isValidCommunityCardCount(n: number): boolean {
  return VALID_CARD_COUNTS.includes(n);
}

function buildDeterministicSeed(dto: {
  holeCards: string[];
  communityCards: string[];
  position: string;
  pot: number;
  toCall: number;
  minRaise: number;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        h: dto.holeCards,
        c: dto.communityCards,
        pos: dto.position,
        pot: dto.pot,
        tc: dto.toCall,
        mr: dto.minRaise,
      }),
    )
    .digest("hex");
}

const VILLAIN_POSITIONS = ["UTG", "UTG+1", "HJ", "CO", "BTN", "SB", "BB"];

function buildMockPlayers(
  numberOfPlayers: number,
  toCall: number,
  oppStack = 1000,
  position = "BTN",
) {
  // Mirrors bots.service.ts: hero is index 0, then opponents.
  // When facing a bet (toCall > 0) only the first opponent is active; all others fold.
  const hero = {
    name: "Hero",
    chips: 1000,
    bet: 0,
    folded: false,
    allIn: false,
    position,
  };
  const villains = Array.from({ length: numberOfPlayers - 1 }, (_, i) => ({
    name: `Villain${i + 1}`,
    chips: oppStack,
    bet: i === 0 ? toCall : 0,
    folded: toCall > 0 && i !== 0,
    allIn: i === 0 && toCall > 0 && toCall >= oppStack,
    position: VILLAIN_POSITIONS[i % VILLAIN_POSITIONS.length],
  }));
  return [hero, ...villains];
}

/** Active opponent count used for equity display — matches strategy engine logic. */
function activeOpponentCount(
  mockPlayers: ReturnType<typeof buildMockPlayers>,
): number {
  // Skip index 0 (hero), count non-folded opponents
  return mockPlayers.slice(1).filter((p) => !p.folded).length;
}

// ─── SPR / stack-depth helpers (same logic as ScenarioLabPage.tsx) ─────────────

function computeSpr(botStack: number, pot: number): number | null {
  return pot > 0 ? botStack / pot : null;
}

function computeMyStackBB(botStack: number, bigBlind: number): number {
  return botStack / bigBlind;
}

function sprBucket(spr: number): "committed" | "low" | "playable" | "deep" {
  if (spr < 2) return "committed";
  if (spr < 5) return "low";
  if (spr < 13) return "playable";
  return "deep";
}

function isShortStack(myStackBB: number): boolean {
  return myStackBB < 15;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Scenario Lab — community card count validation", () => {
  it("accepts 0 cards (preflop)", () => {
    expect(isValidCommunityCardCount(0)).toBe(true);
  });

  it("accepts 3 cards (flop)", () => {
    expect(isValidCommunityCardCount(3)).toBe(true);
  });

  it("accepts 4 cards (turn)", () => {
    expect(isValidCommunityCardCount(4)).toBe(true);
  });

  it("accepts 5 cards (river)", () => {
    expect(isValidCommunityCardCount(5)).toBe(true);
  });

  it("rejects 1 card", () => {
    expect(isValidCommunityCardCount(1)).toBe(false);
  });

  it("rejects 2 cards", () => {
    expect(isValidCommunityCardCount(2)).toBe(false);
  });

  it("rejects 6 cards", () => {
    expect(isValidCommunityCardCount(6)).toBe(false);
  });
});

describe("Scenario Lab — deterministic primary seed", () => {
  const base = {
    holeCards: ["Ks", "Kh"],
    communityCards: [],
    position: "BTN",
    pot: 100,
    toCall: 20,
    minRaise: 40,
  };

  it("produces a 64-char hex seed", () => {
    const seed = buildDeterministicSeed(base);
    expect(seed).toHaveLength(64);
    expect(seed).toMatch(/^[0-9a-f]+$/);
  });

  it("is stable across repeated calls with the same inputs", () => {
    const seed1 = buildDeterministicSeed(base);
    const seed2 = buildDeterministicSeed(base);
    expect(seed1).toBe(seed2);
  });

  it("changes when hole cards change", () => {
    const s1 = buildDeterministicSeed(base);
    const s2 = buildDeterministicSeed({ ...base, holeCards: ["7s", "3h"] });
    expect(s1).not.toBe(s2);
  });

  it("changes when position changes", () => {
    const s1 = buildDeterministicSeed(base);
    const s2 = buildDeterministicSeed({ ...base, position: "UTG" });
    expect(s1).not.toBe(s2);
  });

  it("changes when pot changes", () => {
    const s1 = buildDeterministicSeed(base);
    const s2 = buildDeterministicSeed({ ...base, pot: 200 });
    expect(s1).not.toBe(s2);
  });
});

describe("Scenario Lab — numberOfPlayers mock player building", () => {
  it("creates N players total (hero + N-1 villains)", () => {
    expect(buildMockPlayers(2, 20)).toHaveLength(2); // hero + 1 villain
    expect(buildMockPlayers(6, 20)).toHaveLength(6); // hero + 5 villains
    expect(buildMockPlayers(9, 20)).toHaveLength(9); // hero + 8 villains
  });

  it("first element is hero, rest are villains", () => {
    const players = buildMockPlayers(4, 10);
    expect(players[0].name).toBe("Hero");
    expect(players[1].name).toBe("Villain1");
    expect(players[2].name).toBe("Villain2");
    expect(players[3].name).toBe("Villain3");
  });

  it("when facing a bet: only first villain active, rest folded", () => {
    const players = buildMockPlayers(6, 30); // toCall=30 > 0
    expect(players[0].folded).toBe(false); // hero never folded
    expect(players[1].folded).toBe(false); // bettor
    for (let i = 2; i < players.length; i++) {
      expect(players[i].folded).toBe(true); // inactive seats
    }
  });

  it("when not facing a bet: all players active", () => {
    const players = buildMockPlayers(6, 0); // toCall=0
    expect(players.every((p) => !p.folded)).toBe(true);
  });

  it("uses avgOpponentStack for villain chips", () => {
    const players = buildMockPlayers(3, 10, 750);
    expect(players[1].chips).toBe(750);
    expect(players[2].chips).toBe(750);
  });
});

describe("Scenario Lab — win chance uses active opponent count (regression)", () => {
  // Regression for the bug where displayed win chance was computed with playerCount-1
  // opponents instead of active (non-folded) opponents, causing a large discrepancy
  // between the displayed equity and the equity used for the bot's decision.

  it("facing a bet in a 7-player scenario: active opponents = 1, not 6", () => {
    const players = buildMockPlayers(7, 400); // 7 players, all-in for 400
    const activeCount = activeOpponentCount(players);
    expect(activeCount).toBe(1);
  });

  it("not facing a bet: active opponents = playerCount - 1 (all seats live)", () => {
    const players = buildMockPlayers(7, 0);
    const activeCount = activeOpponentCount(players);
    expect(activeCount).toBe(6);
  });

  it("heads-up facing a bet: active opponents = 1", () => {
    const players = buildMockPlayers(2, 100);
    const activeCount = activeOpponentCount(players);
    expect(activeCount).toBe(1);
  });

  it("hero is never counted in active opponents", () => {
    const players = buildMockPlayers(6, 0);
    // Hero is at index 0; opponent count should be playerCount - 1
    const activeCount = activeOpponentCount(players);
    expect(activeCount).toBe(5);
    expect(players[0].name).toBe("Hero"); // confirm hero is index 0
  });
});

describe("Scenario Lab — SPR calculation", () => {
  it("returns null when pot is 0", () => {
    expect(computeSpr(1000, 0)).toBeNull();
  });

  it("computes stack / pot", () => {
    expect(computeSpr(1000, 100)).toBeCloseTo(10);
    expect(computeSpr(300, 100)).toBeCloseTo(3);
    expect(computeSpr(150, 100)).toBeCloseTo(1.5);
  });

  it("handles fractional results correctly", () => {
    expect(computeSpr(1000, 300)).toBeCloseTo(3.333, 2);
  });
});

describe("Scenario Lab — stack depth in BB", () => {
  it("computes BB-denominated stack depth", () => {
    expect(computeMyStackBB(1000, 10)).toBe(100);
    expect(computeMyStackBB(200, 10)).toBe(20);
    expect(computeMyStackBB(140, 10)).toBe(14);
  });

  it("works with non-standard big blinds", () => {
    expect(computeMyStackBB(500, 25)).toBe(20);
    expect(computeMyStackBB(600, 50)).toBe(12);
  });
});

describe("Scenario Lab — SPR bucket classification", () => {
  it("< 2 is committed", () => {
    expect(sprBucket(1.9)).toBe("committed");
    expect(sprBucket(0.5)).toBe("committed");
  });

  it("2–4.9 is low", () => {
    expect(sprBucket(2)).toBe("low");
    expect(sprBucket(4.9)).toBe("low");
  });

  it("5–12.9 is playable", () => {
    expect(sprBucket(5)).toBe("playable");
    expect(sprBucket(12.9)).toBe("playable");
  });

  it(">= 13 is deep", () => {
    expect(sprBucket(13)).toBe("deep");
    expect(sprBucket(100)).toBe("deep");
  });
});

describe("Scenario Lab — short-stack detection (< 15 BB)", () => {
  it("flags 14 BB as short-stack", () => {
    expect(isShortStack(computeMyStackBB(140, 10))).toBe(true);
  });

  it("flags 10 BB as short-stack", () => {
    expect(isShortStack(computeMyStackBB(100, 10))).toBe(true);
  });

  it("does not flag 15 BB as short-stack", () => {
    expect(isShortStack(computeMyStackBB(150, 10))).toBe(false);
  });

  it("does not flag 100 BB as short-stack", () => {
    expect(isShortStack(computeMyStackBB(1000, 10))).toBe(false);
  });

  it("respects non-standard big blind values", () => {
    // 12.5 BB with BB=20: 250 chips → short
    expect(isShortStack(computeMyStackBB(250, 20))).toBe(true);
    // 20 BB with BB=20: 400 chips → not short
    expect(isShortStack(computeMyStackBB(400, 20))).toBe(false);
  });
});

// ─── Sanity guard: fold-for-free is illegal ────────────────────────────────────
//
// The guard logic extracted from bots.service.ts evaluateScenario:
//   - Per-run: if type === 'fold' && canCheck, coerce to 'check'
//   - Post-loop: pick modal after coercion; fold count must be 0 when canCheck

type ActionBucket = "fold" | "check" | "call" | "raise";

function applyFoldForFreeGuard(
  rawCounts: Record<ActionBucket, number>,
  toCall: number,
): Record<ActionBucket, number> {
  const canCheck = toCall === 0;
  if (!canCheck) return { ...rawCounts };
  // All fold votes → check votes
  return {
    fold: 0,
    check: rawCounts.check + rawCounts.fold,
    call: rawCounts.call,
    raise: rawCounts.raise,
  };
}

function pickModalBucket(counts: Record<ActionBucket, number>): ActionBucket {
  const order: ActionBucket[] = ["raise", "call", "check", "fold"];
  return order.reduce((best, b) => (counts[b] > counts[best] ? b : best));
}

describe("Scenario Lab — fold-for-free sanity guard", () => {
  it("coerces fold counts to check when toCall=0", () => {
    const raw = { fold: 14, check: 4, call: 2, raise: 0 };
    const guarded = applyFoldForFreeGuard(raw, 0);
    expect(guarded.fold).toBe(0);
    expect(guarded.check).toBe(18); // 4 + 14
    expect(guarded.call).toBe(2);
    expect(guarded.raise).toBe(0);
  });

  it("does NOT coerce when toCall > 0 (fold is legal)", () => {
    const raw = { fold: 14, check: 0, call: 4, raise: 2 };
    const guarded = applyFoldForFreeGuard(raw, 20);
    expect(guarded.fold).toBe(14);
    expect(guarded.check).toBe(0);
    expect(guarded.call).toBe(4);
    expect(guarded.raise).toBe(2);
  });

  it("primary action after guard is never fold when canCheck", () => {
    const raw = { fold: 20, check: 0, call: 0, raise: 0 }; // bot wanted to fold 100%
    const guarded = applyFoldForFreeGuard(raw, 0);
    const primary = pickModalBucket(guarded);
    expect(primary).not.toBe("fold");
    expect(primary).toBe("check");
  });

  it("modal is raise when raise leads even after guard", () => {
    const raw = { fold: 5, check: 3, call: 2, raise: 10 };
    const guarded = applyFoldForFreeGuard(raw, 0);
    expect(guarded.fold).toBe(0);
    expect(guarded.check).toBe(8); // 3 + 5
    const primary = pickModalBucket(guarded);
    expect(primary).toBe("raise");
  });

  it("lastAction=check implies toCall must equal 0 (constraint invariant)", () => {
    // This mirrors the frontend constraint enforced by useEffect
    function resolveToCall(lastAction: string, userToCall: number): number {
      return lastAction === "check" ? 0 : userToCall;
    }
    expect(resolveToCall("check", 50)).toBe(0);
    expect(resolveToCall("bet", 50)).toBe(50);
    expect(resolveToCall("raise", 100)).toBe(100);
    expect(resolveToCall("all_in", 0)).toBe(0);
  });
});

describe("Scenario Lab — check-when-facing-bet sanity guard", () => {
  // The symmetric guard: when toCall > 0, 'check' is just as illegal as fold-for-free.
  // Engine must coerce check → call when canCheck is false.

  function applyBothGuards(
    rawCounts: Record<ActionBucket, number>,
    toCall: number,
  ): Record<ActionBucket, number> {
    const canCheck = toCall === 0;
    if (canCheck) {
      // Guard 1: fold → check
      return {
        fold: 0,
        check: rawCounts.check + rawCounts.fold,
        call: rawCounts.call,
        raise: rawCounts.raise,
      };
    } else {
      // Guard 2: check → call
      return {
        fold: rawCounts.fold,
        check: 0,
        call: rawCounts.call + rawCounts.check,
        raise: rawCounts.raise,
      };
    }
  }

  it("coerces check counts to call when toCall > 0", () => {
    const raw = { fold: 0, check: 12, call: 6, raise: 2 };
    const guarded = applyBothGuards(raw, 20);
    expect(guarded.check).toBe(0);
    expect(guarded.call).toBe(18); // 6 + 12
  });

  it("primary action is never check when facing a bet", () => {
    const raw = { fold: 0, check: 20, call: 0, raise: 0 };
    const guarded = applyBothGuards(raw, 20);
    const primary = pickModalBucket(guarded);
    expect(primary).not.toBe("check");
    expect(primary).toBe("call");
  });

  it("does NOT coerce check when toCall=0 (free action)", () => {
    const raw = { fold: 0, check: 15, call: 3, raise: 2 };
    const guarded = applyBothGuards(raw, 0);
    expect(guarded.check).toBe(15); // unchanged (no fold to absorb)
    expect(guarded.call).toBe(3);
  });

  it("guards are mutually exclusive — only one applies per scenario", () => {
    // toCall=0 → only guard 1 (fold→check) applies, guard 2 doesn't touch check
    const withCheck = applyBothGuards(
      { fold: 5, check: 10, call: 3, raise: 2 },
      0,
    );
    expect(withCheck.fold).toBe(0);
    expect(withCheck.check).toBe(15); // 10 + 5 fold
    // toCall=20 → only guard 2 (check→call) applies, guard 1 doesn't touch fold
    const withBet = applyBothGuards(
      { fold: 5, check: 10, call: 3, raise: 2 },
      20,
    );
    expect(withBet.check).toBe(0);
    expect(withBet.call).toBe(13); // 3 + 10 check
    expect(withBet.fold).toBe(5); // fold left intact (legal when facing a bet)
  });
});
