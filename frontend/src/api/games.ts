import { api } from "./client";
import type { GameState } from "../types";

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

export interface HandHistory {
  id: string;
  handNumber: number;
  stage: string;
  pot: number;
  winners: Array<{ playerId: string; amount: number }>;
  createdAt: string;
}

export const gamesApi = {
  getTables: () => api.get<Table[]>("/games"),

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

  getLeaderboard: (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    return api.get<
      Array<{
        botId: string;
        botName: string;
        totalNet: number;
        totalTournaments: number;
        tournamentWins: number;
        totalHands: number;
      }>
    >(`/games/leaderboard${query.toString() ? `?${query}` : ""}`);
  },

  health: () => api.get<{ status: string; activeGames: number }>("/games/health"),
};
