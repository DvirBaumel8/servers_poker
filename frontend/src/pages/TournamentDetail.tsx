import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTournamentStore } from "../stores/tournamentStore";
import { LeaderboardTable } from "../components/tournament/LeaderboardTable";

export function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const {
    currentTournament,
    leaderboard,
    loading,
    fetchTournament,
    fetchLeaderboard,
  } = useTournamentStore();

  useEffect(() => {
    if (id) {
      fetchTournament(id);
      fetchLeaderboard(id);
    }
  }, [id, fetchTournament, fetchLeaderboard]);

  if (loading || !currentTournament) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-gold"></div>
      </div>
    );
  }

  const tournament = currentTournament;

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        to="/tournaments"
        className="text-poker-gold hover:underline mb-6 inline-block"
      >
        ← Back to Tournaments
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800/50 rounded-xl border border-gray-700 p-8 mb-8"
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">{tournament.name}</h1>
            <p className="text-gray-400 capitalize">{tournament.type} Tournament</p>
          </div>
          <span
            className={`px-4 py-2 rounded-full text-sm font-bold ${
              tournament.status === "running"
                ? "bg-blue-500 text-white"
                : tournament.status === "registering"
                  ? "bg-green-500 text-white"
                  : "bg-gray-500 text-white"
            }`}
          >
            {tournament.status.replace("_", " ").toUpperCase()}
          </span>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          <div>
            <span className="text-gray-400 text-sm">Buy-in</span>
            <p className="text-2xl font-bold text-poker-gold">
              {tournament.buyIn.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-gray-400 text-sm">Starting Stack</span>
            <p className="text-2xl font-bold text-white">
              {tournament.startingChips.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-gray-400 text-sm">Players</span>
            <p className="text-2xl font-bold text-white">
              {tournament.entriesCount} / {tournament.maxPlayers}
            </p>
          </div>
          <div>
            <span className="text-gray-400 text-sm">Tables</span>
            <p className="text-2xl font-bold text-white">
              {tournament.playersPerTable}-max
            </p>
          </div>
        </div>
      </motion.div>

      {leaderboard.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-xl font-bold text-white mb-4">Leaderboard</h2>
          <LeaderboardTable entries={leaderboard} />
        </motion.div>
      )}
    </div>
  );
}
