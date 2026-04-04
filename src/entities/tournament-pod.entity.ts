import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tournament } from "./tournament.entity";
import { Bot } from "./bot.entity";
import { bigIntTransformer } from "../common/transformers/bigint.transformer";

export type PodStatus = "pending" | "running" | "finished" | "cancelled";

@Entity("tournament_pods")
export class TournamentPod extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  master_tournament_id!: string;

  @Column({ type: "integer" })
  pod_number!: number;

  @Index()
  @Column({ type: "varchar", length: 20, default: "pending" })
  status: PodStatus = "pending";

  @Column({ type: "bigint", default: 0, transformer: bigIntTransformer })
  prize_pool: bigint = 0n;

  @Column({ type: "integer", default: 0 })
  player_count: number = 0;

  @Column({ type: "varchar", length: 36, nullable: true })
  winner_bot_id?: string;

  @ManyToOne(() => Tournament)
  @JoinColumn({ name: "master_tournament_id" })
  master_tournament!: Tournament;

  @ManyToOne(() => Bot, { nullable: true })
  @JoinColumn({ name: "winner_bot_id" })
  winner_bot?: Bot;
}
