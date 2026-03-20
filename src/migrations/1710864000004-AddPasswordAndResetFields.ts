import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPasswordAndResetFields1710864000004 implements MigrationInterface {
  name = "AddPasswordAndResetFields1710864000004";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add password_hash column
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(60)
    `);

    // Add password reset columns
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "password_reset_code" VARCHAR(6) DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "password_reset_expires_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL
    `);

    // Set a temporary password hash for existing users (they'll need to reset)
    // This is bcrypt hash for "changeme123" - existing users should reset their password
    await queryRunner.query(`
      UPDATE "users"
      SET "password_hash" = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4EnRKDsGOJi1Qwki'
      WHERE "password_hash" IS NULL
    `);

    // Make password_hash NOT NULL after setting defaults
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "password_hash" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "password_reset_expires_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "password_reset_code"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "password_hash"
    `);
  }
}
