import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStrategyTunerRuns1710864007000 implements MigrationInterface {
  name = "AddStrategyTunerRuns1710864007000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "strategy_tuner_runs" (
        "id" varchar(36) NOT NULL,
        "status" varchar(20) NOT NULL,
        "reports_analyzed" integer NOT NULL,
        "proposed_changes" jsonb NOT NULL DEFAULT '[]',
        "pr_url" varchar(500),
        "branch_name" varchar(200),
        "error_message" text,
        "summary" text,
        "started_at" timestamp with time zone NOT NULL,
        "completed_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_strategy_tuner_runs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_strategy_tuner_runs_status"
        ON "strategy_tuner_runs" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_strategy_tuner_runs_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "strategy_tuner_runs"`);
  }
}
