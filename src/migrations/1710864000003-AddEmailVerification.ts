import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailVerification1710864000003 implements MigrationInterface {
  name = "AddEmailVerification1710864000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "verification_code" VARCHAR(6) DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "verification_code_expires_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL
    `);

    // Set existing users as verified
    await queryRunner.query(`
      UPDATE "users"
      SET "email_verified" = true
      WHERE "email_verified" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "verification_code_expires_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "verification_code"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "email_verified"
    `);
  }
}
