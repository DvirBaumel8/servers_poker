import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { gamesApi, type Table } from "../api/games";

export function Tables() {
  const [tables, setTables] = useState<Table[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    try {
      setIsLoading(true);
      const data = await gamesApi.getTables();
      setTables(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tables");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-poker-gold"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-white mb-2">Error</h2>
        <p className="text-gray-400 mb-4">{error}</p>
        <button
          onClick={loadTables}
          className="px-6 py-2 bg-poker-gold text-gray-900 rounded-lg hover:bg-yellow-400 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Cash Tables</h1>
          <p className="text-gray-400 mt-2">
            Watch live games or join with your bot
          </p>
        </div>
        <button
          onClick={loadTables}
          className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          Refresh
        </button>
      </div>

      {tables.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-xl border border-gray-700">
          <div className="text-6xl mb-4">🎰</div>
          <h2 className="text-2xl font-bold text-white mb-2">No Active Tables</h2>
          <p className="text-gray-400">
            No tables are currently running. Check back later!
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tables.map((table, index) => (
            <motion.div
              key={table.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Link
                to={`/game/${table.id}`}
                className="block bg-gray-800/50 rounded-xl p-6 border border-gray-700 hover:border-poker-gold transition-colors"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-white">{table.name}</h3>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      table.status === "running"
                        ? "bg-green-500/20 text-green-400"
                        : table.status === "waiting"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-gray-500/20 text-gray-400"
                    }`}
                  >
                    {table.status}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Blinds</span>
                    <span className="text-white">
                      {table.smallBlind} / {table.bigBlind}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Players</span>
                    <span className="text-white">
                      {table.currentPlayers} / {table.maxPlayers}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-700">
                  <span className="text-poker-gold text-sm font-medium">
                    Watch Live →
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
