/**
 * pool-tournament-worker.ts
 * =========================
 * Reusable pool worker. Stays alive between tasks.
 * Protocol:
 *   startup  → sends { type: "ready" }
 *   on task  → receives { type: "run", taskId, input }
 *              sends   { type: "heartbeat", taskId, timestamp } every 10s
 *              sends   { type: "result", taskId, output } on success
 *              sends   { type: "error",  taskId, error  } on failure
 *
 * Core poker logic (getCurrentBlinds, assignToTables, runTableGame, runTournament)
 * is verbatim from tournament-simulation.worker.ts — only the entry point differs.
 */

import { parentPort } from "worker_threads";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { GameInstance } from "../services/game/live-game-manager.service";
import {
  getOrHydrateStrategy,
  clearHydrationCache,
  clearEvalCache,
  clearStreetMemos,
} from "../modules/bot-strategy/strategy-engine.service";
import type { BotStrategy } from "../domain/bot-strategy/strategy.types";
import {
  SimulationInput,
  SimulationOutput,
  SimBotEntry,
  SimBustRecord,
  SimGame,
  SimHand,
  SimHandPlayer,
  SimAction,
  SimCardData,
  WorkerToPoolMessage,
  PoolToWorkerMessage,
} from "./simulation.types";

if (!parentPort) {
  throw new Error("pool-tournament-worker must run as a Worker Thread");
}

// ─── Silent logger — suppresses all non-error output during simulation ────────

class SilentLogger extends Logger {
  override log() {}
  override debug() {}
  override warn() {}
  override verbose() {}
  // error() is not overridden — crash messages still surface to stderr
}

// ─── Types used only within the worker ───────────────────────────────────────

interface ActiveBot {
  botId: string;
  name: string;
  strategy: Record<string, any> | null;
  chips: bigint;
}

