/**
 * Start Live Tournament
 * =====================
 * 
 * This script bootstraps the NestJS application and starts a tournament
 * with bots so we can observe the game UI.
 * 
 * Run with: npx ts-node --project tsconfig.json scripts/start-live-tournament.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TournamentDirectorService } from '../src/modules/tournaments/tournament-director.service';
import { TournamentsService } from '../src/modules/tournaments/tournaments.service';
import { BotsService } from '../src/modules/bots/bots.service';
import { DataSource } from 'typeorm';

async function bootstrap() {
  console.log('🎰 Starting Live Tournament System...\n');

  // Create NestJS application and start listening
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.enableCors({ origin: '*' });
  app.setGlobalPrefix('api/v1');
  await app.listen(3000);
  console.log('✅ Server listening on port 3000');

  const tournamentService = app.get(TournamentsService);
  const tournamentDirector = app.get(TournamentDirectorService);
  const botsService = app.get(BotsService);
  const dataSource = app.get(DataSource);

  console.log('✅ NestJS app initialized\n');

  // Get active bots
  const bots = await botsService.findActive();
  console.log(`📋 Found ${bots.length} active bots`);

  if (bots.length < 9) {
    console.log('⚠️  Less than 9 bots - will use what we have');
  }

  // Check for existing registering tournament or create via raw SQL
  const tournaments = await tournamentService.findAll('registering');
  let tournamentId: string;

  if (tournaments.length > 0) {
    tournamentId = tournaments[0].id;
    console.log(`\n🏆 Using existing tournament: ${tournaments[0].name}`);
  } else {
    // Create new tournament via raw SQL to ensure all required fields
    console.log('\n🏆 Creating new tournament...');
    const result = await dataSource.query(`
      INSERT INTO tournaments (id, name, type, status, buy_in, starting_chips, min_players, max_players, players_per_table, turn_timeout_ms, late_reg_ends_level, rebuys_allowed, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, 'standard', 'registering', 100, 5000, 2, 100, 9, 10000, 4, true, NOW(), NOW())
      RETURNING id, name
    `, [`Live Test ${new Date().toISOString().slice(11, 19)}`]);
    tournamentId = result[0].id;
    console.log(`   Created: ${result[0].name} (${tournamentId})`);
  }

  // Register bots (up to 30)
  const botsToRegister = bots.slice(0, Math.min(30, bots.length));
  console.log(`\n📝 Registering ${botsToRegister.length} bots...`);

  // Use raw SQL to register since we don't have user context
  for (const bot of botsToRegister) {
    try {
      await dataSource.query(`
        INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, 'initial', NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [tournamentId, bot.id]);
    } catch (e) {
      // Ignore duplicates
    }
  }

  // Make sure tournament is in 'registering' status so it can be started
  await dataSource.query(`
    UPDATE tournaments SET status = 'registering' WHERE id = $1 AND status != 'running'
  `, [tournamentId]);

  // Get entry count
  const entries = await dataSource.query(`
    SELECT COUNT(*) as count FROM tournament_entries WHERE tournament_id = $1
  `, [tournamentId]);
  console.log(`   Registered: ${entries[0].count} bots`);

  // Start the tournament director
  console.log('\n🚀 Starting tournament director...');
  
  try {
    await tournamentDirector.startTournament(tournamentId);
    console.log('✅ Tournament started!\n');
  } catch (e: any) {
    console.log(`⚠️  Could not start director: ${e.message}`);
    console.log('   Tournament may need manual start via API');
  }

  // Monitor the tournament
  console.log('📊 Monitoring tournament...\n');
  
  let lastState: any = null;
  const startTime = Date.now();
  const maxDuration = 5 * 60 * 1000; // 5 minutes

  while (Date.now() - startTime < maxDuration) {
    const state = tournamentDirector.getTournamentState(tournamentId);
    
    if (state && state.tables && state.tables.length > 0) {
      if (!lastState || JSON.stringify(state.tables) !== JSON.stringify(lastState?.tables)) {
        console.log(`\n⏱️  Time: ${Math.round((Date.now() - startTime) / 1000)}s`);
        console.log(`   Level: ${state.level}`);
        console.log(`   Players: ${state.playersRemaining}`);
        console.log(`   Tables: ${state.tables.length}`);
        
        for (const table of state.tables) {
          const gs = table.gameState;
          if (gs && gs.players) {
            const active = gs.players.filter((p: any) => p.chips > 0);
            console.log(`\n   Table ${table.tableNumber} (${table.tableId}):`);
            console.log(`     Stage: ${gs.stage || 'waiting'}`);
            console.log(`     Pot: ${gs.pot || 0}`);
            console.log(`     Players: ${active.length}`);
            
            // Print player details
            for (const p of active.slice(0, 5)) {
              const status = p.folded ? '(folded)' : p.allIn ? '(ALL-IN)' : '';
              console.log(`       ${p.name}: ${p.chips} chips ${status}`);
            }
            if (active.length > 5) {
              console.log(`       ... and ${active.length - 5} more`);
            }
          }
        }

        // Print watch URL
        if (state.tables.length > 0) {
          console.log(`\n   🌐 Watch at: http://localhost:3001/game/${state.tables[0].tableId}`);
        }
        
        lastState = state;
      }
    } else {
      process.stdout.write('.');
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n\n✅ Monitoring complete');
  console.log('   The tournament continues running in the background.');
  console.log('   Press Ctrl+C to stop the server.\n');

  // Keep the process alive
  await new Promise(() => {});
}

bootstrap().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
