import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Hand } from "./hand.entity";

@Entity("logic_bugs")
@Index(["hand_id"])
export class LogicBug extends BaseEntity {
  @Column({ type: "varchar", length: 36, nullable: true })
  hand_id: string | null;

  @Column({ type: "varchar", length: 100 })
  check_name: string;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "jsonb", default: {} })
  details: Record<string, unknown>;

  @Column({ type: "timestamp with time zone", default: () => "NOW()" })
  detected_at: Date;

  @ManyToOne(() => Hand, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "hand_id" })
  hand: Hand | null;
}
