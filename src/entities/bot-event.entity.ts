import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Bot } from "./bot.entity";
import { Game } from "./game.entity";
import { Hand } from "./hand.entity";

export type EventType =
  | "strike"
  | "disconnect"
  | "reconnect"
  | "timeout"
  | "invalid_action"
  | "error";

@Entity("bot_events")
@Index(["bot_id", "created_at"])
export class BotEvent extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  game_id: string | null;

  @ManyToOne(() => Game, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "game_id" })
  game: Game | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  hand_id: string | null;

  @ManyToOne(() => Hand, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "hand_id" })
  hand: Hand | null;

  @Column({ type: "varchar", length: 20 })
  event_type: EventType;

  @Column({ type: "text", nullable: true })
  details: string | null;

  @Column({ type: "jsonb", nullable: true })
  context: Record<string, any> | null;

  @ManyToOne(() => Bot, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
