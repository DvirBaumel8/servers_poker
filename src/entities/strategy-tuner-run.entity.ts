import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

export type TunerRunStatus =
  | "running"
  | "completed"
  | "no_changes"
  | "tests_failed"
  | "git_failed"
  | "error";

export interface ProposedChange {
  parameter: string;
  previousValue: number;
  newValue: number;
  rationale: string;
  triggerCheckId: string;
  occurrences: number;
  affectedBots: number;
}

@Entity("strategy_tuner_runs")
@Index(["status"])
export class StrategyTunerRun extends BaseEntity {
  @Column({ type: "varchar", length: 20 })
  status: TunerRunStatus;

  @Column({ type: "integer" })
  reports_analyzed: number;

  @Column({ type: "jsonb", default: [] })
  proposed_changes: ProposedChange[];

  @Column({ type: "varchar", length: 500, nullable: true })
  pr_url: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  branch_name: string | null;

  @Column({ type: "text", nullable: true })
  error_message: string | null;

  @Column({ type: "text", nullable: true })
  summary: string | null;

  @Column({ type: "timestamp with time zone" })
  started_at: Date;

  @Column({ type: "timestamp with time zone", nullable: true })
  completed_at: Date | null;
}
