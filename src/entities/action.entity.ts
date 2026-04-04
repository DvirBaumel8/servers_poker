import { Entity, Column, ManyToOne, JoinColumn, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";
import {
  bigIntTransformer,
  bigIntNullableTransformer,
} from "../common/transformers/bigint.transformer";
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
@Check(
  `"action_type" IN ('fold', 'check', 'call', 'bet', 'raise', 'all_in', 'small_blind', 'big_blind', 'ante')`,
)
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

  @Column({ type: "bigint", default: 0, transformer: bigIntTransformer })
  amount: bigint;

  @Column({
    type: "bigint",
    nullable: true,
    transformer: bigIntNullableTransformer,
  })
  pot_after: bigint | null;

  @Column({
    type: "bigint",
    nullable: true,
    transformer: bigIntNullableTransformer,
  })
  chips_after: bigint | null;

  @Column({ type: "integer", nullable: true })
  response_time_ms: number | null;

  @ManyToOne(() => Hand, (hand) => hand.actions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "hand_id" })
  hand: Hand;

  @ManyToOne(() => Bot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
