import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";

export type AnalyticsEventType =
  | "page_view"
  | "bot_created"
  | "bot_validated"
  | "tournament_joined"
  | "tournament_watched"
  | "game_watched"
  | "subscription_toggled"
  | "leaderboard_viewed"
  | "profile_viewed"
  | "login"
  | "logout"
  | "signup"
  | "feature_used";

@Entity("analytics_events")
export class AnalyticsEvent extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36, nullable: true })
  user_id?: string;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Index()
  @Column({ type: "varchar", length: 50 })
  event_type!: AnalyticsEventType;

  @Column({ type: "jsonb", default: {} })
  event_data: Record<string, unknown> = {};

  @Index()
  @Column({ type: "varchar", length: 36 })
  session_id!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  ip_hash?: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  user_agent?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  page_url?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  referrer?: string;
}
