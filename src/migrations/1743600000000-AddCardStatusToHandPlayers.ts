import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCardStatusToHandPlayers1743600000000 implements MigrationInterface {
  name = "AddCardStatusToHandPlayers1743600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hand_players" ADD COLUMN IF NOT EXISTS "card_status" VARCHAR(10) NOT NULL DEFAULT 'hidden'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hand_players" DROP COLUMN IF EXISTS "card_status"`,
    );
  }
}
