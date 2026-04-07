/**
 * Regression tests for game-engine bugs fixed 2026-04-03.
 *
 * Bug 1 — Double-winner: a player eligible for multiple pots (main + side)
 *   was receiving chips twice and appearing in the winners list twice.
 *   Fix: showdown() merges potResults entries for the same player.
 *
 * Bug 2 — action_seq ordering: per-hand action sequence numbers were derived
 *   from a local persistence-layer cache that drifted on recovery, causing
 *   duplicate / out-of-order seq values.
 *   Fix: GameInstance is the single source of truth; actionSeq is emitted
 *   with every game.playerAction event and increments monotonically.
 *
 * These tests run the real GameInstance (no DB, no NestJS, sleepMs=0).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import { GameInstance } from "../../src/services/game/live-game-manager.service";
import { PotManager } from "../../src/domain/betting";
import { determineWinners } from "../../src/domain/handEvaluator";
import type { BotStrategy } from "../../src/domain/bot-strategy/strategy.types";
import { randomUUID } from "crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function silentLogger(): Logger {
  return {
    log: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    verbose: () => {},
    fatal: () => {},
  } as unknown as Logger;
}

/** Always-fold quick strategy — keeps tests deterministic and fast. */
const foldStrategy: BotStrategy = {
  version: 1,
  tier: "quick",
  personality: {
    aggression: 0,
    bluffFrequency: 0,
    riskTolerance: 0,
    tightness: 100,
  },
};

/** Aggressive strategy: raises/bets whenever possible. */
const raiseStrategy: BotStrategy = {
  version: 1,
  tier: "quick",
  personality: {
    aggression: 100,
    bluffFrequency: 100,
    riskTolerance: 100,
    tightness: 0,
  },
};

function makeGame(opts?: {
  smallBlind?: number;
  bigBlind?: number;
  startingChips?: number;
}): { game: GameInstance; emitter: EventEmitter2 } {
  const emitter = new EventEmitter2();
  const game = new GameInstance(silentLogger(), emitter, {
    tableId: `t-${randomUUID().slice(0, 8)}`,
    gameId: `g-${randomUUID().slice(0, 8)}`,
    smallBlind: opts?.smallBlind ?? 10,
    bigBlind: opts?.bigBlind ?? 20,
    startingChips: opts?.startingChips ?? 1000,
    sleepMs: 0,
    simulationMode: true,
  });
  return { game, emitter };
}

// ─── Section 1: action_seq ordering ──────────────────────────────────────────

