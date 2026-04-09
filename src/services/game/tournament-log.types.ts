/**
 * Master Tournament Log — Lean Type Definitions
 *
 * Optimised for minimal JSON size. Redundant and derived fields are removed;
 * keys are abbreviated; street values are single-character codes.
 *
 * Abbreviation reference:
 *   p_id   — player id
 *   st     — street  ('p' preflop | 'f' flop | 't' turn | 'r' river)
 *   dec    — bot decision type (fold | check | call | raise | all_in)
 *   amt    — raise/bet amount in chips
 *   eq     — estimated win equity [0,1]
 *   w      — strategy weights array [fold, call, raise] (null for rule/range paths)
 */

import type { BotStrategy } from "../../domain/bot-strategy/strategy.types";

// ─── Top-level log ────────────────────────────────────────────────────────────

export interface MasterTournamentLog {
  tournament_summary: TournamentLogSummary;
  hands: HandLog[];
}

// ─── Tournament summary ───────────────────────────────────────────────────────

export interface TournamentLogSummary {
  id: string;
  timestamp: string; // ISO-8601, start of tournament
  participants: ParticipantInfo[];
}

export interface ParticipantInfo {
  botId: string;
  botName: string;
  userName: string;
  elo: number;
  /** Full strategy config (DNA) at tournament start */
  dna: BotStrategy;
}

// ─── Hand ─────────────────────────────────────────────────────────────────────

export interface HandLog {
  hand_id: string; // stable UUID generated when hand starts
  hand_number: number;
  /** Table that played this hand (needed for multi-table tournament replays). */
  table_id: string;
  dealer_bot_id: string;
  /** Community cards in deal order (0–5 elements). Empty until flop. */
  board: string[];
  /**
   * Chip counts for every seated player at the START of this hand,
   * before any blinds or antes are posted.
   * Keys are bot/player ids.
   */
  initial_stacks: Record<string, number>;
  /**
   * Chip counts for every seated player at the END of this hand,
   * after pots are awarded. Used for state continuity verification.
   */
  final_stacks?: Record<string, number>;
  /** Hole cards per player id, captured on first action. e.g. { "bot-uuid": ["Ah","Kd"] } */
  hole_cards?: Record<string, string[]>;
  /** Winner(s) of this hand. Multiple entries for split pots. */
  winners?: WinnerEntry[];
  actions: ActionLog[];
}

// ─── Action (lean "Black Box" entry) ─────────────────────────────────────────

export type StreetCode = "p" | "f" | "t" | "r";

export interface ActionLog {
  /** Monotonically increasing sequence number from GameInstance.actionSeq */
  seq: number;
  /** Player (bot) id */
  p_id: string;
  /** Seat position at decision time (BTN | SB | BB | UTG | CO | HJ | MP …) */
  position: string;
  /** Street code: p=preflop, f=flop, t=turn, r=river */
  st: StreetCode;
  /** Action taken: fold | check | call | raise | all_in */
  dec: string;
  /** Amount in chips for raise/all_in actions; absent for check/call/fold */
  amt?: number;
  metrics: ActionMetrics;
}

// ─── Winner ──────────────────────────────────────────────────────────────────

export interface WinnerEntry {
  /** Player (bot) id */
  p_id: string;
  /** Amount won in chips */
  amt: number;
  /** Winning hand name (e.g. "Full House"), absent for fold-wins */
  hand_name?: string;
}

export interface ActionMetrics {
  /** Estimated win probability [0,1] at decision time */
  eq: number;
  /**
   * Normalised [fold, call, raise] distribution when source = "Personality".
   * null for deterministic paths (Hard Rule, Range Chart).
   */
  w: [number, number, number] | null;
  /** Which evaluation path produced this decision */
  source: string; // "Hard Rule" | "Personality" | "Range Chart" | "Position Override"
  /** Rule id when source = "Hard Rule" */
  rule_id?: string;
  /** Hand notation when source = "Range Chart" (e.g. "AKo", "QJs") */
  hand_notation?: string;
}
