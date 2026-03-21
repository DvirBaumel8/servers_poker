import type { ReactElement } from "react";
import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { MarketingLayout } from "./components/layout/MarketingLayout";
import { AuthLayout } from "./components/layout/AuthLayout";
import { GameLayout } from "./components/layout/GameLayout";
import { AuthGate } from "./components/auth/AuthGate";
import { PublicGate } from "./components/auth/PublicGate";
import { Home } from "./pages/Home";
import { Tournaments } from "./pages/Tournaments";
import { TournamentDetail } from "./pages/TournamentDetail";
import { GameView } from "./pages/GameView";
import { Bots } from "./pages/Bots";
import { BotProfile } from "./pages/BotProfile";
import { Leaderboard } from "./pages/Leaderboard";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { VerifyEmail } from "./pages/VerifyEmail";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Tables } from "./pages/Tables";
import { Profile } from "./pages/Profile";
import { AdminAnalytics } from "./pages/AdminAnalytics";
import { useAuthStore } from "./stores/authStore";

function RequireAuth({ children }: { children: ReactElement }) {
  const token = useAuthStore((state) => state.token);
  return token ? children : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }: { children: ReactElement }) {
  const { token, user } = useAuthStore((state) => ({
    token: state.token,
    user: state.user,
  }));

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return user?.role === "admin" ? children : <Navigate to="/" replace />;
}

function App() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const fetchUser = useAuthStore((state) => state.fetchUser);

  useEffect(() => {
    if (token && !user) {
      fetchUser();
    }
  }, [token, user, fetchUser]);

  return (
    <Routes>
      <Route path="/" element={<MarketingLayout />}>
        <Route index element={<Home />} />
      </Route>

      <Route path="/" element={<AuthLayout />}>
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
      </Route>

      <Route path="/" element={<Layout />}>
        {/* Public pages - viewable without login, with gentle sign-in banner */}
        <Route
          path="tables"
          element={
            <PublicGate>
              <Tables />
            </PublicGate>
          }
        />
        <Route
          path="tournaments"
          element={
            <PublicGate>
              <Tournaments />
            </PublicGate>
          }
        />
        <Route
          path="tournaments/:id"
          element={
            <PublicGate>
              <TournamentDetail />
            </PublicGate>
          }
        />
        <Route
          path="bots"
          element={
            <PublicGate>
              <Bots />
            </PublicGate>
          }
        />
        <Route
          path="bots/:id"
          element={
            <PublicGate>
              <BotProfile />
            </PublicGate>
          }
        />
        <Route
          path="leaderboard"
          element={
            <PublicGate>
              <Leaderboard />
            </PublicGate>
          }
        />
        {/* Private pages - require authentication */}
        <Route
          path="profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="admin/analytics"
          element={
            <RequireAdmin>
              <AdminAnalytics />
            </RequireAdmin>
          }
        />
      </Route>

      {/* Game view - public spectating allowed */}
      <Route path="/" element={<GameLayout />}>
        <Route
          path="game/:tableId"
          element={
            <PublicGate>
              <GameView />
            </PublicGate>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
