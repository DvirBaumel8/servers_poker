import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHandsPerLevelToTournaments1746000000000 implements MigrationInterface {
  name = "AddHandsPerLevelToTournaments1746000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "hands_per_level" INTEGER NOT NULL DEFAULT 50`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "hands_per_level"`,
    );
  }
}
