import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from "typeorm";

export class AddBotSubscriptions1710864003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "bot_subscriptions",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            default: "uuid_generate_v4()",
          },
          {
            name: "bot_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "tournament_id",
            type: "uuid",
            isNullable: true,
          },
          {
            name: "tournament_type_filter",
            type: "varchar",
            length: "50",
            isNullable: true,
          },
          {
            name: "min_buy_in",
            type: "bigint",
            isNullable: true,
          },
          {
            name: "max_buy_in",
            type: "bigint",
            isNullable: true,
          },
          {
            name: "priority",
            type: "integer",
            default: 50,
          },
          {
            name: "status",
            type: "varchar",
            length: "20",
            default: "'active'",
          },
          {
            name: "successful_registrations",
            type: "integer",
            default: 0,
          },
          {
            name: "failed_registrations",
            type: "integer",
            default: 0,
          },
          {
            name: "last_registration_attempt",
            type: "timestamp with time zone",
            isNullable: true,
          },
          {
            name: "expires_at",
            type: "timestamp with time zone",
            isNullable: true,
          },
          {
            name: "created_at",
            type: "timestamp with time zone",
            default: "now()",
          },
          {
            name: "updated_at",
            type: "timestamp with time zone",
            default: "now()",
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "bot_subscriptions",
      new TableIndex({
        name: "IDX_bot_subscriptions_bot_id",
        columnNames: ["bot_id"],
      }),
    );

    await queryRunner.createIndex(
      "bot_subscriptions",
      new TableIndex({
        name: "IDX_bot_subscriptions_tournament_id",
        columnNames: ["tournament_id"],
      }),
    );

    await queryRunner.createIndex(
      "bot_subscriptions",
      new TableIndex({
        name: "IDX_bot_subscriptions_bot_tournament",
        columnNames: ["bot_id", "tournament_id"],
        isUnique: true,
        where: "tournament_id IS NOT NULL",
      }),
    );

    await queryRunner.createForeignKey(
      "bot_subscriptions",
      new TableForeignKey({
        name: "FK_bot_subscriptions_bot",
        columnNames: ["bot_id"],
        referencedTableName: "bots",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createForeignKey(
      "bot_subscriptions",
      new TableForeignKey({
        name: "FK_bot_subscriptions_tournament",
        columnNames: ["tournament_id"],
        referencedTableName: "tournaments",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.query(`
      ALTER TABLE bot_subscriptions
      ADD CONSTRAINT CHK_priority
      CHECK (priority >= 1 AND priority <= 100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE bot_subscriptions DROP CONSTRAINT IF EXISTS CHK_priority`,
    );
    await queryRunner.dropForeignKey(
      "bot_subscriptions",
      "FK_bot_subscriptions_tournament",
    );
    await queryRunner.dropForeignKey(
      "bot_subscriptions",
      "FK_bot_subscriptions_bot",
    );
    await queryRunner.dropIndex(
      "bot_subscriptions",
      "IDX_bot_subscriptions_bot_tournament",
    );
    await queryRunner.dropIndex(
      "bot_subscriptions",
      "IDX_bot_subscriptions_tournament_id",
    );
    await queryRunner.dropIndex(
      "bot_subscriptions",
      "IDX_bot_subscriptions_bot_id",
    );
    await queryRunner.dropTable("bot_subscriptions");
  }
}
