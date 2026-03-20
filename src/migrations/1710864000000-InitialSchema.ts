import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1710864000000 implements MigrationInterface {
  name = "InitialSchema1710864000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "email" varchar(100) NOT NULL,
        "name" varchar(100) NOT NULL,
        "api_key_hash" varchar(64) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "role" varchar(20) NOT NULL DEFAULT 'user',
        "last_login_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email")`,
    );

    // Bots table
    await queryRunner.query(`
      CREATE TABLE "bots" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" varchar(100) NOT NULL,
        "endpoint" varchar(500) NOT NULL,
        "description" text,
        "active" boolean NOT NULL DEFAULT true,
        "user_id" varchar(36) NOT NULL,
        "last_validation" jsonb,
        "last_validation_score" integer,
        CONSTRAINT "PK_bots" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_bots_active" CHECK ("active" IN (true, false))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bots_name" ON "bots" ("name")`,
    );
    await queryRunner.query(`
      ALTER TABLE "bots" ADD CONSTRAINT "FK_bots_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // Tables (cash game tables)
    await queryRunner.query(`
      CREATE TABLE "tables" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" varchar(100) NOT NULL,
        "small_blind" bigint NOT NULL DEFAULT 10,
        "big_blind" bigint NOT NULL DEFAULT 20,
        "starting_chips" bigint NOT NULL DEFAULT 1000,
        "max_players" integer NOT NULL DEFAULT 9,
        "turn_timeout_ms" integer NOT NULL DEFAULT 10000,
        "status" varchar(20) NOT NULL DEFAULT 'waiting',
        CONSTRAINT "PK_tables" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_tables_small_blind" CHECK ("small_blind" > 0),
        CONSTRAINT "CHK_tables_big_blind" CHECK ("big_blind" > "small_blind"),
        CONSTRAINT "CHK_tables_starting_chips" CHECK ("starting_chips" > 0),
        CONSTRAINT "CHK_tables_max_players" CHECK ("max_players" >= 2 AND "max_players" <= 9)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tables_status" ON "tables" ("status")`,
    );

    // Table Seats
    await queryRunner.query(`
      CREATE TABLE "table_seats" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "table_id" varchar(36) NOT NULL,
        "bot_id" varchar(36) NOT NULL,
        "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "disconnected" boolean NOT NULL DEFAULT false,
        "disconnected_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_table_seats" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_table_seats_table_bot" UNIQUE ("table_id", "bot_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_table_seats_table" ON "table_seats" ("table_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_table_seats_bot" ON "table_seats" ("bot_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "table_seats" ADD CONSTRAINT "FK_table_seats_table"
      FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "table_seats" ADD CONSTRAINT "FK_table_seats_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // Games
    await queryRunner.query(`
      CREATE TABLE "games" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "table_id" varchar(36) NOT NULL,
        "tournament_id" varchar(36),
        "status" varchar(20) NOT NULL DEFAULT 'waiting',
        "total_hands" integer NOT NULL DEFAULT 0,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "finished_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_games" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_games_total_hands" CHECK ("total_hands" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_games_table" ON "games" ("table_id")`,
    );

    // Game Players
    await queryRunner.query(`
      CREATE TABLE "game_players" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "game_id" varchar(36) NOT NULL,
        "bot_id" varchar(36) NOT NULL,
        "start_chips" bigint NOT NULL,
        "end_chips" bigint,
        "hands_played" integer NOT NULL DEFAULT 0,
        "hands_won" integer NOT NULL DEFAULT 0,
        "total_winnings" bigint NOT NULL DEFAULT 0,
        "finish_position" integer,
        CONSTRAINT "PK_game_players" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_game_players_game_bot" UNIQUE ("game_id", "bot_id"),
        CONSTRAINT "CHK_game_players_start_chips" CHECK ("start_chips" >= 0),
        CONSTRAINT "CHK_game_players_end_chips" CHECK ("end_chips" >= 0 OR "end_chips" IS NULL),
        CONSTRAINT "CHK_game_players_hands_played" CHECK ("hands_played" >= 0),
        CONSTRAINT "CHK_game_players_hands_won" CHECK ("hands_won" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_game_players_game" ON "game_players" ("game_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "game_players" ADD CONSTRAINT "FK_game_players_game"
      FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "game_players" ADD CONSTRAINT "FK_game_players_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // Hands
    await queryRunner.query(`
      CREATE TABLE "hands" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "game_id" varchar(36) NOT NULL,
        "tournament_id" varchar(36),
        "hand_number" integer NOT NULL,
        "dealer_bot_id" varchar(36),
        "small_blind" bigint NOT NULL,
        "big_blind" bigint NOT NULL,
        "ante" bigint NOT NULL DEFAULT 0,
        "community_cards" jsonb NOT NULL DEFAULT '[]',
        "pot" bigint NOT NULL DEFAULT 0,
        "stage" varchar(20) NOT NULL DEFAULT 'preflop',
        "started_at" TIMESTAMP WITH TIME ZONE,
        "finished_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_hands" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_hands_game_number" UNIQUE ("game_id", "hand_number"),
        CONSTRAINT "CHK_hands_hand_number" CHECK ("hand_number" >= 1),
        CONSTRAINT "CHK_hands_pot" CHECK ("pot" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_hands_game" ON "hands" ("game_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_hands_tournament" ON "hands" ("tournament_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "hands" ADD CONSTRAINT "FK_hands_game"
      FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE
    `);

    // Hand Players
    await queryRunner.query(`
      CREATE TABLE "hand_players" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "hand_id" varchar(36) NOT NULL,
        "bot_id" varchar(36) NOT NULL,
        "position" integer NOT NULL,
        "hole_cards" jsonb NOT NULL DEFAULT '[]',
        "start_chips" bigint NOT NULL,
        "end_chips" bigint,
        "amount_bet" bigint NOT NULL DEFAULT 0,
        "amount_won" bigint,
        "folded" boolean NOT NULL DEFAULT false,
        "all_in" boolean NOT NULL DEFAULT false,
        "won" boolean NOT NULL DEFAULT false,
        "saw_flop" boolean NOT NULL DEFAULT false,
        "saw_showdown" boolean NOT NULL DEFAULT false,
        "best_hand" jsonb,
        CONSTRAINT "PK_hand_players" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_hand_players_hand_bot" UNIQUE ("hand_id", "bot_id"),
        CONSTRAINT "CHK_hand_players_position" CHECK ("position" >= 0 AND "position" <= 9),
        CONSTRAINT "CHK_hand_players_start_chips" CHECK ("start_chips" >= 0),
        CONSTRAINT "CHK_hand_players_end_chips" CHECK ("end_chips" >= 0 OR "end_chips" IS NULL),
        CONSTRAINT "CHK_hand_players_amount_won" CHECK ("amount_won" >= 0 OR "amount_won" IS NULL),
        CONSTRAINT "CHK_hand_players_amount_bet" CHECK ("amount_bet" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_hand_players_hand" ON "hand_players" ("hand_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "hand_players" ADD CONSTRAINT "FK_hand_players_hand"
      FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "hand_players" ADD CONSTRAINT "FK_hand_players_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // Actions
    await queryRunner.query(`
      CREATE TABLE "actions" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "hand_id" varchar(36) NOT NULL,
        "bot_id" varchar(36) NOT NULL,
        "action_seq" integer NOT NULL,
        "action_type" varchar(20) NOT NULL,
        "stage" varchar(20) NOT NULL,
        "amount" bigint NOT NULL DEFAULT 0,
        "pot_after" bigint,
        "chips_after" bigint,
        "response_time_ms" integer,
        CONSTRAINT "PK_actions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_actions_action_seq" CHECK ("action_seq" >= 0),
        CONSTRAINT "CHK_actions_amount" CHECK ("amount" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_actions_hand" ON "actions" ("hand_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_actions_hand_seq" ON "actions" ("hand_id", "action_seq")`,
    );
    await queryRunner.query(`
      ALTER TABLE "actions" ADD CONSTRAINT "FK_actions_hand"
      FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "actions" ADD CONSTRAINT "FK_actions_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // Tournaments
    await queryRunner.query(`
      CREATE TABLE "tournaments" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" varchar(100) NOT NULL,
        "type" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'registering',
        "buy_in" bigint NOT NULL,
        "starting_chips" bigint NOT NULL,
        "min_players" integer NOT NULL,
        "max_players" integer NOT NULL,
        "players_per_table" integer NOT NULL DEFAULT 9,
        "turn_timeout_ms" integer NOT NULL DEFAULT 10000,
        "late_reg_ends_level" integer NOT NULL DEFAULT 4,
        "rebuys_allowed" boolean NOT NULL DEFAULT true,
        "scheduled_start_at" TIMESTAMP WITH TIME ZONE,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "finished_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tournaments" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_tournaments_buy_in" CHECK ("buy_in" >= 0),
        CONSTRAINT "CHK_tournaments_starting_chips" CHECK ("starting_chips" > 0),
        CONSTRAINT "CHK_tournaments_min_players" CHECK ("min_players" >= 2),
        CONSTRAINT "CHK_tournaments_max_players" CHECK ("max_players" >= "min_players"),
        CONSTRAINT "CHK_tournaments_players_per_table" CHECK ("players_per_table" >= 2 AND "players_per_table" <= 10)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tournaments_name" ON "tournaments" ("name")`,
    );

    // Tournament Entries
    await queryRunner.query(`
      CREATE TABLE "tournament_entries" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tournament_id" varchar(36) NOT NULL,
        "bot_id" varchar(36) NOT NULL,
        "entry_type" varchar(20) NOT NULL DEFAULT 'initial',
        "finish_position" integer,
        "bust_level" integer,
        "payout" bigint NOT NULL DEFAULT 0,
        CONSTRAINT "PK_tournament_entries" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_tournament_entries_payout" CHECK ("payout" >= 0),
        CONSTRAINT "CHK_tournament_entries_finish_position" CHECK ("finish_position" IS NULL OR "finish_position" >= 1)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tournament_entries_tournament_bot" ON "tournament_entries" ("tournament_id", "bot_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "tournament_entries" ADD CONSTRAINT "FK_tournament_entries_tournament"
      FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "tournament_entries" ADD CONSTRAINT "FK_tournament_entries_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // Tournament Tables
    await queryRunner.query(`
      CREATE TABLE "tournament_tables" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tournament_id" varchar(36) NOT NULL,
        "table_number" integer NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "game_id" varchar(36),
        CONSTRAINT "PK_tournament_tables" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tournament_tables_tournament_number" UNIQUE ("tournament_id", "table_number")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tournament_tables_tournament" ON "tournament_tables" ("tournament_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "tournament_tables" ADD CONSTRAINT "FK_tournament_tables_tournament"
      FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "tournament_tables" ADD CONSTRAINT "FK_tournament_tables_game"
      FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE SET NULL
    `);

    // Tournament Seats
    await queryRunner.query(`
      CREATE TABLE "tournament_seats" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tournament_id" varchar(36) NOT NULL,
        "tournament_table_id" varchar(36) NOT NULL,
        "bot_id" varchar(36) NOT NULL,
        "seat_number" integer NOT NULL,
        "chips" bigint NOT NULL,
        "busted" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_tournament_seats" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tournament_seats_tournament_bot" UNIQUE ("tournament_id", "bot_id"),
        CONSTRAINT "CHK_tournament_seats_chips" CHECK ("chips" >= 0),
        CONSTRAINT "CHK_tournament_seats_seat_number" CHECK ("seat_number" >= 1 AND "seat_number" <= 10)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tournament_seats_table" ON "tournament_seats" ("tournament_table_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "tournament_seats" ADD CONSTRAINT "FK_tournament_seats_tournament"
      FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "tournament_seats" ADD CONSTRAINT "FK_tournament_seats_table"
      FOREIGN KEY ("tournament_table_id") REFERENCES "tournament_tables"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "tournament_seats" ADD CONSTRAINT "FK_tournament_seats_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // Tournament Blind Levels
    await queryRunner.query(`
      CREATE TABLE "tournament_blind_levels" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tournament_id" varchar(36) NOT NULL,
        "level" integer NOT NULL,
        "small_blind" bigint NOT NULL,
        "big_blind" bigint NOT NULL,
        "ante" bigint NOT NULL DEFAULT 0,
        "hands_played" integer NOT NULL DEFAULT 0,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "ended_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tournament_blind_levels" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tournament_blind_levels_tournament_level" UNIQUE ("tournament_id", "level"),
        CONSTRAINT "CHK_tournament_blind_levels_level" CHECK ("level" >= 1),
        CONSTRAINT "CHK_tournament_blind_levels_small_blind" CHECK ("small_blind" > 0),
        CONSTRAINT "CHK_tournament_blind_levels_big_blind" CHECK ("big_blind" > "small_blind"),
        CONSTRAINT "CHK_tournament_blind_levels_ante" CHECK ("ante" >= 0),
        CONSTRAINT "CHK_tournament_blind_levels_hands_played" CHECK ("hands_played" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tournament_blind_levels_tournament" ON "tournament_blind_levels" ("tournament_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "tournament_blind_levels" ADD CONSTRAINT "FK_tournament_blind_levels_tournament"
      FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE
    `);

    // Tournament Seat History
    await queryRunner.query(`
      CREATE TABLE "tournament_seat_history" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tournament_id" varchar(36) NOT NULL,
        "tournament_table_id" varchar(36) NOT NULL,
        "bot_id" varchar(36) NOT NULL,
        "seat_number" integer NOT NULL,
        "chips_on_arrival" bigint NOT NULL,
        "chips_on_departure" bigint,
        "reason" varchar(20) NOT NULL,
        "departed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tournament_seat_history" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_tournament_seat_history_seat_number" CHECK ("seat_number" >= 1 AND "seat_number" <= 10),
        CONSTRAINT "CHK_tournament_seat_history_chips_on_arrival" CHECK ("chips_on_arrival" >= 0),
        CONSTRAINT "CHK_tournament_seat_history_chips_on_departure" CHECK ("chips_on_departure" >= 0 OR "chips_on_departure" IS NULL)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tournament_seat_history_tournament_bot" ON "tournament_seat_history" ("tournament_id", "bot_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "tournament_seat_history" ADD CONSTRAINT "FK_tournament_seat_history_tournament"
      FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "tournament_seat_history" ADD CONSTRAINT "FK_tournament_seat_history_table"
      FOREIGN KEY ("tournament_table_id") REFERENCES "tournament_tables"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "tournament_seat_history" ADD CONSTRAINT "FK_tournament_seat_history_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // Bot Stats
    await queryRunner.query(`
      CREATE TABLE "bot_stats" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "bot_id" varchar(36) NOT NULL,
        "total_hands" integer NOT NULL DEFAULT 0,
        "total_tournaments" integer NOT NULL DEFAULT 0,
        "tournament_wins" integer NOT NULL DEFAULT 0,
        "total_net" bigint NOT NULL DEFAULT 0,
        "vpip_hands" integer NOT NULL DEFAULT 0,
        "pfr_hands" integer NOT NULL DEFAULT 0,
        "wtsd_hands" integer NOT NULL DEFAULT 0,
        "wmsd_hands" integer NOT NULL DEFAULT 0,
        "aggressive_actions" integer NOT NULL DEFAULT 0,
        "passive_actions" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_bot_stats" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bot_stats_bot" UNIQUE ("bot_id"),
        CONSTRAINT "CHK_bot_stats_total_hands" CHECK ("total_hands" >= 0),
        CONSTRAINT "CHK_bot_stats_total_tournaments" CHECK ("total_tournaments" >= 0),
        CONSTRAINT "CHK_bot_stats_tournament_wins" CHECK ("tournament_wins" >= 0),
        CONSTRAINT "CHK_bot_stats_vpip_hands" CHECK ("vpip_hands" >= 0),
        CONSTRAINT "CHK_bot_stats_pfr_hands" CHECK ("pfr_hands" >= 0),
        CONSTRAINT "CHK_bot_stats_wtsd_hands" CHECK ("wtsd_hands" >= 0),
        CONSTRAINT "CHK_bot_stats_wmsd_hands" CHECK ("wmsd_hands" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_stats_bot" ON "bot_stats" ("bot_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "bot_stats" ADD CONSTRAINT "FK_bot_stats_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // Bot Events
    await queryRunner.query(`
      CREATE TABLE "bot_events" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "bot_id" varchar(36) NOT NULL,
        "game_id" varchar(36),
        "hand_id" varchar(36),
        "event_type" varchar(20) NOT NULL,
        "details" text,
        "context" jsonb,
        CONSTRAINT "PK_bot_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_events_bot_created" ON "bot_events" ("bot_id", "created_at")`,
    );
    await queryRunner.query(`
      ALTER TABLE "bot_events" ADD CONSTRAINT "FK_bot_events_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // Chip Movements
    await queryRunner.query(`
      CREATE TABLE "chip_movements" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "bot_id" varchar(36) NOT NULL,
        "game_id" varchar(36),
        "hand_id" varchar(36),
        "tournament_id" varchar(36),
        "movement_type" varchar(30) NOT NULL,
        "amount" bigint NOT NULL,
        "balance_before" bigint NOT NULL,
        "balance_after" bigint NOT NULL,
        "description" text,
        "context" jsonb,
        CONSTRAINT "PK_chip_movements" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_chip_movements_balance_after" CHECK ("balance_after" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_chip_movements_bot_created" ON "chip_movements" ("bot_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chip_movements_game_hand" ON "chip_movements" ("game_id", "hand_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chip_movements_tournament" ON "chip_movements" ("tournament_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "chip_movements" ADD CONSTRAINT "FK_chip_movements_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // Audit Logs
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" varchar(36),
        "action" varchar(50) NOT NULL,
        "resource" varchar(100) NOT NULL,
        "resource_id" varchar(36),
        "ip_address" varchar(45),
        "user_agent" varchar(500),
        "http_method" varchar(10) NOT NULL,
        "status_code" integer NOT NULL,
        "duration_ms" integer,
        "request_body" jsonb,
        "response_summary" jsonb,
        "error_message" text,
        "metadata" jsonb,
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_user_created" ON "audit_logs" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_resource_created" ON "audit_logs" ("resource", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_action_created" ON "audit_logs" ("action", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chip_movements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_stats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tournament_seat_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tournament_blind_levels"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tournament_seats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tournament_tables"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tournament_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tournaments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "actions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hand_players"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hands"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "game_players"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "games"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "table_seats"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tables"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bots"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
