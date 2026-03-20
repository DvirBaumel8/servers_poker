import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Game } from "./game.entity";

/**
 * Stores provably fair seed data for each hand.
 * Allows players to verify hand fairness after the game.
 */
@Entity("hand_seeds")
@Index(["game_id", "hand_number"], { unique: true })
export class HandSeed extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  game_id: string;

  @Column({ type: "integer" })
  hand_number: number;

  @Column({ type: "varchar", length: 64 })
  server_seed: string;

  @Column({ type: "varchar", length: 64 })
  server_seed_hash: string;

  @Column({ type: "varchar", length: 32 })
  client_seed: string;

  @Column({ type: "varchar", length: 64 })
  combined_hash: string;

  @Column({ type: "jsonb" })
  deck_order: number[];

  @Column({ type: "boolean", default: false })
  revealed: boolean;

  @Column({ type: "timestamp with time zone", nullable: true })
  revealed_at: Date | null;

  @ManyToOne(() => Game, { onDelete: "CASCADE" })
  @JoinColumn({ name: "game_id" })
  game: Game;
}
