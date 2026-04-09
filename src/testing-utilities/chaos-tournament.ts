/**
 * Chaos Tournament Runner
 * =======================
 * Headless tournament harness for chaos-testing scenarios:
 *
 *   - Custom Bot Injection: fully configured BotStrategy bots
 *   - Stack Imbalance Mode: one bot gets 5 000 chips, the rest get 100
 *   - Clone War Mode: all bots play with identical DNA (bots[0].strategy)
 *
 * Runs a single table entirely in-process — no DB, no NestJS DI, no delays.
 * Returns a complete MasterTournamentLog so the caller can inspect every
 * decision (action source, raise amounts, equity, weights) in detail.
 *
 * Usage:
 *   import { runChaosTournament, CHAOS_PRESETS } from './chaos-tournament';
 *
 *   const result = await runChaosTournament({
 *     bots: CHAOS_PRESETS.maniacVsNit,
 *     stackImbalanceMode: true,
 *     outputPath: './chaos-output.json',
 *   });
 *   console.log(result.winner);
 */

import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import type { BotStrategy } from "../domain/bot-strategy/strategy.types";
import { GameInstance } from "../services/game/live-game-manager.service";
import { TournamentLoggerService } from "../services/game/tournament-logger.service";
import { PERSONALITY_PRESETS } from "../modules/bot-strategy/presets/personality-presets";
import type { MasterTournamentLog } from "../services/game/tournament-log.types";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ChaosBotConfig {
  /** Display name (used in logs). */
  name: string;
  /** Full BotStrategy — Quick, Strategy, or Pro tier. */
  strategy: BotStrategy;
  /**
   * Starting chip count override.
   * Ignored when stackImbalanceMode is true (auto-assigned to 5 000 / 100).
   * Defaults to the global startingChips option.
   */
  startingChips?: number;
}

export interface ChaosOptions {
  /** Bot configurations. Minimum 2, maximum 9. */
  bots: ChaosBotConfig[];

  /** Big-blind amount (default 100). */
  bigBlind?: number;

  /** Small-blind amount (default 50). */
  smallBlind?: number;

  /**
   * Maximum hands to play before stopping, even if no winner has emerged.
   * Useful for clone-war or chip-equality games that can run very long.
   * Default 300.
   */
  handLimit?: number;

  /**
   * Stack Imbalance Mode.
   * The first bot in the bots array receives 5 000 chips; all others get 100.
   * Overrides any per-bot startingChips setting.
   */
  stackImbalanceMode?: boolean;

  /**
   * Clone War Mode.
   * All bots use the strategy from bots[0], regardless of the strategy
   * fields on bots[1..n].  The clone is frozen (shared object reference).
   */
  cloneWarMode?: boolean;

  /**
   * Default starting chip count for bots that don't specify their own.
   * Ignored when stackImbalanceMode is true.
   * Default 1 000.
   */
  startingChips?: number;

  /**
   * Blind escalation: double the blinds every N hands.
   * The runner creates separate game phases with increasing blind levels.
   * Players carry their chip counts between phases.
   * null = no escalation (fixed blinds throughout).
   */
  blindEscalationEveryHands?: number;

  /**
   * If provided, the MasterTournamentLog JSON is written to this path after
   * the tournament finishes.
   */
  outputPath?: string;
}

export interface ChaosResult {
  /** The full tournament log — hands, actions, engine metrics, source fields. */
  log: MasterTournamentLog;
  /** Name of the winning bot, or undefined if no winner within the hand limit. */
  winner?: string;
  /** Total hands played across all blind-escalation phases. */
  handsPlayed: number;
  /** Bot names in elimination order (first eliminated = index 0). */
  eliminationOrder: string[];
  /** Chip counts for all players at tournament end (including eliminated = 0). */
  finalChips: Record<string, number>;
}

// ─── Built-in preset scenarios ────────────────────────────────────────────────

/**
 * Ready-made bot lists for common chaos scenarios.
 * Import and pass directly to runChaosTournament({ bots: CHAOS_PRESETS.xxx }).
 */
