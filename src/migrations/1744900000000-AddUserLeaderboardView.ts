import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserLeaderboardView1744900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW mv_user_leaderboard AS
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
        COALESCE(ts.active_bot_count, 0) AS active_bot_count
      FROM users u
      LEFT JOIN hand_stats hs ON hs.user_id = u.id
      LEFT JOIN tournament_stats ts ON ts.user_id = u.id
      WHERE u.role != 'admin'
      WITH DATA
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mv_user_leaderboard_user" ON mv_user_leaderboard (user_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP MATERIALIZED VIEW IF EXISTS mv_user_leaderboard`,
    );
  }
}
