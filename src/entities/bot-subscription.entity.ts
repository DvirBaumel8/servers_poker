import { Entity, Column, ManyToOne, JoinColumn, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Bot } from "./bot.entity";
import { Tournament } from "./tournament.entity";

export type SubscriptionStatus = "active" | "paused" | "expired";

@Entity("bot_subscriptions")
@Index(["bot_id", "tournament_id"], { unique: true })
@Check(`"priority" >= 1 AND "priority" <= 100`)
export class BotSubscription extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  bot_id!: string;

  @Index()
  @Column({ type: "varchar", length: 36, nullable: true })
  tournament_id?: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  tournament_type_filter?: string;

  @Column({ type: "bigint", nullable: true })
  min_buy_in?: number;

  @Column({ type: "bigint", nullable: true })
  max_buy_in?: number;

  @Column({ type: "integer", default: 50 })
  priority: number = 50;

  @Column({ type: "varchar", length: 20, default: "active" })
  status: SubscriptionStatus = "active";

  @Column({ type: "integer", default: 0 })
  successful_registrations: number = 0;

  @Column({ type: "integer", default: 0 })
  failed_registrations: number = 0;

  @Column({ type: "timestamp with time zone", nullable: true })
  last_registration_attempt?: Date;

  @Column({ type: "timestamp with time zone", nullable: true })
  expires_at?: Date;

  @ManyToOne(() => Bot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot!: Bot;

  @ManyToOne(() => Tournament, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "tournament_id" })
  tournament?: Tournament;
}
