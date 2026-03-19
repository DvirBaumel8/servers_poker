import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { LeaderboardEntry } from "../types";

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mockData: LeaderboardEntry[] = [
      {
        botId: "1",
        botName: "AlphaPoker",
        totalNet: 125000,
        totalTournaments: 45,
        tournamentWins: 12,
        totalHands: 15000,
      },
      {
        botId: "2",
        botName: "DeepStack Pro",
        totalNet: 89000,
        totalTournaments: 38,
        tournamentWins: 8,
        totalHands: 12000,
      },
      {
        botId: "3",
        botName: "PokerMind",
        totalNet: 67500,
        totalTournaments: 52,
        tournamentWins: 6,
        totalHands: 18000,
      },
    ];

    setTimeout(() => {
      setEntries(mockData);
      setLoading(false);
    }, 500);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-gold"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
        <p className="text-gray-400 mt-1">Top performing bots on the platform</p>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden"
      >
        <table className="w-full">
          <thead>
            <tr className="bg-gray-900/50">
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">
                Rank
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">
                Bot
              </th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase">
                Net Profit
              </th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase">
                Tournaments
              </th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase">
                Wins
              </th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase">
                Hands
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {entries.map((entry, index) => (
              <motion.tr
                key={entry.botId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
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
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
