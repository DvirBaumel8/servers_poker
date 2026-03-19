import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { botsApi } from "../api/bots";
import type { Bot } from "../types";

export function Bots() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadBots() {
      try {
        const data = await botsApi.getAll();
        setBots(data);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    loadBots();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-gold"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Bots</h1>
          <p className="text-gray-400 mt-1">Active poker bots on the platform</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {bots.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🤖</div>
          <h3 className="text-xl font-bold text-white mb-2">No bots yet</h3>
          <p className="text-gray-400">Register your first bot to get started</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {bots.map((bot, index) => (
            <motion.div
              key={bot.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-gray-800/50 rounded-xl border border-gray-700 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{bot.name}</h3>
                  <span className="text-sm text-gray-400">{bot.endpoint}</span>
                </div>
                <span
                  className={`w-3 h-3 rounded-full ${
                    bot.active ? "bg-green-500" : "bg-gray-500"
                  }`}
                />
              </div>

              {bot.description && (
                <p className="text-gray-400 text-sm mb-4">{bot.description}</p>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  Score: {bot.lastValidationScore ?? "N/A"}
                </span>
                <span className="text-gray-400">
                  {new Date(bot.createdAt).toLocaleDateString()}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
