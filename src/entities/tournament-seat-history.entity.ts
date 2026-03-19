import { Entity, Column, ManyToOne, JoinColumn, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tournament } from "./tournament.entity";
import { TournamentTable } from "./tournament-table.entity";
import { Bot } from "./bot.entity";

export type SeatHistoryReason =
  | "initial"
  | "balance_move"
  | "table_break"
  | "final_table";

@Entity("tournament_seat_history")
@Index(["tournament_id", "bot_id"])
@Check(`"seat_number" >= 1 AND "seat_number" <= 10`)
@Check(`"chips_on_arrival" >= 0`)
@Check(`"chips_on_departure" >= 0 OR "chips_on_departure" IS NULL`)
export class TournamentSeatHistory extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  tournament_id: string;

  @Column({ type: "varchar", length: 36 })
  tournament_table_id: string;

  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({ type: "integer" })
  seat_number: number;

  @Column({ type: "bigint" })
  chips_on_arrival: number;

  @Column({ type: "bigint", nullable: true })
  chips_on_departure: number | null;

  @Column({ type: "varchar", length: 20 })
  reason: SeatHistoryReason;

  @Column({ type: "timestamp with time zone", nullable: true })
  departed_at: Date | null;

  @ManyToOne(() => Tournament, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tournament_id" })
  tournament: Tournament;

  @ManyToOne(() => TournamentTable, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tournament_table_id" })
  tournament_table: TournamentTable;

  @ManyToOne(() => Bot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
