/**
 * Register bots for tournament simulation
 * Uses admin token to register bots on behalf of users
 */

const fetch = require('node-fetch');
const { Client } = require('pg');

const API_BASE = 'http://localhost:3000/api/v1';

async function main() {
  const simState = require('/tmp/sim-v2.json');
  const { tournamentId, adminToken } = simState;
  
  console.log(`\n🏆 Registering bots for tournament: ${tournamentId}\n`);

  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'poker',
    user: 'postgres',
    password: 'postgres',
  });
  
  await client.connect();

  // Get unique bots (one per user) with localhost endpoints
  const result = await client.query(`
    WITH ranked_bots AS (
      SELECT b.id as bot_id, b.name, u.id as user_id, b.endpoint,
             ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY b.created_at DESC) as rn
      FROM bots b 
      JOIN users u ON b.user_id = u.id 
      WHERE b.active = true 
        AND b.endpoint LIKE 'http://localhost:60%'
        AND CAST(SPLIT_PART(b.endpoint, ':', 3) AS INT) BETWEEN 6001 AND 6030
    )
    SELECT bot_id, name, user_id, endpoint
    FROM ranked_bots
    WHERE rn = 1
    ORDER BY CAST(SPLIT_PART(endpoint, ':', 3) AS INT)
    LIMIT 30;
  `);
  
  console.log(`Found ${result.rows.length} unique user-bot pairs\n`);

  let registered = 0;
  let failed = 0;

  for (const row of result.rows) {
    try {
      // Login as each user to get their token
      const userResult = await client.query(
        `SELECT email FROM users WHERE id = $1`,
        [row.user_id]
      );
      const email = userResult.rows[0]?.email;
      
      // Update password temporarily for login
      const tempPassword = 'TempPass123!';
      const bcrypt = require('bcrypt');
      const hash = bcrypt.hashSync(tempPassword, 10);
      await client.query(
        `UPDATE users SET password_hash = $1, email_verified = true WHERE id = $2`,
        [hash, row.user_id]
      );
      
      // Login as user
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: tempPassword }),
      });
      
      const loginData = await loginRes.json();
      if (!loginData.accessToken) {
        console.log(`  ✗ ${row.name}: Failed to login as ${email}`);
        failed++;
        continue;
      }
      
      // Register bot
      const regRes = await fetch(`${API_BASE}/tournaments/${tournamentId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loginData.accessToken}`,
        },
        body: JSON.stringify({ bot_id: row.bot_id }),
      });
      
      const regData = await regRes.json();
      if (regData.success) {
        console.log(`  ✓ ${row.name} (${row.endpoint})`);
        registered++;
      } else {
        console.log(`  ✗ ${row.name}: ${regData.message || JSON.stringify(regData)}`);
        failed++;
      }
    } catch (err) {
      console.log(`  ✗ ${row.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${registered} registered, ${failed} failed`);
  
  // Get tournament status
  const statusRes = await fetch(`${API_BASE}/tournaments/${tournamentId}`);
  const status = await statusRes.json();
  console.log(`\n🎰 Tournament status: ${status.entries_count}/${status.max_players} players`);
  
  await client.end();
}

main().catch(console.error);
