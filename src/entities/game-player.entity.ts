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
import {
  bigIntTransformer,
  bigIntNullableTransformer,
} from "../common/transformers/bigint.transformer";
import { Game } from "./game.entity";
import { Bot } from "./bot.entity";

@Entity("game_players")
@Unique(["game_id", "bot_id"])
@Check(`"start_chips" >= 0`)
@Check(`"end_chips" >= 0 OR "end_chips" IS NULL`)
@Check(`"hands_played" >= 0`)
@Check(`"hands_won" >= 0`)
export class GamePlayer extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  game_id!: string;

  @Column({ type: "varchar", length: 36 })
  bot_id!: string;

  @Column({ type: "bigint", transformer: bigIntTransformer })
  start_chips!: bigint;

  @Column({
    type: "bigint",
    nullable: true,
    transformer: bigIntNullableTransformer,
  })
  end_chips?: bigint | null;

  @Column({ type: "integer", default: 0 })
  hands_played: number = 0;

  @Column({ type: "integer", default: 0 })
  hands_won: number = 0;

  @Column({ type: "integer", nullable: true })
  finish_position?: number | null;

  @ManyToOne(() => Game, (game) => game.players, { onDelete: "CASCADE" })
  @JoinColumn({ name: "game_id" })
  game!: Game;

  @ManyToOne(() => Bot, (bot) => bot.game_players, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot!: Bot;
}
