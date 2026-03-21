import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPlatformAnalytics1710864004000 implements MigrationInterface {
  name = "AddPlatformAnalytics1710864004000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "platform_metrics" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "date" date NOT NULL,
        "total_users" integer NOT NULL DEFAULT 0,
        "new_users" integer NOT NULL DEFAULT 0,
        "total_bots" integer NOT NULL DEFAULT 0,
        "new_bots" integer NOT NULL DEFAULT 0,
        "active_users" integer NOT NULL DEFAULT 0,
        "active_bots" integer NOT NULL DEFAULT 0,
        "games_played" integer NOT NULL DEFAULT 0,
        "hands_dealt" integer NOT NULL DEFAULT 0,
        "tournaments_completed" integer NOT NULL DEFAULT 0,
        "total_chip_volume" bigint NOT NULL DEFAULT 0,
        "avg_bot_response_ms" integer NOT NULL DEFAULT 0,
        "bot_timeout_count" integer NOT NULL DEFAULT 0,
        "bot_error_count" integer NOT NULL DEFAULT 0,
        "peak_concurrent_games" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_platform_metrics" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_platform_metrics_date" UNIQUE ("date")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_platform_metrics_date" ON "platform_metrics" ("date")
    `);

    await queryRunner.query(`
      CREATE TABLE "analytics_events" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id" varchar(36),
        "event_type" varchar(50) NOT NULL,
        "event_data" jsonb NOT NULL DEFAULT '{}',
        "session_id" varchar(36) NOT NULL,
        "ip_hash" varchar(64),
        "user_agent" varchar(500),
        "page_url" varchar(255),
        "referrer" varchar(255),
        CONSTRAINT "PK_analytics_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_analytics_events_user_id" ON "analytics_events" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_analytics_events_event_type" ON "analytics_events" ("event_type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_analytics_events_session_id" ON "analytics_events" ("session_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_analytics_events_created_at" ON "analytics_events" ("created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "daily_summaries" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "summary_date" date NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "recipients" text[] NOT NULL DEFAULT '{}',
        "metrics_snapshot" jsonb NOT NULL DEFAULT '{}',
        "sent_at" TIMESTAMP WITH TIME ZONE,
        "error_message" text,
        "retry_count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_daily_summaries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_daily_summaries_date" ON "daily_summaries" ("summary_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_daily_summaries_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_summaries"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_analytics_events_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_analytics_events_session_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_analytics_events_event_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_analytics_events_user_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "analytics_events"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_platform_metrics_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "platform_metrics"`);
  }
}
