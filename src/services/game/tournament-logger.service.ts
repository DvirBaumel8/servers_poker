/**
 * TournamentLoggerService
 * =======================
 * Collects per-decision state snapshots during a tournament and serialises
 * them to a lean MasterTournamentLog JSON.
 *
 * Usage:
 *   1. Call initialize() once with tournament meta-data.
 *   2. Wire onHandStarted() to game.handStarted (pass initial stacks + tableId).
 *   3. Wire onHandComplete() to game.handComplete (pass final community cards + tableId + finalStacks).
 *   4. Wire recordAction() to GameInstance.setActionLogger().
 *   5. Call writeToFile() (or serialize()) when the tournament finishes.
 *
 * Multi-table safety: hands are keyed by tableId so concurrent tables
 * never clobber each other's in-progress hand.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import type { BotPayload } from "../../modules/bot-strategy/strategy-engine.service";
import type { StrategyEvaluation } from "../../domain/bot-strategy/strategy.types";
import type {
  MasterTournamentLog,
  TournamentLogSummary,
  ParticipantInfo,
  HandLog,
  ActionLog,
  ActionMetrics,
  StreetCode,
} from "./tournament-log.types";
import { validateHand } from "./tournament-log-validators";

interface InternalGamePlayer {
  id: string;
  chips: bigint;
  folded: boolean;
  allIn: boolean;
}

// ─── Street abbreviation map ──────────────────────────────────────────────────

const STREET_CODE: Record<string, StreetCode> = {
  preflop: "p",
  flop: "f",
  turn: "t",
  river: "r",
};

function toStreetCode(stage: string): StreetCode {
  return STREET_CODE[stage.toLowerCase()] ?? "p";
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class TournamentLoggerService {
  private summary!: TournamentLogSummary;
  private hands: HandLog[] = [];
  /** In-progress hands keyed by tableId — prevents multi-table clobbering. */
  private currentHands: Map<string, HandLog> = new Map();

  initialize(tournamentId: string, participants: ParticipantInfo[]): void {
    this.summary = {
      id: tournamentId,
      timestamp: new Date().toISOString(),
      participants,
    };
    this.hands = [];
    this.currentHands.clear();
  }

  /**
   * Called when a new hand begins (from game.handStarted event).
   *
   * @param handNumber    Hand sequence number within the game
   * @param dealerBotId   Id of the player in the dealer seat
   * @param initialStacks Chip counts per player id BEFORE blinds/antes
   * @param holeCards     Dealt hole cards per player id
   * @param tableId       Table identifier (for multi-table tournaments)
   */
  onHandStarted(
    handNumber: number,
    dealerBotId: string,
    initialStacks: Record<string, number> = {},
    holeCards: Record<string, string[]> = {},
    tableId: string = "",
  ): void {
    // Flush any previous hand for THIS table that wasn't explicitly closed
    const prev = this.currentHands.get(tableId);
    if (prev) {
      this.hands.push(prev);
    }

    // Data integrity check: initial_stacks of this hand must match
    // final_stacks of the previous hand on the same table.
    const lastHand = this.findLastHandForTable(tableId);
    if (lastHand?.final_stacks && Object.keys(initialStacks).length > 0) {
      for (const [pid, stack] of Object.entries(initialStacks)) {
        const prevStack = lastHand.final_stacks[pid];
        if (prevStack !== undefined && prevStack !== stack) {
          console.error(
            `[DataIntegrityError] Tournament log: table=${tableId} hand=${handNumber} ` +
              `player=${pid} initial_stacks=${stack} !== prev final_stacks=${prevStack}`,
          );
        }
      }
    }

    const hand: HandLog = {
      hand_id: crypto.randomUUID(),
      hand_number: handNumber,
      table_id: tableId,
      dealer_bot_id: dealerBotId,
      board: [],
      initial_stacks: initialStacks,
      hole_cards: { ...holeCards },
      actions: [],
    };
    this.currentHands.set(tableId, hand);
  }

  /**
   * Called from the ActionLoggerCallback on every bot decision.
   * Captures the engine reasoning at decision time in lean format.
   */
  recordAction(entry: {
    actionSeq: number;
    playerId: string;
    payload: BotPayload;
    evaluation: StrategyEvaluation;
    allPlayers: InternalGamePlayer[];
    tableId?: string;
  }): void {
    const hand = this.currentHands.get(entry.tableId ?? "");
    if (!hand) {
      console.warn(
        `[TournamentLogger] recordAction: no active hand for tableId="${entry.tableId}" seq=${entry.actionSeq} player=${entry.playerId} — action dropped`,
      );
      return;
    }

    // Schema guard: reject actions from players not seated in this hand
    if (
      Object.keys(hand.initial_stacks).length > 0 &&
      !(entry.playerId in hand.initial_stacks)
    ) {
      console.warn(
        `[TournamentLogger] recordAction: player="${entry.playerId}" not in initial_stacks ` +
          `for tableId="${entry.tableId}" hand=${hand.hand_number} — action rejected`,
      );
      return;
    }

    const { actionSeq, playerId, payload, evaluation } = entry;

    // Keep the board up-to-date (cumulative — always carry latest community cards)
    this.updateBoard(payload.table.communityCards, hand);

    // Build lean metrics
    const sw = evaluation.metrics?.strategyWeights;
    const metrics: ActionMetrics = {
      eq: evaluation.metrics?.equity ?? 0,
      w: sw
        ? [
            parseFloat(sw.fold.toFixed(4)),
            parseFloat(sw.call.toFixed(4)),
            parseFloat(sw.raise.toFixed(4)),
          ]
        : null,
      source: evaluation.source,
      rule_id: evaluation.ruleId,
      hand_notation: evaluation.handNotation,
    };

    const actionLog: ActionLog = {
      seq: actionSeq,
      p_id: playerId,
      position: payload.you.position || "unknown",
      st: toStreetCode(payload.stage),
      dec: evaluation.action.type,
      ...(evaluation.action.amount != null && {
        amt: evaluation.action.amount,
      }),
      metrics,
    };

    hand.actions.push(actionLog);

    // Capture hole cards on first action by this player in the hand
    if (payload.you.holeCards?.length === 2) {
      if (!hand.hole_cards?.[playerId]) {
        if (!hand.hole_cards) hand.hole_cards = {};
        hand.hole_cards[playerId] = [...payload.you.holeCards];
      }
    }
  }

  /**
   * Called from game.handComplete to close the current hand entry.
   *
   * @param communityCards Final community cards
   * @param tableId        Table identifier
   * @param finalStacks    Chip counts per player id AFTER pots are awarded
   */
  onHandComplete(
    communityCards: string[],
    tableId: string = "",
    finalStacks: Record<string, number> = {},
    winners?: Array<{
      playerId: string;
      amount: bigint | number;
      hand?: { name: string };
    }>,
  ): void {
    const hand = this.currentHands.get(tableId);
    if (!hand) {
      console.warn(
        `[TournamentLogger] onHandComplete: no active hand for tableId="${tableId}" — hand completion dropped`,
      );
      return;
    }
    this.updateBoard(communityCards, hand);
    hand.final_stacks = finalStacks;

    // Capture winners
    if (winners && winners.length > 0) {
      hand.winners = winners.map((w) => ({
        p_id: w.playerId,
        amt: Number(w.amount),
        ...(w.hand?.name && { hand_name: w.hand.name }),
      }));
    }

    // Sort actions by sequence number (defense-in-depth)
    hand.actions.sort((a, b) => a.seq - b.seq);

    // Validate hand integrity (log-only — still persist even if corrupt)
    const validationErrors = validateHand(hand);
    if (validationErrors.length > 0) {
      for (const err of validationErrors) {
        console.error(
          `[HandValidation] ${err.severity.toUpperCase()} table=${tableId} hand=${hand.hand_number} ` +
            `rule="${err.rule}": ${err.message}`,
          err.details ?? "",
        );
      }
    }

    this.hands.push(hand);
    this.currentHands.delete(tableId);
  }

  serialize(): MasterTournamentLog {
    // Flush any hands still open (e.g. tournament ended mid-hand)
    for (const hand of this.currentHands.values()) {
      hand.actions.sort((a, b) => a.seq - b.seq);
      this.hands.push(hand);
    }
    this.currentHands.clear();
    return {
      tournament_summary: this.summary,
      hands: this.hands,
    };
  }

  async writeToFile(outputPath: string): Promise<void> {
    const log = this.serialize();
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(log, null, 2), "utf8");
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Replace board array with the latest community cards. */
  private updateBoard(communityCards: string[], hand: HandLog): void {
    if (communityCards.length === 0) return;
    hand.board = [...communityCards];
  }

  /** Find the most recently completed hand for a given table. */
  private findLastHandForTable(tableId: string): HandLog | null {
    for (let i = this.hands.length - 1; i >= 0; i--) {
      if (this.hands[i].table_id === tableId) return this.hands[i];
    }
    return null;
  }
}
