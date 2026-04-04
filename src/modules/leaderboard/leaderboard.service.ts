import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { LockService } from "../../common/redis/lock.service";
import {
  TierBadge,
  LeaderboardQueryDto,
  LeaderboardEntryDto,
  UserLeaderboardEntryDto,
  PaginatedLeaderboardDto,
  BotPerformanceDto,
  HotStreakEntryDto,
} from "./dto/leaderboard.dto";

/** Maps DB tier values to API badge enum */
const TIER_BADGE_MAP: Record<string, TierBadge> = {
  quick: TierBadge.TIER_1_QUICK,
  strategy: TierBadge.TIER_2_MATRIX,
  pro: TierBadge.TIER_3_ELITE,
};

/** Maps sortBy param to safe SQL column name */
const SORT_COLUMNS: Record<string, string> = {
  bb100: "bb_per_100",
  roi: "roi_pct",
  net_profit: "total_net",
};

/** Maps period param to PostgreSQL interval string */
const PERIOD_INTERVALS: Record<string, string> = {
  daily: "1 day",
  weekly: "7 days",
  monthly: "30 days",
};

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);
  private lastRefreshedAt: Date = new Date();

  constructor(
    private readonly dataSource: DataSource,
    private readonly lockService: LockService,
  ) {}

  // ==========================================================================
  // CRON: Refresh materialized view every 15 minutes
  // ==========================================================================

  @Cron("*/15 * * * *", { name: "leaderboard-mv-refresh", timeZone: "UTC" })
  async refreshLeaderboard(): Promise<void> {
    await this.lockService.withLock(
      { key: "lock:leaderboard:refresh", ttlMs: 120_000 },
      async () => {
        this.logger.log("Refreshing leaderboard views...");
        const start = Date.now();
        await this.dataSource.query(
          "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bot_leaderboard",
        );
        this.lastRefreshedAt = new Date();
        this.logger.log(
          `Leaderboard views refreshed in ${Date.now() - start}ms`,
        );
      },
    );
  }

  // ==========================================================================
  // GET /leaderboard
  // ==========================================================================

  async getLeaderboard(
    query: LeaderboardQueryDto,
  ): Promise<PaginatedLeaderboardDto> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const minGames = query.minGames ?? 0;
    const sortCol = SORT_COLUMNS[query.sortBy ?? "bb100"] ?? "bb_per_100";
    const period = query.period ?? "all_time";

    let rows: any[];

    if (period === "all_time") {
      rows = await this.queryAllTimeByUser(sortCol, minGames, limit, offset);
    } else {
      const interval = PERIOD_INTERVALS[period];
      rows = await this.queryPeriodByUser(
        sortCol,
        minGames,
        limit,
        offset,
        interval,
      );
    }

    const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;

    return {
      data: rows.map((row, i) =>
        this.toUserLeaderboardEntry(row, offset + i + 1),
      ),
      total,
      limit,
      offset,
      lastRefreshedAt: this.lastRefreshedAt.toISOString(),
    };
  }

  // ==========================================================================
  // GET /leaderboard/:botId
  // ==========================================================================

  async getBotPerformance(botId: string): Promise<BotPerformanceDto> {
    // 1. Fetch from MV
    const [mvRow] = await this.dataSource.query(
      `SELECT * FROM mv_bot_leaderboard WHERE bot_id = $1`,
      [botId],
    );
    if (!mvRow) {
      throw new NotFoundException(`Bot ${botId} not found on leaderboard`);
    }

    // 2. Hot streak: last 5 finished tournament entries
    const hotStreakRows = await this.dataSource.query(
      `
      SELECT
        te.tournament_id,
        t.name AS tournament_name,
        te.finish_position,
        t.max_players,
        t.finished_at,
        CASE
          WHEN te.finish_position <= CEIL(t.max_players * 0.15) THEN true
          ELSE false
        END AS is_itm
      FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.bot_id = $1
        AND te.finish_position IS NOT NULL
        AND t.status = 'finished'
      ORDER BY t.finished_at DESC
      LIMIT 5
      `,
      [botId],
    );

    // 3. Consistency index: stddev of finish positions
    const [consistencyRow] = await this.dataSource.query(
      `
      SELECT
        STDDEV_POP(te.finish_position)::float AS consistency_index,
        COUNT(*)::int AS entry_count
      FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.bot_id = $1
        AND te.finish_position IS NOT NULL
        AND t.status = 'finished'
      `,
      [botId],
    );

    const entryCount = parseInt(consistencyRow?.entry_count ?? "0", 10);
    const consistencyIndex =
      entryCount >= 2
        ? parseFloat(consistencyRow.consistency_index) || null
        : null;

    const hotStreak: HotStreakEntryDto[] = hotStreakRows.map((r: any) => ({
      tournamentId: r.tournament_id,
      tournamentName: r.tournament_name,
      finishPosition: parseInt(r.finish_position, 10),
      maxPlayers: parseInt(r.max_players, 10),
      isItm: r.is_itm === true || r.is_itm === "true",
      finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : "",
    }));

    return {
      botId: mvRow.bot_id,
      botName: mvRow.bot_name,
      tierBadge: TIER_BADGE_MAP[mvRow.strategy_tier] ?? TierBadge.TIER_1_QUICK,
      bb100: parseFloat(mvRow.bb_per_100) || 0,
      itmPct: parseFloat(mvRow.itm_pct) || 0,
      roiPct: parseFloat(mvRow.roi_pct) || 0,
      totalHands: parseInt(mvRow.total_hands, 10) || 0,
      totalTournaments: parseInt(mvRow.total_tournaments, 10) || 0,
      tournamentWins: parseInt(mvRow.tournament_wins, 10) || 0,
      totalNet: String(mvRow.total_net ?? "0"),
      totalPayout: String(mvRow.total_payout ?? "0"),
      hotStreak,
      consistencyIndex,
    };
  }

  // ==========================================================================
  // USER-BASED LEADERBOARD QUERIES
  // ==========================================================================

  private async queryAllTimeByUser(
    sortCol: string,
    minGames: number,
    limit: number,
    offset: number,
  ): Promise<any[]> {
    const params: (string | number)[] = [minGames, limit, offset];

    return this.dataSource.query(
      `
      WITH hand_stats AS (
        SELECT
          b.user_id,
          COUNT(*)::int AS total_hands,
          SUM(COALESCE(hp.amount_won, 0) - hp.amount_bet) AS net_chips,
          SUM(h.big_blind) AS total_bb
        FROM hand_players hp
        JOIN hands h ON h.id = hp.hand_id
        JOIN bots b ON b.id = hp.bot_id
        GROUP BY b.user_id
      ),
      tournament_stats AS (
        SELECT
          b.user_id,
          COUNT(*) FILTER (WHERE t.status = 'finished')::int AS total_tournaments,
          COUNT(*) FILTER (
            WHERE te.finish_position = 1 AND t.status = 'finished'
          )::int AS tournament_wins,
          SUM(te.payout) AS total_payout,
          SUM(t.buy_in) AS total_buyin,
          COUNT(*) FILTER (
            WHERE te.finish_position IS NOT NULL
              AND te.finish_position <= CEIL(t.max_players * 0.15)
              AND t.status = 'finished'
          )::int AS itm_count,
          COUNT(*) FILTER (
            WHERE te.finish_position IS NOT NULL
              AND t.status = 'finished'
          )::int AS finished_count,
          COUNT(DISTINCT CASE WHEN b.active = true THEN te.bot_id END)::int AS active_bot_count
        FROM tournament_entries te
        JOIN bots b ON b.id = te.bot_id
        JOIN tournaments t ON t.id = te.tournament_id
        GROUP BY b.user_id
      )
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        COALESCE(hs.total_hands, 0) AS total_hands,
        COALESCE(ts.total_tournaments, 0) AS total_tournaments,
        COALESCE(ts.tournament_wins, 0) AS tournament_wins,
        COALESCE(ts.total_payout, 0) AS total_payout,
        (COALESCE(ts.total_payout, 0) - COALESCE(ts.total_buyin, 0)) AS total_net,
        CASE
          WHEN COALESCE(hs.total_bb, 0) = 0 THEN 0.0
          ELSE ROUND(hs.net_chips::numeric / hs.total_bb::numeric * 100.0, 2)
        END AS bb_per_100,
        CASE
          WHEN COALESCE(ts.finished_count, 0) = 0 THEN 0.0
          ELSE ROUND(ts.itm_count::numeric / ts.finished_count::numeric * 100.0, 2)
        END AS itm_pct,
        CASE
          WHEN COALESCE(ts.total_buyin, 0) = 0 THEN 0.0
          ELSE ROUND(
            (ts.total_payout::numeric - ts.total_buyin::numeric) / ts.total_buyin::numeric * 100.0, 2
          )
        END AS roi_pct,
        COALESCE(ts.active_bot_count, 0) AS active_bot_count,
        COUNT(*) OVER() AS total_count
      FROM users u
      LEFT JOIN hand_stats hs ON hs.user_id = u.id
      LEFT JOIN tournament_stats ts ON ts.user_id = u.id
      WHERE u.role != 'admin'
        AND (
          COALESCE(hs.total_hands, 0) >= $1
          OR EXISTS (SELECT 1 FROM bots b WHERE b.user_id = u.id AND b.is_system = true)
        )
      ORDER BY ${sortCol} DESC
      LIMIT $2 OFFSET $3
      `,
      params,
    );
  }

  private async queryPeriodByUser(
    sortCol: string,
    minGames: number,
    limit: number,
    offset: number,
    interval: string,
  ): Promise<any[]> {
    const params: (string | number)[] = [minGames, limit, offset];

    return this.dataSource.query(
      `
      WITH hand_stats AS (
        SELECT
          b.user_id,
          COUNT(*)::int AS total_hands,
          SUM(COALESCE(hp.amount_won, 0) - hp.amount_bet) AS net_chips,
          SUM(h.big_blind) AS total_bb
        FROM hand_players hp
        JOIN hands h ON h.id = hp.hand_id
        JOIN bots b ON b.id = hp.bot_id
        WHERE h.finished_at >= NOW() - INTERVAL '${interval}'
        GROUP BY b.user_id
      ),
      tournament_stats AS (
        SELECT
          b.user_id,
          COUNT(*) FILTER (WHERE t.status = 'finished')::int AS total_tournaments,
          COUNT(*) FILTER (
            WHERE te.finish_position = 1 AND t.status = 'finished'
          )::int AS tournament_wins,
          SUM(te.payout) AS total_payout,
          SUM(t.buy_in) AS total_buyin,
          COUNT(*) FILTER (
            WHERE te.finish_position IS NOT NULL
              AND te.finish_position <= CEIL(t.max_players * 0.15)
              AND t.status = 'finished'
          )::int AS itm_count,
          COUNT(*) FILTER (
            WHERE te.finish_position IS NOT NULL
              AND t.status = 'finished'
          )::int AS finished_count,
          COUNT(DISTINCT CASE WHEN b.active = true THEN te.bot_id END)::int AS active_bot_count
        FROM tournament_entries te
        JOIN bots b ON b.id = te.bot_id
        JOIN tournaments t ON t.id = te.tournament_id
        WHERE t.finished_at >= NOW() - INTERVAL '${interval}'
        GROUP BY b.user_id
      )
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        COALESCE(hs.total_hands, 0) AS total_hands,
        COALESCE(ts.total_tournaments, 0) AS total_tournaments,
        COALESCE(ts.tournament_wins, 0) AS tournament_wins,
        COALESCE(ts.total_payout, 0) AS total_payout,
        (COALESCE(ts.total_payout, 0) - COALESCE(ts.total_buyin, 0)) AS total_net,
        CASE
          WHEN COALESCE(hs.total_bb, 0) = 0 THEN 0.0
          ELSE ROUND(hs.net_chips::numeric / hs.total_bb::numeric * 100.0, 2)
        END AS bb_per_100,
        CASE
          WHEN COALESCE(ts.finished_count, 0) = 0 THEN 0.0
          ELSE ROUND(ts.itm_count::numeric / ts.finished_count::numeric * 100.0, 2)
        END AS itm_pct,
        CASE
          WHEN COALESCE(ts.total_buyin, 0) = 0 THEN 0.0
          ELSE ROUND(
            (ts.total_payout::numeric - ts.total_buyin::numeric) / ts.total_buyin::numeric * 100.0, 2
          )
        END AS roi_pct,
        COALESCE(ts.active_bot_count, 0) AS active_bot_count,
        COUNT(*) OVER() AS total_count
      FROM users u
      JOIN hand_stats hs ON hs.user_id = u.id
      LEFT JOIN tournament_stats ts ON ts.user_id = u.id
      WHERE u.role != 'admin'
        AND (
          COALESCE(hs.total_hands, 0) >= $1
          OR EXISTS (SELECT 1 FROM bots b WHERE b.user_id = u.id AND b.is_system = true)
        )
      ORDER BY ${sortCol} DESC
      LIMIT $2 OFFSET $3
      `,
      params,
    );
  }

  private toUserLeaderboardEntry(
    row: any,
    rank: number,
  ): UserLeaderboardEntryDto {
    return {
      userId: row.user_id,
      userName: row.user_name ?? "",
      activeBotCount: parseInt(row.active_bot_count, 10) || 0,
      bb100: parseFloat(row.bb_per_100) || 0,
      itmPct: parseFloat(row.itm_pct) || 0,
      roiPct: parseFloat(row.roi_pct) || 0,
      totalHands: parseInt(row.total_hands, 10) || 0,
      totalTournaments: parseInt(row.total_tournaments, 10) || 0,
      tournamentWins: parseInt(row.tournament_wins, 10) || 0,
      totalNet: String(row.total_net ?? "0"),
      totalPayout: String(row.total_payout ?? "0"),
      rank,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS (bot-based, used by getBotPerformance)
  // ==========================================================================

  private async queryAllTime(
    sortCol: string,
    tierDb: string | undefined,
    minGames: number,
    limit: number,
    offset: number,
  ): Promise<any[]> {
    const conditions: string[] = [
      `(mv.total_hands >= $1 OR b.is_system = true)`,
    ];
    const params: (string | number)[] = [minGames];
    let paramIdx = 2;

    if (tierDb) {
      conditions.push(`mv.strategy_tier = $${paramIdx}`);
      params.push(tierDb);
      paramIdx++;
    }

    const where = conditions.join(" AND ");

    params.push(limit, offset);
    const limitParam = `$${paramIdx}`;
    const offsetParam = `$${paramIdx + 1}`;

    return this.dataSource.query(
      `
      SELECT mv.*, u.name AS owner_name, COUNT(*) OVER() AS total_count
      FROM mv_bot_leaderboard mv
      JOIN bots b ON b.id = mv.bot_id
      JOIN users u ON u.id = b.user_id
      WHERE ${where}
      ORDER BY mv.${sortCol} DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      params,
    );
  }

  private async queryPeriod(
    sortCol: string,
    tierDb: string | undefined,
    minGames: number,
    limit: number,
    offset: number,
    interval: string,
  ): Promise<any[]> {
    const conditions: string[] = [
      `(COALESCE(hs.total_hands, 0) >= $1 OR b.is_system = true)`,
    ];
    const params: (string | number)[] = [minGames];
    let paramIdx = 2;

    if (tierDb) {
      conditions.push(`b.strategy->>'tier' = $${paramIdx}`);
      params.push(tierDb);
      paramIdx++;
    }

    const where = conditions.join(" AND ");

    params.push(limit, offset);
    const limitParam = `$${paramIdx}`;
    const offsetParam = `$${paramIdx + 1}`;

    return this.dataSource.query(
      `
      WITH hand_stats AS (
        SELECT
          hp.bot_id,
          COUNT(*)::int AS total_hands,
          SUM(COALESCE(hp.amount_won, 0) - hp.amount_bet) AS net_chips,
          SUM(h.big_blind) AS total_bb
        FROM hand_players hp
        JOIN hands h ON h.id = hp.hand_id
        WHERE h.finished_at >= NOW() - INTERVAL '${interval}'
        GROUP BY hp.bot_id
      ),
      tournament_stats AS (
        SELECT
          te.bot_id,
          COUNT(*)::int AS total_entries,
          SUM(te.payout) AS total_payout,
          SUM(t.buy_in) AS total_buyin,
          COUNT(*) FILTER (
            WHERE te.finish_position IS NOT NULL
              AND te.finish_position <= CEIL(t.max_players * 0.15)
              AND t.status = 'finished'
          )::int AS itm_count,
          COUNT(*) FILTER (
            WHERE te.finish_position IS NOT NULL
              AND t.status = 'finished'
          )::int AS finished_count,
          COUNT(*) FILTER (
            WHERE t.status = 'finished'
          )::int AS total_tournaments,
          COUNT(*) FILTER (
            WHERE te.finish_position = 1
              AND t.status = 'finished'
          )::int AS tournament_wins
        FROM tournament_entries te
        JOIN tournaments t ON t.id = te.tournament_id
        WHERE t.finished_at >= NOW() - INTERVAL '${interval}'
        GROUP BY te.bot_id
      )
      SELECT
        b.id AS bot_id,
        b.name AS bot_name,
        b.user_id,
        u.name AS owner_name,
        b.strategy->>'tier' AS strategy_tier,
        COALESCE(hs.total_hands, 0) AS total_hands,
        COALESCE(ts.total_tournaments, 0) AS total_tournaments,
        COALESCE(ts.tournament_wins, 0) AS tournament_wins,
        0 AS total_net,
        CASE
          WHEN COALESCE(hs.total_bb, 0) = 0 THEN 0.0
          ELSE ROUND(hs.net_chips::numeric / hs.total_bb::numeric * 100.0, 2)
        END AS bb_per_100,
        CASE
          WHEN COALESCE(ts.finished_count, 0) = 0 THEN 0.0
          ELSE ROUND(ts.itm_count::numeric / ts.finished_count::numeric * 100.0, 2)
        END AS itm_pct,
        CASE
          WHEN COALESCE(ts.total_buyin, 0) = 0 THEN 0.0
          ELSE ROUND(
            (ts.total_payout::numeric - ts.total_buyin::numeric) / ts.total_buyin::numeric * 100.0, 2
          )
        END AS roi_pct,
        COALESCE(ts.total_payout, 0) AS total_payout,
        COUNT(*) OVER() AS total_count
      FROM bots b
      JOIN users u ON u.id = b.user_id
      LEFT JOIN hand_stats hs ON hs.bot_id = b.id
      LEFT JOIN tournament_stats ts ON ts.bot_id = b.id
      WHERE b.active = true
        AND ${where}
      ORDER BY ${sortCol} DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      params,
    );
  }

  private toLeaderboardEntry(row: any, rank: number): LeaderboardEntryDto {
    return {
      botId: row.bot_id,
      botName: row.bot_name,
      userId: row.user_id,
      ownerName: row.owner_name ?? "",
      tierBadge: TIER_BADGE_MAP[row.strategy_tier] ?? TierBadge.TIER_1_QUICK,
      bb100: parseFloat(row.bb_per_100) || 0,
      itmPct: parseFloat(row.itm_pct) || 0,
      roiPct: parseFloat(row.roi_pct) || 0,
      totalHands: parseInt(row.total_hands, 10) || 0,
      totalTournaments: parseInt(row.total_tournaments, 10) || 0,
      tournamentWins: parseInt(row.tournament_wins, 10) || 0,
      totalNet: String(row.total_net ?? "0"),
      totalPayout: String(row.total_payout ?? "0"),
      rank,
    };
  }
}
