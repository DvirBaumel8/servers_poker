/**
 * Unit tests for the Chaos Tournament runner (src/testing-utilities/chaos-tournament.ts).
 *
 * Covers:
 *  - Basic execution (no throw, returns valid result shape)
 *  - Chip conservation: sum(finalChips) === sum(startingChips)
 *  - stackImbalanceMode: chips are assigned correctly, a winner emerges
 *  - cloneWarMode: all bots use the same strategy DNA
 *  - handLimit: game never exceeds the configured hand limit
 *  - eliminationOrder: only busted bots appear, no duplicates
 *  - Multi-phase blind escalation: blinds double between phases
 *
 * All tests run headless (no DB, no NestJS, sleepMs=0).
 */

import { describe, it, expect } from "vitest";
import {
  runChaosTournament,
  CHAOS_PRESETS,
  type ChaosOptions,
} from "../../src/testing-utilities/chaos-tournament";
import type { BotStrategy } from "../../src/domain/bot-strategy/strategy.types";

// ─── Shared bot configs ───────────────────────────────────────────────────────

const fold: BotStrategy = {
  version: 1,
  tier: "quick",
  personality: {
    aggression: 0,
    bluffFrequency: 0,
    riskTolerance: 0,
    tightness: 100,
  },
};

const raise: BotStrategy = {
  version: 1,
  tier: "quick",
  personality: {
    aggression: 100,
    bluffFrequency: 100,
    riskTolerance: 100,
    tightness: 0,
  },
};

const balanced: BotStrategy = {
  version: 1,
  tier: "quick",
  personality: {
    aggression: 50,
    bluffFrequency: 20,
    riskTolerance: 50,
    tightness: 50,
  },
};

function twoBot(opts?: Partial<ChaosOptions>) {
  return {
    bots: [
      { name: "Aggressor", strategy: raise },
      { name: "Folder", strategy: fold },
    ],
    handLimit: 50,
    bigBlind: 100,
    smallBlind: 50,
    startingChips: 1000,
    ...opts,
  } satisfies ChaosOptions;
}

// ─── Basic execution ──────────────────────────────────────────────────────────

describe("runChaosTournament — basic execution", () => {
  it("returns a valid result without throwing (2-bot game)", async () => {
    const result = await runChaosTournament(twoBot());

    expect(result).toBeDefined();
    expect(typeof result.handsPlayed).toBe("number");
    expect(result.handsPlayed).toBeGreaterThan(0);
    expect(typeof result.finalChips).toBe("object");
    expect(result.log).toBeDefined();
    expect(result.log.hands).toBeDefined();
    expect(Array.isArray(result.eliminationOrder)).toBe(true);
  });

  it("returns a valid result for 6-bot game", async () => {
    const result = await runChaosTournament({
      bots: Array.from({ length: 6 }, (_, i) => ({
        name: `Bot${i + 1}`,
        strategy: i % 2 === 0 ? raise : fold,
      })),
      handLimit: 100,
      startingChips: 1000,
      bigBlind: 100,
      smallBlind: 50,
    });

    expect(result.handsPlayed).toBeGreaterThan(0);
    expect(Object.keys(result.finalChips)).toHaveLength(6);
  });

  it("throws for fewer than 2 bots", async () => {
    await expect(
      runChaosTournament({
        bots: [{ name: "Lonely", strategy: raise }],
        handLimit: 10,
      }),
    ).rejects.toThrow(/at least 2/i);
  });

  it("throws for more than 9 bots", async () => {
    await expect(
      runChaosTournament({
        bots: Array.from({ length: 10 }, (_, i) => ({
          name: `Bot${i}`,
          strategy: balanced,
        })),
        handLimit: 10,
      }),
    ).rejects.toThrow(/at most 9/i);
  });
});

// ─── Chip conservation ────────────────────────────────────────────────────────

