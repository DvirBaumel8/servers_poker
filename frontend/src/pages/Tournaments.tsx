import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TournamentCard } from "../components/tournament/TournamentCard";
import { useTournamentStore } from "../stores/tournamentStore";

const STATUSES = [
  { value: "", label: "All" },
  { value: "registering", label: "Registering" },
  { value: "running", label: "Running" },
  { value: "finished", label: "Finished" },
];

export function Tournaments() {
  const { tournaments, loading, error, fetchTournaments } = useTournamentStore();
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    fetchTournaments(statusFilter || undefined);
  }, [statusFilter, fetchTournaments]);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Tournaments</h1>
          <p className="text-gray-400 mt-1">
            Browse and join poker tournaments
          </p>
        </div>

        <div className="flex gap-2">
          {STATUSES.map((status) => (
            <button
              key={status.value}
              onClick={() => setStatusFilter(status.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === status.value
                  ? "bg-poker-gold text-gray-900"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-gold"></div>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎰</div>
          <h3 className="text-xl font-bold text-white mb-2">
            No tournaments found
          </h3>
          <p className="text-gray-400">
            Check back later for upcoming tournaments
          </p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {tournaments.map((tournament, index) => (
            <motion.div
              key={tournament.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <TournamentCard tournament={tournament} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
