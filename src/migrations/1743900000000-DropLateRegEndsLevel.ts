import { MigrationInterface, QueryRunner } from "typeorm";

export class DropLateRegEndsLevel1743900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tournaments DROP COLUMN IF EXISTS late_reg_ends_level`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE tournaments ADD COLUMN late_reg_ends_level integer NOT NULL DEFAULT 4`,
    );
  }
}
