import { MigrationInterface, QueryRunner } from "typeorm";

export class AddErrorColumnsToTournaments1749000000000 implements MigrationInterface {
  name = "AddErrorColumnsToTournaments1749000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "error_reason" VARCHAR(1000)`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "error_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "error_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "error_reason"`,
    );
  }
}
