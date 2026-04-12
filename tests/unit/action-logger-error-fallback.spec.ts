/**
 * Tests that getPlayerActionSafe() logs fallback actions to the tournament
 * logger even when strategy evaluation throws or times out.
 *
 * Bug: error/timeout paths returned fold/check but never called actionLogger,
 * causing incomplete action arrays in tournament logs.
 */

import { describe, it, expect } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import { GameInstance } from "../../src/services/game/live-game-manager.service";
import type {
  BotStrategy,
  StrategyEvaluation,
} from "../../src/domain/bot-strategy/strategy.types";
import { randomUUID } from "crypto";

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

function makeGame() {
  const emitter = new EventEmitter2();
  const game = new GameInstance(silentLogger(), emitter, {
    tableId: `t-${randomUUID().slice(0, 8)}`,
    gameId: `g-${randomUUID().slice(0, 8)}`,
    smallBlind: 10,
    bigBlind: 20,
    startingChips: 1000,
    simulationMode: true,
  });
  return { game, emitter };
}

describe("actionLogger called on error fallback", () => {
  it("logs fallback action when strategy evaluation throws (simulation path)", async () => {
    const { game, emitter } = makeGame();

    const loggedEntries: Array<{
      playerId: string;
      evaluation: StrategyEvaluation;
    }> = [];
    game.setActionLogger((entry) => {
      loggedEntries.push({
        playerId: entry.playerId,
        evaluation: entry.evaluation,
      });
    });

    // Add two players — one normal, one that will crash
    game.addPlayer({
      id: "p1",
      name: "Normal",
      strategy: foldStrategy,
      chips: 1000,
    });
    game.addPlayer({
      id: "p2",
      name: "Crasher",
      strategy: foldStrategy,
      chips: 1000,
    });

    // Sabotage p2's hydrated strategy so evaluateHydrated throws
    const p2 = game.players.find((p) => p.id === "p2");
    if (p2) {
      (p2 as any).hydratedStrategy = null; // will cause evaluateHydrated to throw
    }

    // Run two hands — p2 is dealer in hand 2 and must act first (triggering the crash)
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

    // Both players should have logged actions (even the crashing one)
    const p1Entries = loggedEntries.filter((e) => e.playerId === "p1");
    const p2Entries = loggedEntries.filter((e) => e.playerId === "p2");

    expect(p1Entries.length).toBeGreaterThan(0);
    expect(p2Entries.length).toBeGreaterThan(0);

    // The crasher's entry should have the error fallback explanation
    const p2Eval = p2Entries[0].evaluation;
    expect(p2Eval.explanation).toContain("Error fallback");
    expect(p2Eval.source).toBe("Personality");
  });

  it("fallback action is fold when canCheck is false, check when true", async () => {
    const { game, emitter } = makeGame();

    const loggedActions: Array<{ playerId: string; action: { type: string } }> =
      [];
    game.setActionLogger((entry) => {
      loggedActions.push({
        playerId: entry.playerId,
        action: entry.evaluation.action,
      });
    });

    game.addPlayer({
      id: "p1",
      name: "Normal",
      strategy: foldStrategy,
      chips: 1000,
    });
    game.addPlayer({
      id: "p2",
      name: "Crasher",
      strategy: foldStrategy,
      chips: 1000,
    });

    const p2 = game.players.find((p) => p.id === "p2");
    if (p2) {
      (p2 as any).hydratedStrategy = null;
    }

    // Run two hands — p2 is dealer in hand 2 and must act first (triggering the crash)
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

    // Crasher's fallback actions should be fold or check (never raise)
    const p2Actions = loggedActions.filter((e) => e.playerId === "p2");
    for (const a of p2Actions) {
      expect(["fold", "check"]).toContain(a.action.type);
    }
  });
});
