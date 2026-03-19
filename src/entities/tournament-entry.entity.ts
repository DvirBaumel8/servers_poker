import { Entity, Column, ManyToOne, JoinColumn, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tournament } from "./tournament.entity";
import { Bot } from "./bot.entity";

export type EntryType = "initial" | "rebuy" | "re_entry";

@Entity("tournament_entries")
@Index(["tournament_id", "bot_id"])
@Check(`"payout" >= 0`)
@Check(`"finish_position" IS NULL OR "finish_position" >= 1`)
export class TournamentEntry extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  tournament_id: string;

  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({ type: "varchar", length: 20, default: "initial" })
  entry_type: EntryType;

  @Column({ type: "integer", nullable: true })
  finish_position: number | null;

  @Column({ type: "integer", nullable: true })
  bust_level: number | null;

  @Column({ type: "bigint", default: 0 })
  payout: number;

  @ManyToOne(() => Tournament, (tournament) => tournament.entries, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tournament_id" })
  tournament: Tournament;

  @ManyToOne(() => Bot, (bot) => bot.tournament_entries, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
