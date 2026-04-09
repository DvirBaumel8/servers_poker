import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLogDataToTournaments1747000000000 implements MigrationInterface {
  name = "AddLogDataToTournaments1747000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "log_data" JSONB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "log_data"`,
    );
  }
}
