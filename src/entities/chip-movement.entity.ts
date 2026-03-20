import { Entity, Column, ManyToOne, JoinColumn, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Bot } from "./bot.entity";

export type MovementType =
  | "ante"
  | "blind"
  | "bet"
  | "call"
  | "raise"
  | "all_in"
  | "win"
  | "refund"
  | "tournament_buyin"
  | "tournament_payout"
  | "rebuy";

@Entity("chip_movements")
@Index(["bot_id", "created_at"])
@Index(["game_id", "hand_id"])
@Index(["tournament_id"])
@Check(`"balance_after" >= 0`)
export class ChipMovement extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  game_id: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  hand_id: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  tournament_id: string | null;

  @Column({ type: "varchar", length: 30 })
  movement_type: MovementType;

  @Column({ type: "bigint" })
  amount: number;

  @Column({ type: "bigint" })
  balance_before: number;

  @Column({ type: "bigint" })
  balance_after: number;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "jsonb", nullable: true })
  context: Record<string, any> | null;

  @ManyToOne(() => Bot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
