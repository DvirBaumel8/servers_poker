import {
  Entity,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { GamePlayer } from "./game-player.entity";
import { Hand } from "./hand.entity";
import { Table } from "./table.entity";
import { Tournament } from "./tournament.entity";

export type GameStatus = "waiting" | "running" | "finished";

@Entity("games")
@Check(`"total_hands" >= 0`)
export class Game extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  table_id: string;

  @ManyToOne(() => Table, { onDelete: "CASCADE" })
  @JoinColumn({ name: "table_id" })
  table: Table;

  @Index()
  @Column({ type: "varchar", length: 36, nullable: true })
  tournament_id: string | null;

  @ManyToOne(() => Tournament, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "tournament_id" })
  tournament: Tournament | null;

  @Index()
  @Column({ type: "varchar", length: 20, default: "waiting" })
  status: GameStatus;

  @Column({ type: "integer", default: 0 })
  total_hands: number;

  @Column({ type: "timestamp with time zone", nullable: true })
  started_at: Date | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  finished_at: Date | null;

  @OneToMany(() => GamePlayer, (gp) => gp.game)
  players: GamePlayer[];

  @OneToMany(() => Hand, (hand) => hand.game)
  hands: Hand[];
}
