import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Table } from "./table.entity";
import { Bot } from "./bot.entity";

@Entity("table_seats")
@Unique(["table_id", "bot_id"])
export class TableSeat extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  table_id: string;

  @Index()
  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({
    type: "timestamp with time zone",
    default: () => "CURRENT_TIMESTAMP",
  })
  joined_at: Date;

  @Column({ type: "boolean", default: false })
  disconnected: boolean;

  @Column({ type: "timestamp with time zone", nullable: true })
  disconnected_at: Date | null;

  @ManyToOne(() => Table)
  @JoinColumn({ name: "table_id" })
  table: Table;

  @ManyToOne(() => Bot)
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
