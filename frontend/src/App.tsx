import type { ReactElement } from "react";
import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { MarketingLayout } from "./components/layout/MarketingLayout";
import { AuthLayout } from "./components/layout/AuthLayout";
import { GameLayout } from "./components/layout/GameLayout";
import { PublicGate } from "./components/auth/PublicGate";
import { LoadingBlock } from "./components/ui/primitives";
import { useAuthStore } from "./stores/authStore";

const Home = lazy(() =>
  import("./pages/Home").then((m) => ({ default: m.Home })),
);
const Tournaments = lazy(() =>
  import("./pages/Tournaments").then((m) => ({ default: m.Tournaments })),
);
const TournamentDetail = lazy(() =>
  import("./pages/TournamentDetail").then((m) => ({
    default: m.TournamentDetail,
  })),
);
const GameView = lazy(() =>
  import("./pages/GameView").then((m) => ({ default: m.GameView })),
);
const Bots = lazy(() =>
  import("./pages/Bots").then((m) => ({ default: m.Bots })),
);
const BotProfile = lazy(() =>
  import("./pages/BotProfile").then((m) => ({ default: m.BotProfile })),
);
const BotBuilder = lazy(() =>
  import("./pages/BotBuilder").then((m) => ({ default: m.BotBuilder })),
);
const Leaderboard = lazy(() =>
  import("./pages/Leaderboard").then((m) => ({ default: m.Leaderboard })),
);
const Login = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.Login })),
);
const Register = lazy(() =>
  import("./pages/Register").then((m) => ({ default: m.Register })),
);
const VerifyEmail = lazy(() =>
  import("./pages/VerifyEmail").then((m) => ({ default: m.VerifyEmail })),
);
const ForgotPassword = lazy(() =>
  import("./pages/ForgotPassword").then((m) => ({ default: m.ForgotPassword })),
);
const ResetPassword = lazy(() =>
  import("./pages/ResetPassword").then((m) => ({ default: m.ResetPassword })),
);
const Tables = lazy(() =>
  import("./pages/Tables").then((m) => ({ default: m.Tables })),
);
const Profile = lazy(() =>
  import("./pages/Profile").then((m) => ({ default: m.Profile })),
);
const AdminAnalytics = lazy(() =>
  import("./pages/AdminAnalytics").then((m) => ({ default: m.AdminAnalytics })),
);
const AdminTournaments = lazy(() =>
  import("./pages/AdminTournaments").then((m) => ({
    default: m.AdminTournaments,
  })),
);
const NotFound = lazy(() =>
  import("./pages/NotFound").then((m) => ({ default: m.NotFound })),
);

function PageLoader() {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <LoadingBlock label="Loading..." />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactElement }) {
  const token = useAuthStore((state) => state.token);
  return token ? children : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }: { children: ReactElement }) {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

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
    <Suspense fallback={<PageLoader />}>
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
            path="bots/build"
            element={
              <RequireAuth>
                <BotBuilder />
              </RequireAuth>
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
          <Route
            path="admin/tournaments"
            element={
              <RequireAdmin>
                <AdminTournaments />
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

        {/* 404 - catch all unmatched routes */}
        <Route path="/" element={<Layout />}>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
// test
