import { api } from "./client";
import type { Bot, LeaderboardEntry } from "../types";

export const botsApi = {
  getAll: () => api.get<Bot[]>("/bots"),

  getById: (id: string) => api.get<Bot>(`/bots/${id}`),

  getMy: (token: string) => api.get<Bot[]>("/bots/my", token),

  create: (
    data: { name: string; endpoint: string; description?: string },
    token: string
  ) => api.post<Bot>("/bots", data, token),

  update: (
    id: string,
    data: { endpoint?: string; description?: string },
    token: string
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
