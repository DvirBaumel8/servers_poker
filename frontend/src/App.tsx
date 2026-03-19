import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Home } from "./pages/Home";
import { Tournaments } from "./pages/Tournaments";
import { TournamentDetail } from "./pages/TournamentDetail";
import { GameView } from "./pages/GameView";
import { Bots } from "./pages/Bots";
import { Leaderboard } from "./pages/Leaderboard";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Tables } from "./pages/Tables";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="tables" element={<Tables />} />
        <Route path="tournaments" element={<Tournaments />} />
        <Route path="tournaments/:id" element={<TournamentDetail />} />
        <Route path="game/:tableId" element={<GameView />} />
        <Route path="bots" element={<Bots />} />
        <Route path="leaderboard" element={<Leaderboard />} />
      </Route>
    </Routes>
  );
}

export default App;
