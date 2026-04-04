import { MigrationInterface, QueryRunner } from "typeorm";

export class DropUnusedTables1743500000000 implements MigrationInterface {
  name = "DropUnusedTables1743500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "strategy_decisions" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "table_seats" CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "table_seats" (
        "id"              VARCHAR(36)              NOT NULL,
        "table_id"        VARCHAR(36)              NOT NULL,
        "bot_id"          VARCHAR(36)              NOT NULL,
        "joined_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "disconnected"    BOOLEAN                  NOT NULL DEFAULT false,
        "disconnected_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_table_seats" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "strategy_decisions" (
        "id"              VARCHAR(36)              NOT NULL,
        "bot_id"          VARCHAR(36)              NOT NULL,
        "bot_name"        VARCHAR(100)             NOT NULL,
        "game_id"         VARCHAR(36),
        "hand_number"     INTEGER                  NOT NULL,
        "street"          VARCHAR(20)              NOT NULL,
        "game_state"      JSONB                    NOT NULL,
        "available_actions" JSONB                  NOT NULL,
        "decision_context"  JSONB                  NOT NULL,
        "action_taken"    VARCHAR(20)              NOT NULL,
        "amount"          INTEGER,
        "tier"            VARCHAR(30)              NOT NULL,
        "rationale"       TEXT                     NOT NULL,
        "model_used"      VARCHAR(100),
        "confidence"      VARCHAR(20),
        "analysis_status" VARCHAR(20)              NOT NULL DEFAULT 'pending',
        "analysis_result" JSONB,
        "analyzed_at"     TIMESTAMP WITH TIME ZONE,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_strategy_decisions" PRIMARY KEY ("id")
      )
    `);
  }
}
