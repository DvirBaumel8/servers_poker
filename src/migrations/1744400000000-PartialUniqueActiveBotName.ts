import { MigrationInterface, QueryRunner } from "typeorm";

export class PartialUniqueActiveBotName1744400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the global unique index on name (blocks reuse of deleted-bot names)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bots_name"`);

    // Drop the strict (user_id, name) unique index (replaced below with partial)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bots_user_id_name"`);

    // Partial unique index: only active bots must have unique names per user.
    // Deactivated bots free up their name for reuse.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bots_active_user_name"
       ON "bots" ("user_id", "name")
       WHERE active = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bots_active_user_name"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bots_user_id_name" ON "bots" ("user_id", "name")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bots_name" ON "bots" ("name")`,
    );
  }
}
