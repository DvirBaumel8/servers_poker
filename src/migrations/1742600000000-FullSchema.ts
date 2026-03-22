import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Single merged migration that defines the complete database schema.
 * Replaces all previous fragmented migration files.
 *
 * Every table, column, index, constraint, and FK matches the TypeORM
 * entity definitions in src/entities/ exactly.
 */
export class FullSchema1742600000000 implements MigrationInterface {
  name = "FullSchema1742600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ── users ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"                           varchar(36) NOT NULL,
        "created_at"                   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"                   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "email"                        varchar(100) NOT NULL,
        "name"                         varchar(100) NOT NULL,
        "password_hash"                varchar(60) NOT NULL,
        "active"                       boolean NOT NULL DEFAULT true,
        "role"                         varchar(20) NOT NULL DEFAULT 'user',
        "email_verified"               boolean NOT NULL DEFAULT false,
        "verification_code"            varchar(6) DEFAULT NULL,
        "verification_code_expires_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        "password_reset_code"          varchar(6) DEFAULT NULL,
        "password_reset_expires_at"    TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        "last_login_at"                TIMESTAMP WITH TIME ZONE,
        "failed_login_attempts"        integer NOT NULL DEFAULT 0,
        "locked_until"                 TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        "last_failed_login_at"         TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        "refresh_token_hash"           varchar(64) DEFAULT NULL,
        "refresh_token_expires_at"     TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email")`,
    );

    // ── bots ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bots" (
        "id"          varchar(36) NOT NULL,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name"        varchar(100) NOT NULL,
        "description" text,
        "active"      boolean NOT NULL DEFAULT true,
        "strategy"    jsonb NOT NULL,
        "user_id"     varchar(36) NOT NULL,
        CONSTRAINT "PK_bots" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_bots_active" CHECK ("active" IN (true, false))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bots_name" ON "bots" ("name")`,
    );
    await queryRunner.query(`
      ALTER TABLE "bots" DROP CONSTRAINT IF EXISTS "FK_bots_user";
      ALTER TABLE "bots" ADD CONSTRAINT "FK_bots_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // ── tables ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tables" (
        "id"             varchar(36) NOT NULL,
        "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name"           varchar(100) NOT NULL,
        "small_blind"    bigint NOT NULL DEFAULT 10,
        "big_blind"      bigint NOT NULL DEFAULT 20,
        "starting_chips" bigint NOT NULL DEFAULT 1000,
        "max_players"    integer NOT NULL DEFAULT 9,
        "turn_timeout_ms" integer NOT NULL DEFAULT 10000,
        "status"         varchar(20) NOT NULL DEFAULT 'waiting',
        CONSTRAINT "PK_tables" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_tables_small_blind" CHECK ("small_blind" > 0),
        CONSTRAINT "CHK_tables_big_blind" CHECK ("big_blind" > "small_blind"),
        CONSTRAINT "CHK_tables_starting_chips" CHECK ("starting_chips" > 0),
        CONSTRAINT "CHK_tables_max_players" CHECK ("max_players" >= 2 AND "max_players" <= 9)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tables_status" ON "tables" ("status")`,
    );

    // ── table_seats ────────────────────────────────────────────────────
    // Entity: table_id, bot_id, joined_at, disconnected, disconnected_at
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "table_seats" (
        "id"              varchar(36) NOT NULL,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "table_id"        varchar(36) NOT NULL,
        "bot_id"          varchar(36) NOT NULL,
        "joined_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "disconnected"    boolean NOT NULL DEFAULT false,
        "disconnected_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_table_seats" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_table_seats_table" ON "table_seats" ("table_id");
      CREATE INDEX IF NOT EXISTS "IDX_table_seats_bot" ON "table_seats" ("bot_id");
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_table_seats_table_bot" ON "table_seats" ("table_id", "bot_id");
      ALTER TABLE "table_seats" DROP CONSTRAINT IF EXISTS "FK_table_seats_table";
      ALTER TABLE "table_seats" ADD CONSTRAINT "FK_table_seats_table"
        FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE;
      ALTER TABLE "table_seats" DROP CONSTRAINT IF EXISTS "FK_table_seats_bot";
      ALTER TABLE "table_seats" ADD CONSTRAINT "FK_table_seats_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // ── tournaments ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tournaments" (
        "id"                 varchar(36) NOT NULL,
        "created_at"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name"               varchar(100) NOT NULL,
        "type"               varchar(20) NOT NULL,
        "status"             varchar(20) NOT NULL DEFAULT 'registering',
        "buy_in"             bigint NOT NULL,
        "starting_chips"     bigint NOT NULL,
        "min_players"        integer NOT NULL,
        "max_players"        integer NOT NULL,
        "players_per_table"  integer NOT NULL DEFAULT 9,
        "turn_timeout_ms"    integer NOT NULL DEFAULT 10000,
        "late_reg_ends_level" integer NOT NULL DEFAULT 4,
        "rebuys_allowed"     boolean NOT NULL DEFAULT true,
        "scheduled_start_at" TIMESTAMP WITH TIME ZONE,
        "started_at"         TIMESTAMP WITH TIME ZONE,
        "finished_at"        TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tournaments" PRIMARY KEY ("id"),
        CONSTRAINT "chk_tournaments_type" CHECK ("type" IN ('rolling', 'scheduled')),
        CONSTRAINT "CHK_tournaments_buy_in" CHECK ("buy_in" >= 0),
        CONSTRAINT "CHK_tournaments_starting_chips" CHECK ("starting_chips" > 0),
        CONSTRAINT "CHK_tournaments_min_players" CHECK ("min_players" >= 2),
        CONSTRAINT "CHK_tournaments_max_players" CHECK ("max_players" >= "min_players"),
        CONSTRAINT "CHK_tournaments_ppt" CHECK ("players_per_table" >= 2 AND "players_per_table" <= 10)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tournaments_name" ON "tournaments" ("name");
      CREATE INDEX IF NOT EXISTS "IDX_tournaments_status" ON "tournaments" ("status")
    `);

    // ── games ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "games" (
        "id"            varchar(36) NOT NULL,
        "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "table_id"      varchar(36) NOT NULL,
        "tournament_id" varchar(36),
        "status"        varchar(20) NOT NULL DEFAULT 'waiting',
        "total_hands"   integer NOT NULL DEFAULT 0,
        "started_at"    TIMESTAMP WITH TIME ZONE,
        "finished_at"   TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_games" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_games_total_hands" CHECK ("total_hands" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_games_table" ON "games" ("table_id");
      CREATE INDEX IF NOT EXISTS "IDX_games_tournament" ON "games" ("tournament_id");
      CREATE INDEX IF NOT EXISTS "IDX_games_status" ON "games" ("status");
      ALTER TABLE "games" DROP CONSTRAINT IF EXISTS "FK_games_table";
      ALTER TABLE "games" ADD CONSTRAINT "FK_games_table"
        FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE;
      ALTER TABLE "games" DROP CONSTRAINT IF EXISTS "FK_games_tournament";
      ALTER TABLE "games" ADD CONSTRAINT "FK_games_tournament"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE
    `);

    // ── game_players ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "game_players" (
        "id"              varchar(36) NOT NULL,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "game_id"         varchar(36) NOT NULL,
        "bot_id"          varchar(36) NOT NULL,
        "start_chips"     bigint NOT NULL,
        "end_chips"       bigint,
        "hands_played"    integer NOT NULL DEFAULT 0,
        "hands_won"       integer NOT NULL DEFAULT 0,
        "finish_position" integer,
        CONSTRAINT "PK_game_players" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_game_players" UNIQUE ("game_id", "bot_id"),
        CONSTRAINT "CHK_gp_start_chips" CHECK ("start_chips" >= 0),
        CONSTRAINT "CHK_gp_end_chips" CHECK ("end_chips" >= 0 OR "end_chips" IS NULL),
        CONSTRAINT "CHK_gp_hands_played" CHECK ("hands_played" >= 0),
        CONSTRAINT "CHK_gp_hands_won" CHECK ("hands_won" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_game_players_game" ON "game_players" ("game_id");
      ALTER TABLE "game_players" DROP CONSTRAINT IF EXISTS "FK_game_players_game";
      ALTER TABLE "game_players" ADD CONSTRAINT "FK_game_players_game"
        FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;
      ALTER TABLE "game_players" DROP CONSTRAINT IF EXISTS "FK_game_players_bot";
      ALTER TABLE "game_players" ADD CONSTRAINT "FK_game_players_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // ── hands ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hands" (
        "id"              varchar(36) NOT NULL,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "game_id"         varchar(36) NOT NULL,
        "tournament_id"   varchar(36),
        "hand_number"     integer NOT NULL,
        "dealer_bot_id"   varchar(36),
        "small_blind"     bigint NOT NULL,
        "big_blind"       bigint NOT NULL,
        "ante"            bigint NOT NULL DEFAULT 0,
        "community_cards" jsonb NOT NULL DEFAULT '[]',
        "pot"             bigint NOT NULL DEFAULT 0,
        "stage"           varchar(20) NOT NULL DEFAULT 'preflop',
        "started_at"      TIMESTAMP WITH TIME ZONE,
        "finished_at"     TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_hands" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_hands_game_hand" UNIQUE ("game_id", "hand_number"),
        CONSTRAINT "CHK_hands_hand_number" CHECK ("hand_number" >= 1),
        CONSTRAINT "CHK_hands_pot" CHECK ("pot" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_hands_game" ON "hands" ("game_id");
      CREATE INDEX IF NOT EXISTS "IDX_hands_tournament" ON "hands" ("tournament_id");
      ALTER TABLE "hands" DROP CONSTRAINT IF EXISTS "FK_hands_game";
      ALTER TABLE "hands" ADD CONSTRAINT "FK_hands_game"
        FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;
      ALTER TABLE "hands" DROP CONSTRAINT IF EXISTS "FK_hands_tournament";
      ALTER TABLE "hands" ADD CONSTRAINT "FK_hands_tournament"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE;
      ALTER TABLE "hands" DROP CONSTRAINT IF EXISTS "FK_hands_dealer";
      ALTER TABLE "hands" ADD CONSTRAINT "FK_hands_dealer"
        FOREIGN KEY ("dealer_bot_id") REFERENCES "bots"("id") ON DELETE SET NULL
    `);

    // ── hand_players ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hand_players" (
        "id"           varchar(36) NOT NULL,
        "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "hand_id"      varchar(36) NOT NULL,
        "bot_id"       varchar(36) NOT NULL,
        "position"     integer NOT NULL,
        "hole_cards"   jsonb NOT NULL DEFAULT '[]',
        "start_chips"  bigint NOT NULL,
        "end_chips"    bigint,
        "amount_bet"   bigint NOT NULL DEFAULT 0,
        "amount_won"   bigint,
        "folded"       boolean NOT NULL DEFAULT false,
        "all_in"       boolean NOT NULL DEFAULT false,
        "won"          boolean NOT NULL DEFAULT false,
        "saw_flop"     boolean NOT NULL DEFAULT false,
        "saw_showdown" boolean NOT NULL DEFAULT false,
        "best_hand"    jsonb,
        CONSTRAINT "PK_hand_players" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_hand_players" UNIQUE ("hand_id", "bot_id"),
        CONSTRAINT "CHK_hp_position" CHECK ("position" >= 0 AND "position" <= 9),
        CONSTRAINT "CHK_hp_start_chips" CHECK ("start_chips" >= 0),
        CONSTRAINT "CHK_hp_end_chips" CHECK ("end_chips" >= 0 OR "end_chips" IS NULL),
        CONSTRAINT "CHK_hp_amount_won" CHECK ("amount_won" >= 0 OR "amount_won" IS NULL),
        CONSTRAINT "CHK_hp_amount_bet" CHECK ("amount_bet" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_hand_players_hand" ON "hand_players" ("hand_id");
      ALTER TABLE "hand_players" DROP CONSTRAINT IF EXISTS "FK_hand_players_hand";
      ALTER TABLE "hand_players" ADD CONSTRAINT "FK_hand_players_hand"
        FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE;
      ALTER TABLE "hand_players" DROP CONSTRAINT IF EXISTS "FK_hand_players_bot";
      ALTER TABLE "hand_players" ADD CONSTRAINT "FK_hand_players_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // ── actions ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "actions" (
        "id"              varchar(36) NOT NULL,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "hand_id"         varchar(36) NOT NULL,
        "bot_id"          varchar(36) NOT NULL,
        "action_seq"      integer NOT NULL,
        "action_type"     varchar(20) NOT NULL,
        "stage"           varchar(20) NOT NULL,
        "amount"          bigint NOT NULL DEFAULT 0,
        "pot_after"       bigint,
        "chips_after"     bigint,
        "response_time_ms" integer,
        CONSTRAINT "PK_actions" PRIMARY KEY ("id"),
        CONSTRAINT "chk_actions_action_type" CHECK (
          "action_type" IN ('fold', 'check', 'call', 'bet', 'raise', 'all_in', 'small_blind', 'big_blind', 'ante')
        ),
        CONSTRAINT "CHK_actions_seq" CHECK ("action_seq" >= 0),
        CONSTRAINT "CHK_actions_amount" CHECK ("amount" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_actions_hand" ON "actions" ("hand_id");
      CREATE INDEX IF NOT EXISTS "IDX_actions_hand_seq" ON "actions" ("hand_id", "action_seq");
      ALTER TABLE "actions" DROP CONSTRAINT IF EXISTS "FK_actions_hand";
      ALTER TABLE "actions" ADD CONSTRAINT "FK_actions_hand"
        FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE;
      ALTER TABLE "actions" DROP CONSTRAINT IF EXISTS "FK_actions_bot";
      ALTER TABLE "actions" ADD CONSTRAINT "FK_actions_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // ── tournament_entries ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tournament_entries" (
        "id"              varchar(36) NOT NULL,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tournament_id"   varchar(36) NOT NULL,
        "bot_id"          varchar(36) NOT NULL,
        "entry_type"      varchar(20) NOT NULL DEFAULT 'initial',
        "finish_position" integer,
        "bust_level"      integer,
        "payout"          bigint NOT NULL DEFAULT 0,
        CONSTRAINT "PK_tournament_entries" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_te_payout" CHECK ("payout" >= 0),
        CONSTRAINT "CHK_te_finish_pos" CHECK ("finish_position" IS NULL OR "finish_position" >= 1)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tournament_entries_tournament_bot"
        ON "tournament_entries" ("tournament_id", "bot_id");
      ALTER TABLE "tournament_entries" DROP CONSTRAINT IF EXISTS "FK_tournament_entries_tournament";
      ALTER TABLE "tournament_entries" ADD CONSTRAINT "FK_tournament_entries_tournament"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE;
      ALTER TABLE "tournament_entries" DROP CONSTRAINT IF EXISTS "FK_tournament_entries_bot";
      ALTER TABLE "tournament_entries" ADD CONSTRAINT "FK_tournament_entries_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // ── tournament_tables ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tournament_tables" (
        "id"            varchar(36) NOT NULL,
        "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tournament_id" varchar(36) NOT NULL,
        "table_number"  integer NOT NULL,
        "game_id"       varchar(36),
        "status"        varchar(20) NOT NULL DEFAULT 'active',
        CONSTRAINT "PK_tournament_tables" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tournament_tables" UNIQUE ("tournament_id", "table_number")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tournament_tables_tournament" ON "tournament_tables" ("tournament_id");
      ALTER TABLE "tournament_tables" DROP CONSTRAINT IF EXISTS "FK_tournament_tables_tournament";
      ALTER TABLE "tournament_tables" ADD CONSTRAINT "FK_tournament_tables_tournament"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE;
      ALTER TABLE "tournament_tables" DROP CONSTRAINT IF EXISTS "FK_tournament_tables_game";
      ALTER TABLE "tournament_tables" ADD CONSTRAINT "FK_tournament_tables_game"
        FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE SET NULL
    `);

    // ── tournament_seats ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tournament_seats" (
        "id"                  varchar(36) NOT NULL,
        "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tournament_id"       varchar(36) NOT NULL,
        "tournament_table_id" varchar(36) NOT NULL,
        "bot_id"              varchar(36) NOT NULL,
        "seat_number"         integer NOT NULL,
        "chips"               bigint NOT NULL,
        "busted"              boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_tournament_seats" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_ts_chips" CHECK ("chips" >= 0),
        CONSTRAINT "CHK_ts_seat_number" CHECK ("seat_number" >= 1 AND "seat_number" <= 10)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tournament_seats_table" ON "tournament_seats" ("tournament_table_id");
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tournament_seats_tournament_bot" ON "tournament_seats" ("tournament_id", "bot_id");
      CREATE INDEX IF NOT EXISTS "IDX_tournament_seats_tournament_busted" ON "tournament_seats" ("tournament_id", "busted");
      ALTER TABLE "tournament_seats" DROP CONSTRAINT IF EXISTS "FK_tournament_seats_tournament";
      ALTER TABLE "tournament_seats" ADD CONSTRAINT "FK_tournament_seats_tournament"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE;
      ALTER TABLE "tournament_seats" DROP CONSTRAINT IF EXISTS "FK_tournament_seats_table";
      ALTER TABLE "tournament_seats" ADD CONSTRAINT "FK_tournament_seats_table"
        FOREIGN KEY ("tournament_table_id") REFERENCES "tournament_tables"("id") ON DELETE CASCADE;
      ALTER TABLE "tournament_seats" DROP CONSTRAINT IF EXISTS "FK_tournament_seats_bot";
      ALTER TABLE "tournament_seats" ADD CONSTRAINT "FK_tournament_seats_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // ── tournament_blind_levels ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tournament_blind_levels" (
        "id"            varchar(36) NOT NULL,
        "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tournament_id" varchar(36) NOT NULL,
        "level"         integer NOT NULL,
        "small_blind"   bigint NOT NULL,
        "big_blind"     bigint NOT NULL,
        "ante"          bigint NOT NULL DEFAULT 0,
        "hands_played"  integer NOT NULL DEFAULT 0,
        "started_at"    TIMESTAMP WITH TIME ZONE,
        "ended_at"      TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tournament_blind_levels" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tournament_blind_levels" UNIQUE ("tournament_id", "level"),
        CONSTRAINT "CHK_tbl_level" CHECK ("level" >= 1),
        CONSTRAINT "CHK_tbl_small_blind" CHECK ("small_blind" > 0),
        CONSTRAINT "CHK_tbl_big_blind" CHECK ("big_blind" > "small_blind"),
        CONSTRAINT "CHK_tbl_ante" CHECK ("ante" >= 0),
        CONSTRAINT "CHK_tbl_hands_played" CHECK ("hands_played" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tournament_blind_levels_tournament"
        ON "tournament_blind_levels" ("tournament_id");
      ALTER TABLE "tournament_blind_levels" DROP CONSTRAINT IF EXISTS "FK_tournament_blind_levels_tournament";
      ALTER TABLE "tournament_blind_levels" ADD CONSTRAINT "FK_tournament_blind_levels_tournament"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE
    `);

    // ── tournament_seat_history ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tournament_seat_history" (
        "id"                  varchar(36) NOT NULL,
        "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tournament_id"       varchar(36) NOT NULL,
        "tournament_table_id" varchar(36) NOT NULL,
        "bot_id"              varchar(36) NOT NULL,
        "seat_number"         integer NOT NULL,
        "chips_on_arrival"    bigint NOT NULL,
        "chips_on_departure"  bigint,
        "reason"              varchar(20) NOT NULL,
        "departed_at"         TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_tournament_seat_history" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_tsh_seat_number" CHECK ("seat_number" >= 1 AND "seat_number" <= 10),
        CONSTRAINT "CHK_tsh_chips_arrival" CHECK ("chips_on_arrival" >= 0),
        CONSTRAINT "CHK_tsh_chips_departure" CHECK ("chips_on_departure" >= 0 OR "chips_on_departure" IS NULL)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tournament_seat_history_tournament_bot"
        ON "tournament_seat_history" ("tournament_id", "bot_id");
      ALTER TABLE "tournament_seat_history" DROP CONSTRAINT IF EXISTS "FK_tsh_tournament";
      ALTER TABLE "tournament_seat_history" ADD CONSTRAINT "FK_tsh_tournament"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE;
      ALTER TABLE "tournament_seat_history" DROP CONSTRAINT IF EXISTS "FK_tsh_table";
      ALTER TABLE "tournament_seat_history" ADD CONSTRAINT "FK_tsh_table"
        FOREIGN KEY ("tournament_table_id") REFERENCES "tournament_tables"("id") ON DELETE CASCADE;
      ALTER TABLE "tournament_seat_history" DROP CONSTRAINT IF EXISTS "FK_tsh_bot";
      ALTER TABLE "tournament_seat_history" ADD CONSTRAINT "FK_tsh_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // ── bot_stats ──────────────────────────────────────────────────────
    // Entity columns only: bot_id, total_hands, total_tournaments, tournament_wins,
    // total_net, vpip_hands, pfr_hands, wtsd_hands, wmsd_hands, aggressive_actions, passive_actions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bot_stats" (
        "id"                 varchar(36) NOT NULL,
        "created_at"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "bot_id"             varchar(36) NOT NULL,
        "total_hands"        integer NOT NULL DEFAULT 0,
        "total_tournaments"  integer NOT NULL DEFAULT 0,
        "tournament_wins"    integer NOT NULL DEFAULT 0,
        "total_net"          bigint NOT NULL DEFAULT 0,
        "vpip_hands"         integer NOT NULL DEFAULT 0,
        "pfr_hands"          integer NOT NULL DEFAULT 0,
        "wtsd_hands"         integer NOT NULL DEFAULT 0,
        "wmsd_hands"         integer NOT NULL DEFAULT 0,
        "aggressive_actions" integer NOT NULL DEFAULT 0,
        "passive_actions"    integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_bot_stats" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_bs_total_hands" CHECK ("total_hands" >= 0),
        CONSTRAINT "CHK_bs_total_tournaments" CHECK ("total_tournaments" >= 0),
        CONSTRAINT "CHK_bs_tournament_wins" CHECK ("tournament_wins" >= 0),
        CONSTRAINT "CHK_bs_vpip_hands" CHECK ("vpip_hands" >= 0),
        CONSTRAINT "CHK_bs_pfr_hands" CHECK ("pfr_hands" >= 0),
        CONSTRAINT "CHK_bs_wtsd_hands" CHECK ("wtsd_hands" >= 0),
        CONSTRAINT "CHK_bs_wmsd_hands" CHECK ("wmsd_hands" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bot_stats_bot" ON "bot_stats" ("bot_id");
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bot_stats_bot" ON "bot_stats" ("bot_id");
      ALTER TABLE "bot_stats" DROP CONSTRAINT IF EXISTS "FK_bot_stats_bot";
      ALTER TABLE "bot_stats" ADD CONSTRAINT "FK_bot_stats_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE
    `);

    // ── bot_events ─────────────────────────────────────────────────────
    // Entity: bot_id, game_id, hand_id, event_type(20), details, context
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bot_events" (
        "id"         varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "bot_id"     varchar(36) NOT NULL,
        "game_id"    varchar(36),
        "hand_id"    varchar(36),
        "event_type" varchar(20) NOT NULL,
        "details"    text,
        "context"    jsonb,
        CONSTRAINT "PK_bot_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bot_events_bot_created" ON "bot_events" ("bot_id", "created_at");
      ALTER TABLE "bot_events" DROP CONSTRAINT IF EXISTS "FK_bot_events_bot";
      ALTER TABLE "bot_events" ADD CONSTRAINT "FK_bot_events_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE;
      ALTER TABLE "bot_events" DROP CONSTRAINT IF EXISTS "FK_bot_events_game";
      ALTER TABLE "bot_events" ADD CONSTRAINT "FK_bot_events_game"
        FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;
      ALTER TABLE "bot_events" DROP CONSTRAINT IF EXISTS "FK_bot_events_hand";
      ALTER TABLE "bot_events" ADD CONSTRAINT "FK_bot_events_hand"
        FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE
    `);

    // ── chip_movements ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chip_movements" (
        "id"             varchar(36) NOT NULL,
        "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "bot_id"         varchar(36) NOT NULL,
        "game_id"        varchar(36),
        "hand_id"        varchar(36),
        "tournament_id"  varchar(36),
        "movement_type"  varchar(30) NOT NULL,
        "amount"         bigint NOT NULL,
        "balance_before" bigint NOT NULL,
        "balance_after"  bigint NOT NULL,
        "description"    text,
        "context"        jsonb,
        CONSTRAINT "PK_chip_movements" PRIMARY KEY ("id"),
        CONSTRAINT "chk_chip_movements_movement_type" CHECK (
          "movement_type" IN ('ante', 'blind', 'bet', 'call', 'raise', 'all_in', 'win', 'refund', 'tournament_buyin', 'tournament_payout', 'rebuy')
        ),
        CONSTRAINT "CHK_cm_balance_after" CHECK ("balance_after" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chip_movements_bot_created"
        ON "chip_movements" ("bot_id", "created_at");
      CREATE INDEX IF NOT EXISTS "IDX_chip_movements_game_hand"
        ON "chip_movements" ("game_id", "hand_id");
      CREATE INDEX IF NOT EXISTS "IDX_chip_movements_tournament"
        ON "chip_movements" ("tournament_id");
      ALTER TABLE "chip_movements" DROP CONSTRAINT IF EXISTS "FK_chip_movements_bot";
      ALTER TABLE "chip_movements" ADD CONSTRAINT "FK_chip_movements_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE;
      ALTER TABLE "chip_movements" DROP CONSTRAINT IF EXISTS "FK_chip_movements_game";
      ALTER TABLE "chip_movements" ADD CONSTRAINT "FK_chip_movements_game"
        FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;
      ALTER TABLE "chip_movements" DROP CONSTRAINT IF EXISTS "FK_chip_movements_hand";
      ALTER TABLE "chip_movements" ADD CONSTRAINT "FK_chip_movements_hand"
        FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE;
      ALTER TABLE "chip_movements" DROP CONSTRAINT IF EXISTS "FK_chip_movements_tournament";
      ALTER TABLE "chip_movements" ADD CONSTRAINT "FK_chip_movements_tournament"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE
    `);

    // ── audit_logs ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id"               varchar(36) NOT NULL,
        "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id"          varchar(36),
        "action"           varchar(50) NOT NULL,
        "resource"         varchar(100) NOT NULL,
        "resource_id"      varchar(36),
        "ip_address"       varchar(45),
        "user_agent"       varchar(500),
        "http_method"      varchar(10) NOT NULL,
        "status_code"      integer NOT NULL,
        "duration_ms"      integer,
        "request_body"     jsonb,
        "response_summary" jsonb,
        "error_message"    text,
        "metadata"         jsonb,
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_user_created"
        ON "audit_logs" ("user_id", "created_at");
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_resource_created"
        ON "audit_logs" ("resource", "created_at");
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action_created"
        ON "audit_logs" ("action", "created_at");
      ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "FK_audit_logs_user";
      ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_audit_logs_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // ── game_state_snapshots ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "game_state_snapshots" (
        "id"                  varchar(36) NOT NULL,
        "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "game_id"             varchar(36) NOT NULL,
        "table_id"            varchar(36) NOT NULL,
        "tournament_id"       varchar(36),
        "status"              varchar(20) NOT NULL DEFAULT 'active',
        "hand_number"         integer NOT NULL DEFAULT 0,
        "game_stage"          varchar(20) NOT NULL DEFAULT 'waiting',
        "dealer_index"        integer NOT NULL DEFAULT 0,
        "pot"                 bigint NOT NULL DEFAULT 0,
        "current_bet"         bigint NOT NULL DEFAULT 0,
        "small_blind"         bigint NOT NULL,
        "big_blind"           bigint NOT NULL,
        "ante"                bigint NOT NULL DEFAULT 0,
        "starting_chips"      bigint NOT NULL,
        "turn_timeout_ms"     integer NOT NULL DEFAULT 10000,
        "community_cards"     jsonb NOT NULL DEFAULT '[]',
        "active_player_id"    varchar(36),
        "players"             jsonb NOT NULL,
        "pot_state"           jsonb,
        "betting_round_state" jsonb,
        "server_instance_id"  varchar(100),
        "last_action_at"      TIMESTAMP WITH TIME ZONE,
        "action_log"          jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT "PK_game_state_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_gss_hand_number" CHECK ("hand_number" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_game_state_snapshots_game" ON "game_state_snapshots" ("game_id");
      CREATE INDEX IF NOT EXISTS "IDX_game_state_snapshots_table" ON "game_state_snapshots" ("table_id");
      CREATE INDEX IF NOT EXISTS "IDX_game_state_snapshots_status" ON "game_state_snapshots" ("status");
      ALTER TABLE "game_state_snapshots" DROP CONSTRAINT IF EXISTS "FK_gss_game";
      ALTER TABLE "game_state_snapshots" ADD CONSTRAINT "FK_gss_game"
        FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE;
      ALTER TABLE "game_state_snapshots" DROP CONSTRAINT IF EXISTS "FK_gss_table";
      ALTER TABLE "game_state_snapshots" ADD CONSTRAINT "FK_gss_table"
        FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE;
      ALTER TABLE "game_state_snapshots" DROP CONSTRAINT IF EXISTS "FK_gss_tournament";
      ALTER TABLE "game_state_snapshots" ADD CONSTRAINT "FK_gss_tournament"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE;
      ALTER TABLE "game_state_snapshots" DROP CONSTRAINT IF EXISTS "FK_gss_active_player";
      ALTER TABLE "game_state_snapshots" ADD CONSTRAINT "FK_gss_active_player"
        FOREIGN KEY ("active_player_id") REFERENCES "bots"("id") ON DELETE SET NULL
    `);

    // ── hand_seeds ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hand_seeds" (
        "id"               varchar(36) NOT NULL,
        "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "game_id"          varchar(36) NOT NULL,
        "hand_number"      integer NOT NULL,
        "server_seed"      varchar(64) NOT NULL,
        "server_seed_hash" varchar(64) NOT NULL,
        "client_seed"      varchar(32) NOT NULL,
        "combined_hash"    varchar(64) NOT NULL,
        "deck_order"       jsonb NOT NULL,
        "revealed"         boolean NOT NULL DEFAULT false,
        "revealed_at"      TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_hand_seeds" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_hand_seeds_game_hand"
        ON "hand_seeds" ("game_id", "hand_number");
      CREATE INDEX IF NOT EXISTS "IDX_hand_seeds_game_id" ON "hand_seeds" ("game_id");
      ALTER TABLE "hand_seeds" DROP CONSTRAINT IF EXISTS "FK_hand_seeds_game";
      ALTER TABLE "hand_seeds" ADD CONSTRAINT "FK_hand_seeds_game"
        FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE
    `);

    // ── bot_subscriptions ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bot_subscriptions" (
        "id"                        varchar(36) NOT NULL,
        "created_at"                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "bot_id"                    varchar(36) NOT NULL,
        "tournament_id"             varchar(36),
        "tournament_type_filter"    varchar(50),
        "min_buy_in"                bigint,
        "max_buy_in"                bigint,
        "priority"                  integer NOT NULL DEFAULT 50,
        "status"                    varchar(20) NOT NULL DEFAULT 'active',
        "successful_registrations"  integer NOT NULL DEFAULT 0,
        "failed_registrations"      integer NOT NULL DEFAULT 0,
        "last_registration_attempt" TIMESTAMP WITH TIME ZONE,
        "expires_at"                TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_bot_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_priority" CHECK ("priority" >= 1 AND "priority" <= 100)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bot_subscriptions_bot_id" ON "bot_subscriptions" ("bot_id");
      CREATE INDEX IF NOT EXISTS "IDX_bot_subscriptions_tournament_id" ON "bot_subscriptions" ("tournament_id");
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bot_subscriptions_bot_tournament"
        ON "bot_subscriptions" ("bot_id", "tournament_id");
      ALTER TABLE "bot_subscriptions" DROP CONSTRAINT IF EXISTS "FK_bot_subscriptions_bot";
      ALTER TABLE "bot_subscriptions" ADD CONSTRAINT "FK_bot_subscriptions_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE;
      ALTER TABLE "bot_subscriptions" DROP CONSTRAINT IF EXISTS "FK_bot_subscriptions_tournament";
      ALTER TABLE "bot_subscriptions" ADD CONSTRAINT "FK_bot_subscriptions_tournament"
        FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE
    `);

    // ── platform_metrics ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "platform_metrics" (
        "id"                    varchar(36) NOT NULL,
        "created_at"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "date"                  date NOT NULL,
        "total_users"           integer NOT NULL DEFAULT 0,
        "new_users"             integer NOT NULL DEFAULT 0,
        "total_bots"            integer NOT NULL DEFAULT 0,
        "new_bots"              integer NOT NULL DEFAULT 0,
        "active_users"          integer NOT NULL DEFAULT 0,
        "active_bots"           integer NOT NULL DEFAULT 0,
        "games_played"          integer NOT NULL DEFAULT 0,
        "hands_dealt"           integer NOT NULL DEFAULT 0,
        "tournaments_completed" integer NOT NULL DEFAULT 0,
        "total_chip_volume"     bigint NOT NULL DEFAULT 0,
        "avg_bot_response_ms"   integer NOT NULL DEFAULT 0,
        "bot_timeout_count"     integer NOT NULL DEFAULT 0,
        "bot_error_count"       integer NOT NULL DEFAULT 0,
        "peak_concurrent_games" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_platform_metrics" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_platform_metrics_date" UNIQUE ("date")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_platform_metrics_date" ON "platform_metrics" ("date")`,
    );

    // ── analytics_events ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analytics_events" (
        "id"         varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id"    varchar(36),
        "event_type" varchar(50) NOT NULL,
        "event_data" jsonb NOT NULL DEFAULT '{}',
        "session_id" varchar(36) NOT NULL,
        "ip_hash"    varchar(64),
        "user_agent" varchar(500),
        "page_url"   varchar(255),
        "referrer"   varchar(255),
        CONSTRAINT "PK_analytics_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analytics_events_user_id" ON "analytics_events" ("user_id");
      CREATE INDEX IF NOT EXISTS "IDX_analytics_events_event_type" ON "analytics_events" ("event_type");
      CREATE INDEX IF NOT EXISTS "IDX_analytics_events_session_id" ON "analytics_events" ("session_id");
      ALTER TABLE "analytics_events" DROP CONSTRAINT IF EXISTS "FK_analytics_events_user";
      ALTER TABLE "analytics_events" ADD CONSTRAINT "FK_analytics_events_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // ── daily_summaries ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "daily_summaries" (
        "id"               varchar(36) NOT NULL,
        "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "summary_date"     date NOT NULL,
        "status"           varchar(20) NOT NULL DEFAULT 'pending',
        "recipients"       text[] NOT NULL DEFAULT '{}',
        "metrics_snapshot"  jsonb NOT NULL DEFAULT '{}',
        "sent_at"          TIMESTAMP WITH TIME ZONE,
        "error_message"    text,
        "retry_count"      integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_daily_summaries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_daily_summaries_date" ON "daily_summaries" ("summary_date")`,
    );

    // ── strategy_decisions ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "strategy_decisions" (
        "id"                varchar(36) NOT NULL,
        "created_at"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "bot_id"            varchar(36) NOT NULL,
        "game_id"           varchar(100) NOT NULL,
        "hand_number"       integer NOT NULL,
        "street"            varchar(20) NOT NULL,
        "bot_payload"       jsonb NOT NULL,
        "game_context"      jsonb NOT NULL,
        "strategy_snapshot"  jsonb NOT NULL,
        "action_type"       varchar(20) NOT NULL,
        "action_amount"     integer,
        "decision_source"   varchar(30) NOT NULL,
        "explanation"       text NOT NULL,
        "rule_id"           varchar(100),
        "hand_notation"     varchar(20),
        "analysis_status"   varchar(20) NOT NULL DEFAULT 'pending',
        "analysis_result"   jsonb,
        "analyzed_at"       TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_strategy_decisions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_strategy_decisions_bot_game"
        ON "strategy_decisions" ("bot_id", "game_id");
      CREATE INDEX IF NOT EXISTS "IDX_strategy_decisions_game"
        ON "strategy_decisions" ("game_id");
      CREATE INDEX IF NOT EXISTS "IDX_strategy_decisions_status"
        ON "strategy_decisions" ("analysis_status");
      ALTER TABLE "strategy_decisions" DROP CONSTRAINT IF EXISTS "FK_strategy_decisions_bot";
      ALTER TABLE "strategy_decisions" ADD CONSTRAINT "FK_strategy_decisions_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE;
      ALTER TABLE "strategy_decisions" DROP CONSTRAINT IF EXISTS "FK_strategy_decisions_game";
      ALTER TABLE "strategy_decisions" ADD CONSTRAINT "FK_strategy_decisions_game"
        FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE
    `);

    // ── strategy_analysis_reports ──────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "strategy_analysis_reports" (
        "id"                    varchar(36) NOT NULL,
        "created_at"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "bot_id"                varchar(36) NOT NULL,
        "game_id"               varchar(100) NOT NULL,
        "total_decisions"       integer NOT NULL,
        "flagged_count"         integer NOT NULL,
        "suggestions"           jsonb NOT NULL DEFAULT '[]',
        "decision_quality_score" integer NOT NULL,
        "summary"               text NOT NULL,
        "analyzed_at"           TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_strategy_analysis_reports" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_strategy_analysis_reports_bot_game"
        ON "strategy_analysis_reports" ("bot_id", "game_id");
      CREATE INDEX IF NOT EXISTS "IDX_strategy_analysis_reports_bot"
        ON "strategy_analysis_reports" ("bot_id");
      ALTER TABLE "strategy_analysis_reports" DROP CONSTRAINT IF EXISTS "FK_strategy_analysis_reports_bot";
      ALTER TABLE "strategy_analysis_reports" ADD CONSTRAINT "FK_strategy_analysis_reports_bot"
        FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE;
      ALTER TABLE "strategy_analysis_reports" DROP CONSTRAINT IF EXISTS "FK_strategy_analysis_reports_game";
      ALTER TABLE "strategy_analysis_reports" ADD CONSTRAINT "FK_strategy_analysis_reports_game"
        FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE
    `);

    // ── strategy_tuner_runs ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "strategy_tuner_runs" (
        "id"               varchar(36) NOT NULL,
        "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "status"           varchar(20) NOT NULL,
        "reports_analyzed"  integer NOT NULL,
        "proposed_changes"  jsonb NOT NULL DEFAULT '[]',
        "pr_url"           varchar(500),
        "branch_name"      varchar(200),
        "error_message"    text,
        "summary"          text,
        "started_at"       TIMESTAMP WITH TIME ZONE NOT NULL,
        "completed_at"     TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_strategy_tuner_runs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_strategy_tuner_runs_status" ON "strategy_tuner_runs" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      "strategy_tuner_runs",
      "strategy_analysis_reports",
      "strategy_decisions",
      "daily_summaries",
      "analytics_events",
      "platform_metrics",
      "bot_subscriptions",
      "hand_seeds",
      "game_state_snapshots",
      "audit_logs",
      "chip_movements",
      "bot_events",
      "bot_stats",
      "tournament_seat_history",
      "tournament_seats",
      "tournament_blind_levels",
      "tournament_tables",
      "tournament_entries",
      "actions",
      "hand_players",
      "hands",
      "game_players",
      "games",
      "table_seats",
      "tables",
      "tournaments",
      "bots",
      "users",
    ];
    for (const table of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
  }
}
