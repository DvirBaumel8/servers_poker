import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

export type TicketStatus = "open" | "in_progress" | "closed";

export interface TicketMetadata {
  userAgent?: string;
  lastHandId?: string;
  tournamentId?: string;
  url?: string;
}

@Entity("support_tickets")
export class SupportTicket extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36, nullable: true })
  user_id: string | null;

  @Column({ type: "varchar", length: 255 })
  email: string;

  @Column({ type: "varchar", length: 200 })
  subject: string;

  @Column({ type: "text" })
  message: string;

  @Index()
  @Column({
    type: "enum",
    enum: ["open", "in_progress", "closed"],
    default: "open",
  })
  status: TicketStatus;

  @Column({ type: "jsonb", default: {} })
  metadata: TicketMetadata;
}
