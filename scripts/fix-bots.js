const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'poker',
  user: 'postgres',
  password: 'postgres',
});

async function main() {
  await client.connect();
  
  // Get first 30 active bots
  const result = await client.query(`
    SELECT id, name FROM bots WHERE active = true ORDER BY created_at LIMIT 30
  `);
  
  console.log(`Found ${result.rows.length} bots to update`);
  
  for (let i = 0; i < result.rows.length; i++) {
    const bot = result.rows[i];
    const port = 6001 + i;
    await client.query(`UPDATE bots SET endpoint = $1 WHERE id = $2`, [
      `http://localhost:${port}`,
      bot.id
    ]);
    console.log(`Updated ${bot.name} -> port ${port}`);
  }
  
  // Verify
  const verify = await client.query(`
    SELECT id, name, endpoint FROM bots 
    WHERE active = true AND endpoint LIKE 'http://localhost:60%' 
    ORDER BY CAST(SPLIT_PART(endpoint, ':', 3) AS INT)
    LIMIT 30
  `);
  
  console.log('\nFinal distribution:');
  for (const row of verify.rows) {
    console.log(`  ${row.name}: ${row.endpoint}`);
  }
  
  await client.end();
}

main().catch(console.error);
