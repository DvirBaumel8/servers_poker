/**
 * Regression tests for the GamePlayer deadlock fix in GameDataPersistenceService.
 *
 * Root cause: onHandComplete had two separate GamePlayer UPDATE loops —
 *   1. winners loop: increment hands_won (sorted by playerId)
 *   2. players loop: increment hands_played (sorted by id)
 *
 * When two hands from the same game completed concurrently (e.g., crash+recovery),
 * these two loops acquired GamePlayer row locks in conflicting interleaved order:
 *   T1 holds (G, P2).hands_won, waits for (G, P1).hands_played
 *   T2 holds (G, P1).hands_won, waits for (G, P2).hands_played  → DEADLOCK
 *
 * Fix: single sorted GamePlayer pass at the end of the transaction — each row
 * is locked exactly once, in consistent bot_id order.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { GameDataPersistenceService } from "../../src/services/game/game-data-persistence.service";

// ── Minimal mocks ─────────────────────────────────────────────────────────────

interface GamePlayerCall {
  botId: string;
  incrementsHandsWon: boolean;
}

/**
 * Build a DataSource mock that captures the order of GamePlayer createQueryBuilder calls.
 * Returns { dataSource, getGamePlayerCalls }.
 */
function makeDataSourceMock(capturedCalls: GamePlayerCall[]) {
  const managerMock: any = {
    getRepository: vi.fn().mockImplementation((entity: any) => {
      const name = entity?.name ?? String(entity);
      if (name === "Hand") {
        return { update: vi.fn().mockResolvedValue({}) };
      }
      if (name === "HandPlayer") {
        return { update: vi.fn().mockResolvedValue({}) };
      }
      if (name === "GamePlayer") {
        return { increment: vi.fn().mockResolvedValue({}) };
      }
      if (name === "Game") {
        return { increment: vi.fn().mockResolvedValue({}) };
      }
      if (name === "Action") {
        return { insert: vi.fn().mockResolvedValue({}) };
      }
      return {
        update: vi.fn().mockResolvedValue({}),
        insert: vi.fn().mockResolvedValue({}),
      };
    }),

    createQueryBuilder: vi.fn().mockImplementation(() => {
      let capturedSet: Record<string, any> = {};
      let capturedWhere: Record<string, any> = {};
      const qb: any = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockImplementation((vals: Record<string, any>) => {
          capturedSet = vals;
          return qb;
        }),
        where: vi
          .fn()
          .mockImplementation((_sql: string, params: Record<string, any>) => {
            capturedWhere = params;
            return qb;
          }),
        execute: vi.fn().mockImplementation(async () => {
          capturedCalls.push({
            botId: capturedWhere.botId as string,
            incrementsHandsWon: "hands_won" in capturedSet,
          });
          return {};
        }),
      };
      return qb;
    }),
  };

  const dataSource: any = {
    transaction: vi
      .fn()
      .mockImplementation(async (fn: (m: any) => Promise<void>) => {
        await fn(managerMock);
      }),
  };

  return dataSource;
}

function makeHandRepo(handId = "hand-uuid") {
  return {
    findOne: vi.fn().mockResolvedValue({ id: handId, finished_at: null }),
  };
}

