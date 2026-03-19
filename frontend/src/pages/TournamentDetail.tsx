import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useTournamentStore } from "../stores/tournamentStore";

type TabType = "information" | "players" | "blinds" | "prizes";

const BLIND_STRUCTURE = [
  { level: 1, smallBlind: 25, bigBlind: 50, ante: 10, minutes: 3 },
  { level: 2, smallBlind: 50, bigBlind: 100, ante: 15, minutes: 3 },
  { level: 3, smallBlind: 75, bigBlind: 150, ante: 25, minutes: 3 },
  { level: 4, smallBlind: 100, bigBlind: 200, ante: 25, minutes: 3 },
  { level: 5, smallBlind: 150, bigBlind: 300, ante: 50, minutes: 3 },
  { level: 6, smallBlind: 200, bigBlind: 400, ante: 50, minutes: 3 },
  { level: 7, smallBlind: 300, bigBlind: 600, ante: 75, minutes: 3 },
  { level: 8, smallBlind: 400, bigBlind: 800, ante: 100, minutes: 3 },
  { level: 9, smallBlind: 600, bigBlind: 1200, ante: 150, minutes: 3 },
  { level: 10, smallBlind: 800, bigBlind: 1600, ante: 200, minutes: 3 },
  { level: 11, smallBlind: 1000, bigBlind: 2000, ante: 300, minutes: 3 },
  { level: 12, smallBlind: 1500, bigBlind: 3000, ante: 400, minutes: 3 },
];

