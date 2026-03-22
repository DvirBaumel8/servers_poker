import { Entity, Column, ManyToOne, JoinColumn, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Bot } from "./bot.entity";
import { Game } from "./game.entity";
import { Hand } from "./hand.entity";
import { Tournament } from "./tournament.entity";

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
@Check(
  `"movement_type" IN ('ante', 'blind', 'bet', 'call', 'raise', 'all_in', 'win', 'refund', 'tournament_buyin', 'tournament_payout', 'rebuy')`,
)
@Check(`"balance_after" >= 0`)
export class ChipMovement extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  game_id: string | null;

  @ManyToOne(() => Game, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "game_id" })
  game: Game | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  hand_id: string | null;

  @ManyToOne(() => Hand, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "hand_id" })
  hand: Hand | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  tournament_id: string | null;

  @ManyToOne(() => Tournament, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "tournament_id" })
  tournament: Tournament | null;

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
