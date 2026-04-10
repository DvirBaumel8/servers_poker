import { describe, it, expect } from "vitest";
import {
  validateHand,
  MIN_EQUITY,
  type HandValidationError,
} from "../../src/services/game/tournament-log-validators";
import type { HandLog } from "../../src/services/game/tournament-log.types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCleanHand(overrides: Partial<HandLog> = {}): HandLog {
  return {
    hand_id: "h-1",
    hand_number: 1,
    table_id: "t-1",
    dealer_bot_id: "bot-a",
    board: ["2h", "7c", "Ks"],
    initial_stacks: { "bot-a": 1000, "bot-b": 980 },
    final_stacks: { "bot-a": 1030, "bot-b": 950 },
    hole_cards: { "bot-a": ["Ah", "Kd"], "bot-b": ["Qs", "Jh"] },
    actions: [
      {
        seq: 1,
        p_id: "bot-a",
        position: "BTN",
        st: "p",
        dec: "raise",
        amt: 40,
        metrics: { eq: 0.55, w: [0.2, 0.3, 0.5], source: "Personality" },
      },
      {
        seq: 2,
        p_id: "bot-b",
        position: "BB",
        st: "p",
        dec: "call",
        metrics: { eq: 0.45, w: [0.3, 0.5, 0.2], source: "Personality" },
      },
      {
        seq: 3,
        p_id: "bot-a",
        position: "BTN",
        st: "f",
        dec: "check",
        metrics: { eq: 0.6, w: [0.1, 0.6, 0.3], source: "Personality" },
      },
    ],
    ...overrides,
  };
}

function findByRule(
  errors: HandValidationError[],
  rule: string,
): HandValidationError | undefined {
  return errors.find((e) => e.rule === rule);
}

function findAllByRule(
  errors: HandValidationError[],
  rule: string,
): HandValidationError[] {
  return errors.filter((e) => e.rule === rule);
}

// ─── Unit Tests ─────────────────────────────────────────────────────────────

