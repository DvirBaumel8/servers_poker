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
import { bigIntTransformer } from "../common/transformers/bigint.transformer";
import { Game } from "./game.entity";
import { Bot } from "./bot.entity";
import { Tournament } from "./tournament.entity";
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
  game_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  tournament_id?: string;

  @ManyToOne(() => Tournament, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "tournament_id" })
  tournament?: Tournament;

  @Column({ type: "integer" })
  hand_number!: number;

  @Column({ type: "varchar", length: 36, nullable: true })
  dealer_bot_id?: string;

  @ManyToOne(() => Bot, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "dealer_bot_id" })
  dealer_bot?: Bot;

  @Column({ type: "bigint", transformer: bigIntTransformer })
  small_blind!: bigint;

  @Column({ type: "bigint", transformer: bigIntTransformer })
  big_blind!: bigint;

  @Column({ type: "bigint", default: 0, transformer: bigIntTransformer })
  ante: bigint = 0n;

  @Column({ type: "jsonb", default: [] })
  community_cards: Array<{ rank: string; suit: string }> = [];

  @Column({ type: "bigint", default: 0, transformer: bigIntTransformer })
  pot: bigint = 0n;

  @Column({ type: "varchar", length: 20, default: "preflop" })
  stage: HandStage = "preflop";

  @Column({ type: "timestamp with time zone", nullable: true })
  started_at?: Date;

  @Column({ type: "timestamp with time zone", nullable: true })
  finished_at?: Date;

  @Column({ type: "boolean", default: false })
  validation_error: boolean = false;

  @Column({ type: "boolean", default: false })
  is_audited: boolean = false;

  @ManyToOne(() => Game, (game) => game.hands, { onDelete: "CASCADE" })
  @JoinColumn({ name: "game_id" })
  game!: Game;

  @OneToMany(() => HandPlayer, (hp) => hp.hand)
  players?: HandPlayer[];

  @OneToMany(() => Action, (action) => action.hand)
  actions?: Action[];
}
