import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  name: string
  role: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isInitialized: boolean
  login: (token: string, user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isInitialized: true,
      login: (token, user) => set({ token, user, isAuthenticated: true, isInitialized: true }),
      logout: () => {
        // Clear localStorage and reset state
        localStorage.removeItem('auth-storage')
        set({ token: null, user: null, isAuthenticated: false, isInitialized: true })
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        // After loading from storage, ensure state is valid
        if (!state?.token) {
          state.isAuthenticated = false
          state.user = null
        }
      },
    }
  )
)
