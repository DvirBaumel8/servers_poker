import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Check,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { TournamentEntry } from "./tournament-entry.entity";
import { GamePlayer } from "./game-player.entity";
import { BotStats } from "./bot-stats.entity";

@Entity("bots")
@Index(["user_id", "active"])
@Check(`"active" IN (true, false)`)
export class Bot extends BaseEntity {
  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description?: string;

  @Column({ type: "boolean", default: true })
  active: boolean = true;

  @Column({ type: "jsonb" })
  strategy!: Record<string, any>;

  @Index()
  @Column({ type: "varchar", length: 36 })
  user_id!: string;

  @ManyToOne(() => User, (user) => user.bots, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @OneToMany(() => TournamentEntry, (entry) => entry.bot)
  tournament_entries?: TournamentEntry[];

  @OneToMany(() => GamePlayer, (gp) => gp.bot)
  game_players?: GamePlayer[];

  @Column({ name: "is_system", type: "boolean", default: false })
  isSystem: boolean = false;

  @OneToMany(() => BotStats, (stats) => stats.bot)
  stats?: BotStats[];
}
