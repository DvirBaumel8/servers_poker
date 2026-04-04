import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSupportTickets1744500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."support_tickets_status_enum" AS ENUM ('open', 'in_progress', 'closed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_tickets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "user_id" character varying(36),
        "email" character varying(255) NOT NULL,
        "subject" character varying(200) NOT NULL,
        "message" text NOT NULL,
        "status" "public"."support_tickets_status_enum" NOT NULL DEFAULT 'open',
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_support_tickets" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_support_tickets_user_id" ON "support_tickets" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_support_tickets_status" ON "support_tickets" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_support_tickets_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_support_tickets_user_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "support_tickets"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."support_tickets_status_enum"`,
    );
  }
}
