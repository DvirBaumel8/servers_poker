import { Entity, Column, Index, Unique } from "typeorm";
import { BaseEntity } from "./base.entity";

@Entity("platform_metrics")
@Unique(["date"])
export class PlatformMetrics extends BaseEntity {
  @Index()
  @Column({ type: "date" })
  date: Date;

  @Column({ type: "integer", default: 0 })
  total_users: number;

  @Column({ type: "integer", default: 0 })
  new_users: number;

  @Column({ type: "integer", default: 0 })
  total_bots: number;

  @Column({ type: "integer", default: 0 })
  new_bots: number;

  @Column({ type: "integer", default: 0 })
  active_users: number;

  @Column({ type: "integer", default: 0 })
  active_bots: number;

  @Column({ type: "integer", default: 0 })
  games_played: number;

  @Column({ type: "integer", default: 0 })
  hands_dealt: number;

  @Column({ type: "integer", default: 0 })
  tournaments_completed: number;

  @Column({ type: "bigint", default: 0 })
  total_chip_volume: number;

  @Column({ type: "integer", default: 0 })
  avg_bot_response_ms: number;

  @Column({ type: "integer", default: 0 })
  bot_timeout_count: number;

  @Column({ type: "integer", default: 0 })
  bot_error_count: number;

  @Column({ type: "integer", default: 0 })
  peak_concurrent_games: number;
}
