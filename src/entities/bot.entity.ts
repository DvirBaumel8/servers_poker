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
@Check(`"active" IN (true, false)`)
export class Bot extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "varchar", length: 500 })
  endpoint: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "boolean", default: true })
  active: boolean;

  @Column({ type: "varchar", length: 36 })
  user_id: string;

  @ManyToOne(() => User, (user) => user.bots, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({ type: "jsonb", nullable: true })
  last_validation: Record<string, any> | null;

  @Column({ type: "integer", nullable: true })
  last_validation_score: number | null;

  @OneToMany(() => TournamentEntry, (entry) => entry.bot)
  tournament_entries: TournamentEntry[];

  @OneToMany(() => GamePlayer, (gp) => gp.bot)
  game_players: GamePlayer[];

  @OneToMany(() => BotStats, (stats) => stats.bot)
  stats: BotStats[];
}