function getPayoutStructure(entrantCount: number): number[] {
  if (entrantCount <= 5) return [100];
  if (entrantCount <= 9) return [65, 35];
  if (entrantCount <= 18) return [50, 30, 20];
  if (entrantCount <= 27) return [40, 25, 20, 15];
  if (entrantCount <= 45) return [35, 22, 18, 14, 11];
  if (entrantCount <= 90) return [28, 18, 14, 11, 9, 7, 6, 4, 3];
  return [25, 15, 11, 9, 7, 6, 5, 4, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1];
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Closed";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("information");
  const [lateRegTimeRemaining, setLateRegTimeRemaining] = useState<number | null>(null);

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

      const interval = setInterval(() => {
        fetchTournament(id);
        fetchLeaderboard(id);
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [id, fetchTournament, fetchLeaderboard]);

  useEffect(() => {
    if (!currentTournament?.startedAt || currentTournament.status !== "running") {
      setLateRegTimeRemaining(null);
      return;
    }

    const levelDurationMs = 3 * 60 * 1000;
    const lateRegEndsAtLevel = currentTournament.lateRegEndsLevel;

    const calculateRemaining = () => {
      const startedAt = new Date(currentTournament.startedAt!).getTime();
      const lateRegEndsAt = startedAt + lateRegEndsAtLevel * levelDurationMs;
      const remaining = lateRegEndsAt - Date.now();
      setLateRegTimeRemaining(remaining > 0 ? remaining : 0);
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);

    return () => clearInterval(interval);
  }, [currentTournament?.startedAt, currentTournament?.status, currentTournament?.lateRegEndsLevel]);

  const prizePool = useMemo(() => {
    if (!currentTournament) return 0;
    return currentTournament.buyIn * currentTournament.entriesCount;
  }, [currentTournament]);

  const payouts = useMemo(() => {
    if (!currentTournament) return [];
    const structure = getPayoutStructure(currentTournament.entriesCount);
    let remaining = prizePool;

    return structure.map((pct, i) => {
      const amount = Math.floor((prizePool * pct) / 100);
      if (i === 0) {
        const extra = remaining - structure.reduce((sum, p) => sum + Math.floor((prizePool * p) / 100), 0);
        return { position: i + 1, percentage: pct, amount: amount + extra };
      }
      remaining -= amount;
      return { position: i + 1, percentage: pct, amount };
    });
  }, [currentTournament, prizePool]);

  const playersLeft = useMemo(() => {
    if (!leaderboard || leaderboard.length === 0) {
      return currentTournament?.entriesCount || 0;
    }
    return leaderboard.filter((p) => !p.busted).length;
  }, [leaderboard, currentTournament]);

  const sortedPlayers = useMemo(() => {
    if (!leaderboard) return [];
    return [...leaderboard]
      .filter((p) => !p.busted)
      .sort((a, b) => b.chips - a.chips);
  }, [leaderboard]);

  if (loading || !currentTournament) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-poker-gold"></div>
      </div>
    );
  }

  const tournament = currentTournament;
  const tabs: { id: TabType; label: string }[] = [
    { id: "information", label: "Information" },
    { id: "players", label: "Players" },
    { id: "blinds", label: "Blinds" },
    { id: "prizes", label: "Prizes" },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate("/tournaments")}
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
        Back to Tournaments
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
              <p className="text-gray-400 capitalize">{tournament.type} Tournament</p>
            </div>
            <span
              className={clsx(
                "px-4 py-2 rounded-full text-sm font-bold",
                tournament.status === "running" && "bg-blue-500 text-white",
                tournament.status === "registering" && "bg-green-500 text-white",
                tournament.status === "final_table" && "bg-purple-500 text-white",
                tournament.status === "finished" && "bg-gray-500 text-white",
                tournament.status === "cancelled" && "bg-red-500 text-white"
              )}
            >
              {tournament.status.replace("_", " ").toUpperCase()}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex-1 py-4 text-center font-medium transition-colors",
                activeTab === tab.id
                  ? "text-poker-gold border-b-2 border-poker-gold bg-gray-800/50"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/30"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "information" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <span className="text-gray-400 text-sm">Start Time</span>
                  <p className="text-xl font-bold text-white mt-1">
                    {tournament.startedAt
                      ? new Date(tournament.startedAt).toLocaleString()
                      : tournament.scheduledStartAt
                        ? new Date(tournament.scheduledStartAt).toLocaleString()
                        : "Waiting"}
                  </p>
                </div>

                <div className="bg-gray-900/50 rounded-lg p-4">
                  <span className="text-gray-400 text-sm">Starting Chips</span>
                  <p className="text-xl font-bold text-white mt-1">
                    {tournament.startingChips.toLocaleString()}
                  </p>
                </div>

                <div className="bg-gray-900/50 rounded-lg p-4">
                  <span className="text-gray-400 text-sm">Players Left</span>
                  <p className="text-xl font-bold text-white mt-1">
                    {playersLeft} / {tournament.entriesCount}
                  </p>
                </div>

                <div className="bg-gray-900/50 rounded-lg p-4">
                  <span className="text-gray-400 text-sm">Late Registration</span>
                  <p className={clsx(
                    "text-xl font-bold mt-1",
                    lateRegTimeRemaining && lateRegTimeRemaining > 0
                      ? "text-yellow-400"
                      : "text-gray-500"
                  )}>
                    {tournament.status === "registering"
                      ? `Until Level ${tournament.lateRegEndsLevel}`
                      : lateRegTimeRemaining !== null && lateRegTimeRemaining > 0
                        ? formatTimeRemaining(lateRegTimeRemaining)
                        : "Closed"}
                  </p>
                </div>

                <div className="bg-gray-900/50 rounded-lg p-4">
                  <span className="text-gray-400 text-sm">Total Prize Pool</span>
                  <p className="text-xl font-bold text-green-400 mt-1">
                    {prizePool.toLocaleString()}
                  </p>
                </div>

                <div className="bg-gray-900/50 rounded-lg p-4">
                  <span className="text-gray-400 text-sm">1st Place Prize</span>
                  <p className="text-xl font-bold text-poker-gold mt-1">
                    {payouts[0]?.amount.toLocaleString() || 0}
                  </p>
                </div>
              </div>

              {tournament.currentLevel && (
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <span className="text-gray-400 text-sm">Current Level</span>
                  <p className="text-xl font-bold text-white mt-1">
                    Level {tournament.currentLevel} - Blinds{" "}
                    {BLIND_STRUCTURE[tournament.currentLevel - 1]?.smallBlind || "?"}/
                    {BLIND_STRUCTURE[tournament.currentLevel - 1]?.bigBlind || "?"}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "players" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {sortedPlayers.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  No players registered yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                        <th className="pb-3 pr-4 w-16">Rank</th>
                        <th className="pb-3 pr-4">Player</th>
                        <th className="pb-3 text-right">Chips</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map((player, index) => (
                        <tr
                          key={player.botId}
                          className="border-b border-gray-700/50 hover:bg-gray-800/30"
                        >
                          <td className="py-4 pr-4">
                            <span
                              className={clsx(
                                "font-bold",
                                index === 0 && "text-yellow-400",
                                index === 1 && "text-gray-300",
                                index === 2 && "text-amber-600",
                                index > 2 && "text-white"
                              )}
                            >
                              #{index + 1}
                            </span>
                          </td>
                          <td className="py-4 pr-4">
                            <span className="text-white font-medium">
                              {player.botName}
                            </span>
                          </td>
                          <td className="py-4 text-right">
                            <span className="text-poker-gold font-bold">
                              {player.chips.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "blinds" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                      <th className="pb-3 pr-4">Level</th>
                      <th className="pb-3 pr-4">Blinds</th>
                      <th className="pb-3 pr-4">Ante</th>
                      <th className="pb-3 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BLIND_STRUCTURE.map((level) => (
                      <tr
                        key={level.level}
                        className={clsx(
                          "border-b border-gray-700/50",
                          tournament.currentLevel === level.level &&
                            "bg-poker-gold/10 border-poker-gold/30"
                        )}
                      >
                        <td className="py-3 pr-4">
                          <span
                            className={clsx(
                              "font-bold",
                              tournament.currentLevel === level.level
                                ? "text-poker-gold"
                                : "text-white"
                            )}
                          >
                            {level.level}
                          </span>
                          {tournament.currentLevel === level.level && (
                            <span className="ml-2 text-xs text-poker-gold">
                              (Current)
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-white">
                          {level.smallBlind.toLocaleString()} /{" "}
                          {level.bigBlind.toLocaleString()}
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          {level.ante.toLocaleString()}
                        </td>
                        <td className="py-3 text-right text-gray-400">
                          {level.minutes} min
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-gray-500 text-sm mt-4">
                Late registration closes at the end of Level {tournament.lateRegEndsLevel}
              </p>
            </motion.div>
          )}

          {activeTab === "prizes" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="mb-4 p-4 bg-gray-900/50 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Total Prize Pool</span>
                  <span className="text-2xl font-bold text-green-400">
                    {prizePool.toLocaleString()}
                  </span>
                </div>
                <p className="text-gray-500 text-sm mt-2">
                  {tournament.entriesCount} entries × {tournament.buyIn.toLocaleString()} buy-in
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                      <th className="pb-3 pr-4">Rank</th>
                      <th className="pb-3 text-right">Prize</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((payout) => (
                      <tr
                        key={payout.position}
                        className="border-b border-gray-700/50 hover:bg-gray-800/30"
                      >
                        <td className="py-4 pr-4">
                          <span
                            className={clsx(
                              "font-bold",
                              payout.position === 1 && "text-yellow-400",
                              payout.position === 2 && "text-gray-300",
                              payout.position === 3 && "text-amber-600",
                              payout.position > 3 && "text-white"
                            )}
                          >
                            {payout.position === 1
                              ? "1st"
                              : payout.position === 2
                                ? "2nd"
                                : payout.position === 3
                                  ? "3rd"
                                  : `${payout.position}th`}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <span className="text-poker-gold font-bold">
                            {payout.amount.toLocaleString()}
                          </span>
                          <span className="text-gray-500 text-sm ml-2">
                            ({payout.percentage}%)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-gray-500 text-sm mt-4">
                Prize structure updates as more players join. Currently paying{" "}
                {payouts.length} position{payouts.length > 1 ? "s" : ""}.
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
