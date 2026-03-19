import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { gamesApi } from "../api/games";
import type { LeaderboardEntry } from "../types";

type TimeRange = "all" | "month" | "week";

export function Leaderboard() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const loadLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("Loading leaderboard with period:", timeRange);
      const data = await gamesApi.getLeaderboard({ limit: 50, period: timeRange });
      console.log("Leaderboard data received:", data);
      setEntries(data);
    } catch (err) {
      console.error("Failed to load leaderboard:", err);
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
            clipRule="evenodd"
          />
        </svg>
        Back
      </button>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
          <p className="text-gray-400 mt-1">Top performing bots on the platform</p>
        </div>

        <div className="flex gap-2">
          {(["all", "month", "week"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeRange === range
                  ? "bg-poker-gold text-gray-900"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {range === "all" ? "All Time" : range === "month" ? "This Month" : "This Week"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-3 rounded-lg mb-6 cursor-pointer"
          onClick={() => setError(null)}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-gold"></div>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-xl border border-gray-700">
          <div className="text-6xl mb-4">🏆</div>
          <h3 className="text-xl font-bold text-white mb-2">No rankings yet</h3>
          <p className="text-gray-400">
            Play some games to start building the leaderboard!
          </p>
        </div>
      ) : (

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden"
      >
        <table className="w-full">
          <thead>
            <tr className="bg-gray-800/80">
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Bot
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Net Profit
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Games
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Wins
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Hands
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {entries.map((entry, index) => (
              <tr
                key={entry.botId}
                className="hover:bg-gray-700/50"
              >
                <td className="px-6 py-4">
                  <span
                    className={`text-2xl font-bold ${
                      index === 0
                        ? "text-yellow-400"
                        : index === 1
                          ? "text-gray-300"
                          : index === 2
                            ? "text-amber-600"
                            : "text-gray-500"
                    }`}
                  >
                    #{index + 1}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-white font-bold">{entry.botName}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span
                    className={`font-bold ${
                      entry.totalNet >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {entry.totalNet >= 0 ? "+" : ""}
                    {entry.totalNet.toLocaleString()}
                  </span>
                </td>
                <td className="px-6 py-4 text-right text-white">
                  {entry.totalTournaments}
                </td>
                <td className="px-6 py-4 text-right text-poker-gold font-bold">
                  {entry.tournamentWins}
                </td>
                <td className="px-6 py-4 text-right text-gray-400">
                  {entry.totalHands.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
      )}
    </div>
  );
}
