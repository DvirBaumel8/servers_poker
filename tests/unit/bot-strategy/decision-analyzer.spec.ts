import { describe, it, expect, vi, beforeEach } from "vitest";
import { DecisionAnalyzerService } from "../../../src/modules/bot-strategy/decision-analyzer.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { StrategyDecision } from "../../../src/entities/strategy-decision.entity";

function makeStoredDecision(
  overrides: Partial<StrategyDecision> = {},
): StrategyDecision {
  return {
    id: "dec-1",
    bot_id: "bot-1",
    game_id: "game-1",
    hand_number: 1,
    street: "preflop",
    bot_payload: {},
    game_context: {
      handStrength: "high_card",
      holeCardRank: "weak",
      facingBet: false,
      facingAllIn: false,
      canCheck: false,
    },
    strategy_snapshot: {
      personality: {
        aggression: 50,
        bluffFrequency: 20,
        riskTolerance: 50,
        tightness: 50,
      },
    },
    action_type: "fold",
    action_amount: null,
    decision_source: "personality",
    explanation: "Personality decided to fold",
    rule_id: null,
    hand_notation: "72o",
    analysis_status: "pending" as const,
    analysis_result: null,
    analyzed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as StrategyDecision;
}

describe("DecisionAnalyzerService", () => {
  let analyzer: DecisionAnalyzerService;
  let eventEmitter: EventEmitter2;
  let mockDecisionRepo: any;
  let mockReportRepo: any;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    mockDecisionRepo = {
      find: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue([]),
    };
    mockReportRepo = {
      create: vi.fn((data: any) => ({ ...data, id: "report-1" })),
      save: vi.fn().mockResolvedValue({}),
    };
    analyzer = new DecisionAnalyzerService(
      eventEmitter,
      mockDecisionRepo,
      mockReportRepo,
    );
    analyzer.onModuleInit();
  });

  it("listens for game.finished events", async () => {
    mockDecisionRepo.find.mockResolvedValue([]);
    eventEmitter.emit("game.finished", { tableId: "game-1", gameId: "game-1" });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockDecisionRepo.find).toHaveBeenCalledWith({
      where: { game_id: "game-1", analysis_status: "pending" },
      order: { created_at: "ASC" },
    });
  });

  it("skips analysis when no decisions exist", async () => {
    mockDecisionRepo.find.mockResolvedValue([]);
    await analyzer.analyzeGame("game-1");
    expect(mockReportRepo.save).not.toHaveBeenCalled();
  });

  it("analyzes clean decisions and produces quality report", async () => {
    const decisions = [makeStoredDecision({ hand_notation: "72o" })];
    mockDecisionRepo.find.mockResolvedValue(decisions);

    await analyzer.analyzeGame("game-1");

    expect(mockDecisionRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          analysis_status: "analyzed",
          analysis_result: expect.objectContaining({
            flags: [],
            qualityScore: 100,
          }),
        }),
      ]),
    );
    expect(mockReportRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        bot_id: "bot-1",
        game_id: "game-1",
        total_decisions: 1,
        flagged_count: 0,
        decision_quality_score: 100,
      }),
    );
  });

  it("flags and reports bad decisions", async () => {
    const decisions = [
      makeStoredDecision({
        hand_notation: "AA",
        game_context: {
          handStrength: "pair",
          holeCardRank: "premium",
          facingBet: false,
          facingAllIn: false,
          canCheck: false,
        },
      }),
    ];
    mockDecisionRepo.find.mockResolvedValue(decisions);

    await analyzer.analyzeGame("game-1");

    expect(mockDecisionRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          analysis_status: "analyzed",
          analysis_result: expect.objectContaining({
            flags: expect.arrayContaining([
              expect.objectContaining({ checkId: "folded_premium" }),
            ]),
          }),
        }),
      ]),
    );
    expect(mockReportRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        flagged_count: expect.any(Number),
        suggestions: expect.arrayContaining([
          expect.objectContaining({ checkId: "folded_premium" }),
        ]),
      }),
    );
  });

  it("groups decisions by bot ID", async () => {
    const decisions = [
      makeStoredDecision({ id: "d1", bot_id: "bot-1", hand_notation: "72o" }),
      makeStoredDecision({ id: "d2", bot_id: "bot-2", hand_notation: "83o" }),
    ];
    mockDecisionRepo.find.mockResolvedValue(decisions);

    await analyzer.analyzeGame("game-1");

    expect(mockReportRepo.save).toHaveBeenCalledTimes(2);
  });

  it("uses tableId as gameId fallback", async () => {
    mockDecisionRepo.find.mockResolvedValue([]);
    eventEmitter.emit("game.finished", { tableId: "table-123" });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockDecisionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { game_id: "table-123", analysis_status: "pending" },
      }),
    );
  });

  it("summary includes critical issue count", async () => {
    const decisions = [
      makeStoredDecision({
        hand_notation: "AA",
        game_context: {
          handStrength: "pair",
          holeCardRank: "premium",
          facingBet: false,
          facingAllIn: false,
          canCheck: false,
        },
      }),
    ];
    mockDecisionRepo.find.mockResolvedValue(decisions);

    await analyzer.analyzeGame("game-1");

    const savedReport = mockReportRepo.save.mock.calls[0][0];
    expect(savedReport.summary).toContain("critical");
  });
});
