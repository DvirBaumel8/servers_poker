import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProfitCurveToSimulations1745000000000 implements MigrationInterface {
  name = "AddProfitCurveToSimulations1745000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "simulation_results" ADD COLUMN IF NOT EXISTS "profit_curve" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "simulation_results" DROP COLUMN IF EXISTS "profit_curve"`,
    );
  }
}
