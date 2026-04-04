import { create } from 'zustand'

interface AnalyticsState {
  activeTournamentId: string | null
  activeHandIndex: number
  playbackSpeed: number
  selectedLogEntryId: string | null
  setTournament: (id: string) => void
  setHandIndex: (i: number) => void
  setPlaybackSpeed: (s: number) => void
  selectLogEntry: (id: string | null) => void
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  activeTournamentId: null,
  activeHandIndex: 0,
  playbackSpeed: 1,
  selectedLogEntryId: null,
  setTournament: (id) => set({ activeTournamentId: id, activeHandIndex: 0 }),
  setHandIndex: (i) => set({ activeHandIndex: i }),
  setPlaybackSpeed: (s) => set({ playbackSpeed: s }),
  selectLogEntry: (id) => set({ selectedLogEntryId: id }),
}))
