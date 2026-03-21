import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

export type SummaryStatus = "pending" | "sent" | "failed";

@Entity("daily_summaries")
export class DailySummary extends BaseEntity {
  @Index()
  @Column({ type: "date" })
  summary_date: Date;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status: SummaryStatus;

  @Column({ type: "text", array: true, default: [] })
  recipients: string[];

  @Column({ type: "jsonb", default: {} })
  metrics_snapshot: Record<string, unknown>;

  @Column({ type: "timestamp with time zone", nullable: true })
  sent_at: Date | null;

  @Column({ type: "text", nullable: true })
  error_message: string | null;

  @Column({ type: "integer", default: 0 })
  retry_count: number;
}
