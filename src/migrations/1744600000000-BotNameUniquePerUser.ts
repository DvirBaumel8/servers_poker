import { MigrationInterface, QueryRunner } from "typeorm";

export class BotNameUniquePerUser1744600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the global unique constraint on bot name
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bots_name"`);

    // Add per-user unique constraint: a user cannot have two bots with the same name
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_bots_user_name" ON "bots" ("user_id", "name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_bots_user_name"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bots_name" ON "bots" ("name")`,
    );
  }
}
