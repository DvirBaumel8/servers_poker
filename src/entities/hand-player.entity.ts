import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
  Check,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import {
  bigIntTransformer,
  bigIntNullableTransformer,
} from "../common/transformers/bigint.transformer";
import { Hand } from "./hand.entity";
import { Bot } from "./bot.entity";

@Entity("hand_players")
@Unique(["hand_id", "bot_id"])
@Check(`"position" >= 0 AND "position" <= 9`)
@Check(`"start_chips" >= 0`)
@Check(`"end_chips" >= 0 OR "end_chips" IS NULL`)
@Check(`"amount_won" >= 0 OR "amount_won" IS NULL`)
@Check(`"amount_bet" >= 0`)
export class HandPlayer extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  hand_id!: string;

  @Column({ type: "varchar", length: 36 })
  bot_id!: string;

  @Column({ type: "integer" })
  position!: number;

  @Column({ type: "jsonb", default: [] })
  hole_cards: Array<{ rank: string; suit: string }> = [];

  @Column({ type: "bigint", transformer: bigIntTransformer })
  start_chips!: bigint;

  @Column({
    type: "bigint",
    nullable: true,
    transformer: bigIntNullableTransformer,
  })
  end_chips?: bigint | null;

  @Column({ type: "bigint", default: 0, transformer: bigIntTransformer })
  amount_bet: bigint = 0n;

  @Column({
    type: "bigint",
    nullable: true,
    transformer: bigIntNullableTransformer,
  })
  amount_won?: bigint | null;

  @Column({ type: "boolean", default: false })
  folded: boolean = false;

  @Column({ type: "boolean", default: false })
  all_in: boolean = false;

  @Column({ type: "boolean", default: false })
  won: boolean = false;

  @Column({ type: "boolean", default: false })
  saw_flop: boolean = false;

  @Column({ type: "boolean", default: false })
  saw_showdown: boolean = false;

  /** Whether cards were shown, mucked, or hidden (folded before showdown). */
  @Column({ type: "varchar", length: 10, default: "hidden" })
  card_status: "shown" | "mucked" | "hidden" = "hidden";

  @Column({ type: "jsonb", nullable: true })
  best_hand?: {
    name: string;
    rank: number;
    cards: Array<{ rank: string; suit: string }>;
  } | null;

  @ManyToOne(() => Hand, (hand) => hand.players, { onDelete: "CASCADE" })
  @JoinColumn({ name: "hand_id" })
  hand!: Hand;

  @ManyToOne(() => Bot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot!: Bot;
}
