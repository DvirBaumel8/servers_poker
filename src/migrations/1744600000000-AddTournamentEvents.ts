import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTournamentEvents1744600000000 implements MigrationInterface {
  name = "AddTournamentEvents1744600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tournament_events" (
        "id" VARCHAR(36) NOT NULL DEFAULT gen_random_uuid(),
        "tournament_id" VARCHAR(36) NOT NULL,
        "event_type" VARCHAR(50) NOT NULL,
        "bot_id" VARCHAR(36) NOT NULL,
        "from_table_id" VARCHAR(36),
        "to_table_id" VARCHAR(36),
        "from_seat" INTEGER,
        "to_seat" INTEGER,
        "chips_at_move" BIGINT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_tournament_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tournament_events_tournament" FOREIGN KEY ("tournament_id")
          REFERENCES "tournaments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tournament_events_from_table" FOREIGN KEY ("from_table_id")
          REFERENCES "tournament_tables"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_tournament_events_to_table" FOREIGN KEY ("to_table_id")
          REFERENCES "tournament_tables"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_tournament_events_tournament_id"
        ON "tournament_events" ("tournament_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_tournament_events_created_at"
        ON "tournament_events" ("created_at" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_tournament_events_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_tournament_events_tournament_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "tournament_events"`);
  }
}
