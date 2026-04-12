/**
 * simulation-hand-worker.ts
 * =========================
 * Headless hand-simulation worker.
 *
 * Protocol:
 *   startup → sends   { type: "ready" }
 *   on task → receives HandSimulationInput directly (parentPort.once)
 *             sends   { type: "progress", simulationId, handsCompleted } every 200 hands
 *             sends   { type: "result",   simulationId, output } on success
 *             sends   { type: "error",    simulationId, error  } on failure
 *
 * GameInstance runs in simulationMode=true:
 *   - No Socket.io/Redis emissions
 *   - No animation delays (sleepMs=0)
 *   - DB persistence never triggered (EventEmitter2 is local, not NestJS global)
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
import {
  HandSimulationInput,
  HandSimulationOutput,
  HandSimWorkerMessage,
} from "./simulation.types";

if (!parentPort) {
  throw new Error("simulation-hand-worker must run as a Worker Thread");
}

// ─── Position name lookup (mirrors GameInstance.POSITION_NAMES) ───────────────

const POSITION_NAMES: Record<number, string[]> = {
  2: ["BTN/SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "UTG+1", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "HJ", "CO"],
};

function getPositionName(
  playerIndex: number,
  dealerIndex: number,
  totalPlayers: number,
): string {
  const n = Math.min(totalPlayers, 9);
  const names = POSITION_NAMES[n] || POSITION_NAMES[9];
  const offset = (playerIndex - dealerIndex + totalPlayers) % totalPlayers;
  return names[offset] || `Seat${offset}`;
}

// ─── Main simulation runner ───────────────────────────────────────────────────

async function runHandSimulation(
  input: HandSimulationInput,
): Promise<HandSimulationOutput> {
  const {
    simulationId,
    targetBot,
    opponents,
    handCount,
    smallBlind,
    bigBlind,
  } = input;

  // Use large starting chips to ensure no one busts before handCount hands
  const startingChips = input.startingChips ?? bigBlind * (handCount + 1000);

  const tableId = uuidv4();
  const gameId = uuidv4();
  const gameEmitter = new EventEmitter2({ wildcard: false });
  const logger = new Logger("SimHandWorker");

  // ─── Stats accumulators ────────────────────────────────────────────────────

  let handsPlayed = 0;
  let handsWon = 0;
  let vpipHands = 0;
  let pfrHands = 0;
  let aggressiveActions = 0;
  let passiveActions = 0;
  const profitCurve: number[] = [0]; // index 0 = hand 0, profit = 0
  const heatmap: Record<
    string,
    { wins: number; losses: number; hands: number }
  > = {};

  // Per-hand state (reset on handStarted, committed on handComplete)
  let currentHandVpip = false;
  let currentHandPfr = false;
  let currentHandPosition = "Unknown";

  let currentHandTargetStartChips = BigInt(startingChips);

  // All player IDs in order (for position computation)
  const allBots = [targetBot, ...opponents];
  const allBotIds = allBots.map((b) => b.id);

  // ─── Event listeners ───────────────────────────────────────────────────────

  gameEmitter.on("game.handStarted", (event: any) => {
    currentHandVpip = false;
    currentHandPfr = false;

    // Determine target bot's position using dealer index
    const dealerBotId: string = event.dealerBotId;
    const dealerIdx = allBotIds.indexOf(dealerBotId);
    const targetIdx = allBotIds.indexOf(targetBot.id);
    const total = allBotIds.length;

    if (dealerIdx >= 0 && targetIdx >= 0) {
      currentHandPosition = getPositionName(targetIdx, dealerIdx, total);
    } else {
      currentHandPosition = "Unknown";
    }

    // Record starting chips for profit calculation
    const targetEntry = event.players?.find((p: any) => p.id === targetBot.id);
    if (targetEntry) {
      currentHandTargetStartChips = BigInt(targetEntry.chips);
    }
  });

  gameEmitter.on("game.playerAction", (event: any) => {
    if (event.botId !== targetBot.id) return;

    const action: string = event.action;
    const stage: string = event.stage || "";

    // Track VPIP and PFR for preflop
    const isPreflop = stage === "pre-flop" || stage === "preflop";
    if (isPreflop) {
      if (action === "call") {
        currentHandVpip = true;
      } else if (action === "raise" || action === "bet") {
        currentHandVpip = true;
        currentHandPfr = true;
      }
    }

    // Track aggression across all streets
    if (action === "raise" || action === "bet") {
      aggressiveActions++;
    } else if (action === "call") {
      passiveActions++;
    }
  });

  gameEmitter.on("game.handComplete", (event: any) => {
    handsPlayed++;

    // Check if target bot won this hand
    const winners: Array<{ playerId: string }> = event.winners || [];
    const targetWon = winners.some((w) => w.playerId === targetBot.id);
    if (targetWon) handsWon++;

    // Update heatmap for this position
    const pos = currentHandPosition;
    if (!heatmap[pos]) heatmap[pos] = { wins: 0, losses: 0, hands: 0 };
    heatmap[pos].hands++;
    if (targetWon) heatmap[pos].wins++;
    else heatmap[pos].losses++;

    // Commit VPIP/PFR
    if (currentHandVpip) vpipHands++;
    if (currentHandPfr) pfrHands++;

    // Sample cumulative profit every 100 hands
    if (handsPlayed % 100 === 0) {
      profitCurve.push(Number(currentHandTargetStartChips) - startingChips);
    }

    // Report progress every 200 hands
    if (handsPlayed % 200 === 0) {
      parentPort!.postMessage({
        type: "progress",
        simulationId,
        handsCompleted: handsPlayed,
      } as HandSimWorkerMessage);
    }

    // Stop the game when we've reached the target hand count
    if (handsPlayed >= handCount) {
      game.stop();
    }
  });

  // ─── Build and start the game ──────────────────────────────────────────────

  const game = new GameInstance(logger, gameEmitter, {
    tableId,
    gameId,
    smallBlind,
    bigBlind,
    startingChips,
    simulationMode: true,
  });

  // Pre-hydrate all strategies before adding players
  for (const bot of allBots) {
    getOrHydrateStrategy(bot.strategy as any);
  }

  // Add all players — GameInstance will auto-start once 2+ are seated
  for (const bot of allBots) {
    game.addPlayer({
      id: bot.id,
      name: bot.name,
      strategy: bot.strategy as any,
      chips: startingChips,
    });
  }

  // Record target bot's starting chips
  const targetBotStartChips = BigInt(startingChips);

  // startGame() is triggered automatically by addPlayer when ≥2 players are seated.
  // We await it here to block until the game completes (game.stop() is called after handCount).
  await game.startGame().catch((err) => {
    // If already running (auto-started), startGame throws — ignore that race.
    if (!String(err?.message).includes("already")) throw err;
  });

  const targetBotEndChips =
    game.players.find((p) => p.id === targetBot.id)?.chips ?? 0n;

  // Push final profit as the last curve point
  profitCurve.push(Number(targetBotEndChips) - startingChips);

  return {
    simulationId,
    handsPlayed,
    targetBotStartChips: Number(targetBotStartChips),
    targetBotEndChips: Number(targetBotEndChips),
    handsWon,
    vpipHands,
    pfrHands,
    aggressiveActions,
    passiveActions,
    heatmap,
    profitCurve,
    durationMs: 0, // filled by caller
  };
}

// ─── Worker entry point ───────────────────────────────────────────────────────

parentPort.postMessage({ type: "ready" } as HandSimWorkerMessage);

parentPort.once("message", async (input: HandSimulationInput) => {
  const start = Date.now();
  try {
    const output = await runHandSimulation(input);
    output.durationMs = Date.now() - start;

    // Cleanup caches between worker tasks
    clearHydrationCache();
    clearEvalCache();
    clearStreetMemos();

    parentPort!.postMessage({
      type: "result",
      simulationId: input.simulationId,
      output,
    } as HandSimWorkerMessage);
  } catch (err: any) {
    clearHydrationCache();
    clearEvalCache();
    clearStreetMemos();

    parentPort!.postMessage({
      type: "error",
      simulationId: input.simulationId,
      error: err?.message ?? "Unknown error",
      stack: err?.stack,
    } as HandSimWorkerMessage);
  }
});
