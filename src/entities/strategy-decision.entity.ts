import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Bot } from "./bot.entity";

export type AnalysisStatus = "pending" | "analyzed" | "skipped";

export interface AnalysisFlag {
  checkId: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  suggestion?: string;
}

export interface DecisionAnalysisResult {
  flags: AnalysisFlag[];
  qualityScore: number;
}

@Entity("strategy_decisions")
@Index(["bot_id", "game_id"])
@Index(["game_id"])
@Index(["analysis_status"])
export class StrategyDecision extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({ type: "varchar", length: 100 })
  game_id: string;

  @Column({ type: "integer" })
  hand_number: number;

  @Column({ type: "varchar", length: 20 })
  street: string;

  @Column({ type: "jsonb" })
  bot_payload: Record<string, any>;

  @Column({ type: "jsonb" })
  game_context: Record<string, any>;

  @Column({ type: "jsonb" })
  strategy_snapshot: Record<string, any>;

  @Column({ type: "varchar", length: 20 })
  action_type: string;

  @Column({ type: "integer", nullable: true })
  action_amount: number | null;

  @Column({ type: "varchar", length: 30 })
  decision_source: string;

  @Column({ type: "text" })
  explanation: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  rule_id: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  hand_notation: string | null;

  @Column({ type: "varchar", length: 20, default: "pending" })
  analysis_status: AnalysisStatus;

  @Column({ type: "jsonb", nullable: true })
  analysis_result: DecisionAnalysisResult | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  analyzed_at: Date | null;

  @ManyToOne(() => Bot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