describe("validateHand", () => {
  it("returns no errors for a valid hand", () => {
    const errors = validateHand(makeCleanHand());
    expect(errors).toHaveLength(0);
  });

  // ─── action_player_membership ──────────────────────────────────────────────

  it("detects actions from players not in initial_stacks", () => {
    const hand = makeCleanHand({
      actions: [
        ...makeCleanHand().actions,
        {
          seq: 4,
          p_id: "ghost-bot",
          position: "SB",
          st: "f",
          dec: "fold",
          metrics: { eq: 0.1, w: null, source: "Personality" },
        },
      ],
    });

    const errors = validateHand(hand);
    const err = findByRule(errors, "action_player_membership");
    expect(err).toBeDefined();
    expect(err!.severity).toBe("error");
    expect(err!.message).toContain("ghost-bot");
    expect(err!.details!.p_id).toBe("ghost-bot");
  });

  it("skips membership check when initial_stacks is empty", () => {
    const hand = makeCleanHand({ initial_stacks: {} });
    const errors = validateHand(hand);
    expect(findByRule(errors, "action_player_membership")).toBeUndefined();
  });

  // ─── hole_card_player_membership ───────────────────────────────────────────

  it("detects hole_cards for players not in initial_stacks", () => {
    const hand = makeCleanHand({
      initial_stacks: { "bot-a": 1000 },
      hole_cards: { "bot-a": ["Ah", "Kd"], "ghost-bot": ["2c", "3s"] },
    });

    const errors = validateHand(hand);
    const err = findByRule(errors, "hole_card_player_membership");
    expect(err).toBeDefined();
    expect(err!.severity).toBe("error");
    expect(err!.message).toContain("ghost-bot");
    expect(err!.details!.initial_stacks_count).toBe(1);
    expect(err!.details!.hole_cards_count).toBe(2);
  });

  it("passes when hole_cards keys match initial_stacks keys", () => {
    const errors = validateHand(makeCleanHand());
    expect(findByRule(errors, "hole_card_player_membership")).toBeUndefined();
  });

  it("skips hole_card check when initial_stacks is empty", () => {
    const hand = makeCleanHand({ initial_stacks: {} });
    const errors = validateHand(hand);
    expect(findByRule(errors, "hole_card_player_membership")).toBeUndefined();
  });

  it("skips hole_card check when hole_cards is missing", () => {
    const hand = makeCleanHand();
    delete hand.hole_cards;
    const errors = validateHand(hand);
    expect(findByRule(errors, "hole_card_player_membership")).toBeUndefined();
  });

  // ─── action_sequence_monotonicity ──────────────────────────────────────────

  it("detects non-monotonic action sequences", () => {
    const hand = makeCleanHand({
      actions: [
        {
          seq: 1,
          p_id: "bot-a",
          position: "BTN",
          st: "p",
          dec: "raise",
          amt: 40,
          metrics: { eq: 0.5, w: null, source: "Personality" },
        },
        {
          seq: 3,
          p_id: "bot-b",
          position: "BB",
          st: "p",
          dec: "call",
          metrics: { eq: 0.5, w: null, source: "Personality" },
        },
        {
          seq: 2,
          p_id: "bot-a",
          position: "BTN",
          st: "f",
          dec: "check",
          metrics: { eq: 0.5, w: null, source: "Personality" },
        },
      ],
    });

    const errors = validateHand(hand);
    const err = findByRule(errors, "action_sequence_monotonicity");
    expect(err).toBeDefined();
    expect(err!.severity).toBe("error");
    expect(err!.details!.prev_seq).toBe(3);
    expect(err!.details!.curr_seq).toBe(2);
  });

  it("passes with strictly increasing sequences", () => {
    const errors = validateHand(makeCleanHand());
    expect(findByRule(errors, "action_sequence_monotonicity")).toBeUndefined();
  });

  it("detects equal (duplicate) sequence numbers", () => {
    const hand = makeCleanHand({
      actions: [
        {
          seq: 1,
          p_id: "bot-a",
          position: "BTN",
          st: "p",
          dec: "raise",
          amt: 40,
          metrics: { eq: 0.5, w: null, source: "Personality" },
        },
        {
          seq: 1,
          p_id: "bot-b",
          position: "BB",
          st: "p",
          dec: "call",
          metrics: { eq: 0.5, w: null, source: "Personality" },
        },
      ],
    });

    const errors = validateHand(hand);
    expect(findByRule(errors, "action_sequence_monotonicity")).toBeDefined();
  });

  // ─── chip_conservation ─────────────────────────────────────────────────────

  it("detects chip conservation violation", () => {
    const hand = makeCleanHand({
      initial_stacks: { "bot-a": 1000, "bot-b": 980 },
      final_stacks: { "bot-a": 1030, "bot-b": 940 }, // sum 1970 vs 1980
    });

    const errors = validateHand(hand);
    const err = findByRule(errors, "chip_conservation");
    expect(err).toBeDefined();
    expect(err!.severity).toBe("error");
    expect(err!.details!.delta).toBe(-10);
  });

  it("catches even a single missing chip", () => {
    const hand = makeCleanHand({
      initial_stacks: { "bot-a": 1000, "bot-b": 980 },
      final_stacks: { "bot-a": 1000, "bot-b": 979 }, // 1 chip missing
    });

    const errors = validateHand(hand);
    const err = findByRule(errors, "chip_conservation");
    expect(err).toBeDefined();
    expect(err!.details!.delta).toBe(-1);
  });

  it("passes when chips are conserved", () => {
    const errors = validateHand(makeCleanHand());
    expect(findByRule(errors, "chip_conservation")).toBeUndefined();
  });

  it("skips chip conservation when final_stacks is missing", () => {
    const hand = makeCleanHand();
    delete hand.final_stacks;
    const errors = validateHand(hand);
    expect(findByRule(errors, "chip_conservation")).toBeUndefined();
  });

  it("skips chip conservation when initial_stacks is empty", () => {
    const hand = makeCleanHand({
      initial_stacks: {},
      final_stacks: { "bot-a": 1000 },
    });
    const errors = validateHand(hand);
    expect(findByRule(errors, "chip_conservation")).toBeUndefined();
  });

  // ─── no_duplicate_cards ────────────────────────────────────────────────────

  it("detects duplicate cards in hole_cards", () => {
    const hand = makeCleanHand({
      hole_cards: {
        "bot-a": ["Ah", "Kd"],
        "bot-b": ["Ah", "Qs"], // Ah duplicated
      },
    });

    const errors = validateHand(hand);
    const err = findByRule(errors, "no_duplicate_cards");
    expect(err).toBeDefined();
    expect(err!.details!.duplicates).toContain("Ah");
  });

  it("detects duplicate cards between board and hole_cards", () => {
    const hand = makeCleanHand({
      board: ["2h", "7c", "Ks"],
      hole_cards: {
        "bot-a": ["Ks", "Qd"], // Ks also on board
      },
    });

    const errors = validateHand(hand);
    const err = findByRule(errors, "no_duplicate_cards");
    expect(err).toBeDefined();
    expect(err!.details!.duplicates).toContain("Ks");
  });

  it("passes with no duplicate cards", () => {
    const errors = validateHand(makeCleanHand());
    expect(findByRule(errors, "no_duplicate_cards")).toBeUndefined();
  });

  it("handles missing hole_cards gracefully", () => {
    const hand = makeCleanHand();
    delete hand.hole_cards;
    const errors = validateHand(hand);
    expect(findByRule(errors, "no_duplicate_cards")).toBeUndefined();
  });

  // ─── equity_bounds ─────────────────────────────────────────────────────────

  it("flags equity=0 when player has dealt hole cards", () => {
    const hand = makeCleanHand({
      hole_cards: { "bot-a": ["T\u2660", "7\u2660"], "bot-b": ["Qs", "Jh"] },
      actions: [
        {
          seq: 1,
          p_id: "bot-a",
          position: "BTN",
          st: "p",
          dec: "call",
          metrics: { eq: 0, w: [0.3, 0.5, 0.2], source: "Personality" },
        },
        {
          seq: 2,
          p_id: "bot-b",
          position: "BB",
          st: "p",
          dec: "check",
          metrics: { eq: 0.45, w: [0.3, 0.5, 0.2], source: "Personality" },
        },
      ],
    });

    const errors = validateHand(hand);
    const err = findByRule(errors, "equity_bounds");
    expect(err).toBeDefined();
    expect(err!.severity).toBe("warning");
    expect(err!.message).toContain("equity=0");
    expect(err!.details!.p_id).toBe("bot-a");
  });

  it("does not flag equity=0 when player has no hole cards", () => {
    const hand = makeCleanHand({
      hole_cards: {}, // no cards dealt
      actions: [
        {
          seq: 1,
          p_id: "bot-a",
          position: "BTN",
          st: "p",
          dec: "fold",
          metrics: { eq: 0, w: null, source: "Personality" },
        },
      ],
    });

    const errors = validateHand(hand);
    expect(findByRule(errors, "equity_bounds")).toBeUndefined();
  });

  it("passes when equity is above the floor", () => {
    const errors = validateHand(makeCleanHand());
    expect(findByRule(errors, "equity_bounds")).toBeUndefined();
  });

  it("MIN_EQUITY constant is exported and non-zero", () => {
    expect(MIN_EQUITY).toBeGreaterThan(0);
    expect(MIN_EQUITY).toBeLessThanOrEqual(0.01);
  });

  // ─── Combined ──────────────────────────────────────────────────────────────

  it("reports multiple violations at once", () => {
    const hand = makeCleanHand({
      initial_stacks: { "bot-a": 1000, "bot-b": 980 },
      final_stacks: { "bot-a": 1000, "bot-b": 970 }, // chip leak
      hole_cards: {
        "bot-a": ["Ah", "Kd"],
        "bot-b": ["Ah", "Qs"], // dup card
      },
      actions: [
        {
          seq: 5,
          p_id: "bot-a",
          position: "BTN",
          st: "p",
          dec: "call",
          metrics: { eq: 0.5, w: null, source: "Personality" },
        },
        {
          seq: 3,
          p_id: "bot-b",
          position: "BB",
          st: "p",
          dec: "fold",
          metrics: { eq: 0.5, w: null, source: "Personality" },
        },
      ],
    });

    const errors = validateHand(hand);
    const rules = errors.map((e) => e.rule);
    expect(rules).toContain("action_sequence_monotonicity");
    expect(rules).toContain("chip_conservation");
    expect(rules).toContain("no_duplicate_cards");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HandValidator Regression Suite — seeded from hand_6.json
//
// These tests use the actual corrupt data from Hand #6 to prove the
// validators catch every class of corruption before it reaches the UI.
// ═══════════════════════════════════════════════════════════════════════════════

describe("HandValidator — hand_6.json regression suite", () => {
  /**
   * Exact reproduction of hand_6.json. This is the corrupt hand as-received.
   * 4 players in initial_stacks, 8 in hole_cards, interleaved seq from two tables.
   */
  const HAND_6: HandLog = {
    hand_id: "dc8e4d46-d4da-473b-8c04-2e1dc7e3bf38",
    hand_number: 3,
    table_id: "",
    dealer_bot_id: "66f4697c-b167-4407-b155-98726b85a8fd",
    board: ["9\u2663", "7\u2660", "K\u2663", "8\u2666"],
    initial_stacks: {
      "01d40eb5-a23d-4191-9b25-bd4df9c4d31c": 4920,
      "66f4697c-b167-4407-b155-98726b85a8fd": 4955,
      "d97dba4e-0331-4fea-a166-fe7a9c275317": 4955,
      "fff7051b-cf5a-48c8-94a5-5bf40d1ac1eb": 4995,
    },
    hole_cards: {
      "01d40eb5-a23d-4191-9b25-bd4df9c4d31c": ["K\u2665", "2\u2665"],
      "2e6a4c62-c1a8-4cd0-9056-0e6813d82c65": ["10\u2660", "A\u2665"],
      "66f4697c-b167-4407-b155-98726b85a8fd": ["4\u2665", "5\u2665"],
      "6d387da6-0dbe-433d-a060-6c0aefa56a33": ["3\u2663", "K\u2660"],
      "997ae1e4-e8ea-40ef-8329-8eedb20ff51d": ["2\u2666", "8\u2665"],
      "cd02276d-8bac-4f7f-81d4-5ff879e56652": ["10\u2663", "7\u2663"],
      "d97dba4e-0331-4fea-a166-fe7a9c275317": ["7\u2663", "Q\u2663"],
      "fff7051b-cf5a-48c8-94a5-5bf40d1ac1eb": ["4\u2663", "3\u2660"],
    },
    actions: [
      {
        st: "p",
        amt: 179,
        dec: "raise",
        seq: 15,
        p_id: "d97dba4e-0331-4fea-a166-fe7a9c275317",
        metrics: {
          w: [0.4925, 0.2365, 0.2711],
          eq: 0.2761,
          source: "Personality",
        },
        position: "UTG",
      },
      {
        st: "t",
        amt: 515,
        dec: "raise",
        seq: 24,
        p_id: "cd02276d-8bac-4f7f-81d4-5ff879e56652",
        metrics: {
          w: [0.1817, 0.5233, 0.295],
          eq: 0.4132,
          source: "Personality",
        },
        position: "BTN",
      },
      {
        st: "p",
        dec: "call",
        seq: 16,
        p_id: "66f4697c-b167-4407-b155-98726b85a8fd",
        metrics: {
          w: [0.2654, 0.5061, 0.2284],
          eq: 0.2305,
          source: "Personality",
        },
        position: "BTN",
      },
      {
        st: "t",
        dec: "call",
        seq: 25,
        p_id: "2e6a4c62-c1a8-4cd0-9056-0e6813d82c65",
        metrics: {
          w: [0.5042, 0.3116, 0.1842],
          eq: 0.2199,
          source: "Personality",
        },
        position: "SB",
      },
      {
        st: "p",
        dec: "fold",
        seq: 17,
        p_id: "fff7051b-cf5a-48c8-94a5-5bf40d1ac1eb",
        metrics: {
          w: [0.8484, 0.1012, 0.0504],
          eq: 0.1577,
          source: "Personality",
        },
        position: "SB",
      },
      {
        st: "t",
        dec: "fold",
        seq: 26,
        p_id: "997ae1e4-e8ea-40ef-8329-8eedb20ff51d",
        metrics: {
          w: [0.2454, 0.5219, 0.2328],
          eq: 0.1938,
          source: "Personality",
        },
        position: "BB",
      },
      {
        st: "p",
        amt: 421,
        dec: "raise",
        seq: 18,
        p_id: "01d40eb5-a23d-4191-9b25-bd4df9c4d31c",
        metrics: {
          w: [0.4605, 0.3073, 0.2322],
          eq: 0.353,
          source: "Personality",
        },
        position: "BB",
      },
      {
        st: "t",
        amt: 1886,
        dec: "raise",
        seq: 27,
        p_id: "6d387da6-0dbe-433d-a060-6c0aefa56a33",
        metrics: {
          w: [0.0266, 0.1543, 0.8191],
          eq: 0.5425,
          source: "Personality",
        },
        position: "UTG",
      },
      {
        st: "p",
        dec: "call",
        seq: 19,
        p_id: "d97dba4e-0331-4fea-a166-fe7a9c275317",
        metrics: {
          w: [0.4778, 0.2462, 0.2761],
          eq: 0.3654,
          source: "Personality",
        },
        position: "UTG",
      },
      {
        st: "t",
        dec: "fold",
        seq: 28,
        p_id: "cd02276d-8bac-4f7f-81d4-5ff879e56652",
        metrics: {
          w: [0.1803, 0.5242, 0.2955],
          eq: 0.5228,
          source: "Personality",
        },
        position: "BTN",
      },
      {
        st: "p",
        amt: 1193,
        dec: "raise",
        seq: 20,
        p_id: "66f4697c-b167-4407-b155-98726b85a8fd",
        metrics: {
          w: [0.256, 0.5126, 0.2314],
          eq: 0.2933,
          source: "Personality",
        },
        position: "BTN",
      },
      {
        st: "t",
        amt: 3883,
        dec: "raise",
        seq: 29,
        p_id: "2e6a4c62-c1a8-4cd0-9056-0e6813d82c65",
        metrics: {
          w: [0.4084, 0.3628, 0.2288],
          eq: 0.492,
          source: "Personality",
        },
        position: "SB",
      },
    ],
  };

  // ─── Test Case 1: Player Count Integrity ─────────────────────────────────

  it("FAILS: 8 hole_cards but only 4 initial_stacks — ghost player corruption", () => {
    const errors = validateHand(HAND_6);
    const ghostErrors = findAllByRule(errors, "hole_card_player_membership");

    // 4 players in hole_cards are NOT in initial_stacks
    expect(ghostErrors.length).toBe(4);

    // Verify the specific ghost player IDs are flagged
    const ghostIds = ghostErrors.map((e) => e.details!.ghost_player);
    expect(ghostIds).toContain("2e6a4c62-c1a8-4cd0-9056-0e6813d82c65");
    expect(ghostIds).toContain("6d387da6-0dbe-433d-a060-6c0aefa56a33");
    expect(ghostIds).toContain("997ae1e4-e8ea-40ef-8329-8eedb20ff51d");
    expect(ghostIds).toContain("cd02276d-8bac-4f7f-81d4-5ff879e56652");
  });

  // ─── Test Case 2: Monotonic Sequence ──────────────────────────────────────

  it("FAILS: interleaved seq (15, 24, 16, 25) — cross-table action bleed", () => {
    const errors = validateHand(HAND_6);
    const seqErr = findByRule(errors, "action_sequence_monotonicity");

    expect(seqErr).toBeDefined();
    expect(seqErr!.severity).toBe("error");
    // seq 15 (preflop) followed by seq 24 (turn) is OK (increasing),
    // but seq 24 followed by seq 16 is NOT
    expect(seqErr!.details!.prev_seq).toBe(24);
    expect(seqErr!.details!.curr_seq).toBe(16);
  });

  // ─── Test Case 3: Action Player Membership ────────────────────────────────

  it("FAILS: turn actions have p_ids not in initial_stacks", () => {
    const errors = validateHand(HAND_6);
    const memberErrors = findAllByRule(errors, "action_player_membership");

    // 6 turn actions from 4 foreign players
    expect(memberErrors.length).toBeGreaterThanOrEqual(6);

    // All foreign p_ids should be flagged
    const flaggedIds = new Set(memberErrors.map((e) => e.details!.p_id));
    expect(flaggedIds.has("cd02276d-8bac-4f7f-81d4-5ff879e56652")).toBe(true);
    expect(flaggedIds.has("2e6a4c62-c1a8-4cd0-9056-0e6813d82c65")).toBe(true);
    expect(flaggedIds.has("997ae1e4-e8ea-40ef-8329-8eedb20ff51d")).toBe(true);
    expect(flaggedIds.has("6d387da6-0dbe-433d-a060-6c0aefa56a33")).toBe(true);
  });

  // ─── Test Case 4: Duplicate Cards ─────────────────────────────────────────

  it("FAILS: 7\u2663 appears in two players' hole cards", () => {
    const errors = validateHand(HAND_6);
    const dupErr = findByRule(errors, "no_duplicate_cards");

    expect(dupErr).toBeDefined();
    expect(dupErr!.severity).toBe("error");
    // 7♣ is in both d97dba4e and cd02276d's hole cards
    expect((dupErr!.details!.duplicates as string[]).length).toBeGreaterThan(0);
  });

  // ─── Meta: the corrupt hand triggers MULTIPLE validators ──────────────────

  it("hand_6.json triggers at least 4 distinct validator rules", () => {
    const errors = validateHand(HAND_6);
    const uniqueRules = new Set(errors.map((e) => e.rule));

    expect(uniqueRules.has("action_player_membership")).toBe(true);
    expect(uniqueRules.has("hole_card_player_membership")).toBe(true);
    expect(uniqueRules.has("action_sequence_monotonicity")).toBe(true);
    expect(uniqueRules.has("no_duplicate_cards")).toBe(true);

    expect(uniqueRules.size).toBeGreaterThanOrEqual(4);
  });

  it("a clean hand produces zero errors — the validators are not over-sensitive", () => {
    const errors = validateHand(makeCleanHand());
    expect(errors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Chip Sum Validation — dedicated precision tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Chip Sum Validation (precision)", () => {
  it("FAILS when exactly 1 chip is missing", () => {
    const hand = makeCleanHand({
      initial_stacks: { "bot-a": 5000, "bot-b": 5000 },
      final_stacks: { "bot-a": 6000, "bot-b": 3999 }, // 9999 vs 10000
    });

    const errors = validateHand(hand);
    const err = findByRule(errors, "chip_conservation");
    expect(err).toBeDefined();
    expect(err!.details!.delta).toBe(-1);
  });

  it("FAILS when 1 extra chip appears", () => {
    const hand = makeCleanHand({
      initial_stacks: { "bot-a": 5000, "bot-b": 5000 },
      final_stacks: { "bot-a": 6000, "bot-b": 4001 }, // 10001 vs 10000
    });

    const errors = validateHand(hand);
    const err = findByRule(errors, "chip_conservation");
    expect(err).toBeDefined();
    expect(err!.details!.delta).toBe(1);
  });

  it("passes with multi-player exact conservation", () => {
    const hand = makeCleanHand({
      initial_stacks: { a: 1000, b: 2000, c: 3000, d: 4000 },
      final_stacks: { a: 500, b: 2500, c: 3500, d: 3500 },
    });

    const errors = validateHand(hand);
    expect(findByRule(errors, "chip_conservation")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Equity Bounds — dedicated tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Equity Bounds Validation", () => {
  it("FAILS: T7s with equity=0 — engine skipped computation", () => {
    const hand = makeCleanHand({
      hole_cards: {
        "bot-a": ["T\u2660", "7\u2660"], // T7 suited
        "bot-b": ["Qs", "Jh"],
      },
      actions: [
        {
          seq: 1,
          p_id: "bot-a",
          position: "BTN",
          st: "p",
          dec: "call",
          metrics: { eq: 0, w: [0.3, 0.5, 0.2], source: "Personality" },
        },
        {
          seq: 2,
          p_id: "bot-b",
          position: "BB",
          st: "p",
          dec: "check",
          metrics: { eq: 0.45, w: [0.3, 0.5, 0.2], source: "Personality" },
        },
      ],
    });

    const errors = validateHand(hand);
    const err = findByRule(errors, "equity_bounds");
    expect(err).toBeDefined();
    expect(err!.severity).toBe("warning");
    expect(err!.details!.equity).toBe(0);
  });

  it("passes when equity is at the floor (0.0001)", () => {
    const hand = makeCleanHand({
      actions: [
        {
          seq: 1,
          p_id: "bot-a",
          position: "BTN",
          st: "p",
          dec: "fold",
          metrics: { eq: MIN_EQUITY, w: null, source: "Personality" },
        },
      ],
    });

    const errors = validateHand(hand);
    expect(findByRule(errors, "equity_bounds")).toBeUndefined();
  });

  it("does not flag equity=0 from Range Chart when no hole cards exist", () => {
    const hand = makeCleanHand({
      hole_cards: {},
      actions: [
        {
          seq: 1,
          p_id: "bot-a",
          position: "BTN",
          st: "p",
          dec: "fold",
          metrics: { eq: 0, w: null, source: "Range Chart" },
        },
      ],
    });

    const errors = validateHand(hand);
    expect(findByRule(errors, "equity_bounds")).toBeUndefined();
  });
});
