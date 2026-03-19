import { Entity, Column, ManyToOne, JoinColumn, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Hand } from "./hand.entity";
import { Bot } from "./bot.entity";

export type ActionType =
  | "ante"
  | "small_blind"
  | "big_blind"
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "all_in";

export type ActionStage = "preflop" | "flop" | "turn" | "river";

@Entity("actions")
@Index(["hand_id", "action_seq"])
@Check(`"action_seq" >= 0`)
@Check(`"amount" >= 0`)
export class Action extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  hand_id: string;

  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({ type: "integer" })
  action_seq: number;

  @Column({ type: "varchar", length: 20 })
  action_type: ActionType;

  @Column({ type: "varchar", length: 20 })
  stage: ActionStage;

  @Column({ type: "bigint", default: 0 })
  amount: number;

  @Column({ type: "bigint", nullable: true })
  pot_after: number | null;

  @Column({ type: "bigint", nullable: true })
  chips_after: number | null;

  @Column({ type: "integer", nullable: true })
  response_time_ms: number | null;

  @ManyToOne(() => Hand, (hand) => hand.actions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "hand_id" })
  hand: Hand;

  @ManyToOne(() => Bot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
