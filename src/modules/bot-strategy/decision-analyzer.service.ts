import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  StrategyDecision,
  type AnalysisFlag,
} from "../../entities/strategy-decision.entity";
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

    for (const decision of decisions) {
      const flags = runAllChecks(decision);

      decision.analysis_status = "analyzed";
      decision.analyzed_at = now;
      decision.analysis_result = {
        flags,
        qualityScore: flags.length === 0 ? 100 : computeDecisionScore(flags),
      };

      totalFlags += flags.length;
    }

    await this.decisionRepo.save(decisions);

    this.logger.log(
      `Bot ${botId}: ${decisions.length} decisions, ${totalFlags} flags`,
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
