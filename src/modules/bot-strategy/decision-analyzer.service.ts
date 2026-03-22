import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  StrategyDecision,
  type AnalysisFlag,
} from "../../entities/strategy-decision.entity";
import {
  StrategyAnalysisReport,
  type AnalysisSuggestion,
} from "../../entities/strategy-analysis-report.entity";
import { runAllChecks } from "./analysis-checks";

interface GameFinishedEvent {
  tableId: string;
  winnerId?: string | null;
  winnerName?: string | null;
  gameId?: string;
}

@Injectable()
export class DecisionAnalyzerService implements OnModuleInit {
  private readonly logger = new Logger(DecisionAnalyzerService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(StrategyDecision)
    private readonly decisionRepo: Repository<StrategyDecision>,
    @InjectRepository(StrategyAnalysisReport)
    private readonly reportRepo: Repository<StrategyAnalysisReport>,
  ) {}

  onModuleInit() {
    this.eventEmitter.on("game.finished", this.onGameFinished.bind(this));
    this.logger.log("Decision analyzer initialized");
  }

  private async onGameFinished(event: GameFinishedEvent): Promise<void> {
    const gameId = event.gameId || event.tableId;
    if (!gameId) return;

    try {
      await this.analyzeGame(gameId);
    } catch (error: any) {
      this.logger.error(
        `Failed to analyze decisions for game ${gameId}: ${error.message}`,
      );
    }
  }

  async analyzeGame(gameId: string): Promise<void> {
    const decisions = await this.decisionRepo.find({
      where: { game_id: gameId, analysis_status: "pending" },
      order: { created_at: "ASC" },
    });

    if (decisions.length === 0) return;

    this.logger.debug(
      `Analyzing ${decisions.length} decisions for game ${gameId}`,
    );

    const botDecisions = new Map<string, StrategyDecision[]>();
    for (const d of decisions) {
      const arr = botDecisions.get(d.bot_id) || [];
      arr.push(d);
      botDecisions.set(d.bot_id, arr);
    }

    for (const [botId, botDecs] of botDecisions) {
      await this.analyzeBotDecisions(botId, gameId, botDecs);
    }
  }

  private async analyzeBotDecisions(
    botId: string,
    gameId: string,
    decisions: StrategyDecision[],
  ): Promise<void> {
    const now = new Date();
    let totalFlags = 0;
    const allFlags: AnalysisFlag[] = [];

    for (const decision of decisions) {
      const flags = runAllChecks(decision);

      decision.analysis_status = "analyzed";
      decision.analyzed_at = now;
      decision.analysis_result = {
        flags,
        qualityScore: flags.length === 0 ? 100 : computeDecisionScore(flags),
      };

      totalFlags += flags.length;
      allFlags.push(...flags);
    }

    await this.decisionRepo.save(decisions);

    const suggestions = aggregateSuggestions(allFlags);
    const qualityScore = computeOverallScore(decisions);

    const report = this.reportRepo.create({
      bot_id: botId,
      game_id: gameId,
      total_decisions: decisions.length,
      flagged_count: totalFlags,
      suggestions,
      decision_quality_score: qualityScore,
      summary: buildSummary(decisions.length, totalFlags, suggestions),
      analyzed_at: now,
    });

    await this.reportRepo.save(report);

    this.logger.log(
      `Bot ${botId}: ${decisions.length} decisions, ${totalFlags} flags, quality=${qualityScore}/100`,
    );
  }
}

function computeDecisionScore(flags: AnalysisFlag[]): number {
  const penalties: Record<string, number> = {
    critical: 40,
    high: 25,
    medium: 15,
    low: 5,
  };
  let penalty = 0;
  for (const f of flags) {
    penalty += penalties[f.severity] || 10;
  }
  return Math.max(0, 100 - penalty);
}

function computeOverallScore(decisions: StrategyDecision[]): number {
  if (decisions.length === 0) return 100;
  const total = decisions.reduce(
    (sum, d) => sum + (d.analysis_result?.qualityScore ?? 100),
    0,
  );
  return Math.round(total / decisions.length);
}

function aggregateSuggestions(flags: AnalysisFlag[]): AnalysisSuggestion[] {
  const grouped = new Map<string, { flag: AnalysisFlag; count: number }>();

  for (const flag of flags) {
    const existing = grouped.get(flag.checkId);
    if (existing) {
      existing.count++;
    } else {
      grouped.set(flag.checkId, { flag, count: 1 });
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      const order: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      return (order[a.flag.severity] ?? 4) - (order[b.flag.severity] ?? 4);
    })
    .map(({ flag, count }) => ({
      checkId: flag.checkId,
      title: flag.title,
      description: flag.suggestion || flag.description,
      occurrences: count,
      severity: flag.severity,
    }));
}

function buildSummary(
  total: number,
  flagged: number,
  suggestions: AnalysisSuggestion[],
): string {
  if (flagged === 0) {
    return `Analyzed ${total} decisions — no issues found. Strategy appears well-configured.`;
  }

  const critCount = suggestions.filter((s) => s.severity === "critical").length;
  const highCount = suggestions.filter((s) => s.severity === "high").length;

  const parts = [`Analyzed ${total} decisions, found ${flagged} flag(s).`];

  if (critCount > 0) {
    parts.push(`${critCount} critical issue(s) require immediate attention.`);
  }
  if (highCount > 0) {
    parts.push(`${highCount} high-severity issue(s) detected.`);
  }

  const topSuggestion = suggestions[0];
  if (topSuggestion) {
    parts.push(
      `Top issue: "${topSuggestion.title}" (${topSuggestion.occurrences} occurrence(s)).`,
    );
  }

  return parts.join(" ");
}
