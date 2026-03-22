/**
 * Monster Army - Test Data Helpers
 *
 * Centralized test data fetching for all monsters.
 * Reduces duplication of test data discovery across monsters.
 */

import { getEnv } from "./env-config";
import { createAuthHelper } from "./auth-helper";

/**
 * Fetch the first available tournament ID.
 * Returns undefined if no tournaments exist.
 */
export async function fetchFirstTournamentId(): Promise<string | undefined> {
  const env = getEnv();

  try {
    const response = await fetch(`${env.apiBaseUrl}/tournaments`);
    if (!response.ok) return undefined;

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data[0].id;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fetch the first available game/table ID.
 * Returns undefined if no games exist.
 */
export async function fetchFirstGameId(): Promise<string | undefined> {
  const env = getEnv();
  const auth = createAuthHelper();

  try {
    await auth.authenticateAsAdmin();
    const headers = auth.getAdminHeaders();

    const response = await fetch(`${env.apiBaseUrl}/games`, { headers });
    if (!response.ok) return undefined;

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data[0].id;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fetch the first available bot ID.
 * Returns undefined if no bots exist.
 */
export async function fetchFirstBotId(): Promise<string | undefined> {
  const env = getEnv();

  try {
    const response = await fetch(`${env.apiBaseUrl}/bots`);
    if (!response.ok) return undefined;

    const data = (await response.json()) as Record<string, unknown>;
    const dataArray = data.data as unknown[] | undefined;
    if (dataArray && Array.isArray(dataArray) && dataArray.length > 0) {
      return (dataArray[0] as Record<string, string>).id;
    }
    if (Array.isArray(data) && data.length > 0) {
      return (data[0] as Record<string, string>).id;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fetch the first available user ID (requires admin auth).
 * Returns undefined if no users exist.
 */
export async function fetchFirstUserId(): Promise<string | undefined> {
  const env = getEnv();
  const auth = createAuthHelper();

  try {
    await auth.authenticateAsAdmin();
    const headers = auth.getAdminHeaders();

    const response = await fetch(`${env.apiBaseUrl}/users`, { headers });
    if (!response.ok) return undefined;

    const data = (await response.json()) as Record<string, unknown>;
    const dataArray = data.data as unknown[] | undefined;
    if (dataArray && Array.isArray(dataArray) && dataArray.length > 0) {
      return (dataArray[0] as Record<string, string>).id;
    }
    if (Array.isArray(data) && data.length > 0) {
      return (data[0] as Record<string, string>).id;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Default test IDs to use when no real data is available.
 * Note: DEFAULT_TEST_IDS is also exported from path-utils.ts for path replacement.
 * This version is for data fetching fallbacks.
 */
const FALLBACK_TEST_IDS = {
  tournament: "00000000-0000-0000-0000-000000000001",
  game: "00000000-0000-0000-0000-000000000002",
  bot: "00000000-0000-0000-0000-000000000003",
  user: "00000000-0000-0000-0000-000000000004",
};

/**
 * Fetch test IDs, falling back to defaults if not found.
 */
export async function fetchTestIds(): Promise<{
  tournamentId: string;
  gameId: string;
  botId: string;
  userId: string;
}> {
  const [tournamentId, gameId, botId, userId] = await Promise.all([
    fetchFirstTournamentId(),
    fetchFirstGameId(),
    fetchFirstBotId(),
    fetchFirstUserId(),
  ]);

  return {
    tournamentId: tournamentId || FALLBACK_TEST_IDS.tournament,
    gameId: gameId || FALLBACK_TEST_IDS.game,
    botId: botId || FALLBACK_TEST_IDS.bot,
    userId: userId || FALLBACK_TEST_IDS.user,
  };
}
