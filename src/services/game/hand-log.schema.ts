/**
 * Runtime Zod Schema — Hand History JSON
 * ========================================
 * Validates hand log JSON at the system boundary (when logs are ingested
 * for replay or audit). TypeScript types are compile-time only; this schema
 * catches corrupt data from real incidents (e.g. hand_6.json) before it
 * reaches the UI or the validator pipeline.
 *
 * Usage:
 *   const result = safeParseHandLog(rawJson)
 *   if (!result.ok) console.error(result.errors)
 *
 *   const hand = parseHandLog(rawJson) // throws ZodError on invalid input
 */

import { z } from "zod";
import type { HandLog, MasterTournamentLog } from "./tournament-log.types";

// ─── Primitive schemas ────────────────────────────────────────────────────────

/**
 * Valid decision values a bot can take.
 * Rejects free-text strings like "limp" that would pass TypeScript's `string`.
 */
const DecisionSchema = z.enum(["fold", "check", "call", "raise", "all_in"]);

/**
 * Single-char street codes.
 * p = preflop, f = flop, t = turn, r = river.
 */
const StreetCodeSchema = z.enum(["p", "f", "t", "r"]);

// ─── Action metrics ───────────────────────────────────────────────────────────

const ActionMetricsSchema = z.object({
  /**
   * Estimated win probability [0, 1] at decision time.
   * 0 is technically valid if the engine had no equity data (flagged separately
   * by the equity_bounds validator for players with dealt cards).
   */
  eq: z.number().min(0).max(1),
  /**
   * Normalised [fold, call, raise] distribution when source = "Personality".
   * null for deterministic paths (Hard Rule, Range Chart).
   */
  w: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  /** Evaluation path that produced this decision. */
  source: z.string().min(1),
  rule_id: z.string().optional(),
  hand_notation: z.string().optional(),
});

// ─── Action log ───────────────────────────────────────────────────────────────

const ActionLogSchema = z
  .object({
    /**
     * Monotonically increasing sequence number (global across the game instance).
     * Cross-table action bleed corrupts this — the sequence monotonicity validator
     * catches the interleaving, but the schema ensures the field is always present.
     */
    seq: z.number().int().min(0),
    /** Player (bot) id — must exist in the hand's initial_stacks. */
    p_id: z.string().min(1),
    /** Seat position at decision time (BTN | SB | BB | UTG | CO | HJ | MP …). */
    position: z.string().min(1),
    /** Street code: p=preflop, f=flop, t=turn, r=river. */
    st: StreetCodeSchema,
    /**
     * Action taken.
     * @remarks Only the five canonical values are accepted.
     * Storing any other string (e.g. "limp", "straddle") is a schema violation.
     */
    dec: DecisionSchema,
    /**
     * Chip amount for raise/all_in actions; must be positive when present.
     * Absent for fold/check/call.
     */
    amt: z.number().int().positive().optional(),
    metrics: ActionMetricsSchema,
  })
  .superRefine((action, ctx) => {
    // Raise and all_in must carry a positive amount.
    if (
      (action.dec === "raise" || action.dec === "all_in") &&
      action.amt == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amt"],
        message: `Action dec="${action.dec}" at seq=${action.seq} must include a positive amt`,
      });
    }
    // Fold/check must not carry an amount (would indicate logging error).
    if (
      (action.dec === "fold" || action.dec === "check") &&
      action.amt != null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amt"],
        message: `Action dec="${action.dec}" at seq=${action.seq} must not include amt`,
      });
    }
  });

// ─── Hand log ─────────────────────────────────────────────────────────────────

