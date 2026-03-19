import { create } from "zustand";
import type { GameState, HandResult, Player } from "../types";

interface GameStore {
  gameState: GameState | null;
  lastHandResult: HandResult | null;
  selectedPlayerId: string | null;
  showCards: boolean;
  
  setGameState: (state: GameState | null) => void;
  setLastHandResult: (result: HandResult | null) => void;
  setSelectedPlayer: (id: string | null) => void;
  toggleShowCards: () => void;
  
  getPlayer: (id: string) => Player | undefined;
  getCurrentPlayer: () => Player | undefined;
  getDealerPlayer: () => Player | undefined;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  lastHandResult: null,
  selectedPlayerId: null,
  showCards: false,

  setGameState: (gameState) => set({ gameState }),
  setLastHandResult: (lastHandResult) => set({ lastHandResult }),
  setSelectedPlayer: (selectedPlayerId) => set({ selectedPlayerId }),
  toggleShowCards: () => set((s) => ({ showCards: !s.showCards })),

  getPlayer: (id) => {
    const { gameState } = get();
    return gameState?.players.find((p) => p.id === id);
  },

  getCurrentPlayer: () => {
    const { gameState } = get();
    if (!gameState?.currentPlayerId) return undefined;
    return gameState.players.find((p) => p.id === gameState.currentPlayerId);
  },

  getDealerPlayer: () => {
    const { gameState } = get();
    if (!gameState) return undefined;
    return gameState.players[gameState.dealerPosition];
  },
}));
