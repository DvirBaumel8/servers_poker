import { create } from "zustand";
import type { Tournament, TournamentEntry } from "../types";
import { tournamentsApi } from "../api/tournaments";
import { logger } from "../utils/logger";

interface TournamentStore {
  tournaments: Tournament[];
  currentTournament: Tournament | null;
  leaderboard: TournamentEntry[];
  loading: boolean;
  leaderboardLoading: boolean;
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
  leaderboardLoading: false,
  error: null,

  fetchTournaments: async (status) => {
    set({ loading: true, error: null });
    try {
      let tournaments: Tournament[];

      if (status === "active") {
        const all = await tournamentsApi.getAll();
        tournaments = all.filter(
          (t) => t.status !== "finished" && t.status !== "cancelled",
        );
      } else {
        tournaments = await tournamentsApi.getAll(status);
      }

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
    set({ leaderboardLoading: true });
    try {
      const leaderboard = await tournamentsApi.getLeaderboard(id);
      set({ leaderboard, leaderboardLoading: false });
    } catch (error) {
      logger.error("Failed to fetch leaderboard", error, "TournamentStore");
      set({ leaderboardLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
