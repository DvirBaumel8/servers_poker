import { DataSource } from "typeorm";
import { v4 as uuid } from "uuid";
import * as dotenv from "dotenv";

dotenv.config();

const dataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "poker",
  synchronize: false,
  logging: false,
});

const now = Date.now();

const TOURNAMENTS = [
  {
    id: uuid(),
    name: "Daily Grind #442",
    type: "scheduled",
    status: "registering",
    buy_in: 0,
    starting_chips: 5000,
    min_players: 4,
    max_players: 16,
    players_per_table: 9,
    turn_timeout_ms: 10000,
    rebuys_allowed: false,
    scheduled_start_at: new Date(now + 30 * 60 * 1000), // 30 min from now
  },
  {
    id: uuid(),
    name: "Evening Royale #89",
    type: "scheduled",
    status: "registering",
    buy_in: 0,
    starting_chips: 10000,
    min_players: 4,
    max_players: 32,
    players_per_table: 9,
    turn_timeout_ms: 10000,
    rebuys_allowed: false,
    scheduled_start_at: new Date(now + 2 * 60 * 60 * 1000), // 2 hours from now
  },
  {
    id: uuid(),
    name: "Weekend Championship #12",
    type: "scheduled",
    status: "registering",
    buy_in: 0,
    starting_chips: 20000,
    min_players: 8,
    max_players: 64,
    players_per_table: 9,
    turn_timeout_ms: 10000,
    rebuys_allowed: false,
    scheduled_start_at: new Date(now + 24 * 60 * 60 * 1000), // 24 hours from now
  },
];

// Prize structures per tournament (position -> payout in cents or display dollars)
const BLIND_LEVELS = [
  { level: 1, small_blind: 25, big_blind: 50, ante: 0 },
  { level: 2, small_blind: 50, big_blind: 100, ante: 10 },
  { level: 3, small_blind: 75, big_blind: 150, ante: 15 },
  { level: 4, small_blind: 100, big_blind: 200, ante: 25 },
  { level: 5, small_blind: 150, big_blind: 300, ante: 30 },
  { level: 6, small_blind: 200, big_blind: 400, ante: 50 },
];

async function seed() {
  console.log("Connecting to database...");
  await dataSource.initialize();
  console.log("Connected!\n");

  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.startTransaction();

    console.log("Clearing existing tournaments...");
    // Delete dependent rows first (foreign key order)
    await queryRunner.query(`DELETE FROM tournament_blind_levels`);
    await queryRunner.query(`DELETE FROM tournament_seat_history`);
    await queryRunner.query(`DELETE FROM tournament_seats`);
    await queryRunner.query(`DELETE FROM tournament_tables`);
    await queryRunner.query(`DELETE FROM tournament_entries`);
    await queryRunner.query(`DELETE FROM tournaments`);
    console.log("Cleared.\n");

    for (const t of TOURNAMENTS) {
      console.log(`Creating tournament: ${t.name}`);
      await queryRunner.query(
        `INSERT INTO tournaments
          (id, name, type, status, buy_in, starting_chips, min_players, max_players,
           players_per_table, turn_timeout_ms, rebuys_allowed,
           scheduled_start_at, started_at, finished_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL,NULL,NOW(),NOW())`,
        [
          t.id, t.name, t.type, t.status, t.buy_in, t.starting_chips,
          t.min_players, t.max_players, t.players_per_table, t.turn_timeout_ms,
          t.rebuys_allowed, t.scheduled_start_at,
        ],
      );

      for (const level of BLIND_LEVELS) {
        await queryRunner.query(
          `INSERT INTO tournament_blind_levels
            (id, tournament_id, level, small_blind, big_blind, ante, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
          [uuid(), t.id, level.level, level.small_blind, level.big_blind, level.ante],
        );
      }
    }

    await queryRunner.commitTransaction();
    console.log("\nDone! Created 3 tournaments:");
    TOURNAMENTS.forEach((t) => {
      console.log(`  - ${t.name} (starts ${t.scheduled_start_at.toISOString()})`);
    });
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error("Seed failed, rolled back:", err);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

seed();
