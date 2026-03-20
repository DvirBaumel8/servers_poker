import { api } from "./client";
import type { Tournament, TournamentEntry } from "../types";

interface TournamentApiResponse {
  id: string;
  name: string;
  type: "rolling" | "scheduled";
  status: "registering" | "running" | "final_table" | "finished" | "cancelled";
  buy_in: number;
  starting_chips: number;
  small_blind?: number;
  big_blind?: number;
  blind_increase_minutes?: number;
  min_players: number;
  max_players: number;
  players_per_table: number;
  entries_count: number;
  late_reg_ends_level: number;
  current_level?: number;
  rebuys_allowed: boolean;
  scheduled_start_at?: string;
  started_at?: string;
  finished_at?: string;
}

function transformTournament(raw: TournamentApiResponse): Tournament {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    status: raw.status,
    buyIn: raw.buy_in,
    startingChips: raw.starting_chips,
    smallBlind: raw.small_blind || 0,
    bigBlind: raw.big_blind || 0,
    blindIncreaseMinutes: raw.blind_increase_minutes,
    minPlayers: raw.min_players,
    maxPlayers: raw.max_players,
    playersPerTable: raw.players_per_table,
    entriesCount: raw.entries_count,
    registeredPlayers: raw.entries_count,
    lateRegEndsLevel: raw.late_reg_ends_level || 4,
    currentLevel: raw.current_level,
    rebuysAllowed: raw.rebuys_allowed ?? true,
    scheduledStartAt: raw.scheduled_start_at,
    startedAt: raw.started_at,
    finishedAt: raw.finished_at,
  };
}

export const tournamentsApi = {
  getAll: async (status?: string): Promise<Tournament[]> => {
    const raw = await api.get<TournamentApiResponse[]>(
      `/tournaments${status ? `?status=${status}` : ""}`,
    );
    return raw.map(transformTournament);
  },

  getById: async (id: string): Promise<Tournament> => {
    const raw = await api.get<TournamentApiResponse>(`/tournaments/${id}`);
    return transformTournament(raw);
  },

  getResults: (id: string) =>
    api.get<
      Array<{
        botId: string;
        botName: string;
        finishPosition: number;
        payout: number;
      }>
    >(`/tournaments/${id}/results`),

  getLeaderboard: (id: string) =>
    api.get<TournamentEntry[]>(`/tournaments/${id}/leaderboard`),

  create: (data: Partial<Tournament>, token: string) =>
    api.post<Tournament>("/tournaments", data, token),

  register: (tournamentId: string, botId: string, token: string) =>
    api.post<{ success: boolean }>(
      `/tournaments/${tournamentId}/register`,
      { bot_id: botId },
      token,
    ),

  unregister: (tournamentId: string, botId: string, token: string) =>
    api.delete<{ success: boolean }>(
      `/tournaments/${tournamentId}/register/${botId}`,
      token,
    ),

  start: (id: string, token: string) =>
    api.post<{ success: boolean }>(
      `/tournaments/${id}/start`,
      undefined,
      token,
    ),

  cancel: (id: string, token: string) =>
    api.post<{ success: boolean }>(
      `/tournaments/${id}/cancel`,
      undefined,
      token,
    ),
};
