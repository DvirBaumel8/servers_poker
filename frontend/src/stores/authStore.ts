import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, type User } from "../api/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login({ email, password });
          set({
            user: response.user,
            token: response.access_token,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "Login failed",
            isLoading: false,
          });
          throw error;
        }
      },

      setAuth: (user: User, token: string) => {
        set({ user, token, isLoading: false, error: null });
      },

      logout: () => {
        set({ user: null, token: null, error: null });
      },

      fetchUser: async () => {
        const { token } = get();
        if (!token) return;

        set({ isLoading: true });
        try {
          const user = await authApi.me(token);
          set({ user, isLoading: false });
        } catch {
          set({ user: null, token: null, isLoading: false });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "poker-auth",
      partialize: (state) => ({ token: state.token }),
    },
  ),
);
