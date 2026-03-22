/**
 * Game Setup Helper for QA Monsters
 *
 * Ensures a live game with active players is running before UI tests.
 * This gives the monsters consistent game state to test against.
 */

import { spawn, ChildProcess } from "child_process";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3000/api/v1";
const BASE_PORT = 4300; // Different from demo script to avoid conflicts

interface SetupResult {
  success: boolean;
  gameId?: string;
  gameUrl?: string;
  playerCount?: number;
  error?: string;
  cleanup: () => Promise<void>;
}

interface GameInfo {
  id: string;
  name: string;
  status: string;
  players: Array<{ id: string; name: string }>;
}

let mockBotProcesses: ChildProcess[] = [];

/**
 * Check if backend is healthy
 */
async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/games/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Find a running game with players, or create one
 */
async function findOrCreateGame(
  minPlayers: number = 2,
): Promise<GameInfo | null> {
  try {
    const response = await fetch(`${API_BASE}/games`);
    if (!response.ok) return null;

    const games = (await response.json()) as GameInfo[];

    // First, try to find a running game with enough players
    const runningWithPlayers = games.find(
      (g) =>
        g.status === "running" && g.players && g.players.length >= minPlayers,
    );
    if (runningWithPlayers) return runningWithPlayers;

    // Next, try to find any running game we can join
    const anyRunning = games.find(
      (g) => g.status === "running" || g.status === "waiting",
    );
    if (anyRunning) return anyRunning;

    return null;
  } catch {
    return null;
  }
}

/**
 * Start a mock bot server on a given port
 */
function startMockBotServer(port: number): ChildProcess {
  const proc = spawn("npx", ["ts-node", "scripts/mock-bot-server.ts"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    detached: true,
  });
  return proc;
}

/**
 * Register a demo player and get their credentials
 */
async function registerDemoPlayer(
  index: number,
  port: number,
): Promise<{ token: string; botId: string } | null> {
  const ts = Date.now();
  const email = `qabot${index}_${ts}@qa.local`;
  const password = `QAPass${index}!`;
  const botName = `QABot${index}_${ts}`;

  try {
    const response = await fetch(`${API_BASE}/auth/register-developer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        name: `QAPlayer${index}`,
        botName,
        botEndpoint: `http://localhost:${port}/action`,
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      accessToken?: string;
      bot?: { id?: string };
    };
    if (!data.accessToken || !data.bot?.id) return null;

    return {
      token: data.accessToken,
      botId: data.bot.id,
    };
  } catch {
    return null;
  }
}

/**
 * Join a bot to a game
 */
async function joinGame(
  gameId: string,
  botId: string,
  token: string,
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/games/${gameId}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ bot_id: botId }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      // "already running" or "joined" are success cases
      if (
        error.message?.includes("running") ||
        error.message?.includes("joined")
      ) {
        return true;
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a live game is running with players for UI testing
 *
 * @param numPlayers Number of players to add (default: 4)
 * @param waitMs Time to wait for game to stabilize (default: 3000)
 */
export async function ensureLiveGame(
  numPlayers: number = 4,
  waitMs: number = 3000,
): Promise<SetupResult> {
  const cleanup = async () => {
    // Kill mock bot processes
    for (const proc of mockBotProcesses) {
      try {
        proc.kill("SIGTERM");
      } catch {
        // Ignore errors
      }
    }
    mockBotProcesses = [];
  };

  // Check backend health
  const healthy = await checkBackendHealth();
  if (!healthy) {
    return {
      success: false,
      error: "Backend not running on port 3000",
      cleanup,
    };
  }

  // Find existing game or one we can join
  let game = await findOrCreateGame(2);
  if (!game) {
    return {
      success: false,
      error: "No available games found. Create a table first.",
      cleanup,
    };
  }

  const currentPlayerCount = game.players?.length || 0;
  const playersNeeded = Math.max(0, numPlayers - currentPlayerCount);

  if (playersNeeded > 0) {
    console.log(
      `  🎮 Adding ${playersNeeded} players to game: ${game.name}...`,
    );

    // Start mock bot servers
    for (let i = 0; i < playersNeeded; i++) {
      const port = BASE_PORT + i + 1;
      const proc = startMockBotServer(port);
      mockBotProcesses.push(proc);
    }

    // Wait for servers to start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Register and join players
    let joined = 0;
    for (let i = 0; i < playersNeeded; i++) {
      const port = BASE_PORT + i + 1;
      const creds = await registerDemoPlayer(i + 1, port);

      if (creds) {
        const success = await joinGame(game.id, creds.botId, creds.token);
        if (success) {
          joined++;
        }
      }
    }

    console.log(`  ✓ ${joined} players joined`);
  }

  // Wait for game to stabilize
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  // Refresh game info
  game = await findOrCreateGame(0);

  return {
    success: true,
    gameId: game?.id,
    gameUrl: game ? `http://localhost:3001/game/${game.id}` : undefined,
    playerCount: game?.players?.length || 0,
    cleanup,
  };
}

/**
 * Quick check if any live game with players exists
 */
export async function hasLiveGame(): Promise<boolean> {
  const game = await findOrCreateGame(2);
  return game !== null && game.players && game.players.length >= 2;
}
