import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

export type SimulationStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type OpponentProfile =
  | "AGGRESSIVE_SHARKS"
  | "TIGHT_PASSIVE"
  | "CURRENT_META";

@Entity("simulations")
@Index(["user_id", "status"])
export class Simulation extends BaseEntity {
  @Column({ type: "varchar", length: 36 })
  user_id: string;

  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({
    type: "enum",
    enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED"],
    default: "PENDING",
  })
  status: SimulationStatus;

  @Column({ type: "integer" })
  hand_count: number;

  /** Number of hands completed so far. Used for progress reporting (progress % = progress_hands / hand_count * 100). */
  @Column({ type: "integer", default: 0 })
  progress_hands: number;

  @Column({
    type: "enum",
    enum: ["AGGRESSIVE_SHARKS", "TIGHT_PASSIVE", "CURRENT_META"],
  })
  opponent_profile: OpponentProfile;

  /** Snapshot of the bot's strategy config at the time the simulation was created. */
  @Column({ type: "jsonb" })
  config_snapshot: Record<string, any>;

  @Column({ type: "timestamp with time zone", nullable: true })
  completed_at: Date | null;
}
