import { DataSource } from "typeorm";
import { v4 as uuid } from "uuid";
import * as crypto from "crypto";
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

function hashApiKey(key: string): string {
  const hashSecret =
    process.env.API_KEY_HMAC_SECRET || "development-api-key-hash-secret";
  return crypto
    .pbkdf2Sync(key, hashSecret, 210000, 32, "sha256")
    .toString("hex");
}

async function seed() {
  console.log("Connecting to database...");
  await dataSource.initialize();
  console.log("Connected!\n");

  const queryRunner = dataSource.createQueryRunner();

  try {
    // Create Users (schema uses 'name' not 'username', 'api_key_hash' not 'api_key')
    console.log("Creating users...");
    const users = [
      { id: uuid(), email: "admin@poker.io", name: "admin", role: "admin" },
      { id: uuid(), email: "alice@example.com", name: "alice", role: "user" },
      { id: uuid(), email: "bob@example.com", name: "bob", role: "user" },
      { id: uuid(), email: "charlie@example.com", name: "charlie", role: "user" },
      { id: uuid(), email: "diana@example.com", name: "diana", role: "user" },
    ];

    for (const user of users) {
      const apiKey = `api_${uuid().replace(/-/g, "")}`;
      const apiKeyHash = hashApiKey(apiKey);
      await queryRunner.query(
        `INSERT INTO users (id, email, name, api_key_hash, role, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
         ON CONFLICT (email) DO NOTHING`,
        [user.id, user.email, user.name, apiKeyHash, user.role]
      );
    }
    console.log(`  Created ${users.length} users`);

    // Fetch created users
    const dbUsers = await queryRunner.query(`SELECT id, name FROM users`);
    const userMap = new Map(dbUsers.map((u: { id: string; name: string }) => [u.name, u.id]));

    // Create Bots
    console.log("Creating bots...");
    const bots = [
      { name: "AlphaPoker", endpoint: "https://alpha-poker.example.com/action", owner: "alice", description: "Advanced GTO-based strategy bot" },
      { name: "DeepStack Pro", endpoint: "https://deepstack.example.com/api/action", owner: "alice", description: "Neural network powered decision making" },
      { name: "PokerMind", endpoint: "https://pokermind.example.com/move", owner: "bob", description: "Exploitative player profiling" },
      { name: "BluffMaster", endpoint: "https://bluffmaster.example.com/decide", owner: "bob", description: "Aggression-focused bluffing strategy" },
      { name: "TightPlayer", endpoint: "https://tight-player.example.com/action", owner: "charlie", description: "Conservative tight-aggressive style" },
      { name: "LAGBot", endpoint: "https://lagbot.example.com/play", owner: "charlie", description: "Loose-aggressive table domination" },
      { name: "EquityCalc", endpoint: "https://equity-calc.example.com/action", owner: "diana", description: "Pure equity-based decisions" },
      { name: "RangeExplorer", endpoint: "https://range-explorer.example.com/action", owner: "diana", description: "Hand range analysis expert" },
    ];

    const botIds: string[] = [];
    for (const bot of bots) {
      const botId = uuid();
      botIds.push(botId);
      const userId = userMap.get(bot.owner);
      await queryRunner.query(
        `INSERT INTO bots (id, name, endpoint, description, user_id, active, last_validation_score, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, $6, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [botId, bot.name, bot.endpoint, bot.description, userId, Math.floor(Math.random() * 30) + 70]
      );
    }
    console.log(`  Created ${bots.length} bots`);

    // Fetch created bots
    const dbBots = await queryRunner.query(`SELECT id, name FROM bots`);
    const botMap = new Map(dbBots.map((b: { id: string; name: string }) => [b.name, b.id]));

    // Create Bot Stats
    console.log("Creating bot stats...");
    const botStats = [
      { bot: "AlphaPoker", hands: 15420, tournaments: 45, wins: 12, net: 125000 },
      { bot: "DeepStack Pro", hands: 12350, tournaments: 38, wins: 8, net: 89000 },
      { bot: "PokerMind", hands: 18200, tournaments: 52, wins: 6, net: 67500 },
      { bot: "BluffMaster", hands: 9800, tournaments: 28, wins: 4, net: 42000 },
      { bot: "TightPlayer", hands: 22100, tournaments: 61, wins: 9, net: 78000 },
      { bot: "LAGBot", hands: 8500, tournaments: 22, wins: 3, net: -15000 },
      { bot: "EquityCalc", hands: 14200, tournaments: 40, wins: 7, net: 55000 },
      { bot: "RangeExplorer", hands: 11800, tournaments: 35, wins: 5, net: 38000 },
    ];

    for (const stat of botStats) {
      const botId = botMap.get(stat.bot);
      if (botId) {
        await queryRunner.query(
          `INSERT INTO bot_stats (id, bot_id, total_hands, total_tournaments, tournament_wins, total_net, vpip_hands, pfr_hands, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
           ON CONFLICT (bot_id) DO UPDATE SET total_hands = $3, total_tournaments = $4, tournament_wins = $5, total_net = $6`,
          [uuid(), botId, stat.hands, stat.tournaments, stat.wins, stat.net, Math.floor(stat.hands * 0.25), Math.floor(stat.hands * 0.18)]
        );
      }
    }
    console.log(`  Created ${botStats.length} bot stats`);

    // Create Tournaments (schema doesn't have small_blind, big_blind, blind_increase_minutes columns)
    console.log("Creating tournaments...");
    const now = new Date();
    const tournaments = [
      { name: "Sunday Million", status: "registering", buyIn: 100, startingChips: 10000, maxPlayers: 100 },
      { name: "Daily Grind", status: "registering", buyIn: 50, startingChips: 5000, maxPlayers: 50 },
      { name: "High Roller", status: "running", buyIn: 500, startingChips: 20000, maxPlayers: 20 },
      { name: "Turbo Blast", status: "running", buyIn: 25, startingChips: 3000, maxPlayers: 30 },
      { name: "Weekly Championship", status: "finished", buyIn: 200, startingChips: 15000, maxPlayers: 80 },
      { name: "Beginner's Luck", status: "finished", buyIn: 10, startingChips: 2000, maxPlayers: 100 },
    ];

    const tournamentIds: string[] = [];
    for (const t of tournaments) {
      const tid = uuid();
      tournamentIds.push(tid);
      const startedAt = t.status !== "registering" ? new Date(now.getTime() - Math.random() * 3600000) : null;
      const finishedAt = t.status === "finished" ? new Date(now.getTime() - Math.random() * 1800000) : null;
      
      await queryRunner.query(
        `INSERT INTO tournaments (id, name, type, status, buy_in, starting_chips, min_players, max_players, players_per_table, created_at, updated_at, started_at, finished_at)
         VALUES ($1, $2, 'rolling', $3, $4, $5, 2, $6, 9, NOW(), NOW(), $7, $8)
         ON CONFLICT DO NOTHING`,
        [tid, t.name, t.status, t.buyIn, t.startingChips, t.maxPlayers, startedAt, finishedAt]
      );
    }
    console.log(`  Created ${tournaments.length} tournaments`);

    // Fetch tournaments
    const dbTournaments = await queryRunner.query(`SELECT id, name, status FROM tournaments`);
    const tournamentMap = new Map(dbTournaments.map((t: { id: string; name: string }) => [t.name, t.id]));

    // Create Tournament Entries
    console.log("Creating tournament entries...");
    const tournamentEntries = [
      { tournament: "Sunday Million", bots: ["AlphaPoker", "DeepStack Pro", "PokerMind", "TightPlayer"] },
      { tournament: "Daily Grind", bots: ["BluffMaster", "LAGBot", "EquityCalc"] },
      { tournament: "High Roller", bots: ["AlphaPoker", "DeepStack Pro", "PokerMind", "TightPlayer", "EquityCalc"] },
      { tournament: "Turbo Blast", bots: ["BluffMaster", "LAGBot", "RangeExplorer"] },
      { tournament: "Weekly Championship", bots: ["AlphaPoker", "PokerMind", "TightPlayer", "EquityCalc", "RangeExplorer"] },
      { tournament: "Beginner's Luck", bots: ["BluffMaster", "LAGBot"] },
    ];

    let entryCount = 0;
    for (const entry of tournamentEntries) {
      const tid = tournamentMap.get(entry.tournament);
      if (tid) {
        for (let i = 0; i < entry.bots.length; i++) {
          const botId = botMap.get(entry.bots[i]);
          if (botId) {
            const tournament = dbTournaments.find((t: { name: string }) => t.name === entry.tournament);
            const finishPosition = tournament?.status === "finished" ? i + 1 : null;
            const payout = tournament?.status === "finished" && i === 0 ? 1000 : 0;
            
            await queryRunner.query(
              `INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, finish_position, payout, created_at, updated_at)
               VALUES ($1, $2, $3, 'initial', $4, $5, NOW(), NOW())
               ON CONFLICT DO NOTHING`,
              [uuid(), tid, botId, finishPosition, payout]
            );
            entryCount++;
          }
        }
      }
    }
    console.log(`  Created ${entryCount} tournament entries`);

    // Create Cash Game Tables (table is named 'tables')
    console.log("Creating cash game tables...");
    const tables = [
      { name: "High Stakes Arena", smallBlind: 50, bigBlind: 100, maxPlayers: 9, startingChips: 10000 },
      { name: "Mid Stakes Lounge", smallBlind: 25, bigBlind: 50, maxPlayers: 6, startingChips: 5000 },
      { name: "Beginner's Table", smallBlind: 5, bigBlind: 10, maxPlayers: 9, startingChips: 1000 },
      { name: "Heads Up Challenge", smallBlind: 100, bigBlind: 200, maxPlayers: 2, startingChips: 20000 },
      { name: "Short Stack Special", smallBlind: 10, bigBlind: 20, maxPlayers: 6, startingChips: 500 },
    ];

    for (const table of tables) {
      await queryRunner.query(
        `INSERT INTO tables (id, name, small_blind, big_blind, max_players, starting_chips, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'waiting', NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [uuid(), table.name, table.smallBlind, table.bigBlind, table.maxPlayers, table.startingChips]
      );
    }
    console.log(`  Created ${tables.length} cash game tables`);

    // Create Games and Hands for history
    console.log("Creating games and hand history...");
    
    // Get the tables we created
    const dbTables = await queryRunner.query(`SELECT id, name FROM tables`);
    
    let gameCount = 0;
    let handCount = 0;
    
    for (const table of dbTables) {
      // Create 2-3 games per table
      const numGames = Math.floor(Math.random() * 2) + 2;
      for (let g = 0; g < numGames; g++) {
        const gameId = uuid();
        const status = g === 0 ? "waiting" : "finished";
        const totalHands = status === "finished" ? Math.floor(Math.random() * 20) + 5 : 0;
        
        await queryRunner.query(
          `INSERT INTO games (id, table_id, status, total_hands, created_at, updated_at, started_at, finished_at)
           VALUES ($1, $2, $3, $4, NOW() - interval '${g * 2} hours', NOW(), $5, $6)
           ON CONFLICT DO NOTHING`,
          [
            gameId,
            table.id,
            status,
            totalHands,
            status === "finished" ? new Date(Date.now() - (g + 1) * 3600000) : null,
            status === "finished" ? new Date(Date.now() - g * 3600000) : null,
          ]
        );
        gameCount++;
        
        // Create hands for finished games
        if (status === "finished") {
          for (let h = 1; h <= totalHands; h++) {
            const pot = Math.floor(Math.random() * 5000) + 200;
            const stage = ["preflop", "flop", "turn", "river", "showdown"][Math.floor(Math.random() * 5)];
            
            await queryRunner.query(
              `INSERT INTO hands (id, game_id, hand_number, small_blind, big_blind, pot, stage, community_cards, created_at, updated_at, started_at, finished_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW() - interval '${h * 2} minutes', NOW() - interval '${h * 2 - 1} minutes')
               ON CONFLICT DO NOTHING`,
              [
                uuid(),
                gameId,
                h,
                10,
                20,
                pot,
                stage,
                JSON.stringify(stage !== "preflop" ? [
                  { rank: ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"][Math.floor(Math.random() * 13)], suit: ["h", "d", "c", "s"][Math.floor(Math.random() * 4)] },
                  { rank: ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"][Math.floor(Math.random() * 13)], suit: ["h", "d", "c", "s"][Math.floor(Math.random() * 4)] },
                  { rank: ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"][Math.floor(Math.random() * 13)], suit: ["h", "d", "c", "s"][Math.floor(Math.random() * 4)] },
                ] : []),
              ]
            );
            handCount++;
          }
        }
      }
    }
    console.log(`  Created ${gameCount} games`);
    console.log(`  Created ${handCount} hand history records`);

    // Create game_players for leaderboard
    console.log("Creating game player records...");
    const finishedGames = await queryRunner.query(
      `SELECT id FROM games WHERE status = 'finished'`
    );
    
    let gamePlayerCount = 0;
    for (const game of finishedGames) {
      // Add 3-6 bots to each finished game
      const numPlayers = Math.floor(Math.random() * 4) + 3;
      const shuffledBots = [...dbBots].sort(() => Math.random() - 0.5).slice(0, numPlayers);
      
      for (let i = 0; i < shuffledBots.length; i++) {
        const bot = shuffledBots[i];
        const startChips = 1000;
        const handsPlayed = Math.floor(Math.random() * 50) + 10;
        const handsWon = Math.floor(Math.random() * handsPlayed * 0.3);
        const totalWinnings = (i === 0 ? 1 : -1) * Math.floor(Math.random() * 2000) + (i === 0 ? 500 : 0);
        const endChips = Math.max(0, startChips + totalWinnings);
        
        await queryRunner.query(
          `INSERT INTO game_players (id, game_id, bot_id, start_chips, end_chips, hands_played, hands_won, total_winnings, finish_position, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [uuid(), game.id, bot.id, startChips, endChips, handsPlayed, handsWon, totalWinnings, i + 1]
        );
        gamePlayerCount++;
      }
    }
    console.log(`  Created ${gamePlayerCount} game player records`);

    console.log("\n✅ Seed data created successfully!");
    console.log("\nTest accounts (login via API - no password in this schema):");
    console.log("  - admin@poker.io (admin)");
    console.log("  - alice@example.com (user)");
    console.log("  - bob@example.com (user)");
    console.log("  - charlie@example.com (user)");
    console.log("  - diana@example.com (user)");

  } catch (error) {
    console.error("Error seeding data:", error);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

seed().catch(console.error);
