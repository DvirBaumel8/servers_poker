import { MigrationInterface, QueryRunner } from "typeorm";

export class AddValidationSchema1744100000000 implements MigrationInterface {
  name = "AddValidationSchema1744100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hands" ADD COLUMN IF NOT EXISTS "validation_error" BOOLEAN NOT NULL DEFAULT FALSE`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "logic_bugs" (
        "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "hand_id"     VARCHAR(36) REFERENCES "hands"("id") ON DELETE CASCADE,
        "check_name"  VARCHAR(100) NOT NULL,
        "description" TEXT        NOT NULL,
        "details"     JSONB       NOT NULL DEFAULT '{}',
        "detected_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_logic_bugs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_logic_bugs_hand_id" ON "logic_bugs" ("hand_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_logic_bugs_hand_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "logic_bugs"`);
    await queryRunner.query(
      `ALTER TABLE "hands" DROP COLUMN IF EXISTS "validation_error"`,
    );
  }
}
