import { Entity, Column, ManyToOne, JoinColumn, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";
import { bigIntTransformer } from "../common/transformers/bigint.transformer";
import { Tournament } from "./tournament.entity";
import { Bot } from "./bot.entity";

export type EntryType = "initial" | "rebuy" | "re_entry";

@Entity("tournament_entries")
@Index(["tournament_id", "bot_id"])
@Index(["tournament_id", "finish_position"])
@Check(`"payout" >= 0`)
@Check(`"finish_position" IS NULL OR "finish_position" >= 1`)
export class TournamentEntry extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  tournament_id!: string;

  @Column({ type: "varchar", length: 36 })
  bot_id!: string;

  @Column({ type: "varchar", length: 20, default: "initial" })
  entry_type: EntryType = "initial";

  @Column({ type: "integer", nullable: true })
  finish_position?: number;

  @Column({ type: "integer", nullable: true })
  bust_level?: number;

  @Column({ type: "bigint", default: 0, transformer: bigIntTransformer })
  payout: bigint = 0n;

  @Column({ type: "integer", nullable: true })
  bust_hand_number?: number;

  @Column({ type: "integer", nullable: true })
  chips_at_bust?: number;

  @ManyToOne(() => Tournament, (tournament) => tournament.entries, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tournament_id" })
  tournament!: Tournament;

  @ManyToOne(() => Bot, (bot) => bot.tournament_entries, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "bot_id" })
  bot!: Bot;
}
