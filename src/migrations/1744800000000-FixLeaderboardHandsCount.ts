import { MigrationInterface, QueryRunner } from "typeorm";

export class FixLeaderboardHandsCount1744800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old view and unique index so we can recreate with the hands fix
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mv_bot_leaderboard_bot"`,
    );
    await queryRunner.query(
      `DROP MATERIALIZED VIEW IF EXISTS mv_bot_leaderboard`,
    );

    // Recreate with GREATEST(hand_players count, bot_stats.total_hands)
    // so system bots seeded with one aggregate row show the real total_hands.
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW mv_bot_leaderboard AS
      WITH hand_stats AS (
        SELECT
          hp.bot_id,
          COUNT(*)::int AS total_hands,
          SUM(COALESCE(hp.amount_won, 0) - hp.amount_bet) AS net_chips,
          SUM(h.big_blind) AS total_bb
        FROM hand_players hp
        JOIN hands h ON h.id = hp.hand_id
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
          )::int AS finished_count
        FROM tournament_entries te
        JOIN tournaments t ON t.id = te.tournament_id
        GROUP BY te.bot_id
      )
      SELECT
        b.id AS bot_id,
        b.name AS bot_name,
        b.user_id,
        b.strategy->>'tier' AS strategy_tier,
        GREATEST(COALESCE(hs.total_hands, 0), COALESCE(bs.total_hands, 0)) AS total_hands,
        COALESCE(bs.total_tournaments, 0) AS total_tournaments,
        COALESCE(bs.tournament_wins, 0) AS tournament_wins,
        COALESCE(bs.total_net, 0) AS total_net,
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
        COALESCE(ts.total_payout, 0) AS total_payout
      FROM bots b
      LEFT JOIN bot_stats bs ON bs.bot_id = b.id
      LEFT JOIN hand_stats hs ON hs.bot_id = b.id
      LEFT JOIN tournament_stats ts ON ts.bot_id = b.id
      WHERE b.active = true
      WITH DATA
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mv_bot_leaderboard_bot" ON mv_bot_leaderboard (bot_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mv_bot_leaderboard_bot"`,
    );
    await queryRunner.query(
      `DROP MATERIALIZED VIEW IF EXISTS mv_bot_leaderboard`,
    );

    // Restore original definition (uses COUNT from hand_players only)
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW mv_bot_leaderboard AS
      WITH hand_stats AS (
        SELECT
          hp.bot_id,
          COUNT(*)::int AS total_hands,
          SUM(COALESCE(hp.amount_won, 0) - hp.amount_bet) AS net_chips,
          SUM(h.big_blind) AS total_bb
        FROM hand_players hp
        JOIN hands h ON h.id = hp.hand_id
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
          )::int AS finished_count
        FROM tournament_entries te
        JOIN tournaments t ON t.id = te.tournament_id
        GROUP BY te.bot_id
      )
      SELECT
        b.id AS bot_id,
        b.name AS bot_name,
        b.user_id,
        b.strategy->>'tier' AS strategy_tier,
        COALESCE(hs.total_hands, 0) AS total_hands,
        COALESCE(bs.total_tournaments, 0) AS total_tournaments,
        COALESCE(bs.tournament_wins, 0) AS tournament_wins,
        COALESCE(bs.total_net, 0) AS total_net,
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
        COALESCE(ts.total_payout, 0) AS total_payout
      FROM bots b
      LEFT JOIN bot_stats bs ON bs.bot_id = b.id
      LEFT JOIN hand_stats hs ON hs.bot_id = b.id
      LEFT JOIN tournament_stats ts ON ts.bot_id = b.id
      WHERE b.active = true
      WITH DATA
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mv_bot_leaderboard_bot" ON mv_bot_leaderboard (bot_id)`,
    );
  }
}
