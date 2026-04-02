import { DataSource } from "typeorm";
import { v4 as uuid } from "uuid";
import * as dotenv from "dotenv";
import * as crypto from "crypto";

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

const BLIND_LEVELS = [
  { level: 1, small_blind: 25, big_blind: 50, ante: 0 },
  { level: 2, small_blind: 50, big_blind: 100, ante: 10 },
  { level: 3, small_blind: 75, big_blind: 150, ante: 15 },
  { level: 4, small_blind: 100, big_blind: 200, ante: 25 },
];

async function quickStart() {
  console.log("🎬 Tournament Quick Start\n");
  await dataSource.initialize();
  console.log("✓ Connected to database\n");

  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.startTransaction();

    // Create test user
    const userId = uuid();
    const timestamp = Date.now();
    const userEmail = `test_${timestamp}@test.local`;
    const userName = `TestPlayer_${timestamp}`;
    console.log(`👤 Creating test user: ${userEmail}`);

    await queryRunner.query(
      `INSERT INTO users (id, email, name, password_hash, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
      [userId, userEmail, userName, crypto.randomBytes(20).toString("hex")]
    );

    // Create test bot
    const botId = uuid();
    const botName = `TestBot_${timestamp}`;
    const strategy = { tier: "quick", preset: "Shark" }; // Simple bot strategy
    console.log(`🤖 Creating test bot: ${botName}`);

    await queryRunner.query(
      `INSERT INTO bots (id, user_id, name, strategy, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
      [botId, userId, botName, JSON.stringify(strategy)]
    );

    // Create tournament (starts in 5 minutes)
    const tournamentId = uuid();
    const startTime = new Date(Date.now() + 1 * 60 * 1000); // 1 minutes from now
    const tournamentName = `Quick Test Tournament ${new Date().toLocaleTimeString()}`;

    console.log(`🎮 Creating tournament: ${tournamentName}`);
    console.log(`   Start time: ${startTime.toLocaleTimeString()}`);

    await queryRunner.query(
      `INSERT INTO tournaments
        (id, name, type, status, buy_in, starting_chips, min_players, max_players,
         players_per_table, turn_timeout_ms, late_reg_ends_level, rebuys_allowed,
         scheduled_start_at, started_at, finished_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,NULL,NOW(),NOW())`,
      [
        tournamentId,
        tournamentName,
        "scheduled",
        "registering",
        0,           // buy_in
        5000,        // starting_chips
        2,           // min_players
        8,           // max_players
        9,           // players_per_table
        10000,       // turn_timeout_ms
        4,           // late_reg_ends_level
        false,       // rebuys_allowed
        startTime,
      ]
    );

    // Add blind levels
    for (const level of BLIND_LEVELS) {
      await queryRunner.query(
        `INSERT INTO tournament_blind_levels
          (id, tournament_id, level, small_blind, big_blind, ante, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
        [uuid(), tournamentId, level.level, level.small_blind, level.big_blind, level.ante]
      );
    }

    // Register bot to tournament
    const entryId = uuid();
    console.log(`📝 Registering bot to tournament...`);

    await queryRunner.query(
      `INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [entryId, tournamentId, botId, "initial"]
    );

    await queryRunner.commitTransaction();

    console.log("\n✅ Tournament created successfully!\n");
    console.log("📊 Tournament Details:");
    console.log(`   ID: ${tournamentId}`);
    console.log(`   Name: ${tournamentName}`);
    console.log(`   Starts: ${startTime.toLocaleTimeString()} (in 5 minutes)`);
    console.log(`   Status: registering\n`);

    console.log("🤖 Registered Bot:");
    console.log(`   Name: ${botName}`);
    console.log(`   Owner: ${userEmail}\n`);

    console.log("🌐 Open in browser:");
    console.log(`   http://localhost:5173/tournaments/${tournamentId}\n`);

    console.log("📋 Next steps:");
    console.log("   1. Open the link above");
    console.log("   2. Login with any account (or create one)");
    console.log("   3. Click 'Register Bot' and select your bot");
    console.log("   4. Wait for countdown (5 minutes)");
    console.log("   5. Tournament starts automatically");
    console.log("   6. Watch the game live!\n");

  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error("❌ Error:", err);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

quickStart();
