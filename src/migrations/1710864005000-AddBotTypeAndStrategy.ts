import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBotTypeAndStrategy1710864005000 implements MigrationInterface {
  name = "AddBotTypeAndStrategy1710864005000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bots"
      ADD COLUMN "bot_type" varchar(20) NOT NULL DEFAULT 'external'
    `);

    await queryRunner.query(`
      ALTER TABLE "bots"
      ADD COLUMN "strategy" jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "bots"
      ALTER COLUMN "endpoint" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "bots"
      ADD CONSTRAINT "CHK_bot_type_valid" CHECK ("bot_type" IN ('external', 'internal'))
    `);

    await queryRunner.query(`
      ALTER TABLE "bots"
      ADD CONSTRAINT "CHK_external_has_endpoint" CHECK (
        "bot_type" != 'external' OR "endpoint" IS NOT NULL
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "bots"
      ADD CONSTRAINT "CHK_internal_has_strategy" CHECK (
        "bot_type" != 'internal' OR "strategy" IS NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bots_bot_type" ON "bots" ("bot_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bots_bot_type"`);

    await queryRunner.query(`
      ALTER TABLE "bots" DROP CONSTRAINT IF EXISTS "CHK_internal_has_strategy"
    `);
    await queryRunner.query(`
      ALTER TABLE "bots" DROP CONSTRAINT IF EXISTS "CHK_external_has_endpoint"
    `);
    await queryRunner.query(`
      ALTER TABLE "bots" DROP CONSTRAINT IF EXISTS "CHK_bot_type_valid"
    `);

    await queryRunner.query(`
      ALTER TABLE "bots"
      ALTER COLUMN "endpoint" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "bots"
      DROP COLUMN IF EXISTS "strategy"
    `);

    await queryRunner.query(`
      ALTER TABLE "bots"
      DROP COLUMN IF EXISTS "bot_type"
    `);
  }
}
