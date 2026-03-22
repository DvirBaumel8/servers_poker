/**
 * Game Setup Helper for QA Monsters
 *
 * Ensures a live game with active players is running before UI tests.
 * This gives the monsters consistent game state to test against.
 */

const API_BASE = process.env.API_BASE_URL || "http://localhost:3000/api/v1";

const DEFAULT_STRATEGY = {
  version: 1,
  tier: "quick",
  personality: {
    aggression: 50,
    bluffFrequency: 50,
    riskTolerance: 50,
    tightness: 50,
  },
};

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

    const runningWithPlayers = games.find(
      (g) =>
        g.status === "running" && g.players && g.players.length >= minPlayers,
    );
    if (runningWithPlayers) return runningWithPlayers;

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
 * Register a user, login, and create an internal bot with strategy JSON
 */
async function registerAndCreateBot(
  index: number,
): Promise<{ token: string; botId: string } | null> {
  const ts = Date.now();
  const email = `qabot${index}_${ts}@qa.local`;
  const password = `QAPass${index}!`;
  const botName = `QABot${index}_${ts}`;

  try {
    const regResponse = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: `QAPlayer${index}` }),
    });
    if (!regResponse.ok) return null;

    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!loginResponse.ok) return null;

    const loginData = (await loginResponse.json()) as {
      accessToken?: string;
    };
    if (!loginData.accessToken) return null;

    const token = loginData.accessToken;

    const botResponse = await fetch(`${API_BASE}/bots/internal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: botName,
        strategy: DEFAULT_STRATEGY,
      }),
    });
    if (!botResponse.ok) return null;

    const botData = (await botResponse.json()) as { id?: string };
    if (!botData.id) return null;

    return { token, botId: botData.id };
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
    // No external processes to clean up
  };

  const healthy = await checkBackendHealth();
  if (!healthy) {
    return {
      success: false,
      error: "Backend not running on port 3000",
      cleanup,
    };
  }

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

    let joined = 0;
    for (let i = 0; i < playersNeeded; i++) {
      const creds = await registerAndCreateBot(i + 1);

      if (creds) {
        const success = await joinGame(game.id, creds.botId, creds.token);
        if (success) {
          joined++;
        }
      }
    }

    console.log(`  ✓ ${joined} players joined`);
  }

  await new Promise((resolve) => setTimeout(resolve, waitMs));

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
