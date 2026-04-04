import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMissingIndexes1744400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // users: index on refresh_token_hash — called on every authenticated API request
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_refresh_token_hash" ON "users" ("refresh_token_hash")`,
    );

    // bots: index on user_id (FK) + composite with active for filtered lookups
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bots_user_id" ON "bots" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bots_user_active" ON "bots" ("user_id", "active")`,
    );

    // transactions: composite (wallet_id, created_at) for paginated history — eliminates sort step
    // Note: reference_id already has a partial index (IDX_tx_reference_id WHERE reference_id IS NOT NULL)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_wallet_created" ON "transactions" ("wallet_id", "created_at")`,
    );
    // Drop the now-redundant single wallet_id index (superseded by composite above)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tx_wallet_id"`);

    // game_state_snapshots: replace 3 individual indexes with 2 composites for hot-path queries
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_game_state_snapshots_game"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_game_state_snapshots_table"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_game_state_snapshots_status"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_gss_game_status" ON "game_state_snapshots" ("game_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_gss_table_status" ON "game_state_snapshots" ("table_id", "status")`,
    );

    // simulations: composite (user_id, status) — covers countActiveForUser + findByUserId
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_simulations_user_id"`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_simulations_user_status" ON "simulations" ("user_id", "status")`,
    );

    // tournament_entries: composite (tournament_id, finish_position) for getResults + getActiveEntries
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tournament_entries_tourney_finish" ON "tournament_entries" ("tournament_id", "finish_position")`,
    );

    // games: index on finished_at for leaderboard period-filtered CTEs (daily/weekly/monthly)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_games_finished_at" ON "games" ("finished_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_users_refresh_token_hash"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bots_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bots_user_active"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_wallet_created"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gss_game_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gss_table_status"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_simulations_user_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_tournament_entries_tourney_finish"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_games_finished_at"`);

    // Restore original indexes that were dropped in up()
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tx_wallet_id" ON "transactions" ("wallet_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_game_state_snapshots_game" ON "game_state_snapshots" ("game_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_game_state_snapshots_table" ON "game_state_snapshots" ("table_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_game_state_snapshots_status" ON "game_state_snapshots" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_simulations_user_id" ON "simulations" ("user_id")`,
    );
  }
}
