import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThanOrEqual } from "typeorm";
import { User } from "../entities/user.entity";
import { Bot } from "../entities/bot.entity";
import { Game } from "../entities/game.entity";
import { Hand } from "../entities/hand.entity";
import { Tournament } from "../entities/tournament.entity";
import { BotEvent } from "../entities/bot-event.entity";
import { ChipMovement } from "../entities/chip-movement.entity";
import { Action } from "../entities/action.entity";
import { GamePlayer } from "../entities/game-player.entity";
import { PlatformMetrics } from "../entities/platform-metrics.entity";
import { AuditLog } from "../entities/audit-log.entity";

const GAME_STATUS_FINISHED = "finished";
const GAME_STATUS_ACTIVE = "running";
const TOURNAMENT_STATUS_FINISHED = "finished";
const TOURNAMENT_STATUS_RUNNING = "running";

export interface LifetimeStats {
  totalUsers: number;
  totalBots: number;
  totalHandsDealt: number;
  totalTournaments: number;
  totalGames: number;
  totalChipVolume: number;
}

export interface TodayStats {
  newUsers: number;
  activeUsers: number;
  newBots: number;
  activeBots: number;
  gamesPlayed: number;
  handsDealt: number;
  tournamentsCompleted: number;
}

export interface LiveStats {
  activeGames: number;
  activeTournaments: number;
  playersInGames: number;
  currentHandsPerMinute: number;
}

export interface HealthStats {
  avgBotResponseMs: number;
  botTimeoutCount: number;
  botErrorCount: number;
  errorRate: string;
}

export interface PlatformStats {
  lifetime: LifetimeStats;
  today: TodayStats;
  live: LiveStats;
  health: HealthStats;
  generatedAt: string;
}

export interface DailySummaryData {
  date: Date;
  lifetime: LifetimeStats;
  today: TodayStats;
  health: HealthStats;
  topPerformers: Array<{
    botId: string;
    botName: string;
    netChips: number;
  }>;
  peakConcurrentGames: number;
}

