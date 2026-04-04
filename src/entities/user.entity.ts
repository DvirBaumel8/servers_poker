import { Entity, Column, OneToMany, Index } from "typeorm";
import { BaseEntity } from "./base.entity";
import { Bot } from "./bot.entity";
import { bigIntTransformer } from "../common/transformers/bigint.transformer";

@Entity("users")
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: "varchar", length: 100 })
  email!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "varchar", length: 60 })
  password_hash!: string;

  @Column({ type: "boolean", default: true })
  active: boolean = true;

  @Column({ type: "varchar", length: 20, default: "user" })
  role: "admin" | "user" = "user";

  @Column({ type: "boolean", default: false })
  email_verified: boolean = false;

  @Column({ type: "varchar", length: 6, nullable: true })
  verification_code?: string;

  @Column({ type: "timestamp with time zone", nullable: true })
  verification_code_expires_at?: Date;

  @Column({ type: "varchar", length: 6, nullable: true })
  password_reset_code?: string;

  @Column({ type: "timestamp with time zone", nullable: true })
  password_reset_expires_at?: Date;

  @Column({ type: "timestamp with time zone", nullable: true })
  last_login_at?: Date;

  @Column({ type: "int", default: 0 })
  failed_login_attempts: number = 0;

  @Column({ type: "timestamp with time zone", nullable: true })
  locked_until?: Date;

  @Column({ type: "timestamp with time zone", nullable: true })
  last_failed_login_at?: Date;

  @Index()
  @Column({ type: "varchar", length: 64, nullable: true })
  refresh_token_hash?: string;

  @Column({ type: "timestamp with time zone", nullable: true })
  refresh_token_expires_at?: Date;

  @Column({ type: "varchar", length: 20, default: "free" })
  subscription_status: "free" | "active" | "cancelled" | "expired" = "free";

  @Column({ type: "timestamp with time zone", nullable: true })
  subscription_start?: Date;

  @Column({ type: "timestamp with time zone", nullable: true })
  subscription_end?: Date;

  @Column({ type: "bigint", default: 0, transformer: bigIntTransformer })
  monthly_fee: bigint = 0n;

  @OneToMany(() => Bot, (bot) => bot.user)
  bots?: Bot[];
}
