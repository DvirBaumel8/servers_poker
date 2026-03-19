import { create } from "zustand";
import type { Tournament, TournamentEntry } from "../types";
import { tournamentsApi } from "../api/tournaments";

interface TournamentStore {
  tournaments: Tournament[];
  currentTournament: Tournament | null;
  leaderboard: TournamentEntry[];
  loading: boolean;
  error: string | null;

  fetchTournaments: (status?: string) => Promise<void>;
  fetchTournament: (id: string) => Promise<void>;
  fetchLeaderboard: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useTournamentStore = create<TournamentStore>((set) => ({
  tournaments: [],
  currentTournament: null,
  leaderboard: [],
  loading: false,
  error: null,

  fetchTournaments: async (status) => {
    set({ loading: true, error: null });
    try {
      const tournaments = await tournamentsApi.getAll(status);
      set({ tournaments, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  fetchTournament: async (id) => {
    set({ loading: true, error: null });
    try {
      const tournament = await tournamentsApi.getById(id);
      set({ currentTournament: tournament, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  fetchLeaderboard: async (id) => {
    try {
      const leaderboard = await tournamentsApi.getLeaderboard(id);
      set({ leaderboard });
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
    }
  },

  clearError: () => set({ error: null }),
}));