interface TableResult {
  handsPlayed: number;
  finalChips: Map<string, bigint>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_STAGES = new Set(["preflop", "flop", "turn", "river"]);

function normalizeStage(stage: string): string {
  const s = stage.toLowerCase().replace("-", "");
  if (s === "preflop" || s === "pre-flop") return "preflop";
  return VALID_STAGES.has(s) ? s : "preflop";
}

/** Convert a Card object or card-string to { rank, suit } for DB storage. */
function toCardData(card: any): SimCardData {
  if (typeof card === "string") {
    const chars = [...card];
    const suit = chars.pop()!;
    const rank = chars.join("");
    return { rank, suit };
  }
  return { rank: String(card.rank ?? "?"), suit: String(card.suit ?? "?") };
}

function getCurrentBlinds(
  input: SimulationInput,
  handsPlayed: number,
): { smallBlind: number; bigBlind: number; ante: number; level: number } {
  const { blindLevels } = input.config;
  if (!blindLevels.length)
    return { smallBlind: 25, bigBlind: 50, ante: 0, level: 1 };

  let cumulativeHands = 0;
  for (const lvl of blindLevels) {
    cumulativeHands += lvl.handsPerLevel;
    if (handsPlayed < cumulativeHands) {
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

/** Split bots into balanced table groups of at most seatsPerTable. */
function assignToTables(
  bots: ActiveBot[],
  seatsPerTable: number,
): ActiveBot[][] {
  if (bots.length === 0) return [];
  const numTables = Math.max(1, Math.ceil(bots.length / seatsPerTable));
  const tables: ActiveBot[][] = Array.from({ length: numTables }, () => []);
  bots.forEach((bot, i) => tables[i % numTables].push(bot));
  return tables;
}

// ─── Single-table game runner ─────────────────────────────────────────────────

async function runTableGame(
  tableBots: ActiveBot[],
  blinds: { smallBlind: number; bigBlind: number; ante: number; level: number },
  games: SimGame[],
  hands: SimHand[],
  handPlayers: SimHandPlayer[],
  actions: SimAction[],
  globalActionSeq: { value: number },
): Promise<TableResult> {
  const tableId = uuidv4();
  const gameId = uuidv4();
  const gameEmitter = new EventEmitter2({ wildcard: false });
  const logger = new SilentLogger();

  interface PendingHand {
    handId: string;
    startedAt: string;
    startChipsSnapshot: Map<string, number>;
  }
  const pendingHands = new Map<number, PendingHand>();
  const currentChips = new Map<string, number>(
    tableBots.map((b) => [b.botId, Number(b.chips)]),
  );

  gameEmitter.on("game.handStarted", (event: any) => {
    const handId = uuidv4();
    pendingHands.set(event.handNumber, {
      handId,
      startedAt: new Date().toISOString(),
      startChipsSnapshot: new Map(currentChips),
    });
  });

  gameEmitter.on("game.playerAction", (event: any) => {
    const pending = pendingHands.get(event.handNumber);
    if (!pending) return;

    const stageStr = normalizeStage(event.stage || "preflop");
    if (!VALID_STAGES.has(stageStr)) return;

    actions.push({
      handId: pending.handId,
      botId: event.botId,
      street: stageStr,
      action: event.action,
      amount: Number(event.amount) || 0,
      sequence: globalActionSeq.value++,
      potAfter: Number(event.pot) || 0,
      chipsAfter: event.chipsAfter != null ? Number(event.chipsAfter) : null,
    });
  });

  gameEmitter.on("game.handComplete", (event: any) => {
    const pending = pendingHands.get(event.handNumber);
    if (!pending) return;
    pendingHands.delete(event.handNumber);

    const communityCards: SimCardData[] = (event.communityCards || []).map(
      toCardData,
    );
    const totalPot = Number(event.pot) || 0;

    hands.push({
      handId: pending.handId,
      gameId,
      handNumber: event.handNumber,
      level: blinds.level,
      smallBlind: blinds.smallBlind,
      bigBlind: blinds.bigBlind,
      ante: blinds.ante,
      pot: totalPot,
      communityCards,
      startedAt: pending.startedAt,
      finishedAt: new Date().toISOString(),
    });

    const winnerAmounts = new Map<string, number>(
      (event.winners || []).map((w: any) => [w.playerId, Number(w.amount)]),
    );

    const eventPlayers: any[] = event.players || [];
    for (const p of eventPlayers) {
      currentChips.set(p.id, Number(p.chips));
    }

    for (const p of eventPlayers) {
      const startChips =
        pending.startChipsSnapshot.get(p.id) ?? Number(p.chips);
      const endChips = Number(p.chips);
      const amountWon = winnerAmounts.get(p.id) || 0;
      const rawHoleCards: SimCardData[] = (p.holeCards || []).map(toCardData);

      handPlayers.push({
        handId: pending.handId,
        botId: p.id,
        position: 0,
        holeCards: rawHoleCards,
        startChips,
        endChips,
        amountBet: Number(p.totalBet) || 0,
        won: winnerAmounts.has(p.id),
        amountWon,
        folded: Boolean(p.folded),
        allIn: Boolean(p.allIn),
        sawShowdown: Boolean(event.atShowdown) && !p.folded,
      });
    }
  });

  games.push({ gameId, tableId });

  const game = new GameInstance(logger, gameEmitter, {
    tableId,
    gameId,
    smallBlind: blinds.smallBlind,
    bigBlind: blinds.bigBlind,
    ante: blinds.ante,
    startingChips: tableBots[0]
      ? Number(tableBots[0].chips)
      : blinds.bigBlind * 100,
    sleepMs: 0,
  });

  // Pre-hydrate all strategies before the game loop to avoid first-hand latency
  for (const bot of tableBots) {
    getOrHydrateStrategy(bot.strategy as BotStrategy);
  }

  for (const bot of tableBots) {
    game.addPlayer({
      id: bot.botId,
      name: bot.name,
      strategy: bot.strategy as any,
      chips: Number(bot.chips),
    });
  }

  await game.startGame();

  const finalState = game.getPublicState();
  const finalChips = new Map<string, bigint>(
    finalState.players.map((p) => [p.id, p.chips]),
  );

  return { handsPlayed: game.handNumber, finalChips };
}

// ─── Main simulation orchestrator ────────────────────────────────────────────

async function runTournament(
  input: SimulationInput,
): Promise<SimulationOutput> {
  const { config, entries } = input;
  const startTime = Date.now();

  // All arrays are local to this call — they go out of scope on return and are
  // GC'd after postMessage serialises the output. No manual cleanup needed.
  const games: SimGame[] = [];
  const hands: SimHand[] = [];
  const handPlayers: SimHandPlayer[] = [];
  const actions: SimAction[] = [];
  const bustOrder: SimBustRecord[] = [];
  const globalActionSeq = { value: 0 };

  const activeBots = new Map<string, ActiveBot>(
    entries.map((e: SimBotEntry) => [
      e.botId,
      {
        botId: e.botId,
        name: e.name,
        strategy: e.strategy,
        chips: BigInt(config.startingChips),
      },
    ]),
  );

  let totalHandsPlayed = 0;
  let nextBustPosition = entries.length;

  while (activeBots.size > 1) {
    const botList = Array.from(activeBots.values());
    const blinds = getCurrentBlinds(input, totalHandsPlayed);
    const tableGroups = assignToTables(botList, config.seatsPerTable);

    const results = await Promise.all(
      tableGroups.map((tableBots) => {
        if (tableBots.length < 2) {
          return Promise.resolve<TableResult>({
            handsPlayed: 0,
            finalChips: new Map(tableBots.map((b) => [b.botId, b.chips])),
          });
        }
        return runTableGame(
          tableBots,
          blinds,
          games,
          hands,
          handPlayers,
          actions,
          globalActionSeq,
        );
      }),
    );

    for (const result of results) {
      totalHandsPlayed += result.handsPlayed;
      for (const [botId, chips] of result.finalChips) {
        if (!activeBots.has(botId)) continue;
        if (chips <= 0n) {
          bustOrder.push({
            botId,
            bustLevel: blinds.level,
            finishPosition: nextBustPosition--,
          });
          activeBots.delete(botId);
        } else {
          activeBots.get(botId)!.chips = chips;
        }
      }
    }

    if (activeBots.size > 1 && results.every((r) => r.handsPlayed === 0)) {
      break;
    }
  }

  const winnerId =
    activeBots.size === 1 ? Array.from(activeBots.keys())[0] : null;
  const winnerName = winnerId ? (activeBots.get(winnerId)?.name ?? null) : null;

  return {
    tournamentId: config.tournamentId,
    winnerId,
    winnerName,
    bustOrder: [...bustOrder].reverse(),
    games,
    hands,
    handPlayers,
    actions,
    durationMs: Date.now() - startTime,
    totalHands: totalHandsPlayed,
  };
}

// ─── Event loop: signal ready, then process tasks indefinitely ───────────────

parentPort.postMessage({ type: "ready" } satisfies WorkerToPoolMessage);

parentPort.on("message", async (msg: PoolToWorkerMessage) => {
  if (msg.type !== "run") return;
  const { taskId, input } = msg;

  // Heartbeat: cleared before posting result to prevent a late heartbeat
  // racing with the result message.
  const heartbeatInterval = setInterval(() => {
    parentPort!.postMessage({
      type: "heartbeat",
      taskId,
      timestamp: Date.now(),
    } satisfies WorkerToPoolMessage);
  }, 10_000);

  try {
    const output = await runTournament(input);
    clearInterval(heartbeatInterval);
    // Clean up strategy caches between tasks to prevent memory bloat in reused workers
    clearHydrationCache();
    clearEvalCache();
    clearStreetMemos();
    parentPort!.postMessage({
      type: "result",
      taskId,
      output,
    } satisfies WorkerToPoolMessage);
  } catch (err: any) {
    clearInterval(heartbeatInterval);
    clearHydrationCache();
    clearEvalCache();
    clearStreetMemos();
    parentPort!.postMessage({
      type: "error",
      taskId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    } satisfies WorkerToPoolMessage);
  }
  // No process.exit() — the parentPort listener keeps the event loop alive
  // so the worker is ready to receive the next "run" message.
});
