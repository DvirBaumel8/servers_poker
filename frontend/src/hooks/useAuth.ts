import { useAuthStore } from "../stores/authStore";

export function useAuth() {
  const {
    user,
    token,
    isLoading,
    error,
    login,
    logout,
    fetchUser,
    clearError,
  } = useAuthStore();

  return {
    user,
    token,
    isLoading,
    error,
    isAuthenticated: !!token && !!user,
    isAdmin: user?.role === "admin",
    login,
    logout,
    fetchUser,
    clearError,
  };
}
