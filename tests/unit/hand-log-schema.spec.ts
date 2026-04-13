import { describe, it, expect } from "vitest";
import {
  parseHandLog,
  safeParseHandLog,
  safeParseTournamentLog,
  HandLogSchema,
} from "../../src/services/game/hand-log.schema";

// ─── Minimal valid hand fixture ───────────────────────────────────────────────

function validHand() {
  return {
    hand_id: "550e8400-e29b-41d4-a716-446655440000",
    hand_number: 1,
    table_id: "t-1",
    dealer_bot_id: "bot-a",
    board: ["2h", "7c", "Ks"],
    initial_stacks: { "bot-a": 1000, "bot-b": 980 },
    final_stacks: { "bot-a": 1030, "bot-b": 950 },
    hole_cards: { "bot-a": ["Ah", "Kd"], "bot-b": ["Qs", "Jh"] },
    winners: [{ p_id: "bot-a", amt: 30 }],
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
        metrics: { eq: 0.45, w: null, source: "Hard Rule" },
      },
    ],
  };
}

// ─── parseHandLog (strict) ───────────────────────────────────────────────────

describe("parseHandLog", () => {
  it("accepts a fully valid hand", () => {
    expect(() => parseHandLog(validHand())).not.toThrow();
  });

  it("throws on non-object input", () => {
    expect(() => parseHandLog("not-an-object")).toThrow();
    expect(() => parseHandLog(null)).toThrow();
    expect(() => parseHandLog(42)).toThrow();
  });
});

// ─── safeParseHandLog ────────────────────────────────────────────────────────

