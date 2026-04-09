import { describe, it, expect, beforeEach, vi } from "vitest";
import { TournamentLoggerService } from "../../src/services/game/tournament-logger.service";
import type { BotPayload } from "../../src/modules/bot-strategy/strategy-engine.service";
import type { StrategyEvaluation } from "../../src/domain/bot-strategy/strategy.types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<BotPayload> = {}): BotPayload {
  return {
    gameId: "game-1",
    handNumber: 1,
    stage: "preflop",
    you: {
      name: "Bot A",
      chips: 1000,
      holeCards: ["Ah", "Kd"],
      bet: 0,
      position: "BTN",
    },
    action: {
      canCheck: false,
      toCall: 20,
      minRaise: 40,
      maxRaise: 1000,
    },
    table: {
      pot: 30,
      currentBet: 20,
      communityCards: [],
      smallBlind: 10,
      bigBlind: 20,
      ante: 0,
    },
    players: [
      {
        name: "Bot B",
        chips: 980,
        bet: 20,
        folded: false,
        allIn: false,
        position: "SB",
      },
      {
        name: "Bot C",
        chips: 960,
        bet: 20,
        folded: false,
        allIn: false,
        position: "BB",
      },
    ],
    decisionSeed: "abc123def456",
    ...overrides,
  };
}

function makeEval(
  overrides: Partial<StrategyEvaluation> = {},
): StrategyEvaluation {
  return {
    action: { type: "call" },
    source: "Personality",
    explanation: "Calling (strong, F:20% C:50% R:30%)",
    metrics: {
      equity: 0.55,
      strategyWeights: { fold: 0.2, call: 0.5, raise: 0.3 },
    },
    ...overrides,
  };
}

