import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

export type AuditAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "chip_movement"
  | "game_action";

@Entity("audit_logs")
@Index(["user_id", "created_at"])
@Index(["resource", "created_at"])
@Index(["action", "created_at"])
export class AuditLog extends BaseEntity {
  @Column({ type: "varchar", length: 36, nullable: true })
  user_id: string | null;

  @Column({ type: "varchar", length: 50 })
  action: AuditAction;

  @Column({ type: "varchar", length: 100 })
  resource: string;

  @Column({ type: "varchar", length: 36, nullable: true })
  resource_id: string | null;

  @Column({ type: "varchar", length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  user_agent: string | null;

  @Column({ type: "varchar", length: 10 })
  http_method: string;

  @Column({ type: "integer" })
  status_code: number;

  @Column({ type: "integer", nullable: true })
  duration_ms: number | null;

  @Column({ type: "jsonb", nullable: true })
  request_body: Record<string, any> | null;

  @Column({ type: "jsonb", nullable: true })
  response_summary: Record<string, any> | null;

  @Column({ type: "text", nullable: true })
  error_message: string | null;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null;
}
