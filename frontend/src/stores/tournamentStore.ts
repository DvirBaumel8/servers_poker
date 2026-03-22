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
    const isInitial = useTournamentStore.getState().tournaments.length === 0;
    if (isInitial) set({ loading: true });
    set({ error: null });
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

      const prev = useTournamentStore.getState().tournaments;
      const changed =
        prev.length !== tournaments.length ||
        JSON.stringify(prev) !== JSON.stringify(tournaments);
      if (changed) {
        set({ tournaments, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  fetchTournament: async (id) => {
    const current = useTournamentStore.getState().currentTournament;
    const isNewTournament = !current || current.id !== id;
    if (isNewTournament) {
      set({ loading: true, currentTournament: null, leaderboard: [] });
    }
    set({ error: null });
    try {
      const tournament = await tournamentsApi.getById(id);
      const prev = useTournamentStore.getState().currentTournament;
      const changed = JSON.stringify(prev) !== JSON.stringify(tournament);
      if (changed) {
        set({ currentTournament: tournament, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  fetchLeaderboard: async (id) => {
    set({ leaderboardLoading: true });
    try {
      const leaderboard = await tournamentsApi.getLeaderboard(id);
      const prev = useTournamentStore.getState().leaderboard;
      const changed =
        prev.length !== leaderboard.length ||
        JSON.stringify(prev) !== JSON.stringify(leaderboard);
      if (changed) {
        set({ leaderboard, leaderboardLoading: false });
      } else {
        set({ leaderboardLoading: false });
      }
    } catch (error) {
      logger.error("Failed to fetch leaderboard", error, "TournamentStore");
      set({ leaderboardLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
