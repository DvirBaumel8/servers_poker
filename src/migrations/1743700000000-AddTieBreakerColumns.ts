import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTieBreakerColumns1743700000000 implements MigrationInterface {
  name = "AddTieBreakerColumns1743700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournament_entries" ADD COLUMN IF NOT EXISTS "bust_hand_number" INTEGER`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_entries" ADD COLUMN IF NOT EXISTS "chips_at_bust" INTEGER`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tournament_entries" DROP COLUMN IF EXISTS "bust_hand_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournament_entries" DROP COLUMN IF EXISTS "chips_at_bust"`,
    );
  }
}