@Injectable()
export class PlatformAnalyticsService {
  private readonly logger = new Logger(PlatformAnalyticsService.name);
  private handCountCache: { count: number; timestamp: number } | null = null;
  private readonly HAND_COUNT_CACHE_TTL = 60000; // 1 minute

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Bot)
    private readonly botRepository: Repository<Bot>,
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    @InjectRepository(Hand)
    private readonly handRepository: Repository<Hand>,
    @InjectRepository(Tournament)
    private readonly tournamentRepository: Repository<Tournament>,
    @InjectRepository(BotEvent)
    private readonly botEventRepository: Repository<BotEvent>,
    @InjectRepository(ChipMovement)
    private readonly chipMovementRepository: Repository<ChipMovement>,
    @InjectRepository(Action)
    private readonly actionRepository: Repository<Action>,
    @InjectRepository(GamePlayer)
    private readonly gamePlayerRepository: Repository<GamePlayer>,
    @InjectRepository(PlatformMetrics)
    private readonly metricsRepository: Repository<PlatformMetrics>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async getLifetimeStats(): Promise<LifetimeStats> {
    const [
      totalUsers,
      totalBots,
      totalHandsDealt,
      totalTournaments,
      totalGames,
      chipVolumeResult,
    ] = await Promise.all([
      this.userRepository.count(),
      this.botRepository.count(),
      this.getCachedHandCount(),
      this.tournamentRepository.count({
        where: { status: TOURNAMENT_STATUS_FINISHED },
      }),
      this.gameRepository.count({
        where: { status: GAME_STATUS_FINISHED },
      }),
      this.chipMovementRepository
        .createQueryBuilder("cm")
        .select("COALESCE(SUM(ABS(cm.amount)), 0)", "total")
        .getRawOne(),
    ]);

    return {
      totalUsers,
      totalBots,
      totalHandsDealt,
      totalTournaments,
      totalGames,
      totalChipVolume: parseInt(chipVolumeResult?.total || "0", 10),
    };
  }

  private async getCachedHandCount(): Promise<number> {
    const now = Date.now();
    if (
      this.handCountCache &&
      now - this.handCountCache.timestamp < this.HAND_COUNT_CACHE_TTL
    ) {
      return this.handCountCache.count;
    }

    const count = await this.handRepository.count();
    this.handCountCache = { count, timestamp: now };
    return count;
  }

  async getTodayStats(): Promise<TodayStats> {
    const todayStart = this.getStartOfDay();

    const [
      newUsers,
      activeUsers,
      newBots,
      activeBots,
      gamesPlayed,
      handsDealt,
      tournamentsCompleted,
    ] = await Promise.all([
      this.userRepository.count({
        where: { created_at: MoreThanOrEqual(todayStart) },
      }),
      this.getActiveUsersToday(todayStart),
      this.botRepository.count({
        where: { created_at: MoreThanOrEqual(todayStart) },
      }),
      this.getActiveBotsToday(todayStart),
      this.gameRepository.count({
        where: {
          status: GAME_STATUS_FINISHED,
          finished_at: MoreThanOrEqual(todayStart),
        },
      }),
      this.handRepository.count({
        where: { created_at: MoreThanOrEqual(todayStart) },
      }),
      this.tournamentRepository.count({
        where: {
          status: TOURNAMENT_STATUS_FINISHED,
          finished_at: MoreThanOrEqual(todayStart),
        },
      }),
    ]);

    return {
      newUsers,
      activeUsers,
      newBots,
      activeBots,
      gamesPlayed,
      handsDealt,
      tournamentsCompleted,
    };
  }

  private async getActiveUsersToday(todayStart: Date): Promise<number> {
    const result = await this.auditLogRepository
      .createQueryBuilder("log")
      .select("COUNT(DISTINCT log.user_id)", "count")
      .where("log.created_at >= :todayStart", { todayStart })
      .andWhere("log.user_id IS NOT NULL")
      .getRawOne();

    return parseInt(result?.count || "0", 10);
  }

  private async getActiveBotsToday(todayStart: Date): Promise<number> {
    const result = await this.gamePlayerRepository
      .createQueryBuilder("gp")
      .innerJoin("gp.game", "game")
      .select("COUNT(DISTINCT gp.bot_id)", "count")
      .where("game.created_at >= :todayStart", { todayStart })
      .getRawOne();

    return parseInt(result?.count || "0", 10);
  }

  private liveGameManager:
    | import("./game/live-game-manager.service").LiveGameManagerService
    | null = null;
  private tournamentDirector:
    | import("../modules/tournaments/tournament-director.service").TournamentDirectorService
    | null = null;

  setLiveServices(
    liveGameManager: import("./game/live-game-manager.service").LiveGameManagerService,
    tournamentDirector: import("../modules/tournaments/tournament-director.service").TournamentDirectorService,
  ): void {
    this.liveGameManager = liveGameManager;
    this.tournamentDirector = tournamentDirector;
    this.logger.log("Live services injected for real-time stats");
  }

  async getLiveStats(): Promise<LiveStats> {
    const [
      dbActiveGames,
      dbActiveTournaments,
      dbPlayersInGames,
      handsLastMinute,
    ] = await Promise.all([
      this.gameRepository.count({
        where: { status: GAME_STATUS_ACTIVE },
      }),
      this.tournamentRepository.count({
        where: { status: TOURNAMENT_STATUS_RUNNING },
      }),
      this.getPlayersInActiveGames(),
      this.getHandsLastMinute(),
    ]);

    // Add in-memory game counts from LiveGameManager
    let activeGames = dbActiveGames;
    let playersInGames = dbPlayersInGames;
    let activeTournaments = dbActiveTournaments;

    if (this.liveGameManager) {
      const liveGames = this.liveGameManager.getAllGames();
      activeGames = Math.max(activeGames, liveGames.length);

      let livePlayersCount = 0;
      for (const lg of liveGames) {
        const state = lg.game.getPublicState();
        livePlayersCount += state.players.filter(
          (p) => !p.disconnected && p.chips > 0,
        ).length;
      }
      playersInGames = Math.max(playersInGames, livePlayersCount);
    }

    if (this.tournamentDirector) {
      const activeTournamentIds =
        this.tournamentDirector.getActiveTournaments();
      activeTournaments = Math.max(
        activeTournaments,
        activeTournamentIds.length,
      );
    }

    return {
      activeGames,
      activeTournaments,
      playersInGames,
      currentHandsPerMinute: handsLastMinute,
    };
  }

  private async getPlayersInActiveGames(): Promise<number> {
    const result = await this.gamePlayerRepository
      .createQueryBuilder("gp")
      .innerJoin("gp.game", "game")
      .select("COUNT(*)", "count")
      .where("game.status = :status", { status: GAME_STATUS_ACTIVE })
      .getRawOne();

    return parseInt(result?.count || "0", 10);
  }

  private async getHandsLastMinute(): Promise<number> {
    const oneMinuteAgo = new Date(Date.now() - 60000);
    return this.handRepository.count({
      where: { created_at: MoreThanOrEqual(oneMinuteAgo) },
    });
  }

  async getHealthStats(): Promise<HealthStats> {
    const todayStart = this.getStartOfDay();

    const [avgResponseTime, timeoutCount, errorCount, totalActions] =
      await Promise.all([
        this.getAverageResponseTime(todayStart),
        this.botEventRepository.count({
          where: {
            event_type: "timeout",
            created_at: MoreThanOrEqual(todayStart),
          },
        }),
        this.botEventRepository.count({
          where: {
            event_type: "error",
            created_at: MoreThanOrEqual(todayStart),
          },
        }),
        this.actionRepository.count({
          where: { created_at: MoreThanOrEqual(todayStart) },
        }),
      ]);

    const totalErrors = timeoutCount + errorCount;
    const errorRate =
      totalActions > 0
        ? `${((totalErrors / totalActions) * 100).toFixed(2)}%`
        : "0%";

    return {
      avgBotResponseMs: avgResponseTime,
      botTimeoutCount: timeoutCount,
      botErrorCount: errorCount,
      errorRate,
    };
  }

  private async getAverageResponseTime(since: Date): Promise<number> {
    const result = await this.actionRepository
      .createQueryBuilder("action")
      .select("AVG(action.response_time_ms)", "avg")
      .where("action.created_at >= :since", { since })
      .andWhere("action.response_time_ms IS NOT NULL")
      .getRawOne();

    return Math.round(parseFloat(result?.avg || "0"));
  }

  async getPlatformStats(): Promise<PlatformStats> {
    const [lifetime, today, live, health] = await Promise.all([
      this.getLifetimeStats(),
      this.getTodayStats(),
      this.getLiveStats(),
      this.getHealthStats(),
    ]);

    return {
      lifetime,
      today,
      live,
      health,
      generatedAt: new Date().toISOString(),
    };
  }

  async getTopPerformers(
    limit: number = 5,
    since?: Date,
  ): Promise<Array<{ botId: string; botName: string; netChips: number }>> {
    const queryBuilder = this.gamePlayerRepository
      .createQueryBuilder("gp")
      .innerJoin("gp.bot", "bot")
      .innerJoin("gp.game", "game")
      .select("gp.bot_id", "botId")
      .addSelect("bot.name", "botName")
      .addSelect("SUM(gp.end_chips - gp.start_chips)", "netChips")
      .where("game.status = :status", { status: GAME_STATUS_FINISHED })
      .groupBy("gp.bot_id")
      .addGroupBy("bot.name")
      .orderBy('"netChips"', "DESC")
      .limit(limit);

    if (since) {
      queryBuilder.andWhere("game.finished_at >= :since", { since });
    }

    const results = await queryBuilder.getRawMany();

    return results.map((r) => ({
      botId: r.botId,
      botName: r.botName,
      netChips: parseInt(r.netChips || "0", 10),
    }));
  }

  async getDailySummaryData(): Promise<DailySummaryData> {
    const todayStart = this.getStartOfDay();

    const [lifetime, today, health, topPerformers, peakConcurrent] =
      await Promise.all([
        this.getLifetimeStats(),
        this.getTodayStats(),
        this.getHealthStats(),
        this.getTopPerformers(5, todayStart),
        this.getPeakConcurrentGames(todayStart),
      ]);

    return {
      date: todayStart,
      lifetime,
      today,
      health,
      topPerformers,
      peakConcurrentGames: peakConcurrent,
    };
  }

  private async getPeakConcurrentGames(since: Date): Promise<number> {
    const result = await this.gameRepository
      .createQueryBuilder("game")
      .select("COUNT(*)", "count")
      .where("game.started_at >= :since", { since })
      .andWhere("game.status IN (:...statuses)", {
        statuses: [GAME_STATUS_ACTIVE, GAME_STATUS_FINISHED],
      })
      .getRawOne();

    return parseInt(result?.count || "0", 10);
  }

  async saveDailyMetrics(): Promise<PlatformMetrics> {
    const today = this.getStartOfDay();
    const todayStr = today.toISOString().split("T")[0];

    let metrics = await this.metricsRepository.findOne({
      where: { date: today },
    });

    const [lifetime, todayStats, health] = await Promise.all([
      this.getLifetimeStats(),
      this.getTodayStats(),
      this.getHealthStats(),
    ]);

    const peakConcurrent = await this.getPeakConcurrentGames(today);

    if (!metrics) {
      metrics = this.metricsRepository.create({
        date: today,
      });
    }

    metrics.total_users = lifetime.totalUsers;
    metrics.new_users = todayStats.newUsers;
    metrics.total_bots = lifetime.totalBots;
    metrics.new_bots = todayStats.newBots;
    metrics.active_users = todayStats.activeUsers;
    metrics.active_bots = todayStats.activeBots;
    metrics.games_played = todayStats.gamesPlayed;
    metrics.hands_dealt = todayStats.handsDealt;
    metrics.tournaments_completed = todayStats.tournamentsCompleted;
    metrics.total_chip_volume = lifetime.totalChipVolume;
    metrics.avg_bot_response_ms = health.avgBotResponseMs;
    metrics.bot_timeout_count = health.botTimeoutCount;
    metrics.bot_error_count = health.botErrorCount;
    metrics.peak_concurrent_games = peakConcurrent;

    await this.metricsRepository.save(metrics);
    this.logger.log(`Saved daily metrics for ${todayStr}`);

    return metrics;
  }

  async getMetricsHistory(days: number = 30): Promise<PlatformMetrics[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.metricsRepository.find({
      where: {
        date: MoreThanOrEqual(startDate),
      },
      order: { date: "ASC" },
    });
  }

  private getStartOfDay(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}
