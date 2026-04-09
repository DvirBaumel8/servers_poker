/**
 * demo-tournament-log.ts
 * ----------------------
 * Runs a single-table headless "tournament" (5 bots, 1000 chips each, blinds 10/20)
 * and writes the Master Tournament Log JSON to logs/tournaments/demo-<id>.json.
 *
 * Usage:
 *   npx tsx scripts/demo-tournament-log.ts
 */

import { EventEmitter2 } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { GameInstance } from "../src/services/game/live-game-manager.service";
import { TournamentLoggerService } from "../src/services/game/tournament-logger.service";
import { PERSONALITY_PRESETS } from "../src/modules/bot-strategy/presets/personality-presets";

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const BOT_COUNT = 5;

async function main() {
  const tournamentId = `demo-${randomUUID().substring(0, 8)}`;
  const tableId = `table-${randomUUID().substring(0, 8)}`;
  const gameId = `game-${randomUUID().substring(0, 8)}`;

  const silentLogger = {
    log: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    verbose: () => {},
    fatal: () => {},
  } as unknown as Logger;

  const eventEmitter = new EventEmitter2();

  // ── 1. Set up tournament logger ─────────────────────────────────────────
  const tournamentLogger = new TournamentLoggerService();

  const presets = PERSONALITY_PRESETS.slice(0, BOT_COUNT);
  const participants = presets.map((preset, i) => ({
    elo: 1000 + i * 50,
    dna: {
      version: 1 as const,
      tier: "quick" as const,
      personality: preset.personality,
    },
  }));

  tournamentLogger.initialize(tournamentId, participants);

  // ── 2. Create game instance ─────────────────────────────────────────────
  const game = new GameInstance(silentLogger, eventEmitter, {
    tableId,
    gameId,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    startingChips: STARTING_CHIPS,
    sleepMs: 0, // turbo — no animation delays
  });

  // ── 3. Wire logger to game events ───────────────────────────────────────
  game.setActionLogger((entry) => tournamentLogger.recordAction(entry));

  eventEmitter.on(
    "game.handStarted",
    (event: { handNumber: number; dealerBotId: string; players?: Array<{ id: string; chips: bigint | number }>; holeCards?: Record<string, string[]> }) => {
      const initialStacks: Record<string, number> = {};
      for (const p of event.players ?? []) {
        initialStacks[p.id] = Number(p.chips);
      }
      tournamentLogger.onHandStarted(event.handNumber, event.dealerBotId, initialStacks, event.holeCards ?? {});
    },
  );

  eventEmitter.on(
    "game.handComplete",
    (event: { communityCards: any[] }) => {
      const cards: string[] = (event.communityCards ?? []).map((c: any) =>
        typeof c === "string" ? c : `${c.rank}${c.suit?.[0] ?? ""}`,
      );
      tournamentLogger.onHandComplete(cards);
    },
  );

  // ── 4. Add bots ─────────────────────────────────────────────────────────
  presets.forEach((preset, i) => {
    game.addPlayer({
      id: `bot-${i}`,
      name: preset.name,
      strategy: { version: 1, tier: "quick", personality: preset.personality },
      chips: STARTING_CHIPS,
    });
  });

  // ── 5. Run game ─────────────────────────────────────────────────────────
  let handsPlayed = 0;
  eventEmitter.on("game.handComplete", () => {
    handsPlayed++;
    process.stdout.write(`\rHands played: ${handsPlayed}`);
  });

  console.log(`Starting demo tournament ${tournamentId} with ${BOT_COUNT} bots...`);
  await game.startGame();
  console.log(`\nGame finished after ${handsPlayed} hands.`);

  // ── 6. Write log ─────────────────────────────────────────────────────────
  const outPath = `logs/tournaments/${tournamentId}.json`;
  await tournamentLogger.writeToFile(outPath);

  const log = tournamentLogger.serialize();
  const totalActions = log.hands.reduce((sum, h) => sum + h.actions.length, 0);

  console.log(`\nMaster Tournament Log written to: ${outPath}`);
  console.log(`  Hands logged : ${log.hands.length}`);
  console.log(`  Total actions: ${totalActions}`);
  console.log(`  Participants : ${log.tournament_summary.participants.map((p) => p.bot_name).join(", ")}`);

  // Print a sample action for inspection
  const sampleAction = log.hands[0]?.actions[0];
  if (sampleAction) {
    console.log("\n── Sample action (hand 1, first decision) ──────────────────");
    console.log(JSON.stringify(sampleAction, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
