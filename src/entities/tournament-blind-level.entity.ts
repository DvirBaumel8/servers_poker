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
import { Tournament } from "./tournament.entity";

@Entity("tournament_blind_levels")
@Unique(["tournament_id", "level"])
@Check(`"level" >= 1`)
@Check(`"small_blind" > 0`)
@Check(`"big_blind" > "small_blind"`)
@Check(`"ante" >= 0`)
@Check(`"hands_played" >= 0`)
export class TournamentBlindLevel extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  tournament_id: string;

  @Column({ type: "integer" })
  level: number;

  @Column({ type: "bigint" })
  small_blind: number;

  @Column({ type: "bigint" })
  big_blind: number;

  @Column({ type: "bigint", default: 0 })
  ante: number;

  @Column({ type: "integer", default: 0 })
  hands_played: number;

  @Column({ type: "timestamp with time zone", nullable: true })
  started_at: Date | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  ended_at: Date | null;

  @ManyToOne(() => Tournament, (tournament) => tournament.blind_levels, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "tournament_id" })
  tournament: Tournament;
}
