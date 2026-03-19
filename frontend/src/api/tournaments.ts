import { api } from "./client";
import type { Tournament, TournamentEntry } from "../types";

export const tournamentsApi = {
  getAll: (status?: string) =>
    api.get<Tournament[]>(`/tournaments${status ? `?status=${status}` : ""}`),

  getById: (id: string) => api.get<Tournament>(`/tournaments/${id}`),

  getResults: (id: string) =>
    api.get<Array<{ botId: string; botName: string; finishPosition: number; payout: number }>>(
      `/tournaments/${id}/results`
    ),

  getLeaderboard: (id: string) =>
    api.get<TournamentEntry[]>(`/tournaments/${id}/leaderboard`),

  create: (data: Partial<Tournament>, token: string) =>
    api.post<Tournament>("/tournaments", data, token),

  register: (tournamentId: string, botId: string, token: string) =>
    api.post<{ success: boolean }>(
      `/tournaments/${tournamentId}/register`,
      { bot_id: botId },
      token
    ),

  unregister: (tournamentId: string, botId: string, token: string) =>
    api.delete<{ success: boolean }>(
      `/tournaments/${tournamentId}/register/${botId}`,
      token
    ),

  start: (id: string, token: string) =>
    api.post<{ success: boolean }>(`/tournaments/${id}/start`, undefined, token),

  cancel: (id: string, token: string) =>
    api.post<{ success: boolean }>(`/tournaments/${id}/cancel`, undefined, token),
};
