import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGameStateSnapshots1710864001000 implements MigrationInterface {
  name = "AddGameStateSnapshots1710864001000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "game_state_snapshots" (
        "id" varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "game_id" varchar(36) NOT NULL,
        "table_id" varchar(36) NOT NULL,
        "tournament_id" varchar(36),
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "hand_number" integer NOT NULL DEFAULT 0,
        "game_stage" varchar(20) NOT NULL DEFAULT 'waiting',
        "dealer_index" integer NOT NULL DEFAULT 0,
        "pot" bigint NOT NULL DEFAULT 0,
        "current_bet" bigint NOT NULL DEFAULT 0,
        "small_blind" bigint NOT NULL,
        "big_blind" bigint NOT NULL,
        "ante" bigint NOT NULL DEFAULT 0,
        "starting_chips" bigint NOT NULL,
        "turn_timeout_ms" integer NOT NULL DEFAULT 10000,
        "community_cards" jsonb NOT NULL DEFAULT '[]',
        "active_player_id" varchar(36),
        "players" jsonb NOT NULL,
        "pot_state" jsonb,
        "betting_round_state" jsonb,
        "server_instance_id" varchar(100),
        "last_action_at" TIMESTAMP WITH TIME ZONE,
        "action_log" jsonb NOT NULL DEFAULT '[]',
        CONSTRAINT "PK_game_state_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_game_state_snapshots_hand_number" CHECK ("hand_number" >= 0)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_game_state_snapshots_game" ON "game_state_snapshots" ("game_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_game_state_snapshots_table" ON "game_state_snapshots" ("table_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_game_state_snapshots_status" ON "game_state_snapshots" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_game_state_snapshots_server" ON "game_state_snapshots" ("server_instance_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "game_state_snapshots"`);
  }
}
