import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStrategyDecisions1710864006000 implements MigrationInterface {
  name = "AddStrategyDecisions1710864006000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "strategy_decisions" (
        "id" varchar(36) NOT NULL,
        "bot_id" varchar(36) NOT NULL,
        "game_id" varchar(100) NOT NULL,
        "hand_number" integer NOT NULL,
        "street" varchar(20) NOT NULL,
        "bot_payload" jsonb NOT NULL,
        "game_context" jsonb NOT NULL,
        "strategy_snapshot" jsonb NOT NULL,
        "action_type" varchar(20) NOT NULL,
        "action_amount" integer,
        "decision_source" varchar(30) NOT NULL,
        "explanation" text NOT NULL,
        "rule_id" varchar(100),
        "hand_notation" varchar(20),
        "analysis_status" varchar(20) NOT NULL DEFAULT 'pending',
        "analysis_result" jsonb,
        "analyzed_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_strategy_decisions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_strategy_decisions_bot" FOREIGN KEY ("bot_id")
          REFERENCES "bots"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_strategy_decisions_bot_game"
        ON "strategy_decisions" ("bot_id", "game_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_strategy_decisions_game"
        ON "strategy_decisions" ("game_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_strategy_decisions_status"
        ON "strategy_decisions" ("analysis_status")
    `);

    await queryRunner.query(`
      CREATE TABLE "strategy_analysis_reports" (
        "id" varchar(36) NOT NULL,
        "bot_id" varchar(36) NOT NULL,
        "game_id" varchar(100) NOT NULL,
        "total_decisions" integer NOT NULL,
        "flagged_count" integer NOT NULL,
        "suggestions" jsonb NOT NULL DEFAULT '[]',
        "decision_quality_score" integer NOT NULL,
        "summary" text NOT NULL,
        "analyzed_at" timestamp with time zone NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_strategy_analysis_reports" PRIMARY KEY ("id"),
        CONSTRAINT "FK_strategy_analysis_reports_bot" FOREIGN KEY ("bot_id")
          REFERENCES "bots"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_strategy_analysis_reports_bot_game"
        ON "strategy_analysis_reports" ("bot_id", "game_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_strategy_analysis_reports_bot"
        ON "strategy_analysis_reports" ("bot_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_strategy_analysis_reports_bot"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_strategy_analysis_reports_bot_game"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "strategy_analysis_reports"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_strategy_decisions_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_strategy_decisions_game"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_strategy_decisions_bot_game"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "strategy_decisions"`);
  }
}