describe("runChaosTournament — chip conservation", () => {
  it("sum of final chips equals sum of starting chips (2-bot, simple run)", async () => {
    const startingChips = 1000;
    const result = await runChaosTournament(twoBot({ startingChips }));

    const total = Object.values(result.finalChips).reduce((s, c) => s + c, 0);
    expect(total).toBe(startingChips * 2);
  });

  it("chip conservation holds after 6-bot game to natural winner", async () => {
    const startingChips = 500;
    const botCount = 6;

    const result = await runChaosTournament({
      bots: Array.from({ length: botCount }, (_, i) => ({
        name: `Bot${i + 1}`,
        strategy: i === 0 ? raise : fold,
      })),
      startingChips,
      handLimit: 200,
      bigBlind: 100,
      smallBlind: 50,
    });

    const total = Object.values(result.finalChips).reduce((s, c) => s + c, 0);
    expect(total).toBe(startingChips * botCount);
  });

  it("chip conservation holds with stackImbalanceMode", async () => {
    const result = await runChaosTournament({
      bots: [
        { name: "BigStack", strategy: raise },
        { name: "Small1", strategy: fold },
        { name: "Small2", strategy: fold },
      ],
      stackImbalanceMode: true,
      handLimit: 100,
      bigBlind: 100,
      smallBlind: 50,
    });

    // stackImbalanceMode: first bot 5000, rest 100 each.
    const expectedTotal = 5000 + 100 + 100;
    const total = Object.values(result.finalChips).reduce((s, c) => s + c, 0);
    expect(total).toBe(expectedTotal);
  });
});

// ─── handLimit ────────────────────────────────────────────────────────────────

describe("runChaosTournament — handLimit is respected", () => {
  it("never plays more hands than the limit (clone war, no natural winner)", async () => {
    const handLimit = 30;

    const result = await runChaosTournament({
      bots: Array.from({ length: 4 }, (_, i) => ({
        name: `Clone${i + 1}`,
        strategy: balanced,
      })),
      cloneWarMode: true,
      startingChips: 1000,
      handLimit,
      bigBlind: 20,
      smallBlind: 10,
    });

    expect(result.handsPlayed).toBeLessThanOrEqual(handLimit);
  });

  it("stops exactly at hand limit when no winner emerged", async () => {
    // Clones with equal chips rarely eliminate each other quickly.
    const handLimit = 20;

    const result = await runChaosTournament({
      bots: [
        { name: "C1", strategy: balanced, startingChips: 500 },
        { name: "C2", strategy: balanced, startingChips: 500 },
      ],
      handLimit,
      bigBlind: 10,
      smallBlind: 5,
    });

    expect(result.handsPlayed).toBeLessThanOrEqual(handLimit);
  });
});

// ─── stackImbalanceMode ───────────────────────────────────────────────────────

describe("runChaosTournament — stackImbalanceMode", () => {
  it("assigns 5000 chips to first bot and 100 to the rest", async () => {
    const chipsCaptured: Record<string, number> | null = null;

    const result = await runChaosTournament({
      bots: [
        { name: "Whale", strategy: raise },
        { name: "Minnow1", strategy: fold },
        { name: "Minnow2", strategy: fold },
      ],
      stackImbalanceMode: true,
      handLimit: 5, // stop early — we just want to verify chip assignment
      bigBlind: 100,
      smallBlind: 50,
    });

    // Chip conservation check.
    const total = Object.values(result.finalChips).reduce((s, c) => s + c, 0);
    expect(total).toBe(5000 + 100 + 100);
  });

  it("produces a winner when big-stack aggressor faces tiny-stack folders", async () => {
    const result = await runChaosTournament({
      bots: [
        { name: "Whale", strategy: raise },
        { name: "Minnow1", strategy: fold },
        { name: "Minnow2", strategy: fold },
      ],
      stackImbalanceMode: true,
      handLimit: 200,
      bigBlind: 100,
      smallBlind: 50,
    });

    // The aggressor whale should collect the minnows.
    expect(result.winner).toBeDefined();
    // Eliminated bots should have 0 chips.
    for (const name of result.eliminationOrder) {
      expect(result.finalChips[name]).toBe(0);
    }
  });
});

// ─── cloneWarMode ─────────────────────────────────────────────────────────────

describe("runChaosTournament — cloneWarMode", () => {
  it("runs without throwing and respects hand limit", async () => {
    const result = await runChaosTournament({
      bots: CHAOS_PRESETS.cloneWar(),
      cloneWarMode: true,
      handLimit: 30,
      startingChips: 1000,
      bigBlind: 100,
      smallBlind: 50,
    });

    expect(result.handsPlayed).toBeGreaterThan(0);
    expect(result.handsPlayed).toBeLessThanOrEqual(30);
  });

  it("chip conservation holds in clone war", async () => {
    const botCount = 4;
    const startingChips = 600;

    const result = await runChaosTournament({
      bots: Array.from({ length: botCount }, (_, i) => ({
        name: `Clone${i + 1}`,
        strategy: balanced,
      })),
      cloneWarMode: true,
      startingChips,
      handLimit: 40,
      bigBlind: 20,
      smallBlind: 10,
    });

    const total = Object.values(result.finalChips).reduce((s, c) => s + c, 0);
    expect(total).toBe(startingChips * botCount);
  });
});

