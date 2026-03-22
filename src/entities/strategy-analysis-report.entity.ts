import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Bot } from "./bot.entity";

export interface AnalysisSuggestion {
  checkId: string;
  title: string;
  description: string;
  occurrences: number;
  severity: "critical" | "high" | "medium" | "low";
}

@Entity("strategy_analysis_reports")
@Index(["bot_id", "game_id"])
@Index(["bot_id"])
export class StrategyAnalysisReport extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({ type: "varchar", length: 100 })
  game_id: string;

  @Column({ type: "integer" })
  total_decisions: number;

  @Column({ type: "integer" })
  flagged_count: number;

  @Column({ type: "jsonb", default: [] })
  suggestions: AnalysisSuggestion[];

  @Column({ type: "integer" })
  decision_quality_score: number;

  @Column({ type: "text" })
  summary: string;

  @Column({ type: "timestamp with time zone" })
  analyzed_at: Date;

  @ManyToOne(() => Bot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
