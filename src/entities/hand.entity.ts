import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
  Check,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { Game } from "./game.entity";
import { HandPlayer } from "./hand-player.entity";
import { Action } from "./action.entity";

export type HandStage =
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "complete";

@Entity("hands")
@Unique(["game_id", "hand_number"])
@Index(["tournament_id"])
@Check(`"hand_number" >= 1`)
@Check(`"pot" >= 0`)
export class Hand extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  game_id: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  tournament_id: string | null;

  @Column({ type: "integer" })
  hand_number: number;

  @Column({ type: "varchar", length: 36, nullable: true })
  dealer_bot_id: string | null;

  @Column({ type: "bigint" })
  small_blind: number;

  @Column({ type: "bigint" })
  big_blind: number;

  @Column({ type: "bigint", default: 0 })
  ante: number;

  @Column({ type: "jsonb", default: [] })
  community_cards: Array<{ rank: string; suit: string }>;

  @Column({ type: "bigint", default: 0 })
  pot: number;

  @Column({ type: "varchar", length: 20, default: "preflop" })
  stage: HandStage;

  @Column({ type: "timestamp with time zone", nullable: true })
  started_at: Date | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  finished_at: Date | null;

  @ManyToOne(() => Game, (game) => game.hands, { onDelete: "CASCADE" })
  @JoinColumn({ name: "game_id" })
  game: Game;

  @OneToMany(() => HandPlayer, (hp) => hp.hand)
  players: HandPlayer[];

  @OneToMany(() => Action, (action) => action.hand)
  actions: Action[];
}
