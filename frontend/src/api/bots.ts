import { api } from "./client";
import type { Bot, LeaderboardEntry } from "../types";

interface BotApiResponse {
  id: string;
  name: string;
  endpoint: string;
  description?: string;
  active: boolean;
  user_id: string;
  created_at: string;
  last_validation_score?: number;
}

function transformBot(raw: BotApiResponse): Bot {
  return {
    id: raw.id,
    name: raw.name,
    endpoint: raw.endpoint,
    description: raw.description,
    active: raw.active,
    userId: raw.user_id,
    createdAt: raw.created_at,
    lastValidationScore: raw.last_validation_score,
  };
}

export const botsApi = {
  getAll: async (): Promise<Bot[]> => {
    const raw = await api.get<BotApiResponse[]>("/bots");
    return raw.map(transformBot);
  },

  getById: async (id: string): Promise<Bot> => {
    const raw = await api.get<BotApiResponse>(`/bots/${id}`);
    return transformBot(raw);
  },

  getMy: async (token: string): Promise<Bot[]> => {
    const raw = await api.get<BotApiResponse[]>("/bots/my", token);
    return raw.map(transformBot);
  },

  create: (
    data: { name: string; endpoint: string; description?: string },
    token: string,
  ) => api.post<Bot>("/bots", data, token),

  update: (
    id: string,
    data: { endpoint?: string; description?: string },
    token: string,
  ) => api.put<Bot>(`/bots/${id}`, data, token),

  validate: (id: string, token: string) =>
    api.post<{
      valid: boolean;
      score: number;
      details: {
        reachable: boolean;
        respondedCorrectly: boolean;
        responseTimeMs: number;
        errors: string[];
      };
    }>(`/bots/${id}/validate`, undefined, token),

  activate: (id: string, token: string) =>
    api.post<{ success: boolean }>(`/bots/${id}/activate`, undefined, token),

  deactivate: (id: string, token: string) =>
    api.delete<{ success: boolean }>(`/bots/${id}`, token),

  getProfile: (id: string) =>
    api.get<{
      bot: Bot;
      stats: {
        totalHands: number;
        totalTournaments: number;
        tournamentWins: number;
        totalNet: number;
      };
      vpip: number;
      pfr: number;
      aggression: number;
    }>(`/bots/${id}/profile`),

  getLeaderboard: () => api.get<LeaderboardEntry[]>("/analytics/leaderboard"),
};
