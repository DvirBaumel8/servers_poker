#!/usr/bin/env node
/**
 * Quick Tournament Runner
 * =======================
 * 
 * Starts a tournament via the API and monitors its progress.
 * This bypasses the need for direct NestJS module imports.
 * 
 * Usage: node scripts/run-tournament.js
 */

const http = require('http');

const API_BASE = 'http://localhost:3000';

async function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🎰 Tournament Runner');
  console.log('====================\n');

  // Check if server is running
  const healthRes = await request('GET', '/api/v1/games/health');
  if (healthRes.status !== 200) {
    console.log('❌ Backend not running. Start with: node dist/src/main.js');
    process.exit(1);
  }
  console.log('✅ Backend is running\n');

  // Get active bots
  console.log('📋 Fetching active bots...');
  const botsRes = await request('GET', '/api/v1/bots/active');
  const bots = botsRes.data || [];
  console.log(`   Found ${bots.length} active bots\n`);

  if (bots.length < 9) {
    console.log('⚠️  Need at least 9 bots for a full table test');
    console.log('   Current bots:', bots.map(b => b.name).join(', '));
  }

  // Check for running tournaments with active state
  console.log('🏆 Checking tournaments...');
  const tourRes = await request('GET', '/api/v1/tournaments');
  const tournaments = tourRes.data || [];
  const running = tournaments.filter(t => t.status === 'running');
  
  console.log(`   Found ${running.length} running tournaments\n`);

  for (const t of running.slice(0, 3)) {
    console.log(`\n📊 Tournament: ${t.name}`);
    console.log(`   ID: ${t.id}`);
    console.log(`   Entries: ${t.entries_count}`);
    
    // Get state
    const stateRes = await request('GET', `/api/v1/tournaments/${t.id}/state`);
    if (stateRes.status === 200 && stateRes.data) {
      const state = stateRes.data;
      console.log(`   Players Remaining: ${state.playersRemaining || 'unknown'}`);
      console.log(`   Level: ${state.level || 'N/A'}`);
      console.log(`   Tables: ${state.tables?.length || 0}`);
      
      if (state.tables && state.tables.length > 0) {
        console.log('\n   🎴 Table States:');
        for (const table of state.tables) {
          const gs = table.gameState;
          if (gs) {
            const players = gs.players || [];
            const activePlayers = players.filter(p => p.chips > 0);
            console.log(`   Table ${table.tableNumber}: ${activePlayers.length} active players`);
            
            if (activePlayers.length > 0) {
              console.log('   Players:');
              for (const p of activePlayers.slice(0, 5)) {
                console.log(`     - ${p.name}: ${p.chips} chips${p.folded ? ' (folded)' : ''}${p.allIn ? ' (ALL-IN)' : ''}`);
              }
              if (activePlayers.length > 5) {
                console.log(`     ... and ${activePlayers.length - 5} more`);
              }
            }
          }
        }
        
        // Show frontend URL
        if (state.tables.length > 0) {
          const tableId = state.tables[0].tableId;
          console.log(`\n   🌐 Watch live at: http://localhost:3001/game/${tableId}`);
        }
      } else {
        console.log('   ⚠️  No active tables (tournament may be paused or DB-only state)');
      }
    }
  }

  // Check games endpoint for tables with players
  console.log('\n\n📋 Checking games for active players...');
  const gamesRes = await request('GET', '/api/v1/games');
  const tables = gamesRes.data || [];
  const tablesWithPlayers = tables.filter(t => t.players && t.players.length > 0);
  
  console.log(`   Total tables: ${tables.length}`);
  console.log(`   Tables with players: ${tablesWithPlayers.length}`);

  if (tablesWithPlayers.length > 0) {
    console.log('\n   🎴 Tables with active players:');
    for (const table of tablesWithPlayers.slice(0, 5)) {
      console.log(`   ${table.name}: ${table.players.length} players`);
      console.log(`     Watch: http://localhost:3001/game/${table.id}`);
    }
  } else {
    console.log('\n   ℹ️  No tables currently have players');
    console.log('   This is normal if no tournament is actively running in-memory.');
    console.log('\n   To start a tournament with live games:');
    console.log('   1. Go to http://localhost:3001/tournaments');
    console.log('   2. Click on a "registering" tournament');
    console.log('   3. Register bots (requires login)');
    console.log('   4. Admin starts the tournament');
  }

  console.log('\n\n✅ Done');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
