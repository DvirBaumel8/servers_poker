import { EventEmitter2 } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { GameInstance } from "../services/game/live-game-manager.service";
import { ValidatorSuite, BugReport } from "./validators";
import { PERSONALITY_PRESETS } from "../modules/bot-strategy/presets/personality-presets";
import type { BotStrategy } from "../domain/bot-strategy/strategy.types";

// ─── Types ────────────────────────────────────────────────────────────────

export interface GameLogEntry {
  actionNumber: number;
  event: string;
  snapshot: any;
  timestamp: number;
}

export interface CoverageData {
  allInWithSidePots: number; // potManager.pots.length > 1 when side pots form
  headsUp: number; // activePlayers === 2 at start of hand
  splitPot: number; // handComplete winners.length > 1
  playerElimination: number; // player.chips === 0 after hand
  everyoneFoldsToBlind: number; // only 1 active non-folded player after preflop
  showdown: number; // stage === 'showdown'
}

export interface SimulationResult {
  success: boolean;
  errors: BugReport[];
  gameLog: GameLogEntry[];
  duration: number; // milliseconds
  finalState: any;
  coverageHits: Partial<CoverageData>;
}

// ─── Utilities ────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─── Main Function ────────────────────────────────────────────────────────

export async function runSimulatedGame(config: {
  botCount: number;
  startingChips?: number;
  smallBlind?: number;
  bigBlind?: number;
  gameId?: string;
}): Promise<SimulationResult> {
  const startTime = Date.now();
  const logger = new Logger("GameSimulator");
  const eventEmitter = new EventEmitter2();
  const gameId = config.gameId || `sim-${randomUUID().substring(0, 8)}`;
  const tableId = `table-${randomUUID().substring(0, 8)}`;
  const startingChips = config.startingChips ?? 1000;
  const smallBlind = config.smallBlind ?? 10;
  const bigBlind = config.bigBlind ?? 20;

  const errors: BugReport[] = [];
  const gameLog: GameLogEntry[] = [];
  let actionNumber = 0;
  let lastActions: string[] = [];
  let gameFinished = false;
  let finalState: any = null;
  const seenBugTypes = new Set<string>(); // Deduplicate bugs by type per game

  // Coverage tracking
  const coverage: CoverageData = {
    allInWithSidePots: 0,
    headsUp: 0,
    splitPot: 0,
    playerElimination: 0,
    everyoneFoldsToBlind: 0,
    showdown: 0,
  };

  // Create game instance with minimal dependencies
  // sleepMs: 0 for fast testing (no delay between hands)
  const game = new GameInstance(logger, eventEmitter, {
    tableId,
    gameId,
    smallBlind,
    bigBlind,
    startingChips,
    sleepMs: 0,
  });

  // Add bots with shuffled personality presets
  const shuffledPresets = shuffleArray(PERSONALITY_PRESETS);
  const botNames = [
    "Shark",
    "Rock",
    "Maniac",
    "Station",
    "Nit",
    "ProBot",
    "Tricky",
    "Bully",
    "Shadow",
  ];

  for (let i = 0; i < config.botCount; i++) {
    const preset = shuffledPresets[i % shuffledPresets.length];
    const strategy: BotStrategy = {
      version: 1,
      tier: "quick",
      personality: preset.personality,
    };

    game.addPlayer({
      id: `bot-${i}-${randomUUID().substring(0, 6)}`,
      name: botNames[i] || `Bot${i}`,
      strategy,
      chips: startingChips,
    });
  }

  // Set up event listeners
  const stateUpdatedHandler = () => {
    actionNumber++;
    const snapshot = game.getPublicState();

    // Run validators and deduplicate bugs by type per game
    const bugs = ValidatorSuite.runAll(game, actionNumber, lastActions);
    for (const bug of bugs) {
      if (!seenBugTypes.has(bug.invariant)) {
        errors.push(bug);
        seenBugTypes.add(bug.invariant);
      }
    }

    // Log the state update
    gameLog.push({
      actionNumber,
      event: `state_update_${game.stage}`,
      snapshot,
      timestamp: Date.now(),
    });

    // Track coverage metrics
    if (game.potManager && game.potManager.pots.length > 1) {
      coverage.allInWithSidePots++;
    }

    const activePlayers = game.players.filter(
      (p) => p.chips > 0 && !p.disconnected,
    );
    if (activePlayers.length === 2) {
      coverage.headsUp++;
    }

    if (game.stage === "showdown") {
      coverage.showdown++;
    }
  };

  const playerActionHandler = (data: {
    botId: string;
    action: string;
    amount?: number;
  }) => {
    const actionStr = `${data.action}${data.amount ? ` ${data.amount}` : ""}`;
    lastActions = [actionStr, ...lastActions.slice(0, 9)];
  };

  const handStartedHandler = () => {
    // Reset coverage for new hand
    const activePlayers = game.players.filter(
      (p) => p.chips > 0 && !p.disconnected,
    );
    if (activePlayers.length === 2) {
      coverage.headsUp++;
    }
  };

  const playerRemovedHandler = (data: { playerId: string }) => {
    // Check if any player was eliminated
    const player = game.players.find((p) => p.id === data.playerId);
    if (player && player.chips === 0) {
      coverage.playerElimination++;
    }
  };

  eventEmitter.on("game.stateUpdated", stateUpdatedHandler);
  eventEmitter.on("game.playerAction", playerActionHandler);
  eventEmitter.on("game.handStarted", handStartedHandler);
  eventEmitter.on("game.playerRemoved", playerRemovedHandler);

  // Start the game with error handling
  try {
    await game.startGame();
    gameFinished = true;
    finalState = game.getPublicState();
  } catch (e: any) {
    errors.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      severity: "Critical",
      invariant: "Game loop threw exception",
      gameId,
      actionNumber,
      errorDetails: {
        error: (e as Error).message,
        stack: (e as Error).stack,
      },
      gameState: game.getPublicState(),
      lastActions,
    });
    finalState = game.getPublicState();
  }

  // Cleanup
  eventEmitter.off("game.stateUpdated", stateUpdatedHandler);
  eventEmitter.off("game.playerAction", playerActionHandler);
  eventEmitter.off("game.handStarted", handStartedHandler);
  eventEmitter.off("game.playerRemoved", playerRemovedHandler);

  const duration = Date.now() - startTime;

  return {
    success: gameFinished && errors.length === 0,
    errors,
    gameLog,
    duration,
    finalState,
    coverageHits: coverage,
  };
}
