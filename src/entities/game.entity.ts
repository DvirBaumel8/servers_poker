import { Entity, Column, OneToMany, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";
import { GamePlayer } from "./game-player.entity";
import { Hand } from "./hand.entity";

export type GameStatus = "waiting" | "running" | "finished";

@Entity("games")
@Check(`"total_hands" >= 0`)
export class Game extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  table_id: string;

  @Index()
  @Column({ type: "varchar", length: 36, nullable: true })
  tournament_id: string | null;

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
