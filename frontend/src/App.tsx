import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import Home from './pages/Home'
import MyBots from './pages/MyBots'
import BotBuilder from './pages/BotBuilder'
import GameSpectator from './pages/GameSpectator'
import TournamentsPage from './pages/TournamentsPage'
import TournamentDetailPage from './pages/TournamentDetailPage'
import TournamentLobbyPage from './pages/TournamentLobbyPage'
import TournamentLivePage from './pages/TournamentLivePage'
import TournamentResultsPage from './pages/TournamentResultsPage'
import SimulationsPage from './pages/SimulationsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import TournamentAnalyticsPage from './pages/TournamentAnalyticsPage'
import SupportPage from './pages/SupportPage'
import ScenarioLabPage from './pages/ScenarioLabPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const token = useAuthStore((s) => s.token)

  // Redirect if not authenticated or no token exists
  if (!isAuthenticated || !token) return <Navigate to="/signin" replace />
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
        <Route path="/tournaments/:id/live" element={<ProtectedRoute><TournamentLivePage /></ProtectedRoute>} />
        <Route path="/tournaments/:id/results" element={<ProtectedRoute><TournamentResultsPage /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
        <Route path="/games" element={<ProtectedRoute><TournamentAnalyticsPage /></ProtectedRoute>} />
        <Route path="/simulations" element={<ProtectedRoute><SimulationsPage /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
        <Route path="/scenario-lab" element={<ProtectedRoute><ScenarioLabPage /></ProtectedRoute>} />
        <Route path="/games/:gameId" element={<GameSpectator />} />
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
