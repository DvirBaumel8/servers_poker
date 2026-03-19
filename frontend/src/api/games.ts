import { api } from "./client";
import type { GameState } from "../types";

interface TableApiResponse {
  id: string;
  name: string;
  status: "waiting" | "running" | "finished";
  config: {
    small_blind: number;
    big_blind: number;
    starting_chips: number;
    max_players: number;
  };
  players: Array<{ id: string; name: string }>;
}

export interface Table {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  currentPlayers: number;
  status: "waiting" | "running" | "finished";
  createdAt: string;
}

function transformTable(raw: TableApiResponse): Table {
  return {
    id: raw.id,
    name: raw.name,
    smallBlind: raw.config?.small_blind || 0,
    bigBlind: raw.config?.big_blind || 0,
    maxPlayers: raw.config?.max_players || 9,
    currentPlayers: raw.players?.length || 0,
    status: raw.status,
    createdAt: "",
  };
}

export interface HandHistory {
  id: string;
  handNumber: number;
  stage: string;
  pot: number;
  winners: Array<{ playerId: string; amount: number }>;
  createdAt: string;
}

export const gamesApi = {
  getTables: async (): Promise<Table[]> => {
    const raw = await api.get<TableApiResponse[]>("/games");
    return raw.map(transformTable);
  },

  getTable: (id: string) => api.get<Table>(`/games/tables/${id}`),

  createTable: (
    data: {
      name: string;
      small_blind: number;
      big_blind: number;
      max_players?: number;
      starting_chips?: number;
    },
    token: string
  ) => api.post<Table>("/games/tables", data, token),

  getGameState: (tableId: string) =>
    api.get<GameState>(`/games/${tableId}/state`),

  joinTable: (tableId: string, botId: string, token: string) =>
    api.post<{ success: boolean; message: string }>(
      `/games/${tableId}/join`,
      { bot_id: botId },
      token
    ),

  getHandHistory: (
    tableId: string,
    params?: { limit?: number; offset?: number }
  ) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    return api.get<HandHistory[]>(
      `/games/${tableId}/hands${query.toString() ? `?${query}` : ""}`
    );
  },

  getHand: (handId: string) => api.get<HandHistory>(`/games/hands/${handId}`),

  getLeaderboard: async (params?: { limit?: number; offset?: number; period?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    if (params?.period) query.set("period", params.period);
    
    const raw = await api.get<
      Array<{
        name: string;
        bot_id: string;
        games_played: string;
        total_hands: string;
        total_wins: string;
        total_winnings: string;
        win_rate_pct: string;
      }>
    >(`/games/leaderboard${query.toString() ? `?${query}` : ""}`);
    
    return raw.map((entry) => ({
      botId: entry.bot_id,
      botName: entry.name,
      totalNet: parseInt(entry.total_winnings, 10) || 0,
      totalTournaments: parseInt(entry.games_played, 10) || 0,
      tournamentWins: parseInt(entry.total_wins, 10) || 0,
      totalHands: parseInt(entry.total_hands, 10) || 0,
    }));
  },

  health: () => api.get<{ status: string; activeGames: number }>("/games/health"),
};