describe("safeParseHandLog", () => {
  it("returns ok=true for a valid hand", () => {
    const result = safeParseHandLog(validHand());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hand_number).toBe(1);
      expect(result.data.initial_stacks["bot-a"]).toBe(1000);
    }
  });

  // ─── Decision enum validation ──────────────────────────────────────────────

  it("rejects invalid dec value 'limp'", () => {
    const hand = validHand();
    hand.actions[0].dec = "limp" as any;
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("dec"))).toBe(true);
    }
  });

  it("rejects invalid dec value 'bet'", () => {
    const hand = validHand();
    hand.actions[0].dec = "bet" as any;
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  it("accepts all valid dec values", () => {
    for (const dec of ["fold", "check", "call", "raise", "all_in"] as const) {
      const hand = validHand();
      // Set appropriate amt for raise/all_in
      if (dec === "raise" || dec === "all_in") {
        hand.actions[0] = { ...hand.actions[0], dec, amt: 100 };
      } else {
        const { amt: _amt, ...rest } = hand.actions[0];
        hand.actions[0] = { ...rest, dec };
      }
      const result = safeParseHandLog(hand);
      expect(result.ok).toBe(true);
    }
  });

  // ─── Street code enum validation ───────────────────────────────────────────

  it("rejects invalid st value 'x'", () => {
    const hand = validHand();
    (hand.actions[0] as any).st = "x";
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("st"))).toBe(true);
    }
  });

  it("accepts all valid street codes", () => {
    for (const st of ["p", "f", "t", "r"] as const) {
      const hand = validHand();
      hand.actions[0] = { ...hand.actions[0], st };
      expect(safeParseHandLog(hand).ok).toBe(true);
    }
  });

  // ─── initial_stacks validation ─────────────────────────────────────────────

  it("rejects empty initial_stacks", () => {
    const hand = validHand();
    (hand as any).initial_stacks = {};
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("initial_stacks"))).toBe(
        true,
      );
    }
  });

  it("rejects initial_stacks with only 1 player", () => {
    const hand = validHand();
    (hand as any).initial_stacks = { "bot-a": 1000 };
    // Also fix hole_cards and actions to avoid unrelated errors
    (hand as any).hole_cards = { "bot-a": ["Ah", "Kd"] };
    hand.actions = [hand.actions[0]];
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  it("rejects negative stack values", () => {
    const hand = validHand();
    (hand as any).initial_stacks = { "bot-a": -100, "bot-b": 1000 };
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  // ─── Ghost player detection ───────────────────────────────────────────────

  it("rejects hole_cards with more players than initial_stacks — ghost player", () => {
    const hand = validHand();
    // initial_stacks has 2 players, hole_cards has 3 (one is a ghost)
    (hand as any).hole_cards = {
      "bot-a": ["Ah", "Kd"],
      "bot-b": ["Qs", "Jh"],
      "ghost-c": ["2c", "3s"], // not in initial_stacks
    };
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("ghost-c"))).toBe(true);
    }
  });

  it("accepts hole_cards with fewer players than initial_stacks (muck scenario)", () => {
    const hand = validHand();
    // Only hero's cards recorded (opponent mucked)
    (hand as any).hole_cards = { "bot-a": ["Ah", "Kd"] };
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(true);
  });

  // ─── hole_cards card count ─────────────────────────────────────────────────

  it("rejects hole_cards with 3 cards for a player", () => {
    const hand = validHand();
    (hand as any).hole_cards = {
      "bot-a": ["Ah", "Kd", "2c"],
      "bot-b": ["Qs", "Jh"],
    };
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  it("rejects hole_cards with 1 card for a player", () => {
    const hand = validHand();
    (hand as any).hole_cards = { "bot-a": ["Ah"], "bot-b": ["Qs", "Jh"] };
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  // ─── Action amt validation ────────────────────────────────────────────────

  it("rejects raise action missing amt", () => {
    const hand = validHand();
    const { amt: _amt, ...raiseWithoutAmt } = hand.actions[0];
    hand.actions[0] = raiseWithoutAmt as any;
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("amt"))).toBe(true);
    }
  });

  it("rejects all_in action missing amt", () => {
    const hand = validHand();
    hand.actions[0] = { ...hand.actions[0], dec: "all_in" } as any;
    delete (hand.actions[0] as any).amt;
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  it("rejects fold action with amt", () => {
    const hand = validHand();
    hand.actions[1] = { ...hand.actions[1], dec: "fold", amt: 0 } as any;
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  it("rejects check action with amt", () => {
    const hand = validHand();
    hand.actions[1] = { ...hand.actions[1], dec: "check", amt: 50 } as any;
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  it("rejects raise action with amt=0", () => {
    const hand = validHand();
    hand.actions[0] = { ...hand.actions[0], amt: 0 };
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  // ─── Missing required fields ───────────────────────────────────────────────

  it("rejects hand missing seq on action", () => {
    const hand = validHand();
    const { seq: _seq, ...noSeq } = hand.actions[0];
    hand.actions[0] = noSeq as any;
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("seq"))).toBe(true);
    }
  });

  it("rejects hand missing hand_number", () => {
    const hand = validHand();
    delete (hand as any).hand_number;
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  it("rejects invalid hand_id (not a UUID)", () => {
    const hand = validHand();
    (hand as any).hand_id = "not-a-uuid";
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  // ─── winners without final_stacks ─────────────────────────────────────────

  it("rejects hand with winners but missing final_stacks", () => {
    const hand = validHand();
    delete (hand as any).final_stacks;
    // winners is present from validHand()
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("final_stacks"))).toBe(true);
    }
  });

  it("accepts hand with no winners and no final_stacks (in-progress hand)", () => {
    const hand = validHand();
    delete (hand as any).final_stacks;
    delete (hand as any).winners;
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(true);
  });

  // ─── equity bounds ─────────────────────────────────────────────────────────

  it("rejects equity > 1", () => {
    const hand = validHand();
    hand.actions[0].metrics.eq = 1.5;
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  it("rejects negative equity", () => {
    const hand = validHand();
    hand.actions[0].metrics.eq = -0.1;
    const result = safeParseHandLog(hand);
    expect(result.ok).toBe(false);
  });

  it("accepts equity=0 (engine skip — flagged by validator, not schema)", () => {
    const hand = validHand();
    hand.actions[0].metrics.eq = 0;
    const result = safeParseHandLog(hand);
    // Schema allows 0; the equity_bounds validator emits a warning separately
    expect(result.ok).toBe(true);
  });
});

// ─── safeParseTournamentLog ──────────────────────────────────────────────────

describe("safeParseTournamentLog", () => {
  it("accepts a minimal valid tournament log", () => {
    const log = {
      tournament_summary: {
        id: "t-1",
        timestamp: "2025-01-01T00:00:00Z",
        participants: [
          {
            botId: "bot-a",
            botName: "Alpha",
            elo: 1500,
            dna: { name: "Alpha" },
          },
          { botId: "bot-b", botName: "Beta", elo: 1450, dna: { name: "Beta" } },
        ],
      },
      hands: [validHand()],
    };
    const result = safeParseTournamentLog(log);
    expect(result.ok).toBe(true);
  });

  it("rejects log with invalid hand inside hands array", () => {
    const log = {
      tournament_summary: {
        id: "t-1",
        timestamp: "2025-01-01T00:00:00Z",
        participants: [],
      },
      hands: [{ ...validHand(), initial_stacks: {} }], // empty stacks → invalid
    };
    const result = safeParseTournamentLog(log);
    expect(result.ok).toBe(false);
  });

  it("rejects log missing tournament_summary", () => {
    const result = safeParseTournamentLog({ hands: [validHand()] });
    expect(result.ok).toBe(false);
  });

  it("rejects log with non-array hands field", () => {
    const result = safeParseTournamentLog({
      tournament_summary: { id: "t", timestamp: "now", participants: [] },
      hands: "not-an-array",
    });
    expect(result.ok).toBe(false);
  });
});
