import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFinanceAndMatchmaking1744000000000 implements MigrationInterface {
  name = "AddFinanceAndMatchmaking1744000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Add subscription columns to users ──
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "subscription_status" varchar(20) NOT NULL DEFAULT 'free',
        ADD COLUMN "subscription_start" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        ADD COLUMN "subscription_end" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        ADD COLUMN "monthly_fee" bigint NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "CHK_user_sub_status"
          CHECK ("subscription_status" IN ('free', 'active', 'cancelled', 'expired')),
        ADD CONSTRAINT "CHK_user_monthly_fee"
          CHECK ("monthly_fee" >= 0)
    `);

    // ── 2. Create wallets table ──
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id"         varchar(36) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "user_id"    varchar(36) NOT NULL,
        "balance"    bigint NOT NULL DEFAULT 0,
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_user_id" UNIQUE ("user_id"),
        CONSTRAINT "CHK_wallet_balance" CHECK ("balance" >= 0),
        CONSTRAINT "FK_wallets_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_wallets_user_id" ON "wallets" ("user_id")`,
    );

    // ── 3. Create transactions table ──
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id"           varchar(36) NOT NULL,
        "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "wallet_id"    varchar(36) NOT NULL,
        "type"         varchar(20) NOT NULL,
        "amount"       bigint NOT NULL,
        "reference_id" varchar(36) DEFAULT NULL,
        "description"  varchar(255) DEFAULT NULL,
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_tx_type"
          CHECK ("type" IN ('deposit', 'withdrawal', 'buy_in', 'payout', 'prize')),
        CONSTRAINT "CHK_tx_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_tx_wallet" FOREIGN KEY ("wallet_id")
          REFERENCES "wallets"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_tx_wallet_id" ON "transactions" ("wallet_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tx_reference_id" ON "transactions" ("reference_id") WHERE "reference_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tx_type" ON "transactions" ("type")`,
    );

    // ── 4. Create tournament_pods table ──
    await queryRunner.query(`
      CREATE TABLE "tournament_pods" (
        "id"                    varchar(36) NOT NULL,
        "created_at"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "master_tournament_id"  varchar(36) NOT NULL,
        "pod_number"            integer NOT NULL,
        "status"                varchar(20) NOT NULL DEFAULT 'pending',
        "prize_pool"            bigint NOT NULL DEFAULT 0,
        "player_count"          integer NOT NULL DEFAULT 0,
        "winner_bot_id"         varchar(36) DEFAULT NULL,
        CONSTRAINT "PK_tournament_pods" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_pod_status"
          CHECK ("status" IN ('pending', 'running', 'finished', 'cancelled')),
        CONSTRAINT "CHK_pod_prize_pool" CHECK ("prize_pool" >= 0),
        CONSTRAINT "CHK_pod_number" CHECK ("pod_number" >= 1),
        CONSTRAINT "UQ_pod_tournament_number"
          UNIQUE ("master_tournament_id", "pod_number"),
        CONSTRAINT "FK_pod_tournament" FOREIGN KEY ("master_tournament_id")
          REFERENCES "tournaments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pod_winner_bot" FOREIGN KEY ("winner_bot_id")
          REFERENCES "bots"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_pod_master_tournament" ON "tournament_pods" ("master_tournament_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pod_status" ON "tournament_pods" ("status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tournament_pods" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transactions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallets" CASCADE`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_user_sub_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_user_monthly_fee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "subscription_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "subscription_start"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "subscription_end"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "monthly_fee"`,
    );
  }
}