export const HandLogSchema = z
  .object({
    hand_id: z.string().uuid(),
    hand_number: z.number().int().min(1),
    table_id: z.string(),
    dealer_bot_id: z.string().min(1),
    /**
     * Community cards in deal order.
     * 0 (preflop only), 3 (flop), 4 (turn), or 5 (river) are the valid counts.
     */
    board: z.array(z.string()),
    /**
     * Chip counts for every seated player BEFORE blinds/antes.
     * Must be non-empty (at least 2 players) and all values must be positive.
     *
     * @remarks This is the primary player roster for a hand. A player present
     * here but absent from hole_cards simply had their cards mucked or the log
     * was recorded before showdown. The reverse (hole_cards player not in
     * initial_stacks) is a "ghost player" corruption — caught by
     * checkHoleCardPlayerMembership.
     */
    initial_stacks: z
      .record(z.string(), z.number().int().min(0))
      .refine((s) => Object.keys(s).length >= 2, {
        message: "initial_stacks must have at least 2 players",
      }),
    /**
     * Chip counts AFTER pots are awarded.
     * Optional — absent for in-progress or abandoned hands.
     */
    final_stacks: z.record(z.string(), z.number().int().min(0)).optional(),
    /**
     * Hole cards per player id.
     * When present, every key must exist in initial_stacks (ghost-player check).
     * Each player must have exactly 2 cards.
     */
    hole_cards: z.record(z.string(), z.array(z.string()).length(2)).optional(),
    winners: z
      .array(
        z.object({
          p_id: z.string().min(1),
          amt: z.number().int().min(0),
          hand_name: z.string().optional(),
        }),
      )
      .optional(),
    actions: z.array(ActionLogSchema),
  })
  .superRefine((hand, ctx) => {
    // Ghost-player check at schema level: hole_cards players must be in initial_stacks.
    if (hand.hole_cards) {
      const stackKeys = new Set(Object.keys(hand.initial_stacks));
      for (const pid of Object.keys(hand.hole_cards)) {
        if (!stackKeys.has(pid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["hole_cards", pid],
            message: `hole_cards contains player "${pid}" not in initial_stacks — possible cross-table data bleed`,
          });
        }
      }
    }

    // If hand has declared winners, final_stacks must be present (completed hand).
    if (hand.winners && hand.winners.length > 0 && !hand.final_stacks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["final_stacks"],
        message:
          "Hand has winners but final_stacks is absent — chip conservation cannot be verified",
      });
    }
  });

// ─── Master tournament log ────────────────────────────────────────────────────

export const MasterTournamentLogSchema = z.object({
  tournament_summary: z.object({
    id: z.string().min(1),
    timestamp: z.string().min(1),
    participants: z.array(
      z.object({
        botId: z.string().optional(),
        botName: z.string().optional(),
        userName: z.string().optional(),
        elo: z.number(),
        dna: z.unknown(),
      }),
    ),
  }),
  hands: z.array(HandLogSchema),
});

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SafeParseResult {
  ok: true;
  data: HandLog;
}

export interface SafeParseFailure {
  ok: false;
  errors: string[];
}

/**
 * Safely parse and validate a raw JSON value as a HandLog.
 * Never throws — returns `{ ok: false, errors }` on failure.
 *
 * @example
 * const result = safeParseHandLog(rawJson)
 * if (!result.ok) {
 *   console.error('Hand rejected:', result.errors)
 * }
 */
export function safeParseHandLog(
  raw: unknown,
): SafeParseResult | SafeParseFailure {
  const result = HandLogSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data as HandLog };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return { ok: false, errors };
}

/**
 * Parse and validate a raw JSON value as a HandLog, throwing on failure.
 * Use at hard trust boundaries where invalid data must abort processing.
 *
 * @throws {z.ZodError} When the input does not conform to HandLogSchema
 */
export function parseHandLog(raw: unknown): HandLog {
  return HandLogSchema.parse(raw) as HandLog;
}

/**
 * Safely parse a full MasterTournamentLog.
 * Use when loading a log file for replay or audit.
 */
export function safeParseTournamentLog(
  raw: unknown,
): { ok: true; data: MasterTournamentLog } | { ok: false; errors: string[] } {
  const result = MasterTournamentLogSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data as MasterTournamentLog };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return { ok: false, errors };
}