function makePlayers() {
  return [
    { id: "bot-a", chips: BigInt(1000), folded: false, allIn: false },
    { id: "bot-b", chips: BigInt(980), folded: false, allIn: false },
    { id: "bot-c", chips: BigInt(960), folded: true, allIn: false },
  ] as any[];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TournamentLoggerService", () => {
  let logger: TournamentLoggerService;

  beforeEach(() => {
    logger = new TournamentLoggerService();
    logger.initialize("t-1", [
      {
        elo: 1000,
        dna: {
          version: 1,
          tier: "quick",
          personality: {
            aggression: 50,
            bluffFrequency: 20,
            riskTolerance: 50,
            tightness: 50,
          },
        },
      },
    ]);
  });

  it("recordAction builds a lean ActionLog with abbreviated keys", () => {
    logger.onHandStarted(1, "bot-a");

    const payload = makePayload();
    const evaluation = makeEval();
    logger.recordAction({
      actionSeq: 3,
      playerId: "bot-a",
      payload,
      evaluation,
      allPlayers: makePlayers(),
    });

    const log = logger.serialize();
    const hand = log.hands[0];
    expect(hand.actions).toHaveLength(1);

    const action = hand.actions[0];
    expect(action.seq).toBe(3);
    expect(action.p_id).toBe("bot-a");
    expect(action.position).toBe("BTN");
    expect(action.st).toBe("p"); // preflop → 'p'
    expect(action.dec).toBe("call"); // flattened from bot_decision.type
    // call has no amount
    expect(action.amt).toBeUndefined();

    // Removed fields must not exist
    expect((action as any).player_id).toBeUndefined();
    expect((action as any).street).toBeUndefined();
    expect((action as any).stack_before).toBeUndefined();
    expect((action as any).pot_before).toBeUndefined();
    expect((action as any).amount_to_call).toBeUndefined();
    expect((action as any).facing_action).toBeUndefined();
    expect((action as any).bot_decision).toBeUndefined();
    expect((action as any).live_players).toBeUndefined();
    expect((action as any).engine_metrics).toBeUndefined();
  });

  it("amt is set on raise actions, absent on call/check/fold", () => {
    logger.onHandStarted(1, "bot-a");

    const raiseEval = makeEval({ action: { type: "raise", amount: 120 } });
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload(),
      evaluation: raiseEval,
      allPlayers: makePlayers(),
    });

    const action = logger.serialize().hands[0].actions[0];
    expect(action.dec).toBe("raise");
    expect(action.amt).toBe(120);
  });

  it("metrics maps eq and w (array) from evaluation.metrics", () => {
    logger.onHandStarted(1, "bot-a");
    const evaluation = makeEval();
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload(),
      evaluation,
      allPlayers: makePlayers(),
    });

    const { metrics } = logger.serialize().hands[0].actions[0];
    expect(metrics.eq).toBe(0.55);
    expect(Array.isArray(metrics.w)).toBe(true);
    expect(metrics.w).toHaveLength(3);
    expect(metrics.w![0]).toBeCloseTo(0.2, 4); // fold
    expect(metrics.w![1]).toBeCloseTo(0.5, 4); // call
    expect(metrics.w![2]).toBeCloseTo(0.3, 4); // raise
    expect(metrics.source).toBe("Personality");

    // explanation must be gone
    expect((metrics as any).explanation).toBeUndefined();
    expect((metrics as any).calculated_equity).toBeUndefined();
    expect((metrics as any).strategy_weights).toBeUndefined();
  });

  it("metrics.w is null when evaluation has no strategyWeights (rule source)", () => {
    logger.onHandStarted(1, "bot-a");
    const evaluation = makeEval({
      source: "Hard Rule",
      metrics: { equity: 0.6, strategyWeights: undefined },
    });
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload(),
      evaluation,
      allPlayers: makePlayers(),
    });

    const { metrics } = logger.serialize().hands[0].actions[0];
    expect(metrics.w).toBeNull();
    expect(metrics.eq).toBe(0.6);
  });

  it("street codes: preflop→p, flop→f, turn→t, river→r", () => {
    logger.onHandStarted(1, "bot-a");
    const stages: Array<[string, string]> = [
      ["preflop", "p"],
      ["flop", "f"],
      ["turn", "t"],
      ["river", "r"],
    ];
    for (const [stage, expected] of stages) {
      logger.recordAction({
        actionSeq: 1,
        playerId: "bot-a",
        payload: makePayload({ stage: stage as any }),
        evaluation: makeEval(),
        allPlayers: makePlayers(),
      });
    }
    const actions = logger.serialize().hands[0].actions;
    expect(actions[0].st).toBe("p");
    expect(actions[1].st).toBe("f");
    expect(actions[2].st).toBe("t");
    expect(actions[3].st).toBe("r");
  });

  it("board is a flat array updated cumulatively across streets", () => {
    logger.onHandStarted(1, "bot-a");

    // Preflop — no community cards
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload({ stage: "preflop" }),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    // Flop
    logger.recordAction({
      actionSeq: 2,
      playerId: "bot-a",
      payload: makePayload({
        stage: "flop",
        table: {
          pot: 60,
          currentBet: 0,
          communityCards: ["2h", "7c", "Ks"],
          smallBlind: 10,
          bigBlind: 20,
          ante: 0,
        },
      }),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    // Turn
    logger.recordAction({
      actionSeq: 3,
      playerId: "bot-a",
      payload: makePayload({
        stage: "turn",
        table: {
          pot: 100,
          currentBet: 0,
          communityCards: ["2h", "7c", "Ks", "4d"],
          smallBlind: 10,
          bigBlind: 20,
          ante: 0,
        },
      }),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    const board = logger.serialize().hands[0].board;
    // After turn, board should have 4 cards
    expect(board).toEqual(["2h", "7c", "Ks", "4d"]);

    // No per-street breakdown object
    expect((logger.serialize().hands[0] as any).board_cards).toBeUndefined();
  });

  it("onHandComplete finalises board with river cards", () => {
    logger.onHandStarted(1, "bot-a");
    logger.onHandComplete(["2h", "7c", "Ks", "4d", "Ac"]);

    const board = logger.serialize().hands[0].board;
    expect(board).toEqual(["2h", "7c", "Ks", "4d", "Ac"]);
  });

  it("initial_stacks is populated from onHandStarted arg", () => {
    const stacks = { "bot-a": 1000, "bot-b": 980, "bot-c": 960 };
    logger.onHandStarted(1, "bot-a", stacks);
    const hand = logger.serialize().hands[0];
    expect(hand.initial_stacks).toEqual(stacks);
  });

  it("initial_stacks defaults to empty object when not provided", () => {
    logger.onHandStarted(1, "bot-a");
    const hand = logger.serialize().hands[0];
    expect(hand.initial_stacks).toEqual({});
  });

  it("serialize returns complete tournament_summary and all hands", () => {
    // Hand 1
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000 });
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload(),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });
    logger.onHandComplete([]);

    // Hand 2
    logger.onHandStarted(2, "bot-b", { "bot-b": 980 });
    logger.recordAction({
      actionSeq: 2,
      playerId: "bot-b",
      payload: makePayload(),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });
    logger.onHandComplete([]);

    const result = logger.serialize();

    expect(result.tournament_summary.id).toBe("t-1");
    expect(result.tournament_summary.participants).toHaveLength(1);
    expect(result.hands).toHaveLength(2);
    expect(result.hands[0].hand_number).toBe(1);
    expect(result.hands[1].hand_number).toBe(2);
  });

  it("hole_cards is populated after first action by a player in a hand", () => {
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000, "bot-b": 980 });

    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload({
        you: { ...makePayload().you, holeCards: ["Ah", "Kd"] },
      }),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    const hand = logger.serialize().hands[0];
    expect(hand.hole_cards).toBeDefined();
    expect(hand.hole_cards!["bot-a"]).toEqual(["Ah", "Kd"]);
  });

  it("hole_cards is not overwritten on subsequent actions by the same player", () => {
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000, "bot-b": 980 });

    // First action by bot-a captures AhKd
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload({
        you: { ...makePayload().you, holeCards: ["Ah", "Kd"] },
      }),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    // Second action by bot-a tries to capture different cards (should be ignored)
    logger.recordAction({
      actionSeq: 2,
      playerId: "bot-a",
      payload: makePayload({
        you: { ...makePayload().you, holeCards: ["2c", "3d"] },
        stage: "flop",
      }),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    const hand = logger.serialize().hands[0];
    // Should still be the first captured cards
    expect(hand.hole_cards!["bot-a"]).toEqual(["Ah", "Kd"]);
  });

  it("hole_cards is empty object when payload.you.holeCards is absent or empty", () => {
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000 });

    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload({ you: { ...makePayload().you, holeCards: [] } }),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    const hand = logger.serialize().hands[0];
    expect(hand.hole_cards).toEqual({});
    expect(hand.hole_cards!["bot-a"]).toBeUndefined();
  });

  it("hole_cards are captured at deal time via onHandStarted holeCards param", () => {
    const holeCards = {
      "bot-a": ["Ah", "Kd"],
      "bot-b": ["2c", "3s"],
    };
    logger.onHandStarted(
      1,
      "bot-a",
      { "bot-a": 1000, "bot-b": 980 },
      holeCards,
    );

    // No actions recorded yet — cards should already be present
    const hand = logger.serialize().hands[0];
    expect(hand.hole_cards!["bot-a"]).toEqual(["Ah", "Kd"]);
    expect(hand.hole_cards!["bot-b"]).toEqual(["2c", "3s"]);
  });

  it("deal-time hole cards are not overwritten by recordAction", () => {
    const holeCards = { "bot-a": ["Ah", "Kd"] };
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000 }, holeCards);

    // recordAction with different cards for same player — should NOT overwrite
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload({
        you: { ...makePayload().you, holeCards: ["Qs", "Jh"] },
      }),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    const hand = logger.serialize().hands[0];
    expect(hand.hole_cards!["bot-a"]).toEqual(["Ah", "Kd"]);
  });

  // ─── table_id ────────────────────────────────────────────────────────────────

  it("table_id is set on hand logs when provided", () => {
    logger.onHandStarted(1, "bot-a", {}, {}, "table-42");
    logger.onHandComplete([], "table-42");
    const hand = logger.serialize().hands[0];
    expect(hand.table_id).toBe("table-42");
  });

  it("table_id defaults to empty string when omitted", () => {
    logger.onHandStarted(1, "bot-a");
    logger.onHandComplete([]);
    const hand = logger.serialize().hands[0];
    expect(hand.table_id).toBe("");
  });

  // ─── Multi-table safety ──────────────────────────────────────────────────────

  it("concurrent tables do not clobber each other's hands", () => {
    // Table A starts hand 1
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000 }, {}, "table-A");
    // Table B starts hand 1 (should NOT overwrite table A's hand)
    logger.onHandStarted(1, "bot-b", { "bot-b": 2000 }, {}, "table-B");

    // Record action on table A
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload(),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
      tableId: "table-A",
    });

    // Record action on table B
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-b",
      payload: makePayload(),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
      tableId: "table-B",
    });

    // Complete both
    logger.onHandComplete([], "table-A");
    logger.onHandComplete([], "table-B");

    const log = logger.serialize();
    expect(log.hands).toHaveLength(2);
    expect(log.hands[0].table_id).toBe("table-A");
    expect(log.hands[0].initial_stacks).toEqual({ "bot-a": 1000 });
    expect(log.hands[0].actions).toHaveLength(1);
    expect(log.hands[1].table_id).toBe("table-B");
    expect(log.hands[1].initial_stacks).toEqual({ "bot-b": 2000 });
    expect(log.hands[1].actions).toHaveLength(1);
  });

  it("actions without tableId go to the default empty-string hand", () => {
    logger.onHandStarted(1, "bot-a");
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload(),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
      // no tableId
    });
    logger.onHandComplete([]);
    const hand = logger.serialize().hands[0];
    expect(hand.actions).toHaveLength(1);
  });

  // ─── final_stacks ────────────────────────────────────────────────────────────

  it("final_stacks is populated from onHandComplete", () => {
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000, "bot-b": 980 });
    const finalStacks = { "bot-a": 1030, "bot-b": 950 };
    logger.onHandComplete([], "", finalStacks);
    const hand = logger.serialize().hands[0];
    expect(hand.final_stacks).toEqual(finalStacks);
  });

  it("final_stacks defaults to empty object when not provided", () => {
    logger.onHandStarted(1, "bot-a");
    logger.onHandComplete([]);
    const hand = logger.serialize().hands[0];
    expect(hand.final_stacks).toEqual({});
  });

  // ─── Data integrity check ─────────────────────────────────────────────────

  it("logs DataIntegrityError when initial_stacks mismatch prev final_stacks", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.onHandStarted(1, "bot-a", { "bot-a": 1000 }, {}, "t1");
    logger.onHandComplete([], "t1", { "bot-a": 1030 });

    // Hand 2: bot-a initial=999 but prev final=1030 → mismatch
    logger.onHandStarted(2, "bot-a", { "bot-a": 999 }, {}, "t1");
    logger.onHandComplete([], "t1", { "bot-a": 999 });

    // Filter for DataIntegrityError specifically (chip_conservation validation also fires)
    const integrityErrors = errorSpy.mock.calls.filter((c) =>
      c[0].includes("[DataIntegrityError]"),
    );
    expect(integrityErrors).toHaveLength(1);
    expect(integrityErrors[0][0]).toContain("bot-a");
    errorSpy.mockRestore();
  });

  it("no DataIntegrityError when stacks match", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.onHandStarted(1, "bot-a", { "bot-a": 1000 }, {}, "t1");
    logger.onHandComplete([], "t1", { "bot-a": 1000 }); // conserved

    // Hand 2: matching stacks
    logger.onHandStarted(2, "bot-a", { "bot-a": 1000 }, {}, "t1");
    logger.onHandComplete([], "t1", { "bot-a": 1000 }); // conserved

    const integrityErrors = errorSpy.mock.calls.filter((c) =>
      c[0].includes("[DataIntegrityError]"),
    );
    expect(integrityErrors).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it("integrity check is scoped per table", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Table A: bot-a ends with same as start (conserved)
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000 }, {}, "table-A");
    logger.onHandComplete([], "table-A", { "bot-a": 1000 });

    // Table B: bot-b starts fresh — no cross-table check
    logger.onHandStarted(1, "bot-b", { "bot-b": 500 }, {}, "table-B");
    logger.onHandComplete([], "table-B", { "bot-b": 500 });

    const integrityErrors = errorSpy.mock.calls.filter((c) =>
      c[0].includes("[DataIntegrityError]"),
    );
    expect(integrityErrors).toHaveLength(0);
    errorSpy.mockRestore();
  });

  // ─── Defensive warnings ────────────────────────────────────────────────────

  it("recordAction warns when no active hand exists for tableId", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // No hand started — action should be dropped with a warning
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload(),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
      tableId: "nonexistent-table",
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain(
      "[TournamentLogger] recordAction",
    );
    expect(warnSpy.mock.calls[0][0]).toContain("nonexistent-table");
    expect(warnSpy.mock.calls[0][0]).toContain("action dropped");
    warnSpy.mockRestore();
  });

  it("onHandComplete warns when no active hand exists for tableId", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // No hand started — complete should be dropped with a warning
    logger.onHandComplete(["Ah", "Kd", "Qs"], "nonexistent-table", {
      "bot-a": 1000,
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain(
      "[TournamentLogger] onHandComplete",
    );
    expect(warnSpy.mock.calls[0][0]).toContain("nonexistent-table");
    expect(warnSpy.mock.calls[0][0]).toContain("hand completion dropped");
    warnSpy.mockRestore();
  });

  it("recordAction with missing tableId and no default hand warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // No hand started for default "" tableId
    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload(),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
      // no tableId — falls back to ""
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("players without deal-time cards still get captured on first action", () => {
    // Only bot-a gets cards at deal time; bot-b is missing
    logger.onHandStarted(
      1,
      "bot-a",
      { "bot-a": 1000, "bot-b": 980 },
      { "bot-a": ["Ah", "Kd"] },
    );

    // bot-b acts and their cards should now be captured
    logger.recordAction({
      actionSeq: 2,
      playerId: "bot-b",
      payload: makePayload({
        you: { ...makePayload().you, holeCards: ["Tc", "9d"] },
      }),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    const hand = logger.serialize().hands[0];
    expect(hand.hole_cards!["bot-a"]).toEqual(["Ah", "Kd"]);
    expect(hand.hole_cards!["bot-b"]).toEqual(["Tc", "9d"]);
  });

  // ─── Schema guard ──────────────────────────────────────────────────────────

  it("recordAction rejects action from player not in initial_stacks", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logger.onHandStarted(1, "bot-a", { "bot-a": 1000, "bot-b": 980 });

    // Action from "ghost-bot" — not in initial_stacks
    logger.recordAction({
      actionSeq: 1,
      playerId: "ghost-bot",
      payload: makePayload(),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    const hand = logger.serialize().hands[0];
    expect(hand.actions).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("action rejected");
    expect(warnSpy.mock.calls[0][0]).toContain("ghost-bot");
    warnSpy.mockRestore();
  });

  it("recordAction accepts action from player in initial_stacks", () => {
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000, "bot-b": 980 });

    logger.recordAction({
      actionSeq: 1,
      playerId: "bot-a",
      payload: makePayload(),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    const hand = logger.serialize().hands[0];
    expect(hand.actions).toHaveLength(1);
    expect(hand.actions[0].p_id).toBe("bot-a");
  });

  it("schema guard skipped when initial_stacks is empty (legacy)", () => {
    logger.onHandStarted(1, "bot-a"); // no stacks

    logger.recordAction({
      actionSeq: 1,
      playerId: "any-bot",
      payload: makePayload(),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    const hand = logger.serialize().hands[0];
    expect(hand.actions).toHaveLength(1);
  });

  it("ghost player hole_cards are not captured when action is rejected", () => {
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000 });

    logger.recordAction({
      actionSeq: 1,
      playerId: "ghost-bot",
      payload: makePayload({
        you: { ...makePayload().you, holeCards: ["Ah", "Kd"] },
      }),
      evaluation: makeEval(),
      allPlayers: makePlayers(),
    });

    const hand = logger.serialize().hands[0];
    expect(hand.hole_cards!["ghost-bot"]).toBeUndefined();
  });

  // ─── Action sorting ────────────────────────────────────────────────────────

  it("actions are sorted by seq after onHandComplete", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000, "bot-b": 980 });

    // Record actions out of order
    for (const seq of [3, 1, 2]) {
      logger.recordAction({
        actionSeq: seq,
        playerId: seq % 2 === 0 ? "bot-b" : "bot-a",
        payload: makePayload(),
        evaluation: makeEval(),
        allPlayers: makePlayers(),
      });
    }

    logger.onHandComplete([], "", { "bot-a": 1000, "bot-b": 980 });

    const hand = logger.serialize().hands[0];
    expect(hand.actions.map((a) => a.seq)).toEqual([1, 2, 3]);
    errorSpy.mockRestore();
  });

  it("actions are sorted by seq in serialize for unclosed hands", () => {
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000, "bot-b": 980 });

    for (const seq of [5, 3, 4]) {
      logger.recordAction({
        actionSeq: seq,
        playerId: seq % 2 === 0 ? "bot-b" : "bot-a",
        payload: makePayload(),
        evaluation: makeEval(),
        allPlayers: makePlayers(),
      });
    }

    // No onHandComplete — serialize flushes in-progress hands
    const hand = logger.serialize().hands[0];
    expect(hand.actions.map((a) => a.seq)).toEqual([3, 4, 5]);
  });

  // ─── Winners ───────────────────────────────────────────────────────────────

  it("winners field is populated from onHandComplete", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000, "bot-b": 980 });
    logger.onHandComplete([], "", { "bot-a": 1030, "bot-b": 950 }, [
      { playerId: "bot-a", amount: 50, hand: { name: "Two Pair" } },
    ]);

    const hand = logger.serialize().hands[0];
    expect(hand.winners).toBeDefined();
    expect(hand.winners).toHaveLength(1);
    expect(hand.winners![0].p_id).toBe("bot-a");
    expect(hand.winners![0].amt).toBe(50);
    expect(hand.winners![0].hand_name).toBe("Two Pair");
    errorSpy.mockRestore();
  });

  it("winners field supports split pots (multiple winners)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000, "bot-b": 980 });
    logger.onHandComplete([], "", { "bot-a": 1010, "bot-b": 970 }, [
      { playerId: "bot-a", amount: 30 },
      { playerId: "bot-b", amount: 10 },
    ]);

    const hand = logger.serialize().hands[0];
    expect(hand.winners).toHaveLength(2);
    expect(hand.winners![0].p_id).toBe("bot-a");
    expect(hand.winners![1].p_id).toBe("bot-b");
    // hand_name absent for fold-wins
    expect(hand.winners![0].hand_name).toBeUndefined();
    errorSpy.mockRestore();
  });

  it("winners field is absent when no winners provided", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000, "bot-b": 980 });
    logger.onHandComplete([], "", { "bot-a": 1000, "bot-b": 980 });

    const hand = logger.serialize().hands[0];
    expect(hand.winners).toBeUndefined();
    errorSpy.mockRestore();
  });

  it("winners amount handles bigint values", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.onHandStarted(1, "bot-a", { "bot-a": 1000, "bot-b": 980 });
    logger.onHandComplete([], "", { "bot-a": 1030, "bot-b": 950 }, [
      { playerId: "bot-a", amount: BigInt(50), hand: { name: "Flush" } },
    ]);

    const hand = logger.serialize().hands[0];
    expect(hand.winners![0].amt).toBe(50);
    expect(typeof hand.winners![0].amt).toBe("number");
    errorSpy.mockRestore();
  });
});