function makeService(dataSource: any, handRepo: any) {
  const eventEmitter = new EventEmitter2();
  const service = new GameDataPersistenceService(
    eventEmitter,
    dataSource,
    /* gameRepository */ { find: vi.fn().mockResolvedValue([]) } as any,
    handRepo as any,
    /* handPlayerRepository */ {} as any,
    /* actionRepository */ {} as any,
    /* gamePlayerRepository */ {} as any,
    /* botEventRepository */ {} as any,
  );

  // Register event listeners the same way onModuleInit does
  eventEmitter.on(
    "game.handComplete",
    (service as any).onHandComplete.bind(service),
  );

  // Pre-seed handIdCache so the DB lookup is skipped
  (service as any).handIdCache.set("game-1:1", "hand-uuid");

  return { service, eventEmitter };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GameDataPersistenceService — GamePlayer deadlock fix", () => {
  let gameCalls: GamePlayerCall[];

  beforeEach(() => {
    gameCalls = [];
  });

  it("acquires GamePlayer locks in sorted bot_id order regardless of winner position", async () => {
    // P_z is the winner, P_a is the loser.
    // Old code: locked (G, P_z) first (winner loop), then (G, P_a) (player loop) → different
    //           concurrent tx could deadlock if it has P_a as winner first.
    // New code: single sorted pass → always (G, P_a) then (G, P_z).

    const dataSource = makeDataSourceMock(gameCalls);
    const { eventEmitter } = makeService(dataSource, makeHandRepo());

    await new Promise<void>((resolve) => {
      setImmediate(resolve);
      eventEmitter.emit("game.handComplete", {
        tableId: "t1",
        gameId: "game-1",
        handNumber: 1,
        winners: [{ playerId: "P_z", amount: 200n }],
        atShowdown: false,
        players: [
          { id: "P_z", chips: 200n, folded: false, allIn: false },
          { id: "P_a", chips: 0n, folded: true, allIn: false },
        ],
      });
    });

    // Wait for async handler
    await new Promise((r) => setTimeout(r, 50));

    expect(gameCalls.length).toBe(2);
    // Sorted order: P_a before P_z
    expect(gameCalls[0].botId).toBe("P_a");
    expect(gameCalls[1].botId).toBe("P_z");
  });

  it("increments hands_won only for winners, hands_played for all", async () => {
    const dataSource = makeDataSourceMock(gameCalls);
    const { eventEmitter } = makeService(dataSource, makeHandRepo());

    eventEmitter.emit("game.handComplete", {
      tableId: "t1",
      gameId: "game-1",
      handNumber: 1,
      winners: [{ playerId: "bot-b", amount: 300n }],
      atShowdown: true,
      players: [
        { id: "bot-a", chips: 0n, folded: true, allIn: false },
        { id: "bot-b", chips: 300n, folded: false, allIn: false },
        { id: "bot-c", chips: 0n, folded: true, allIn: false },
      ],
    });

    await new Promise((r) => setTimeout(r, 50));

    // Sorted: bot-a, bot-b, bot-c
    expect(gameCalls.map((c) => c.botId)).toEqual(["bot-a", "bot-b", "bot-c"]);
    expect(gameCalls[0].incrementsHandsWon).toBe(false); // bot-a: loser
    expect(gameCalls[1].incrementsHandsWon).toBe(true); // bot-b: winner
    expect(gameCalls[2].incrementsHandsWon).toBe(false); // bot-c: loser
  });

  it("handles split pot (multiple winners) correctly", async () => {
    const dataSource = makeDataSourceMock(gameCalls);
    const { eventEmitter } = makeService(dataSource, makeHandRepo());

    eventEmitter.emit("game.handComplete", {
      tableId: "t1",
      gameId: "game-1",
      handNumber: 1,
      winners: [
        { playerId: "bot-c", amount: 150n },
        { playerId: "bot-a", amount: 150n },
      ],
      atShowdown: true,
      players: [
        { id: "bot-a", chips: 150n, folded: false, allIn: true },
        { id: "bot-b", chips: 0n, folded: true, allIn: false },
        { id: "bot-c", chips: 150n, folded: false, allIn: false },
      ],
    });

    await new Promise((r) => setTimeout(r, 50));

    // Sorted: bot-a, bot-b, bot-c
    expect(gameCalls.map((c) => c.botId)).toEqual(["bot-a", "bot-b", "bot-c"]);
    expect(gameCalls[0].incrementsHandsWon).toBe(true); // bot-a: winner
    expect(gameCalls[1].incrementsHandsWon).toBe(false); // bot-b: loser
    expect(gameCalls[2].incrementsHandsWon).toBe(true); // bot-c: winner
  });

  it("each player's GamePlayer row is updated exactly once (no double lock acquisition)", async () => {
    const dataSource = makeDataSourceMock(gameCalls);
    const { eventEmitter } = makeService(dataSource, makeHandRepo());

    eventEmitter.emit("game.handComplete", {
      tableId: "t1",
      gameId: "game-1",
      handNumber: 1,
      winners: [{ playerId: "bot-x", amount: 400n }],
      atShowdown: false,
      players: [
        { id: "bot-x", chips: 400n, folded: false, allIn: false },
        { id: "bot-y", chips: 0n, folded: true, allIn: false },
      ],
    });

    await new Promise((r) => setTimeout(r, 50));

    const botIds = gameCalls.map((c) => c.botId);
    // Each bot_id appears exactly once — no double locking
    expect(new Set(botIds).size).toBe(botIds.length);
    expect(botIds.length).toBe(2);
  });
});
