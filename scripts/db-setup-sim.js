/**
 * Direct Database Setup for Tournament Simulation
 * 
 * Creates users and bots directly in PostgreSQL, bypassing rate limits.
 */

const { Client } = require('pg');
const crypto = require('crypto');

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'poker',
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

function uuid() {
  return crypto.randomUUID();
}

function hashPassword(password) {
  // Use bcrypt-compatible hash (10 rounds)
  const bcrypt = require('bcrypt');
  return bcrypt.hashSync(password, 10);
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

const PERSONALITIES = [
  'Caller', 'Caller', 'Caller', 'Caller', 'Caller',
  'Maniac', 'Maniac', 'Maniac', 'Maniac', 'Maniac',
  'Smart', 'Smart', 'Smart', 'Smart', 'Smart',
  'Random', 'Random', 'Random', 'Random', 'Random',
  'Folder', 'Folder', 'Folder', 'Folder', 'Folder',
  'AllIn', 'AllIn', 'AllIn', 'AllIn', 'AllIn',
];

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  🎰 DATABASE SETUP FOR TOURNAMENT SIMULATION');
  console.log('='.repeat(60));
  
  await client.connect();
  console.log('\n✓ Connected to PostgreSQL\n');
  
  try {
    const users = [];
    const bots = [];
    
    // Create 30 users with bots
    console.log('📝 Creating 30 users with bots...\n');
    
    for (let i = 1; i <= 30; i++) {
      const userId = uuid();
      const botId = uuid();
      const port = 6000 + i;
      const personality = PERSONALITIES[i - 1];
      const email = `simbot${i}_${Date.now()}@tournament.local`;
      const userName = `SimPlayer${i}`;
      const botName = `${personality}Bot${i}`;
      const apiKey = `sim_${uuid().replace(/-/g, '')}`;
      const apiKeyHash = hashApiKey(apiKey);
      const passwordHash = hashPassword('Test123!@#');
      
      // Insert user
      await client.query(`
        INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'user', true, true, NOW(), NOW())
        ON CONFLICT (email) DO NOTHING
      `, [userId, email, userName, passwordHash, apiKeyHash]);
      
      // Insert bot
      await client.query(`
        INSERT INTO bots (id, name, endpoint, description, user_id, active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [botId, botName, `http://localhost:${port}`, `${personality} personality simulation bot`, userId]);
      
      users.push({ id: userId, email, name: userName, apiKey });
      bots.push({ id: botId, name: botName, userId, port, personality });
      
      console.log(`  ✓ Created ${i}/30: ${botName} (port ${port})`);
    }
    
    // Create an admin user for tournament management
    console.log('\n🔐 Creating admin user...');
    const adminId = uuid();
    const adminApiKey = `admin_${uuid().replace(/-/g, '')}`;
    const adminEmail = `simadmin_${Date.now()}@tournament.local`;
    
    await client.query(`
      INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
      VALUES ($1, $2, 'SimAdmin', $3, $4, 'admin', true, true, NOW(), NOW())
      ON CONFLICT (email) DO NOTHING
    `, [adminId, adminEmail, hashPassword('Admin123!@#'), hashApiKey(adminApiKey)]);
    
    console.log(`  ✓ Created admin: ${adminEmail}`);
    
    // Create the tournament
    console.log('\n🏆 Creating tournament...');
    const tournamentId = uuid();
    
    await client.query(`
      INSERT INTO tournaments (
        id, name, type, status, buy_in, starting_chips, 
        min_players, max_players, players_per_table, 
        turn_timeout_ms, late_reg_ends_level, rebuys_allowed,
        created_at, updated_at
      ) VALUES (
        $1, 'Ultimate Bot Championship', 'rolling', 'registering', 
        100, 5000, 2, 50, 9, 5000, 6, false, NOW(), NOW()
      )
    `, [tournamentId]);
    
    console.log(`  ✓ Created tournament: Ultimate Bot Championship (ID: ${tournamentId})`);
    
    // Register initial 20 bots
    console.log('\n📋 Registering initial 20 bots...');
    
    for (let i = 0; i < 20; i++) {
      const bot = bots[i];
      const entryId = uuid();
      
      await client.query(`
        INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, created_at, updated_at)
        VALUES ($1, $2, $3, 'initial', NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [entryId, tournamentId, bot.id]);
      
      console.log(`  ✓ Registered ${i + 1}/20: ${bot.name}`);
    }
    
    // Save state
    const state = {
      tournamentId,
      adminId,
      adminEmail,
      adminApiKey,
      users,
      bots,
      registeredCount: 20,
      remainingBots: bots.slice(20)
    };
    
    require('fs').writeFileSync('/tmp/tournament-state.json', JSON.stringify(state, null, 2));
    
    // Output summary
    console.log('\n' + '='.repeat(60));
    console.log('  📊 SETUP COMPLETE');
    console.log('='.repeat(60));
    console.log(`\n  Tournament ID: ${tournamentId}`);
    console.log(`  Tournament Name: Ultimate Bot Championship`);
    console.log(`  Initial Bots Registered: 20`);
    console.log(`  Remaining for late reg: 10`);
    console.log(`\n  Admin Email: ${adminEmail}`);
    console.log(`  Admin API Key: ${adminApiKey}`);
    console.log(`\n  Frontend URL: http://localhost:3001/tournaments`);
    console.log(`\n  State saved to: /tmp/tournament-state.json`);
    
    console.log('\n' + '='.repeat(60));
    console.log('  📝 REMAINING BOTS FOR LATE REGISTRATION:');
    console.log('='.repeat(60));
    for (const bot of bots.slice(20)) {
      console.log(`  - ${bot.name} (ID: ${bot.id})`);
    }
    
    console.log('\n');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
