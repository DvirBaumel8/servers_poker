import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import Home from './pages/Home'
import MyBots from './pages/MyBots'
import BotBuilder from './pages/BotBuilder'
import TournamentsPage from './pages/TournamentsPage'
import TournamentDetailPage from './pages/TournamentDetailPage'
import TournamentLobbyPage from './pages/TournamentLobbyPage'
import TournamentResultsPage from './pages/TournamentResultsPage'
import SimulationsPage from './pages/SimulationsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import TournamentAnalyticsPage from './pages/TournamentAnalyticsPage'
import SupportPage from './pages/SupportPage'
import ScenarioLabPage from './pages/ScenarioLabPage'
import AdminDashboard from './pages/AdminDashboard'
import TournamentTheaterPage from './pages/TournamentTheaterPage'

/**
 * ProtectedRoute — guards a route behind authentication and optional role check.
 *
 * Props:
 *   allowedRoles  Optional whitelist of user.role values (e.g. ['admin']).
 *                 When omitted, any authenticated user is allowed through.
 *
 * Redirect logic:
 *   1. Not authenticated (no token / isAuthenticated false) → /signin
 *   2. Authenticated but role not in allowedRoles → / (dashboard)
 *   3. Passes both checks → renders children
 */
function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode
  allowedRoles?: string[]
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)

  if (!isAuthenticated || !token) return <Navigate to="/signin" replace />

  if (allowedRoles && allowedRoles.length > 0) {
    const role = user?.role ?? ''
    if (!allowedRoles.includes(role)) return <Navigate to="/" replace />
  }

  return <>{children}</>
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/bots" element={<ProtectedRoute><MyBots /></ProtectedRoute>} />
        <Route path="/bots/build" element={<ProtectedRoute><BotBuilder /></ProtectedRoute>} />
        <Route path="/tournaments" element={<ProtectedRoute><TournamentsPage /></ProtectedRoute>} />
        <Route path="/tournaments/:id" element={<ProtectedRoute><TournamentDetailPage /></ProtectedRoute>} />
        <Route path="/tournaments/:id/lobby" element={<ProtectedRoute><TournamentLobbyPage /></ProtectedRoute>} />
        <Route path="/tournaments/:id/results" element={<ProtectedRoute><TournamentResultsPage /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
        <Route path="/games" element={<ProtectedRoute><TournamentAnalyticsPage /></ProtectedRoute>} />
        <Route path="/tournaments/:id/theater" element={<ProtectedRoute><TournamentTheaterPage /></ProtectedRoute>} />
        <Route path="/simulations" element={<ProtectedRoute><SimulationsPage /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
        <Route path="/scenario-lab" element={<ProtectedRoute><ScenarioLabPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
