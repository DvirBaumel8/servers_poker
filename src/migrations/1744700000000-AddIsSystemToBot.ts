import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsSystemToBot1744700000000 implements MigrationInterface {
  name = "AddIsSystemToBot1744700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bots" ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT FALSE`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bots" DROP COLUMN "is_system"`);
  }
}
