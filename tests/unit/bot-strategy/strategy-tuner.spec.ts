import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrategyTunerService } from "../../../src/modules/bot-strategy/strategy-tuner.service";
import { STRATEGY_TUNABLES } from "../../../src/modules/bot-strategy/strategy-tunables";
import type { StrategyAnalysisReport } from "../../../src/entities/strategy-analysis-report.entity";

function makeReport(
  overrides: Partial<StrategyAnalysisReport> = {},
): StrategyAnalysisReport {
  return {
    id: "report-1",
    bot_id: "bot-1",
    game_id: "game-1",
    total_decisions: 10,
    flagged_count: 2,
    suggestions: [
      {
        checkId: "folded_premium",
        title: "Folded premium hand preflop",
        description: "Folded AA preflop",
        occurrences: 3,
        severity: "critical",
      },
    ],
    decision_quality_score: 60,
    summary: "Test report",
    analyzed_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as StrategyAnalysisReport;
}

describe("StrategyTunerService", () => {
  let service: StrategyTunerService;
  let mockReportRepo: any;
  let mockRunRepo: any;

  beforeEach(() => {
    mockReportRepo = {
      find: vi.fn().mockResolvedValue([]),
    };
    mockRunRepo = {
      create: vi.fn((data: any) => ({ ...data, id: "run-1" })),
      save: vi.fn().mockImplementation((data: any) => Promise.resolve(data)),
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
    };
    service = new StrategyTunerService(mockReportRepo, mockRunRepo);
  });

  describe("aggregateReports", () => {
    it("groups suggestions by checkId and counts occurrences", () => {
      const reports = [
        makeReport({
          id: "r1",
          bot_id: "bot-1",
          suggestions: [
            {
              checkId: "folded_premium",
              title: "T",
              description: "D",
              occurrences: 3,
              severity: "critical",
            },
            {
              checkId: "passive_strong_hand",
              title: "T",
              description: "D",
              occurrences: 1,
              severity: "medium",
            },
          ],
          decision_quality_score: 60,
        }),
        makeReport({
          id: "r2",
          bot_id: "bot-2",
          suggestions: [
            {
              checkId: "folded_premium",
              title: "T",
              description: "D",
              occurrences: 2,
              severity: "critical",
            },
          ],
          decision_quality_score: 70,
        }),
      ];

      const result = service.aggregateReports(reports);

      const foldedPremium = result.find((r) => r.checkId === "folded_premium");
      expect(foldedPremium).toBeDefined();
      expect(foldedPremium!.totalOccurrences).toBe(5);
      expect(foldedPremium!.affectedBots).toBe(2);
      expect(foldedPremium!.reports).toBe(2);

      const passive = result.find((r) => r.checkId === "passive_strong_hand");
      expect(passive).toBeDefined();
      expect(passive!.totalOccurrences).toBe(1);
      expect(passive!.affectedBots).toBe(1);
    });

    it("returns empty for reports with no suggestions", () => {
      const reports = [makeReport({ suggestions: [] })];
      const result = service.aggregateReports(reports);
      expect(result).toHaveLength(0);
    });

    it("computes average quality score correctly", () => {
      const reports = [
        makeReport({
          id: "r1",
          bot_id: "bot-1",
          decision_quality_score: 40,
          suggestions: [
            {
              checkId: "x",
              title: "T",
              description: "D",
              occurrences: 5,
              severity: "high",
            },
          ],
        }),
        makeReport({
          id: "r2",
          bot_id: "bot-2",
          decision_quality_score: 80,
          suggestions: [
            {
              checkId: "x",
              title: "T",
              description: "D",
              occurrences: 5,
              severity: "high",
            },
          ],
        }),
      ];
      const result = service.aggregateReports(reports);
      expect(result[0].avgQualityScore).toBe(60);
    });
  });

  describe("detectOpportunities", () => {
    it("returns empty when occurrences are below threshold", () => {
      const checks = [
        {
          checkId: "folded_premium",
          totalOccurrences: 2,
          affectedBots: 1,
          avgQualityScore: 50,
          reports: 1,
        },
      ];
      const result = service.detectOpportunities(checks);
      expect(result).toHaveLength(0);
    });

    it("returns empty when affected bots are below threshold", () => {
      const checks = [
        {
          checkId: "folded_premium",
          totalOccurrences: 10,
          affectedBots: 1,
          avgQualityScore: 50,
          reports: 5,
        },
      ];
      const result = service.detectOpportunities(checks);
      expect(result).toHaveLength(0);
    });

    it("detects folded_premium opportunity", () => {
      const checks = [
        {
          checkId: "folded_premium",
          totalOccurrences: 10,
          affectedBots: 3,
          avgQualityScore: 50,
          reports: 5,
        },
      ];
      const result = service.detectOpportunities(checks);
      expect(result).toHaveLength(1);
      expect(result[0].parameter).toBe("personality.preflopBluffDivisor");
      expect(result[0].proposedValue).toBeLessThan(result[0].currentValue);
    });

    it("detects passive_strong_hand opportunity", () => {
      const checks = [
        {
          checkId: "passive_strong_hand",
          totalOccurrences: 8,
          affectedBots: 2,
          avgQualityScore: 70,
          reports: 4,
        },
      ];
      const result = service.detectOpportunities(checks);
      expect(result).toHaveLength(1);
      expect(result[0].parameter).toBe("personality.strongHandThreshold");
      expect(result[0].proposedValue).toBeLessThan(result[0].currentValue);
    });

    it("detects overaggressive_weak opportunity", () => {
      const checks = [
        {
          checkId: "overaggressive_weak",
          totalOccurrences: 6,
          affectedBots: 2,
          avgQualityScore: 65,
          reports: 3,
        },
      ];
      const result = service.detectOpportunities(checks);
      expect(result).toHaveLength(1);
      expect(result[0].parameter).toBe("sizing.postflopAggressionBonus");
    });

    it("detects personality_inconsistent_passive opportunity", () => {
      const checks = [
        {
          checkId: "personality_inconsistent_passive",
          totalOccurrences: 10,
          affectedBots: 3,
          avgQualityScore: 80,
          reports: 5,
        },
      ];
      const result = service.detectOpportunities(checks);
      expect(result).toHaveLength(1);
      expect(result[0].parameter).toBe("personality.raiseWeightAggression");
      expect(result[0].proposedValue).toBeGreaterThan(result[0].currentValue);
    });

    it("detects called_allin_trash opportunity", () => {
      const checks = [
        {
          checkId: "called_allin_trash",
          totalOccurrences: 5,
          affectedBots: 2,
          avgQualityScore: 40,
          reports: 3,
        },
      ];
      const result = service.detectOpportunities(checks);
      expect(result).toHaveLength(1);
      expect(result[0].parameter).toBe("personality.weakAllInCallDivisor");
      expect(result[0].proposedValue).toBeGreaterThan(result[0].currentValue);
    });

    it("ignores unknown check IDs", () => {
      const checks = [
        {
          checkId: "unknown_check",
          totalOccurrences: 100,
          affectedBots: 10,
          avgQualityScore: 30,
          reports: 50,
        },
      ];
      const result = service.detectOpportunities(checks);
      expect(result).toHaveLength(0);
    });

    it("handles multiple opportunities at once", () => {
      const checks = [
        {
          checkId: "folded_premium",
          totalOccurrences: 10,
          affectedBots: 3,
          avgQualityScore: 50,
          reports: 5,
        },
        {
          checkId: "overaggressive_weak",
          totalOccurrences: 8,
          affectedBots: 2,
          avgQualityScore: 60,
          reports: 4,
        },
        {
          checkId: "called_allin_trash",
          totalOccurrences: 5,
          affectedBots: 2,
          avgQualityScore: 40,
          reports: 3,
        },
      ];
      const result = service.detectOpportunities(checks);
      expect(result).toHaveLength(3);
    });
  });

  describe("magnitude guards", () => {
    it("limits change to max 20% of current value", () => {
      const checks = [
        {
          checkId: "folded_premium",
          totalOccurrences: 100,
          affectedBots: 10,
          avgQualityScore: 30,
          reports: 50,
        },
      ];
      const result = service.detectOpportunities(checks);
      const current = STRATEGY_TUNABLES.personality.preflopBluffDivisor;
      const maxDelta = current * 0.2;

      expect(Math.abs(result[0].proposedValue - current)).toBeLessThanOrEqual(
        maxDelta + 0.001,
      );
    });
  });

  describe("runTuner", () => {
    it("creates a run record and returns no_changes when no reports", async () => {
      mockReportRepo.find.mockResolvedValue([]);
      const run = await service.runTuner();

      expect(run.status).toBe("no_changes");
      expect(run.reports_analyzed).toBe(0);
      expect(mockRunRepo.save).toHaveBeenCalled();
    });

    it("creates a run with no_changes when no opportunities found", async () => {
      mockReportRepo.find.mockResolvedValue([
        makeReport({
          suggestions: [
            {
              checkId: "folded_premium",
              title: "T",
              description: "D",
              occurrences: 1,
              severity: "critical",
            },
          ],
        }),
      ]);
      const run = await service.runTuner();

      expect(run.status).toBe("no_changes");
      expect(run.reports_analyzed).toBe(1);
    });
  });

  describe("getHistory", () => {
    it("queries with correct order and limit", async () => {
      await service.getHistory(10);
      expect(mockRunRepo.find).toHaveBeenCalledWith({
        order: { created_at: "DESC" },
        take: 10,
      });
    });
  });
});
