/**
 * Hand History Types — Frontend
 * ==============================
 * Mirrors backend `tournament-log.types.ts`. Keep these in sync manually —
 * any field added to the backend HandLog must be reflected here.
 *
 * Abbreviation reference (preserved from the lean log format):
 *   p_id  — player / bot id
 *   st    — street code ('p' preflop | 'f' flop | 't' turn | 'r' river)
 *   dec   — decision type: fold | check | call | raise | all_in
 *   amt   — raise/bet amount in chips
 *   eq    — estimated win equity [0, 1]
 *   w     — strategy weights [fold, call, raise] (null for deterministic paths)
 */

// ─── Street code ──────────────────────────────────────────────────────────────

/** Single-char street identifier. */
export type StreetCode = "p" | "f" | "t" | "r";

// ─── Action metrics ───────────────────────────────────────────────────────────

export interface ActionMetrics {
  /** Estimated win probability [0, 1] at decision time. */
  eq: number;
  /**
   * Normalised [fold, call, raise] distribution when source = "Personality".
   * null for deterministic paths (Hard Rule, Range Chart).
   */
  w: [number, number, number] | null;
  /** Which evaluation path produced this decision. */
  source: string;
  /** Rule id when source = "Hard Rule". */
  rule_id?: string;
  /** Hand notation when source = "Range Chart" (e.g. "AKo", "QJs"). */
  hand_notation?: string;
}

// ─── Action log ───────────────────────────────────────────────────────────────

export interface ActionLog {
  /** Monotonically increasing sequence number from GameInstance.actionSeq. */
  seq: number;
  /** Player (bot) id. */
  p_id: string;
  /** Seat position at decision time (BTN | SB | BB | UTG | CO | HJ | MP …). */
  position: string;
  /** Street code: p=preflop, f=flop, t=turn, r=river. */
  st: StreetCode;
  /** Action taken: fold | check | call | raise | all_in. */
  dec: string;
  /** Chip amount for raise/all_in; absent for fold/check/call. */
  amt?: number;
  metrics: ActionMetrics;
}

// ─── Hand log ─────────────────────────────────────────────────────────────────

export interface HandLog {
  /** Stable UUID generated when the hand starts. */
  hand_id: string;
  hand_number: number;
  /** Table identifier (needed for multi-table tournament replays). */
  table_id?: string;
  dealer_bot_id: string;
  /** Community cards in deal order (0–5 elements). Empty until flop. */
  board: string[];
  /**
   * Chip counts for every seated player BEFORE blinds/antes are posted.
   * This is the primary player roster for the hand.
   */
  initial_stacks: Record<string, number>;
  /**
   * Chip counts AFTER pots are awarded.
   * Optional — absent for in-progress or abandoned hands.
   */
  final_stacks?: Record<string, number>;
  /**
   * Hole cards per player id.
   * Missing opponents' cards are hidden until showdown.
   * e.g. { "bot-uuid": ["Ah", "Kd"] }
   */
  hole_cards?: Record<string, string[]>;
  /** Winner(s) of this hand. Multiple entries for split pots. */
  winners?: Array<{
    p_id: string;
    amt: number;
    hand_name?: string;
  }>;
  actions: ActionLog[];
}

// ─── Participant ──────────────────────────────────────────────────────────────

export interface ParticipantInfo {
  botId?: string;
  botName?: string;
  userName?: string;
  elo: number;
  dna: { name: string; tier?: string };
}

// ─── Tournament summary ───────────────────────────────────────────────────────

export interface TournamentLogSummary {
  id: string;
  /** ISO-8601 timestamp of tournament start. */
  timestamp: string;
  participants: ParticipantInfo[];
}

// ─── Master log ───────────────────────────────────────────────────────────────

export interface MasterTournamentLog {
  tournament_summary: TournamentLogSummary;
  hands: HandLog[];
}