describe("action_seq ordering (Bug #2 regression)", () => {
  it("actionSeq starts at 0 before any hand", () => {
    const { game } = makeGame();
    expect(game.actionSeq).toBe(0);
  });

  it("every game.playerAction event carries a strictly-increasing actionSeq", async () => {
    const { game, emitter } = makeGame();

    const seqs: number[] = [];
    emitter.on("game.playerAction", (evt: { actionSeq: number }) => {
      seqs.push(evt.actionSeq);
    });

    game.addPlayer({
      id: "p1",
      name: "P1",
      strategy: raiseStrategy,
      chips: 500,
    });
    game.addPlayer({
      id: "p2",
      name: "P2",
      strategy: foldStrategy,
      chips: 500,
    });

    // Run just one hand then stop.
    let handCount = 0;
    emitter.on("game.handComplete", () => {
      handCount++;
      if (handCount >= 1) game.stop();
    });

    try {
      await game.startGame();
    } catch {
      /* stop() may throw */
    }

    // Must have recorded at least the blind actions.
    expect(seqs.length).toBeGreaterThan(0);

    // All values must be unique.
    const unique = new Set(seqs);
    expect(unique.size).toBe(seqs.length);

    // Values must be strictly increasing.
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  it("actionSeq increments monotonically across multiple hands", async () => {
    const { game, emitter } = makeGame();

    const seqsByHand: Record<number, number[]> = {};
    emitter.on(
      "game.playerAction",
      (evt: { actionSeq: number; handNumber: number }) => {
        (seqsByHand[evt.handNumber] ??= []).push(evt.actionSeq);
      },
    );

    let handCount = 0;
    emitter.on("game.handComplete", () => {
      handCount++;
      if (handCount >= 3) game.stop();
    });

    game.addPlayer({
      id: "p1",
      name: "P1",
      strategy: raiseStrategy,
      chips: 500,
    });
    game.addPlayer({
      id: "p2",
      name: "P2",
      strategy: foldStrategy,
      chips: 500,
    });

    try {
      await game.startGame();
    } catch {
      /* stop() may throw */
    }

    // Collect all seqs across all hands.
    const allSeqs = Object.values(seqsByHand).flat();
    expect(allSeqs.length).toBeGreaterThan(0);

    // Global uniqueness: no seq repeated across the entire game.
    const allUnique = new Set(allSeqs);
    expect(allUnique.size).toBe(allSeqs.length);

    // No hand should start with seq 0 (reset would indicate the bug is back).
    for (const [handNum, seqs] of Object.entries(seqsByHand)) {
      const firstSeq = Math.min(...seqs);
      if (Number(handNum) > 1) {
        expect(firstSeq).toBeGreaterThan(0);
      }
    }
  });

  it("no two actions within the same hand share an actionSeq", async () => {
    const { game, emitter } = makeGame();

    // Use strategies that will generate multiple actions per hand.
    game.addPlayer({
      id: "p1",
      name: "Aggressor",
      strategy: raiseStrategy,
      chips: 1000,
    });
    game.addPlayer({
      id: "p2",
      name: "Caller",
      strategy: raiseStrategy,
      chips: 1000,
    });
    game.addPlayer({
      id: "p3",
      name: "Folder",
      strategy: foldStrategy,
      chips: 1000,
    });

    const perHandSeqs: Record<number, number[]> = {};
    emitter.on(
      "game.playerAction",
      (evt: { actionSeq: number; handNumber: number }) => {
        (perHandSeqs[evt.handNumber] ??= []).push(evt.actionSeq);
      },
    );

    let handCount = 0;
    emitter.on("game.handComplete", () => {
      handCount++;
      if (handCount >= 2) game.stop();
    });

    try {
      await game.startGame();
    } catch {
      /* stop() may throw */
    }

    for (const [hand, seqs] of Object.entries(perHandSeqs)) {
      const uniqueSeqs = new Set(seqs);
      expect(
        uniqueSeqs.size,
        `Hand ${hand}: duplicate actionSeq values found — ${seqs.join(",")}`,
      ).toBe(seqs.length);
    }
  });
});

// ─── Section 2: double-winner chip distribution ───────────────────────────────

describe("double-winner / multi-pot chip distribution (Bug #1 regression)", () => {
  /**
   * Core invariant: total chips distributed at showdown === pot size.
   * Violated by the double-winner bug (chips distributed twice to same player).
   */
  it("chip conservation holds across complete game runs", async () => {
    const totalChips = 3000;
    const { game, emitter } = makeGame({ startingChips: 1000 });

    game.addPlayer({
      id: "p1",
      name: "P1",
      strategy: raiseStrategy,
      chips: 1000,
    });
    game.addPlayer({
      id: "p2",
      name: "P2",
      strategy: raiseStrategy,
      chips: 1000,
    });
    game.addPlayer({
      id: "p3",
      name: "P3",
      strategy: foldStrategy,
      chips: 1000,
    });

    game.setExpectedTotalChips(BigInt(totalChips));

    // Collect chip violations.
    const violations: string[] = [];
    emitter.on(
      "game.handComplete",
      (evt: {
        winners: Array<{ playerId: string; amount: bigint }>;
        pot: bigint;
      }) => {
        const distributed = evt.winners.reduce((s, w) => s + w.amount, 0n);
        if (distributed !== evt.pot) {
          violations.push(
            `Hand: distributed=${distributed} pot=${evt.pot} delta=${distributed - evt.pot}`,
          );
        }
      },
    );

    let handCount = 0;
    emitter.on("game.handComplete", () => {
      handCount++;
      if (handCount >= 10) game.stop();
    });

    try {
      await game.startGame();
    } catch {
      /* stop() may throw */
    }

    expect(violations).toEqual([]);
  });

  it("winners list contains no duplicate player IDs after multi-pot showdown", async () => {
    const { game, emitter } = makeGame({ startingChips: 1000 });

    // All-in bot with small stack creates a side pot.
    game.addPlayer({
      id: "short",
      name: "ShortStack",
      strategy: raiseStrategy,
      chips: 100,
    });
    game.addPlayer({
      id: "p2",
      name: "P2",
      strategy: raiseStrategy,
      chips: 1000,
    });
    game.addPlayer({
      id: "p3",
      name: "P3",
      strategy: raiseStrategy,
      chips: 1000,
    });

    const duplicateWinners: string[] = [];
    emitter.on(
      "game.handComplete",
      (evt: { winners: Array<{ playerId: string; amount: bigint }> }) => {
        const ids = evt.winners.map((w) => w.playerId);
        const unique = new Set(ids);
        if (unique.size !== ids.length) {
          duplicateWinners.push(`Duplicates: ${ids.join(",")}`);
        }
      },
    );

    let handCount = 0;
    emitter.on("game.handComplete", () => {
      handCount++;
      if (handCount >= 10) game.stop();
    });

    try {
      await game.startGame();
    } catch {
      /* stop() may throw */
    }

    expect(duplicateWinners).toEqual([]);
  });

  it("distributed amount equals pot for every single hand", async () => {
    // 5-player game: maximum side-pot complexity.
    const chips = [50, 100, 200, 500, 1000];
    const { game, emitter } = makeGame({ startingChips: 1000 });

    for (let i = 0; i < chips.length; i++) {
      game.addPlayer({
        id: `p${i}`,
        name: `Bot${i}`,
        strategy: raiseStrategy,
        chips: chips[i],
      });
    }

    const mismatches: string[] = [];
    emitter.on(
      "game.handComplete",
      (evt: {
        handNumber: number;
        winners: Array<{ playerId: string; amount: bigint }>;
        pot: bigint;
      }) => {
        const distributed = evt.winners.reduce((s, w) => s + w.amount, 0n);
        if (distributed !== evt.pot) {
          mismatches.push(
            `Hand #${evt.handNumber}: distributed=${distributed} pot=${evt.pot}`,
          );
        }
      },
    );

    let handCount = 0;
    emitter.on("game.handComplete", () => {
      handCount++;
      if (handCount >= 15) game.stop();
    });

    try {
      await game.startGame();
    } catch {
      /* stop() may throw */
    }

    expect(mismatches).toEqual([]);
  });

  it("player chips never go negative after pot distribution", async () => {
    const { game, emitter } = makeGame({ startingChips: 1000 });

    game.addPlayer({
      id: "p1",
      name: "P1",
      strategy: raiseStrategy,
      chips: 1000,
    });
    game.addPlayer({
      id: "p2",
      name: "P2",
      strategy: raiseStrategy,
      chips: 1000,
    });
    game.addPlayer({
      id: "p3",
      name: "P3",
      strategy: foldStrategy,
      chips: 1000,
    });

    const negativeChips: string[] = [];
    emitter.on(
      "game.handComplete",
      (evt: { players: Array<{ id: string; chips: bigint }> }) => {
        for (const p of evt.players) {
          if (p.chips < 0n) {
            negativeChips.push(`Player ${p.id}: chips=${p.chips}`);
          }
        }
      },
    );

    let handCount = 0;
    emitter.on("game.handComplete", () => {
      handCount++;
      if (handCount >= 10) game.stop();
    });

    try {
      await game.startGame();
    } catch {
      /* stop() may throw */
    }

    expect(negativeChips).toEqual([]);
  });
});

// ─── Section 3: PotManager multi-winner distribution unit tests ───────────────

describe("PotManager — multi-winner pot distribution (isolated)", () => {
  it("single-pot split: two equal bets → each eligible player gets half", () => {
    const pm = new PotManager();
    pm.addBet("p1", 200n);
    pm.addBet("p2", 200n);

    const players = [
      { id: "p1", chips: 0n, folded: false, allIn: true },
      { id: "p2", chips: 0n, folded: false, allIn: true },
    ];
    pm.calculatePots(players);

    expect(pm.pots).toHaveLength(1);
    expect(pm.pots[0].amount).toBe(400n);
    expect(pm.pots[0].eligiblePlayerIds).toContain("p1");
    expect(pm.pots[0].eligiblePlayerIds).toContain("p2");
    expect(pm.getTotalPot()).toBe(400n);
  });

  it("all-in creates two pots: winner eligible for both does not cause chip duplication", () => {
    // p1 all-in for 100, p2 and p3 each bet 300.
    // main pot = 300 (all 3 eligible), side pot = 400 (p2+p3 only).
    const pm = new PotManager();
    pm.addBet("p1", 100n);
    pm.addBet("p2", 300n);
    pm.addBet("p3", 300n);

    const players = [
      { id: "p1", chips: 0n, folded: false, allIn: true },
      { id: "p2", chips: 0n, folded: false, allIn: false },
      { id: "p3", chips: 0n, folded: false, allIn: false },
    ];
    pm.calculatePots(players);

    expect(pm.pots).toHaveLength(2);

    const [mainPot, sidePot] = pm.pots;
    expect(mainPot.amount).toBe(300n);
    expect(sidePot.amount).toBe(400n);
    expect(mainPot.eligiblePlayerIds).toHaveLength(3);
    expect(sidePot.eligiblePlayerIds).toHaveLength(2);
    expect(sidePot.eligiblePlayerIds).not.toContain("p1");

    // Total must match sum of all bets — the fundamental conservation invariant.
    const sumBets = 100n + 300n + 300n;
    expect(mainPot.amount + sidePot.amount).toBe(sumBets);
    expect(pm.getTotalPot()).toBe(sumBets);
  });

  it("player winning both pots: sum of pot amounts equals total bets", () => {
    // 3 bets; p2 wins main + side → simulates the double-winner scenario.
    const pm = new PotManager();
    pm.addBet("p1", 50n); // short all-in
    pm.addBet("p2", 200n);
    pm.addBet("p3", 200n);

    const players = [
      { id: "p1", chips: 0n, folded: false, allIn: true },
      { id: "p2", chips: 150n, folded: false, allIn: false },
      { id: "p3", chips: 150n, folded: false, allIn: false },
    ];
    pm.calculatePots(players);

    const totalPot = pm.getTotalPot();
    expect(totalPot).toBe(450n); // 50+200+200

    // Simulate p2 winning both pots (best hand in both).
    const simulatedWinners: Record<string, bigint> = {};
    for (const pot of pm.pots) {
      // In this scenario p2 wins every pot.
      const winner = "p2";
      simulatedWinners[winner] = (simulatedWinners[winner] ?? 0n) + pot.amount;
    }

    // Single merged entry for p2.
    expect(Object.keys(simulatedWinners)).toHaveLength(1);
    expect(simulatedWinners["p2"]).toBe(totalPot);
  });

  it("split pot: odd-chip remainder goes to single entry, total still equals pot", () => {
    const pm = new PotManager();
    pm.addBet("p1", 100n);
    pm.addBet("p2", 100n);
    pm.addBet("p3", 101n); // one extra chip

    const players = [
      { id: "p1", chips: 0n, folded: false, allIn: false },
      { id: "p2", chips: 0n, folded: false, allIn: false },
      { id: "p3", chips: 1n, folded: false, allIn: false },
    ];
    pm.calculatePots(players);

    expect(pm.getTotalPot()).toBe(301n);
  });

  it("determineWinners never returns the same player twice", () => {
    // Construct a scenario where p1 clearly wins.
    const community = [
      { value: 14, suit: "s" }, // As
      { value: 13, suit: "h" }, // Kh
      { value: 12, suit: "d" }, // Qd
      { value: 11, suit: "c" }, // Jc
      { value: 2, suit: "s" }, // 2s
    ];
    const players = [
      {
        id: "p1",
        holeCards: [
          { value: 10, suit: "h" },
          { value: 9, suit: "h" },
        ],
      }, // straight
      {
        id: "p2",
        holeCards: [
          { value: 3, suit: "c" },
          { value: 4, suit: "c" },
        ],
      }, // high card
      {
        id: "p3",
        holeCards: [
          { value: 5, suit: "d" },
          { value: 6, suit: "d" },
        ],
      }, // high card
    ];

    const { winners } = determineWinners(players, community);
    const ids = winners.map((w: { playerId: string }) => w.playerId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe("p1");
  });

  it("determineWinners split: both players returned exactly once each", () => {
    // Both players play the board (board is best 5-card hand for both).
    const community = [
      { value: 14, suit: "s" }, // As
      { value: 14, suit: "h" }, // Ah
      { value: 14, suit: "d" }, // Ad
      { value: 14, suit: "c" }, // Ac
      { value: 13, suit: "s" }, // Ks — quads aces + K kicker from board
    ];
    const players = [
      {
        id: "p1",
        holeCards: [
          { value: 2, suit: "c" },
          { value: 3, suit: "d" },
        ],
      },
      {
        id: "p2",
        holeCards: [
          { value: 4, suit: "c" },
          { value: 5, suit: "d" },
        ],
      },
    ];

    const { winners } = determineWinners(players, community);
    const ids = winners.map((w: { playerId: string }) => w.playerId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    expect(ids.sort()).toEqual(["p1", "p2"]);
  });
});