export const CHAOS_PRESETS = {
  /** Classic aggressor vs ultra-nit matchup — 6 bots. */
  maniacVsNit: (): ChaosBotConfig[] => {
    const maniac = PERSONALITY_PRESETS.find((p) => p.id === "maniac");
    const nit = PERSONALITY_PRESETS.find((p) => p.id === "nit");
    const shark = PERSONALITY_PRESETS.find((p) => p.id === "shark");
    return [
      {
        name: "Maniac",
        strategy: {
          version: 1,
          tier: "quick",
          personality: maniac?.personality ?? {
            aggression: 95,
            bluffFrequency: 80,
            riskTolerance: 90,
            tightness: 10,
          },
        },
      },
      {
        name: "Nit1",
        strategy: {
          version: 1,
          tier: "quick",
          personality: nit?.personality ?? {
            aggression: 15,
            bluffFrequency: 5,
            riskTolerance: 20,
            tightness: 90,
          },
        },
      },
      {
        name: "Nit2",
        strategy: {
          version: 1,
          tier: "quick",
          personality: nit?.personality ?? {
            aggression: 15,
            bluffFrequency: 5,
            riskTolerance: 20,
            tightness: 90,
          },
        },
      },
      {
        name: "Shark1",
        strategy: {
          version: 1,
          tier: "quick",
          personality: shark?.personality ?? {
            aggression: 75,
            bluffFrequency: 20,
            riskTolerance: 50,
            tightness: 70,
          },
        },
      },
      {
        name: "Shark2",
        strategy: {
          version: 1,
          tier: "quick",
          personality: shark?.personality ?? {
            aggression: 75,
            bluffFrequency: 20,
            riskTolerance: 50,
            tightness: 70,
          },
        },
      },
      {
        name: "Maniac2",
        strategy: {
          version: 1,
          tier: "quick",
          personality: maniac?.personality ?? {
            aggression: 95,
            bluffFrequency: 80,
            riskTolerance: 90,
            tightness: 10,
          },
        },
      },
    ];
  },

  /** All 6 bots with maximum aggression + maximum tightness (contradictory DNA). */
  extremeDNA: (): ChaosBotConfig[] =>
    Array.from({ length: 6 }, (_, i) => ({
      name: `ExtremeBot${i + 1}`,
      strategy: {
        version: 1 as const,
        tier: "quick" as const,
        personality: {
          aggression: 100,
          bluffFrequency: 100,
          riskTolerance: 100,
          tightness: 100,
        },
      },
    })),

  /** Clone war — all 6 bots share identical Shark DNA. */
  cloneWar: (): ChaosBotConfig[] => {
    const shark = PERSONALITY_PRESETS.find((p) => p.id === "shark");
    const sharedStrategy: BotStrategy = {
      version: 1,
      tier: "quick",
      personality: shark?.personality ?? {
        aggression: 75,
        bluffFrequency: 20,
        riskTolerance: 50,
        tightness: 70,
      },
    };
    return Array.from({ length: 6 }, (_, i) => ({
      name: `Clone${i + 1}`,
      strategy: sharedStrategy,
    }));
  },
};

// ─── Silent logger ────────────────────────────────────────────────────────────

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

// ─── Main runner ──────────────────────────────────────────────────────────────

/**
 * Run a chaos tournament and return the full log + result summary.
 *
 * The function is completely self-contained — no database, no HTTP server,
 * no NestJS bootstrap needed.
 *
 * When blindEscalationEveryHands is set, the tournament runs in phases:
 * each phase uses a new GameInstance with doubled blinds, players carry their
 * chip counts between phases, and the TournamentLoggerService accumulates all
 * hand logs into a single MasterTournamentLog.
 */
