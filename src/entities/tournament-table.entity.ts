import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  Index,
  Unique,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tournament } from "./tournament.entity";
import { Game } from "./game.entity";
import { TournamentSeat } from "./tournament-seat.entity";

export type TableStatus = "active" | "broken" | "finished";

@Entity("tournament_tables")
@Unique(["tournament_id", "table_number"])
export class TournamentTable extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  tournament_id: string;

  @Column({ type: "integer" })
  table_number: number;

  @Column({ type: "varchar", length: 20, default: "active" })
  status: TableStatus;

  @Column({ type: "varchar", length: 36, nullable: true })
  game_id: string | null;

  @ManyToOne(() => Tournament, (tournament) => tournament.tables, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tournament_id" })
  tournament: Tournament;

  @OneToOne(() => Game, { nullable: true })
  @JoinColumn({ name: "game_id" })
  game: Game | null;

  @OneToMany(() => TournamentSeat, (seat) => seat.tournament_table)
  seats: TournamentSeat[];
}
