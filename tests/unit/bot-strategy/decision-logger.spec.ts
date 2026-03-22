import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DecisionLoggerService,
  type StrategyDecisionEvent,
} from "../../../src/modules/bot-strategy/decision-logger.service";
import { EventEmitter2 } from "@nestjs/event-emitter";

function makeEvent(
  overrides: Partial<StrategyDecisionEvent> = {},
): StrategyDecisionEvent {
  return {
    botId: "bot-1",
    gameId: "game-1",
    handNumber: 1,
    street: "pre-flop",
    payload: {
      gameId: "game-1",
      handNumber: 1,
      stage: "pre-flop",
      you: {
        name: "TestBot",
        chips: 5000,
        holeCards: ["A♠", "K♥"],
        bet: 0,
        position: "BTN",
      },
      action: { canCheck: false, toCall: 100, minRaise: 200, maxRaise: 5000 },
      table: {
        communityCards: [],
        pot: 150,
        currentBet: 100,
        roundBets: [],
        previousPots: [],
      },
      players: [
        { name: "TestBot", chips: 5000, bet: 0, folded: false, allIn: false },
        {
          name: "Opponent",
          chips: 3000,
          bet: 100,
          folded: false,
          allIn: false,
        },
      ],
    } as any,
    strategy: {
      tier: "quick",
      personality: {
        aggression: 50,
        bluffFrequency: 20,
        riskTolerance: 50,
        tightness: 50,
      },
    } as any,
    evaluation: {
      action: { type: "call", amount: 100 },
      source: "personality",
      explanation: "Personality decided to call",
    } as any,
    ...overrides,
  };
}

describe("DecisionLoggerService", () => {
  let logger: DecisionLoggerService;
  let eventEmitter: EventEmitter2;
  let mockRepo: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    mockQueryBuilder = {
      insert: vi.fn().mockReturnThis(),
      into: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue({}),
    };
    mockRepo = {
      createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
    };
    logger = new DecisionLoggerService(eventEmitter, mockRepo);
    logger.onModuleInit();
  });

  afterEach(async () => {
    await logger.onModuleDestroy();
  });

  it("buffers decisions when event is emitted", () => {
    eventEmitter.emit("strategy.decision", makeEvent());
    expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it("flushes on destroy", async () => {
    eventEmitter.emit("strategy.decision", makeEvent());
    await logger.onModuleDestroy();
    expect(mockRepo.createQueryBuilder).toHaveBeenCalled();
    expect(mockQueryBuilder.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          bot_id: "bot-1",
          game_id: "game-1",
          action_type: "call",
          decision_source: "personality",
        }),
      ]),
    );
  });

  it("flushes when buffer reaches max size", () => {
    for (let i = 0; i < 50; i++) {
      eventEmitter.emit("strategy.decision", makeEvent({ handNumber: i }));
    }
    expect(mockRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(mockQueryBuilder.values).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ bot_id: "bot-1" })]),
    );
  });

  it("correctly maps evaluation fields", async () => {
    const event = makeEvent({
      evaluation: {
        action: { type: "raise", amount: 300 },
        source: "rule",
        explanation: "Rule triggered: raise with premium",
        ruleId: "rule-42",
        handNotation: "AKs",
      } as any,
    });
    eventEmitter.emit("strategy.decision", event);
    await logger.onModuleDestroy();

    const values = mockQueryBuilder.values.mock.calls[0][0];
    expect(values[0]).toMatchObject({
      action_type: "raise",
      action_amount: 300,
      decision_source: "rule",
      rule_id: "rule-42",
      hand_notation: "AKs",
      analysis_status: "pending",
    });
  });

  it("handles errors gracefully without throwing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const badEvent = { ...makeEvent(), payload: null };
    expect(() =>
      eventEmitter.emit("strategy.decision", badEvent),
    ).not.toThrow();
  });
});
