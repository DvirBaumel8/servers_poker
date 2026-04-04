import { MigrationInterface, QueryRunner } from "typeorm";

export class AddArchivingColumns1744200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tournament: archive tracking
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" ADD COLUMN "archive_url" VARCHAR(512)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tournaments_not_archived" ON "tournaments" ("finished_at") WHERE "is_archived" = FALSE AND "status" = 'finished'`,
    );

    // Hand: audit tracking
    await queryRunner.query(
      `ALTER TABLE "hands" ADD COLUMN "is_audited" BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_hands_not_audited" ON "hands" ("tournament_id") WHERE "is_audited" = FALSE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_hands_not_audited"`);
    await queryRunner.query(
      `ALTER TABLE "hands" DROP COLUMN IF EXISTS "is_audited"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_tournaments_not_archived"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "archive_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "is_archived"`,
    );
  }
}
