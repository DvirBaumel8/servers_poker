/**
 * TournamentLoggerService
 * =======================
 * Collects per-decision state snapshots during a tournament and serialises
 * them to a lean MasterTournamentLog JSON.
 *
 * Usage:
 *   1. Call initialize() once with tournament meta-data.
 *   2. Wire onHandStarted() to game.handStarted (pass initial stacks).
 *   3. Wire onHandComplete() to game.handComplete (pass final community cards).
 *   4. Wire recordAction() to GameInstance.setActionLogger().
 *   5. Call writeToFile() (or serialize()) when the tournament finishes.
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
  private currentHand: HandLog | null = null;

  initialize(tournamentId: string, participants: ParticipantInfo[]): void {
    this.summary = {
      id: tournamentId,
      timestamp: new Date().toISOString(),
      participants,
    };
    this.hands = [];
    this.currentHand = null;
  }

  /**
   * Called when a new hand begins (from game.handStarted event).
   *
   * @param handNumber    Hand sequence number within the game
   * @param dealerBotId   Id of the player in the dealer seat
   * @param initialStacks Chip counts per player id BEFORE blinds/antes
   */
  onHandStarted(
    handNumber: number,
    dealerBotId: string,
    initialStacks: Record<string, number> = {},
  ): void {
    // Flush any previous hand that wasn't explicitly closed
    if (this.currentHand) {
      this.hands.push(this.currentHand);
    }
    this.currentHand = {
      hand_id: crypto.randomUUID(),
      hand_number: handNumber,
      dealer_bot_id: dealerBotId,
      board: [],
      initial_stacks: initialStacks,
      actions: [],
    };
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
  }): void {
    if (!this.currentHand) return;

    const { actionSeq, playerId, payload, evaluation } = entry;

    // Keep the board up-to-date (cumulative — always carry latest community cards)
    this.updateBoard(payload.table.communityCards);

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

    this.currentHand.actions.push(actionLog);
  }

  /** Called from game.handComplete to close the current hand entry. */
  onHandComplete(communityCards: string[]): void {
    if (!this.currentHand) return;
    this.updateBoard(communityCards);
    this.hands.push(this.currentHand);
    this.currentHand = null;
  }

  serialize(): MasterTournamentLog {
    // Flush any hand still open (e.g. tournament ended mid-hand)
    if (this.currentHand) {
      this.hands.push(this.currentHand);
      this.currentHand = null;
    }
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
  private updateBoard(communityCards: string[]): void {
    if (!this.currentHand || communityCards.length === 0) return;
    this.currentHand.board = [...communityCards];
  }
}
