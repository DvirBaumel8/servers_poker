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
import { Tournament } from "./tournament.entity";
import { TournamentTable } from "./tournament-table.entity";
import { Bot } from "./bot.entity";

@Entity("tournament_seats")
@Unique(["tournament_id", "bot_id"])
@Index(["tournament_table_id"])
@Index(["tournament_id", "busted"])
@Check(`"chips" >= 0`)
@Check(`"seat_number" >= 1 AND "seat_number" <= 10`)
export class TournamentSeat extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  tournament_id: string;

  @Column({ type: "varchar", length: 36 })
  tournament_table_id: string;

  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({ type: "integer" })
  seat_number: number;

  @Column({ type: "bigint" })
  chips: number;

  @Column({ type: "boolean", default: false })
  busted: boolean;

  @ManyToOne(() => Tournament, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tournament_id" })
  tournament: Tournament;

  @ManyToOne(() => TournamentTable, (table) => table.seats, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tournament_table_id" })
  tournament_table: TournamentTable;

  @ManyToOne(() => Bot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
