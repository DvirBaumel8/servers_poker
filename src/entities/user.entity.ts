import { Entity, Column, OneToMany, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Bot } from "./bot.entity";

@Entity("users")
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: "varchar", length: 100 })
  email: string;

  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "varchar", length: 60 })
  password_hash: string;

  @Column({ type: "varchar", length: 64 })
  api_key_hash: string;

  @Column({ type: "timestamp with time zone", nullable: true })
  api_key_created_at: Date | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  api_key_expires_at: Date | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  api_key_last_used_at: Date | null;

  @Column({ type: "boolean", default: true })
  active: boolean;

  @Column({ type: "varchar", length: 20, default: "user" })
  role: "admin" | "user";

  @Column({ type: "boolean", default: false })
  email_verified: boolean;

  @Column({ type: "varchar", length: 6, nullable: true })
  verification_code: string | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  verification_code_expires_at: Date | null;

  @Column({ type: "varchar", length: 6, nullable: true })
  password_reset_code: string | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  password_reset_expires_at: Date | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  last_login_at: Date | null;

  @Column({ type: "int", default: 0 })
  failed_login_attempts: number;

  @Column({ type: "timestamp with time zone", nullable: true })
  locked_until: Date | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  last_failed_login_at: Date | null;

  @OneToMany(() => Bot, (bot) => bot.user)
  bots: Bot[];
}
