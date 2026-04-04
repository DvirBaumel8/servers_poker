import { Entity, Column, OneToMany, Index, Check } from "typeorm";
import { BaseEntity } from "./base.entity";
import { bigIntTransformer } from "../common/transformers/bigint.transformer";
import { TournamentEntry } from "./tournament-entry.entity";
import { TournamentTable } from "./tournament-table.entity";
import { TournamentBlindLevel } from "./tournament-blind-level.entity";

export type TournamentStatus =
  | "registering"
  | "running"
  | "final_table"
  | "finished"
  | "cancelled";

export type TournamentType = "rolling" | "scheduled";

@Entity("tournaments")
@Check(`"type" IN ('rolling', 'scheduled')`)
@Check(`"buy_in" >= 0`)
@Check(`"starting_chips" > 0`)
@Check(`"min_players" >= 2`)
@Check(`"max_players" >= "min_players"`)
@Check(`"players_per_table" >= 2 AND "players_per_table" <= 10`)
export class Tournament extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "varchar", length: 20 })
  type: TournamentType;

  @Index()
  @Column({ type: "varchar", length: 20, default: "registering" })
  status: TournamentStatus;

  @Column({ type: "bigint", transformer: bigIntTransformer })
  buy_in: bigint;

  @Column({ type: "bigint", transformer: bigIntTransformer })
  starting_chips: bigint;

  @Column({ type: "integer" })
  min_players: number;

  @Column({ type: "integer" })
  max_players: number;

  @Column({ type: "integer", default: 9 })
  players_per_table: number;

  @Column({ type: "integer", default: 10000 })
  turn_timeout_ms: number;

  @Column({ type: "boolean", default: true })
  rebuys_allowed: boolean;

  @Column({ type: "timestamp with time zone", nullable: true })
  scheduled_start_at: Date | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  started_at: Date | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  finished_at: Date | null;

  @Column({ type: "boolean", default: false })
  is_archived: boolean;

  @Column({ type: "varchar", length: 512, nullable: true })
  archive_url: string | null;

  @OneToMany(() => TournamentEntry, (entry) => entry.tournament)
  entries: TournamentEntry[];

  @OneToMany(() => TournamentTable, (table) => table.tournament)
  tables: TournamentTable[];

  @OneToMany(() => TournamentBlindLevel, (level) => level.tournament)
  blind_levels: TournamentBlindLevel[];
}
