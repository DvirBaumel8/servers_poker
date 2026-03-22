#!/usr/bin/env npx ts-node
/**
 * QA Monster - Seed Tournament
 *
 * Quickly seeds a tournament with bots for UI testing.
 * This ensures the QA Monster has active tables to test.
 *
 * Run with: npm run qa:monster:seed
 */

const API_BASE = "http://localhost:3000/api/v1";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

interface Bot {
  id: string;
  name: string;
  status: string;
}

interface Tournament {
  id: string;
  name: string;
  status: string;
  registeredPlayers: number;
  maxPlayers: number;
}

async function fetchJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

async function checkBackend(): Promise<boolean> {
  try {
    await fetchJson("/games");
    return true;
  } catch {
    return false;
  }
}

async function getActiveBots(): Promise<Bot[]> {
  const bots = await fetchJson<Bot[]>("/bots");
  return bots.filter((b) => b.status === "active");
}

async function getRunningTournaments(): Promise<Tournament[]> {
  const tournaments = await fetchJson<Tournament[]>("/tournaments");
  return tournaments.filter((t) => t.status === "running");
}

async function getRegisteringTournaments(): Promise<Tournament[]> {
  const tournaments = await fetchJson<Tournament[]>("/tournaments");
  return tournaments.filter((t) => t.status === "registering");
}

async function getTablesWithPlayers(): Promise<any[]> {
  const games = await fetchJson<any[]>("/games");
  return games.filter((g) => g.players && g.players.length > 0);
}

async function main(): Promise<void> {
  console.log(`\n${CYAN}${"═".repeat(60)}${RESET}`);
  console.log(`${CYAN}${BOLD}  QA MONSTER - SEED TOURNAMENT${RESET}`);
  console.log(`${CYAN}${"═".repeat(60)}${RESET}\n`);

  // Check backend
  console.log(`  Checking backend...`);
  const backendUp = await checkBackend();
  if (!backendUp) {
    console.log(`  ${RED}✗ Backend not responding${RESET}`);
    console.log(
      `  ${YELLOW}Start the backend first: node dist/src/main.js${RESET}\n`,
    );
    process.exit(1);
  }
  console.log(`  ${GREEN}✓ Backend is running${RESET}`);

  // Check for active bots
  console.log(`  Checking for active bots...`);
  const bots = await getActiveBots();
  if (bots.length === 0) {
    console.log(`  ${YELLOW}⚠ No active bots found${RESET}`);
    console.log(`  ${YELLOW}Create bots through the UI or API first${RESET}\n`);
  } else {
    console.log(`  ${GREEN}✓ Found ${bots.length} active bots${RESET}`);
  }

  // Check for running tournaments
  console.log(`  Checking for running tournaments...`);
  const runningTournaments = await getRunningTournaments();
  if (runningTournaments.length > 0) {
    console.log(
      `  ${GREEN}✓ Found ${runningTournaments.length} running tournaments${RESET}`,
    );
    for (const t of runningTournaments) {
      console.log(`    - ${t.name} (${t.registeredPlayers} players)`);
    }
  } else {
    console.log(`  ${YELLOW}⚠ No running tournaments${RESET}`);
  }

  // Check for tables with players
  console.log(`  Checking for tables with players...`);
  const tablesWithPlayers = await getTablesWithPlayers();
  if (tablesWithPlayers.length > 0) {
    console.log(
      `  ${GREEN}✓ Found ${tablesWithPlayers.length} tables with players${RESET}`,
    );
    for (const t of tablesWithPlayers.slice(0, 3)) {
      console.log(
        `    - ${t.name || t.id.slice(0, 8)}: ${t.players?.length || 0} players`,
      );
    }
    if (tablesWithPlayers.length > 3) {
      console.log(`    ... and ${tablesWithPlayers.length - 3} more`);
    }
  } else {
    console.log(`  ${YELLOW}⚠ No tables have active players${RESET}`);
  }

  // Summary
  console.log(`\n${CYAN}${"─".repeat(60)}${RESET}`);
  console.log(`\n  ${BOLD}Summary:${RESET}`);

  const hasPlayers = tablesWithPlayers.length > 0;
  const hasTournaments = runningTournaments.length > 0;

  if (hasPlayers) {
    console.log(`  ${GREEN}${BOLD}✓ Ready for UI testing!${RESET}`);
    console.log(
      `  ${GREEN}Tables have active players - run QA Monster now.${RESET}`,
    );
  } else if (hasTournaments) {
    console.log(
      `  ${YELLOW}${BOLD}⚠ Tournaments running but no visible players${RESET}`,
    );
    console.log(
      `  ${YELLOW}Wait for tournament hands to start, or check API.${RESET}`,
    );
  } else {
    console.log(`  ${YELLOW}${BOLD}⚠ No active games for UI testing${RESET}`);
    console.log(`\n  ${BOLD}To seed test data, run one of:${RESET}`);
    console.log(
      `    ${CYAN}npm run qa:monster:live-tournament${RESET}  - Start a full tournament`,
    );
    console.log(
      `    ${CYAN}npm run sim:multi${RESET}                   - Run multi-table simulation`,
    );
  }

  // Registering tournaments that could be started
  const registeringTournaments = await getRegisteringTournaments();
  if (registeringTournaments.length > 0) {
    console.log(`\n  ${BOLD}Tournaments ready to start (registering):${RESET}`);
    for (const t of registeringTournaments) {
      console.log(
        `    - ${t.name}: ${t.registeredPlayers}/${t.maxPlayers} players`,
      );
    }
    console.log(`\n  ${YELLOW}Start these via the admin panel or API.${RESET}`);
  }

  console.log();
}

main().catch((err) => {
  console.error(`${RED}Error: ${err.message}${RESET}`);
  process.exit(1);
});
