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

  @Column({ type: "varchar", length: 64 })
  api_key_hash: string;

  @Column({ type: "boolean", default: true })
  active: boolean;

  @Column({ type: "varchar", length: 20, default: "user" })
  role: "admin" | "user";

  @Column({ type: "timestamp with time zone", nullable: true })
  last_login_at: Date | null;

  @OneToMany(() => Bot, (bot) => bot.user)
  bots: Bot[];
}
