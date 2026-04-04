import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSimulations1744300000000 implements MigrationInterface {
  name = "AddSimulations1744300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."simulations_status_enum" AS ENUM(
        'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."simulations_opponent_profile_enum" AS ENUM(
        'AGGRESSIVE_SHARKS', 'TIGHT_PASSIVE', 'CURRENT_META'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "simulations" (
        "id"               VARCHAR(36)  NOT NULL DEFAULT gen_random_uuid(),
        "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "user_id"          VARCHAR(36)  NOT NULL,
        "bot_id"           VARCHAR(36)  NOT NULL,
        "status"           "public"."simulations_status_enum" NOT NULL DEFAULT 'PENDING',
        "hand_count"       INTEGER      NOT NULL,
        "progress_hands"   INTEGER      NOT NULL DEFAULT 0,
        "opponent_profile" "public"."simulations_opponent_profile_enum" NOT NULL,
        "config_snapshot"  JSONB        NOT NULL DEFAULT '{}',
        "completed_at"     TIMESTAMPTZ  NULL,
        CONSTRAINT "PK_simulations" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_simulations_user_id" ON "simulations" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "simulation_results" (
        "id"                 VARCHAR(36) NOT NULL DEFAULT gen_random_uuid(),
        "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "simulation_id"      VARCHAR(36) NOT NULL,
        "total_profit"       BIGINT      NOT NULL DEFAULT 0,
        "bb_per_100"         FLOAT       NOT NULL DEFAULT 0,
        "win_rate"           FLOAT       NOT NULL DEFAULT 0,
        "vpip"               FLOAT       NOT NULL DEFAULT 0,
        "pfr"                FLOAT       NOT NULL DEFAULT 0,
        "aggression_factor"  FLOAT       NOT NULL DEFAULT 0,
        "heatmap_data"       JSONB       NOT NULL DEFAULT '{}',
        "equity_realization" FLOAT       NOT NULL DEFAULT 0,
        CONSTRAINT "PK_simulation_results" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_simulation_results_simulation_id" UNIQUE ("simulation_id"),
        CONSTRAINT "FK_simulation_results_simulation"
          FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "simulation_results"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "simulations"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."simulations_opponent_profile_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."simulations_status_enum"`,
    );
  }
}
