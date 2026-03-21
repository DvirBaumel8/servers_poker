import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
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

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="tables" element={<Tables />} />
        <Route path="tournaments" element={<Tournaments />} />
        <Route path="tournaments/:id" element={<TournamentDetail />} />
        <Route path="game/:tableId" element={<GameView />} />
        <Route path="bots" element={<Bots />} />
        <Route path="bots/:id" element={<BotProfile />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="profile" element={<Profile />} />
        <Route path="admin/analytics" element={<AdminAnalytics />} />
      </Route>
    </Routes>
  );
}

export default App;