export async function runChaosTournament(
  opts: ChaosOptions,
): Promise<ChaosResult> {
  const {
    bigBlind: initialBigBlind = 100,
    smallBlind: initialSmallBlind = 50,
    handLimit = 300,
    stackImbalanceMode = false,
    cloneWarMode = false,
    startingChips = 1_000,
    blindEscalationEveryHands,
    outputPath,
  } = opts;

  if (opts.bots.length < 2)
    throw new Error("Chaos tournament requires at least 2 bots");
  if (opts.bots.length > 9)
    throw new Error("Chaos tournament supports at most 9 bots");

  // ── Resolve strategies ──────────────────────────────────────────────────────
  const cloneStrategy = opts.bots[0].strategy;
  const bots: ChaosBotConfig[] = opts.bots.map((b, i) => ({
    ...b,
    strategy: cloneWarMode ? cloneStrategy : b.strategy,
    startingChips: stackImbalanceMode
      ? i === 0
        ? 5_000
        : 100
      : (b.startingChips ?? startingChips),
  }));

  // ── Build shared logger ────────────────────────────────────────────────────
  const tournamentId = `chaos-${randomUUID().substring(0, 8)}`;

  // Assign stable IDs once — reused across phases (must precede logger init)
  const botIds: string[] = bots.map(
    () => `bot-${randomUUID().substring(0, 8)}`,
  );

  const tournamentLogger = new TournamentLoggerService();
  tournamentLogger.initialize(
    tournamentId,
    bots.map((b, i) => ({
      botId: botIds[i],
      botName: b.name,
      userName: b.name,
      elo: 1000,
      dna: b.strategy,
    })),
  );

  // ── Shared tracking state ──────────────────────────────────────────────────
  let handsPlayedTotal = 0;
  const eliminationOrder: string[] = [];
  const botNameById = new Map<string, string>();

  for (let i = 0; i < bots.length; i++) {
    botNameById.set(botIds[i], bots[i].name);
  }

  // Starting chip map — updated between phases
  const chipsByBotId = new Map<string, number>();
  for (let i = 0; i < bots.length; i++) {
    chipsByBotId.set(botIds[i], bots[i].startingChips ?? startingChips);
  }

  // ── Phase loop ─────────────────────────────────────────────────────────────
  let currentSmallBlind = initialSmallBlind;
  let currentBigBlind = initialBigBlind;
  let winner: string | undefined;

  while (true) {
    // How many hands can this phase run?
    const handsRemainingOverall = handLimit - handsPlayedTotal;
    if (handsRemainingOverall <= 0) break;

    const phaseHandLimit = blindEscalationEveryHands
      ? Math.min(blindEscalationEveryHands, handsRemainingOverall)
      : handsRemainingOverall;

    // Only include bots still alive (chips > 0)
    const aliveBotIds = botIds.filter((id) => (chipsByBotId.get(id) ?? 0) > 0);
    if (aliveBotIds.length < 2) break;

    // ── Create phase game instance ──────────────────────────────────────────
    const tableId = `table-${randomUUID().substring(0, 8)}`;
    const gameId = `game-${randomUUID().substring(0, 8)}`;
    const eventEmitter = new EventEmitter2();

    const game = new GameInstance(silentLogger(), eventEmitter, {
      tableId,
      gameId,
      smallBlind: currentSmallBlind,
      bigBlind: currentBigBlind,
      startingChips: chipsByBotId.get(aliveBotIds[0]) ?? startingChips,
      sleepMs: 0,
    });

    game.setActionLogger((entry) => tournamentLogger.recordAction(entry));

    // ── Phase-local hand counter ────────────────────────────────────────────
    let phaseHandsPlayed = 0;

    eventEmitter.on(
      "game.handStarted",
      (event: {
        handNumber: number;
        dealerBotId: string;
        players?: Array<{ id: string; chips: bigint | number }>;
        holeCards?: Record<string, string[]>;
      }) => {
        phaseHandsPlayed = event.handNumber;

        const initialStacks: Record<string, number> = {};
        for (const p of event.players ?? []) {
          initialStacks[p.id] = Number(p.chips);
        }
        // Use a global hand number so the logger accumulates correctly
        const globalHandNumber = handsPlayedTotal + event.handNumber;
        tournamentLogger.onHandStarted(
          globalHandNumber,
          event.dealerBotId,
          initialStacks,
          event.holeCards ?? {},
        );

        if (phaseHandsPlayed >= phaseHandLimit) {
          game.stop();
        }
      },
    );

    eventEmitter.on(
      "game.handComplete",
      (event: { communityCards: string[]; winners?: { id: string }[] }) => {
        tournamentLogger.onHandComplete(event.communityCards ?? []);

        for (const p of game.players) {
          const id = p.id;
          if (Number(p.chips) === 0 && !eliminationOrder.includes(id)) {
            eliminationOrder.push(id);
          }
        }
      },
    );

    // ── Add alive bots to this phase ────────────────────────────────────────
    for (const id of aliveBotIds) {
      const bot = bots[botIds.indexOf(id)];
      game.addPlayer({
        id,
        name: bot.name,
        strategy: bot.strategy,
        chips: chipsByBotId.get(id),
      });
    }

    // ── Run phase ───────────────────────────────────────────────────────────
    try {
      await game.startGame();
    } catch {
      // stop() throws in some engine versions — safe to swallow
    }

    handsPlayedTotal += phaseHandsPlayed;

    // ── Sync chip counts from this phase ────────────────────────────────────
    for (const p of game.players) {
      chipsByBotId.set(p.id, Number(p.chips));
    }

    // ── Check for a winner ──────────────────────────────────────────────────
    const survivors = game.players.filter((p) => Number(p.chips) > 0);
    if (survivors.length === 1) {
      winner = survivors[0].name;
      break;
    }
    if (survivors.length === 0) break;

    // ── If no escalation, we're done ────────────────────────────────────────
    if (!blindEscalationEveryHands) break;

    // ── Double blinds for next phase ────────────────────────────────────────
    currentSmallBlind *= 2;
    currentBigBlind *= 2;
  }

  // ── Collect final chip counts ──────────────────────────────────────────────
  const finalChips: Record<string, number> = {};
  for (const [id, chips] of chipsByBotId) {
    const name = botNameById.get(id) ?? id;
    finalChips[name] = chips;
  }

  // ── Build and optionally persist the log ───────────────────────────────────
  const log = tournamentLogger.serialize();

  if (outputPath) {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(log, null, 2), "utf-8");
  }

  return {
    log,
    winner,
    handsPlayed: handsPlayedTotal,
    eliminationOrder: eliminationOrder.map((id) => botNameById.get(id) ?? id),
    finalChips,
  };
}
