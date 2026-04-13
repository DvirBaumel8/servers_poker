/**
 * Tournament Hand Log Validators
 * ===============================
 * Shared validation for HandLog records. Runs at persist time in
 * TournamentLoggerService.onHandComplete() and can also be used
 * client-side for replay integrity checks.
 */

import type { HandLog } from "./tournament-log.types";

export interface HandValidationError {
  rule: string;
  severity: "error" | "warning";
  message: string;
  details?: Record<string, unknown>;
}

/** Minimum equity any dealt hand can have — no hand is truly 0%. */
export const MIN_EQUITY = 0.0001;

/**
 * Validate a completed hand log. Returns an empty array if the hand is clean.
 *
 * Runs all structural and integrity checks in a single pass. Errors are
 * collected rather than thrown so the caller can log all violations at once
 * before deciding whether to persist or discard the hand.
 *
 * @param hand - The completed hand log to validate
 * @returns Array of validation errors; empty means the hand is clean
 */
export function validateHand(hand: HandLog): HandValidationError[] {
  const errors: HandValidationError[] = [];
  errors.push(...checkActionPlayerMembership(hand));
  errors.push(...checkHoleCardPlayerMembership(hand));
  errors.push(...checkInitialStacksMatchHoleCards(hand));
  errors.push(...checkActionSequenceMonotonicity(hand));
  errors.push(...checkChipConservation(hand));
  errors.push(...checkFinalStacksPresent(hand));
  errors.push(...checkAmountValidity(hand));
  errors.push(...checkNoDuplicateCards(hand));
  errors.push(...checkEquityBounds(hand));
  return errors;
}

/**
 * Every action's p_id must exist in initial_stacks.
 * Skipped when initial_stacks is empty (legacy data).
 */
function checkActionPlayerMembership(hand: HandLog): HandValidationError[] {
  const stacks = hand.initial_stacks;
  if (!stacks || Object.keys(stacks).length === 0) return [];

  const errors: HandValidationError[] = [];
  for (const action of hand.actions) {
    if (!(action.p_id in stacks)) {
      errors.push({
        rule: "action_player_membership",
        severity: "error",
        message: `Action seq=${action.seq} has p_id="${action.p_id}" not in initial_stacks`,
        details: {
          seq: action.seq,
          p_id: action.p_id,
          known_players: Object.keys(stacks),
        },
      });
    }
  }
  return errors;
}

/**
 * Actions must be sorted by seq (monotonically increasing).
 */
function checkActionSequenceMonotonicity(hand: HandLog): HandValidationError[] {
  const errors: HandValidationError[] = [];
  for (let i = 1; i < hand.actions.length; i++) {
    if (hand.actions[i].seq <= hand.actions[i - 1].seq) {
      errors.push({
        rule: "action_sequence_monotonicity",
        severity: "error",
        message: `Actions not monotonically increasing: seq ${hand.actions[i - 1].seq} followed by ${hand.actions[i].seq}`,
        details: {
          index: i,
          prev_seq: hand.actions[i - 1].seq,
          curr_seq: hand.actions[i].seq,
        },
      });
      break; // Report first violation only
    }
  }
  return errors;
}

/**
 * Total chips must be conserved: sum(initial_stacks) === sum(final_stacks).
 * Skipped when either is missing.
 */
function checkChipConservation(hand: HandLog): HandValidationError[] {
  if (
    !hand.initial_stacks ||
    !hand.final_stacks ||
    Object.keys(hand.initial_stacks).length === 0 ||
    Object.keys(hand.final_stacks).length === 0
  ) {
    return [];
  }

  const initialSum = Object.values(hand.initial_stacks).reduce(
    (a, b) => a + b,
    0,
  );
  const finalSum = Object.values(hand.final_stacks).reduce((a, b) => a + b, 0);

  if (initialSum !== finalSum) {
    return [
      {
        rule: "chip_conservation",
        severity: "error",
        message: `Chip conservation violated: initial=${initialSum} final=${finalSum} delta=${finalSum - initialSum}`,
        details: { initialSum, finalSum, delta: finalSum - initialSum },
      },
    ];
  }
  return [];
}

/**
 * Every player in hole_cards must exist in initial_stacks.
 * Catches "ghost player" corruption where cards leak from another table.
 * Skipped when initial_stacks is empty (legacy data).
 */
function checkHoleCardPlayerMembership(hand: HandLog): HandValidationError[] {
  const stacks = hand.initial_stacks;
  if (!stacks || Object.keys(stacks).length === 0) return [];
  if (!hand.hole_cards) return [];

  const errors: HandValidationError[] = [];
  const stackKeys = new Set(Object.keys(stacks));
  const holeCardKeys = Object.keys(hand.hole_cards);

  for (const pid of holeCardKeys) {
    if (!stackKeys.has(pid)) {
      errors.push({
        rule: "hole_card_player_membership",
        severity: "error",
        message: `hole_cards contains player "${pid}" not in initial_stacks (${stackKeys.size} stacks vs ${holeCardKeys.length} hole_cards)`,
        details: {
          ghost_player: pid,
          initial_stacks_count: stackKeys.size,
          hole_cards_count: holeCardKeys.length,
        },
      });
    }
  }
  return errors;
}

/**
 * No card should appear more than once across all hole_cards and the board.
 */
function checkNoDuplicateCards(hand: HandLog): HandValidationError[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const card of hand.board ?? []) {
    if (seen.has(card)) duplicates.push(card);
    seen.add(card);
  }

  if (hand.hole_cards) {
    for (const cards of Object.values(hand.hole_cards)) {
      for (const card of cards) {
        if (seen.has(card)) duplicates.push(card);
        seen.add(card);
      }
    }
  }

  if (duplicates.length > 0) {
    return [
      {
        rule: "no_duplicate_cards",
        severity: "error",
        message: `Duplicate cards found: ${duplicates.join(", ")}`,
        details: { duplicates },
      },
    ];
  }
  return [];
}

