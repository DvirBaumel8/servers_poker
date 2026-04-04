import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTableSizeToSimulations1744800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE simulations
      ADD COLUMN table_size INTEGER NOT NULL DEFAULT 9
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE simulations DROP COLUMN table_size
    `);
  }
}
