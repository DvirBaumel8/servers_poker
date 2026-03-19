import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { Bot } from "../entities/bot.entity";
import { BotStats } from "../entities/bot-stats.entity";
import { BotEvent } from "../entities/bot-event.entity";
import { TournamentEntry } from "../entities/tournament-entry.entity";

export interface LeaderboardEntry {
  bot_id: string;
  bot_name: string;
  total_net: number;
  total_tournaments: number;
  tournament_wins: number;
  total_hands: number;
}

export interface BotProfile {
  bot: Bot;
  stats: BotStats | null;
  recentTournaments: TournamentEntry[];
  vpip: number;
  pfr: number;
  aggression: number;
}

@Injectable()
export class AnalyticsRepository {
  constructor(
    @InjectRepository(BotStats)
    private readonly statsRepository: Repository<BotStats>,
    @InjectRepository(BotEvent)
    private readonly eventRepository: Repository<BotEvent>,
    @InjectRepository(TournamentEntry)
    private readonly entryRepository: Repository<TournamentEntry>,
    @InjectRepository(Bot)
    private readonly botRepository: Repository<Bot>,
    private readonly dataSource: DataSource,
  ) {}

  async ensureBotStats(botId: string): Promise<BotStats> {
    let stats = await this.statsRepository.findOne({
      where: { bot_id: botId },
    });
    if (!stats) {
      stats = this.statsRepository.create({ bot_id: botId });
      stats = await this.statsRepository.save(stats);
    }
    return stats;
  }

  async updateBotStats(
    botId: string,
    updates: Partial<BotStats>,
  ): Promise<void> {
    await this.ensureBotStats(botId);
    await this.statsRepository.update({ bot_id: botId }, updates);
  }

  async incrementBotStats(
    botId: string,
    increments: {
      total_hands?: number;
      total_tournaments?: number;
      tournament_wins?: number;
      total_net?: number;
      vpip_hands?: number;
      pfr_hands?: number;
      wtsd_hands?: number;
      wmsd_hands?: number;
      aggressive_actions?: number;
      passive_actions?: number;
    },
  ): Promise<void> {
    await this.ensureBotStats(botId);

    const setClause: string[] = [];
    const params: Record<string, number> = {};

    for (const [key, value] of Object.entries(increments)) {
      if (value !== undefined && value !== 0) {
        setClause.push(`${key} = ${key} + :${key}`);
        params[key] = value;
      }
    }

    if (setClause.length > 0) {
      await this.dataSource.query(
        `UPDATE bot_stats SET ${setClause.join(", ")}, updated_at = NOW() WHERE bot_id = $1`,
        [botId, ...Object.values(params)],
      );
    }
  }

  async getLeaderboard(limit: number = 20): Promise<LeaderboardEntry[]> {
    return this.dataSource.query(
      `
      SELECT 
        bs.bot_id,
        b.name as bot_name,
        bs.total_net,
        bs.total_tournaments,
        bs.tournament_wins,
        bs.total_hands
      FROM bot_stats bs
      JOIN bots b ON b.id = bs.bot_id
      WHERE b.active = true
      ORDER BY bs.total_net DESC
      LIMIT $1
    `,
      [limit],
    );
  }

  async getBotProfile(botId: string): Promise<BotProfile | null> {
    const bot = await this.botRepository.findOne({ where: { id: botId } });
    if (!bot) return null;

    const stats = await this.statsRepository.findOne({
      where: { bot_id: botId },
    });

    const recentTournaments = await this.entryRepository.find({
      where: { bot_id: botId },
      relations: ["tournament"],
      order: { created_at: "DESC" },
      take: 10,
    });

    const vpip =
      stats && stats.total_hands > 0
        ? (stats.vpip_hands / stats.total_hands) * 100
        : 0;
    const pfr =
      stats && stats.total_hands > 0
        ? (stats.pfr_hands / stats.total_hands) * 100
        : 0;
    const aggression =
      stats && stats.passive_actions > 0
        ? stats.aggressive_actions / stats.passive_actions
        : 0;

    return {
      bot,
      stats,
      recentTournaments,
      vpip,
      pfr,
      aggression,
    };
  }

  async recordBotEvent(data: Partial<BotEvent>): Promise<BotEvent> {
    const event = this.eventRepository.create(data);
    return this.eventRepository.save(event);
  }

  async getBotEvents(botId: string, limit: number = 50): Promise<BotEvent[]> {
    return this.eventRepository.find({
      where: { bot_id: botId },
      order: { created_at: "DESC" },
      take: limit,
    });
  }

  async getTournamentChipProgression(
    tournamentId: string,
    botId: string,
  ): Promise<Array<{ hand_number: number; chips: number }>> {
    return this.dataSource.query(
      `
      SELECT 
        h.hand_number,
        hp.end_chips as chips
      FROM hand_players hp
      JOIN hands h ON h.id = hp.hand_id
      WHERE h.tournament_id = $1 AND hp.bot_id = $2
      ORDER BY h.hand_number ASC
    `,
      [tournamentId, botId],
    );
  }
}