/**
 * Bidirectional count check: hole_cards count must not exceed initial_stacks count.
 *
 * @remarks
 * `checkHoleCardPlayerMembership` already catches ghost players (hole_cards
 * player not in initial_stacks). This validator adds a fast-fail count check
 * and validates that each player in hole_cards has exactly 2 cards — catching
 * partial card deals or logging errors before the per-player membership loop
 * runs. The hand_6.json corruption had 8 players in hole_cards vs 4 in
 * initial_stacks; this rule fires first and surfaces the count mismatch
 * explicitly.
 *
 * @param hand - Hand log to inspect
 * @returns Errors if hole_cards count exceeds initial_stacks or a player has ≠2 cards
 */
function checkInitialStacksMatchHoleCards(
  hand: HandLog,
): HandValidationError[] {
  if (!hand.hole_cards || Object.keys(hand.initial_stacks).length === 0)
    return [];

  const errors: HandValidationError[] = [];
  const stackCount = Object.keys(hand.initial_stacks).length;
  const holeCount = Object.keys(hand.hole_cards).length;

  if (holeCount > stackCount) {
    errors.push({
      rule: "initial_stacks_match_hole_cards",
      severity: "error",
      message: `hole_cards has ${holeCount} players but initial_stacks only has ${stackCount} — cross-table data bleed likely`,
      details: {
        hole_cards_count: holeCount,
        initial_stacks_count: stackCount,
      },
    });
  }

  for (const [pid, cards] of Object.entries(hand.hole_cards)) {
    if (cards.length !== 2) {
      errors.push({
        rule: "initial_stacks_match_hole_cards",
        severity: "error",
        message: `Player "${pid}" has ${cards.length} hole cards — expected exactly 2`,
        details: { p_id: pid, card_count: cards.length },
      });
    }
  }

  return errors;
}

/**
 * If a hand has declared winners, final_stacks must also be present.
 *
 * @remarks
 * A hand with winners but no final_stacks means the pot was awarded but the
 * chip state was never recorded. This makes chip conservation verification
 * impossible and creates a gap in the audit trail. The chip_conservation
 * validator silently skips when final_stacks is absent, so this rule makes
 * the gap explicit rather than quietly bypassing the conservation check.
 *
 * @param hand - Hand log to inspect
 * @returns Error if winners exist but final_stacks is missing
 */
function checkFinalStacksPresent(hand: HandLog): HandValidationError[] {
  if (hand.winners && hand.winners.length > 0 && !hand.final_stacks) {
    return [
      {
        rule: "final_stacks_present",
        severity: "error",
        message: `Hand has ${hand.winners.length} winner(s) but final_stacks is absent — chip conservation cannot be verified`,
        details: { winner_count: hand.winners.length },
      },
    ];
  }
  return [];
}

/**
 * Validate that action amounts are structurally correct.
 *
 * @remarks
 * - raise/all_in must carry a positive `amt` (zero or missing means the logger
 *   failed to record the bet size).
 * - fold/check must NOT carry `amt` (would indicate a logging error where
 *   passive actions were mis-tagged as bets).
 * - call is intentionally not validated: the call amount is typically absent
 *   because the logger omits it (amount is inferred from the pot level).
 *
 * @param hand - Hand log to inspect
 * @returns Errors for any action with an invalid amount
 */
function checkAmountValidity(hand: HandLog): HandValidationError[] {
  const errors: HandValidationError[] = [];

  for (const action of hand.actions) {
    if (action.dec === "raise" || action.dec === "all_in") {
      if (action.amt == null || action.amt <= 0) {
        errors.push({
          rule: "amount_validity",
          severity: "error",
          message: `Action dec="${action.dec}" seq=${action.seq} p_id="${action.p_id}" must have a positive amt (got ${action.amt ?? "absent"})`,
          details: { seq: action.seq, dec: action.dec, amt: action.amt },
        });
      }
    }
    if (
      (action.dec === "fold" || action.dec === "check") &&
      action.amt != null
    ) {
      errors.push({
        rule: "amount_validity",
        severity: "error",
        message: `Action dec="${action.dec}" seq=${action.seq} p_id="${action.p_id}" must not have amt (got ${action.amt})`,
        details: { seq: action.seq, dec: action.dec, amt: action.amt },
      });
    }
  }

  return errors;
}

/**
 * Every action's equity must be > 0 when the player has hole cards.
 * A dealt hand always has non-zero equity — exactly 0 means the engine
 * skipped computation or hit a bug.
 */
function checkEquityBounds(hand: HandLog): HandValidationError[] {
  const errors: HandValidationError[] = [];

  for (const action of hand.actions) {
    const eq = action.metrics?.eq;
    if (eq !== undefined && eq !== null && eq === 0) {
      // Only flag if this player actually has hole cards (i.e. was dealt in)
      const hasCards =
        hand.hole_cards?.[action.p_id] &&
        hand.hole_cards[action.p_id].length === 2;
      if (hasCards) {
        errors.push({
          rule: "equity_bounds",
          severity: "warning",
          message: `Action seq=${action.seq} p_id="${action.p_id}" has equity=0 with dealt hole cards — engine may have skipped computation`,
          details: {
            seq: action.seq,
            p_id: action.p_id,
            equity: eq,
            source: action.metrics?.source,
          },
        });
      }
    }
  }
  return errors;
}
