import { Entity, Column, Check, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

export type TableStatus = "waiting" | "running" | "finished";

@Entity("tables")
@Check(`"small_blind" > 0`)
@Check(`"big_blind" > "small_blind"`)
@Check(`"starting_chips" > 0`)
@Check(`"max_players" >= 2 AND "max_players" <= 9`)
export class Table extends BaseEntity {
  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "bigint", default: 10 })
  small_blind: number;

  @Column({ type: "bigint", default: 20 })
  big_blind: number;

  @Column({ type: "bigint", default: 1000 })
  starting_chips: number;

  @Column({ type: "integer", default: 9 })
  max_players: number;

  @Column({ type: "integer", default: 10000 })
  turn_timeout_ms: number;

  @Index()
  @Column({ type: "varchar", length: 20, default: "waiting" })
  status: TableStatus;
}
