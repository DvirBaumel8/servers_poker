import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueSeatPerTable1748000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // First fix any existing duplicates: keep the row with the most chips
    await queryRunner.query(`
      DELETE FROM tournament_seats
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY tournament_table_id, seat_number
                   ORDER BY chips DESC, created_at ASC
                 ) AS rn
          FROM tournament_seats
          WHERE busted = false
        ) sub
        WHERE sub.rn > 1
      )
    `);

    // Add partial unique index: only non-busted seats must be unique per table
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_seat_per_table_active"
      ON tournament_seats (tournament_table_id, seat_number)
      WHERE busted = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_seat_per_table_active"`);
  }
}
