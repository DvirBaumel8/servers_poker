import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
  Check,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { Bot } from "./bot.entity";

@Entity("bot_stats")
@Unique(["bot_id"])
@Check(`"total_hands" >= 0`)
@Check(`"total_tournaments" >= 0`)
@Check(`"tournament_wins" >= 0`)
@Check(`"vpip_hands" >= 0`)
@Check(`"pfr_hands" >= 0`)
@Check(`"wtsd_hands" >= 0`)
@Check(`"wmsd_hands" >= 0`)
export class BotStats extends BaseEntity {
  @Index()
  @Column({ type: "varchar", length: 36 })
  bot_id: string;

  @Column({ type: "integer", default: 0 })
  total_hands: number;

  @Column({ type: "integer", default: 0 })
  total_tournaments: number;

  @Column({ type: "integer", default: 0 })
  tournament_wins: number;

  @Column({ type: "bigint", default: 0 })
  total_net: number;

  @Column({ type: "integer", default: 0 })
  vpip_hands: number;

  @Column({ type: "integer", default: 0 })
  pfr_hands: number;

  @Column({ type: "integer", default: 0 })
  wtsd_hands: number;

  @Column({ type: "integer", default: 0 })
  wmsd_hands: number;

  @Column({ type: "integer", default: 0 })
  aggressive_actions: number;

  @Column({ type: "integer", default: 0 })
  passive_actions: number;

  @ManyToOne(() => Bot, (bot) => bot.stats, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: Bot;
}
