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
 */
export function validateHand(hand: HandLog): HandValidationError[] {
  const errors: HandValidationError[] = [];
  errors.push(...checkActionPlayerMembership(hand));
  errors.push(...checkHoleCardPlayerMembership(hand));
  errors.push(...checkActionSequenceMonotonicity(hand));
  errors.push(...checkChipConservation(hand));
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