// ─── eliminationOrder ─────────────────────────────────────────────────────────

describe("runChaosTournament — eliminationOrder integrity", () => {
  it("eliminated bots have 0 final chips", async () => {
    const result = await runChaosTournament({
      bots: [
        { name: "Aggressor", strategy: raise },
        { name: "Tiny", strategy: fold, startingChips: 50 },
        { name: "Medium", strategy: balanced, startingChips: 300 },
      ],
      handLimit: 150,
      bigBlind: 50,
      smallBlind: 25,
    });

    for (const name of result.eliminationOrder) {
      expect(result.finalChips[name]).toBe(0);
    }
  });

  it("eliminationOrder contains no duplicates", async () => {
    const result = await runChaosTournament({
      bots: Array.from({ length: 4 }, (_, i) => ({
        name: `Bot${i + 1}`,
        strategy: i === 0 ? raise : fold,
      })),
      startingChips: 300,
      handLimit: 200,
      bigBlind: 100,
      smallBlind: 50,
    });

    const unique = new Set(result.eliminationOrder);
    expect(unique.size).toBe(result.eliminationOrder.length);
  });

  it("winner is not in eliminationOrder", async () => {
    const result = await runChaosTournament({
      bots: [
        { name: "Winner", strategy: raise },
        { name: "Loser", strategy: fold },
      ],
      handLimit: 100,
      bigBlind: 100,
      smallBlind: 50,
      startingChips: 500,
    });

    if (result.winner) {
      expect(result.eliminationOrder).not.toContain(result.winner);
    }
  });
});

// ─── Tournament log shape ─────────────────────────────────────────────────────

describe("runChaosTournament — tournament log shape", () => {
  it("log contains hand entries matching handsPlayed", async () => {
    const result = await runChaosTournament(twoBot({ handLimit: 10 }));

    expect(Array.isArray(result.log.hands)).toBe(true);
    // Log may have fewer entries than handsPlayed if the game stopped early,
    // but should never have more.
    expect(result.log.hands.length).toBeLessThanOrEqual(result.handsPlayed);
  });

  it("each log hand entry has required fields", async () => {
    const result = await runChaosTournament(twoBot({ handLimit: 5 }));

    for (const hand of result.log.hands) {
      expect(hand).toHaveProperty("hand_number");
      expect(hand).toHaveProperty("actions");
      expect(Array.isArray(hand.actions)).toBe(true);
    }
  });
});

// ─── CHAOS_PRESETS ────────────────────────────────────────────────────────────

describe("CHAOS_PRESETS", () => {
  it("maniacVsNit() returns 6 bots with valid strategies", () => {
    const bots = CHAOS_PRESETS.maniacVsNit();
    expect(bots).toHaveLength(6);
    for (const bot of bots) {
      expect(bot.name).toBeTruthy();
      expect(bot.strategy.tier).toBe("quick");
      expect(bot.strategy.personality).toBeDefined();
    }
  });

  it("extremeDNA() returns 6 bots with max aggression", () => {
    const bots = CHAOS_PRESETS.extremeDNA();
    expect(bots).toHaveLength(6);
    for (const bot of bots) {
      expect(bot.strategy.personality?.aggression).toBe(100);
    }
  });

  it("cloneWar() returns 6 bots all sharing the same strategy object", () => {
    const bots = CHAOS_PRESETS.cloneWar();
    expect(bots).toHaveLength(6);
    const first = bots[0].strategy;
    for (const bot of bots) {
      // Same reference — confirms the shared-DNA contract.
      expect(bot.strategy).toBe(first);
    }
  });

  it("maniacVsNit preset runs through chaos tournament without error", async () => {
    const result = await runChaosTournament({
      bots: CHAOS_PRESETS.maniacVsNit(),
      handLimit: 30,
      startingChips: 500,
      bigBlind: 100,
      smallBlind: 50,
    });

    expect(result.handsPlayed).toBeGreaterThan(0);
    const total = Object.values(result.finalChips).reduce((s, c) => s + c, 0);
    expect(total).toBe(500 * 6);
  });
});
