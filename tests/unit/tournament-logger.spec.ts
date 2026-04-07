import { describe, it, expect, beforeEach } from "vitest";
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
});
