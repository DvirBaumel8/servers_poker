import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  BeforeInsert,
} from "typeorm";
import { v4 as uuidv4 } from "uuid";

export const EVENT_TABLE_MOVE = "TABLE_MOVE";

@Entity("tournament_events")
@Index("idx_tournament_events_tournament_id", ["tournament_id"])
@Index("idx_tournament_events_created_at", ["created_at"])
export class TournamentEvent {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }

  @Column({ type: "varchar", length: 36 })
  tournament_id!: string;

  @Column({ type: "varchar", length: 50 })
  event_type!: string;

  @Column({ type: "varchar", length: 36 })
  bot_id!: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  from_table_id!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  to_table_id!: string | null;

  @Column({ type: "int", nullable: true })
  from_seat!: number | null;

  @Column({ type: "int", nullable: true })
  to_seat!: number | null;

  @Column({ type: "bigint", nullable: true })
  chips_at_move!: bigint | null;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
