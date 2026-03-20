import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHandSeeds1710864002000 implements MigrationInterface {
  name = "AddHandSeeds1710864002000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "hand_seeds" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "game_id" varchar(36) NOT NULL,
        "hand_number" integer NOT NULL,
        "server_seed" varchar(64) NOT NULL,
        "server_seed_hash" varchar(64) NOT NULL,
        "client_seed" varchar(32) NOT NULL,
        "combined_hash" varchar(64) NOT NULL,
        "deck_order" jsonb NOT NULL,
        "revealed" boolean NOT NULL DEFAULT false,
        "revealed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_hand_seeds" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_hand_seeds_game_hand" UNIQUE ("game_id", "hand_number")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_hand_seeds_game_id" ON "hand_seeds" ("game_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "hand_seeds"
        ADD CONSTRAINT "FK_hand_seeds_game"
        FOREIGN KEY ("game_id")
        REFERENCES "games"("id")
        ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "hand_seeds" DROP CONSTRAINT "FK_hand_seeds_game"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_hand_seeds_game_id"
    `);

    await queryRunner.query(`
      DROP TABLE "hand_seeds"
    `);
  }
}
