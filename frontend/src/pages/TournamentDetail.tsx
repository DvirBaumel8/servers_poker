import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useTournamentStore } from "../stores/tournamentStore";
import {
  TOURNAMENT_DETAIL_POLL_MS,
  TOURNAMENT_COUNTDOWN_MS,
} from "../utils/timing";
import {
  LoadingBlock,
  MetricCard,
  PageHeader,
  PageShell,
  SegmentedTabs,
  StatusPill,
  SurfaceCard,
} from "../components/ui/primitives";

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
  const [activeTab, setActiveTab] = useState<TabType>("information");
  const [lateRegTimeRemaining, setLateRegTimeRemaining] = useState<
    number | null
  >(null);

  const {
    currentTournament,
    leaderboard,
    loading,
    leaderboardLoading,
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
      }, TOURNAMENT_DETAIL_POLL_MS);

      return () => clearInterval(interval);
    }
  }, [id, fetchTournament, fetchLeaderboard]);

  useEffect(() => {
    if (
      !currentTournament?.startedAt ||
      currentTournament.status !== "running"
    ) {
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
    const interval = setInterval(calculateRemaining, TOURNAMENT_COUNTDOWN_MS);

    return () => clearInterval(interval);
  }, [
    currentTournament?.startedAt,
    currentTournament?.status,
    currentTournament?.lateRegEndsLevel,
  ]);

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
        const extra =
          remaining -
          structure.reduce(
            (sum, p) => sum + Math.floor((prizePool * p) / 100),
            0,
          );
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
      <LoadingBlock label="Loading tournament detail" className="page-shell" />
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
    <PageShell className="space-y-8">
      <PageHeader
        backHref="/tournaments"
        backLabel="Back to tournaments"
        eyebrow="Tournament detail"
        title={tournament.name}
        description={`${tournament.type} tournament workspace with live structure, standings, and prize overview.`}
        actions={
          <StatusPill
            label={tournament.status.replace("_", " ")}
            tone={
              tournament.status === "running"
                ? "info"
                : tournament.status === "registering"
                  ? "success"
                  : tournament.status === "cancelled"
                    ? "danger"
                    : "neutral"
            }
            pulse={tournament.status === "running"}
          />
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Prize pool"
          value={prizePool.toLocaleString()}
          accent
        />
        <MetricCard
          label="Field"
          value={`${playersLeft}/${tournament.entriesCount}`}
          hint="Players still alive"
        />
        <MetricCard label="Buy-in" value={tournament.buyIn.toLocaleString()} />
        <MetricCard
          label="Late registration"
          value={
            tournament.status === "registering"
              ? `Until L${tournament.lateRegEndsLevel}`
              : lateRegTimeRemaining !== null && lateRegTimeRemaining > 0
                ? formatTimeRemaining(lateRegTimeRemaining)
                : "Closed"
          }
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <SurfaceCard className="space-y-6">
          <SegmentedTabs
            value={activeTab}
            onChange={setActiveTab}
            items={tabs.map((tab) => ({ value: tab.id, label: tab.label }))}
          />

          <div>
            {activeTab === "information" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div className="bg-subtle-dark/50 rounded-lg p-4">
                    <span className="text-muted text-sm">Start Time</span>
                    <p className="text-xl font-bold text-white mt-1">
                      {tournament.startedAt
                        ? new Date(tournament.startedAt).toLocaleString()
                        : tournament.scheduledStartAt
                          ? new Date(
                              tournament.scheduledStartAt,
                            ).toLocaleString()
                          : "Waiting"}
                    </p>
                  </div>

                  <div className="bg-subtle-dark/50 rounded-lg p-4">
                    <span className="text-muted text-sm">Starting Chips</span>
                    <p className="text-xl font-bold text-white mt-1">
                      {tournament.startingChips.toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-subtle-dark/50 rounded-lg p-4">
                    <span className="text-muted text-sm">Players Left</span>
                    <p className="text-xl font-bold text-white mt-1">
                      {playersLeft} / {tournament.entriesCount}
                    </p>
                  </div>

                  <div className="bg-subtle-dark/50 rounded-lg p-4">
                    <span className="text-muted text-sm">
                      Late Registration
                    </span>
                    <p
                      className={clsx(
                        "text-xl font-bold mt-1",
                        lateRegTimeRemaining && lateRegTimeRemaining > 0
                          ? "text-yellow-400"
                          : "text-muted-dark",
                      )}
                    >
                      {tournament.status === "registering"
                        ? `Until Level ${tournament.lateRegEndsLevel}`
                        : lateRegTimeRemaining !== null &&
                            lateRegTimeRemaining > 0
                          ? formatTimeRemaining(lateRegTimeRemaining)
                          : "Closed"}
                    </p>
                  </div>

                  <div className="bg-subtle-dark/50 rounded-lg p-4">
                    <span className="text-muted text-sm">Total Prize Pool</span>
                    <p className="text-xl font-bold text-green-400 mt-1">
                      {prizePool.toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-subtle-dark/50 rounded-lg p-4">
                    <span className="text-muted text-sm">1st Place Prize</span>
                    <p className="text-xl font-bold text-poker-gold mt-1">
                      {payouts[0]?.amount.toLocaleString() || 0}
                    </p>
                  </div>
                </div>

                {tournament.currentLevel && (
                  <div className="bg-subtle-dark/50 rounded-lg p-4">
                    <span className="text-muted text-sm">Current Level</span>
                    <p className="text-xl font-bold text-white mt-1">
                      Level {tournament.currentLevel} - Blinds{" "}
                      {BLIND_STRUCTURE[tournament.currentLevel - 1]
                        ?.smallBlind || "?"}
                      /
                      {BLIND_STRUCTURE[tournament.currentLevel - 1]?.bigBlind ||
                        "?"}
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "players" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {leaderboardLoading && sortedPlayers.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted mb-2">Loading player data...</p>
                    <p className="text-muted-dark text-sm">
                      Fetching current chip counts
                    </p>
                  </div>
                ) : sortedPlayers.length === 0 ? (
                  <div className="text-center py-12">
                    {tournament.status === "registering" ? (
                      <>
                        <p className="text-muted mb-2">
                          {tournament.entriesCount > 0
                            ? `${tournament.entriesCount} player${tournament.entriesCount > 1 ? "s" : ""} registered`
                            : "No players registered yet"}
                        </p>
                        <p className="text-muted-dark text-sm">
                          Player details will appear once the tournament starts
                        </p>
                      </>
                    ) : tournament.status === "running" ? (
                      <>
                        <p className="text-muted mb-2">
                          {tournament.entriesCount > 0
                            ? "Waiting for table assignments..."
                            : "No players in this tournament"}
                        </p>
                        <p className="text-muted-dark text-sm">
                          Chip counts will appear once play begins
                        </p>
                      </>
                    ) : (
                      <p className="text-muted">No player data available</p>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-muted text-sm border-b border-line">
                          <th className="pb-3 pr-4 w-16">Rank</th>
                          <th className="pb-3 pr-4">Player</th>
                          <th className="pb-3 text-right">Chips</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPlayers.map((player, index) => (
                          <tr
                            key={player.botId}
                            className="border-b border-line/50 hover:bg-subtle/30"
                          >
                            <td className="py-4 pr-4">
                              <span
                                className={clsx(
                                  "font-bold",
                                  index === 0 && "text-yellow-400",
                                  index === 1 && "text-muted-light",
                                  index === 2 && "text-amber-600",
                                  index > 2 && "text-white",
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
                      <tr className="text-left text-muted text-sm border-b border-line">
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
                            "border-b border-line/50",
                            tournament.currentLevel === level.level &&
                              "bg-poker-gold/10 border-poker-gold/30",
                          )}
                        >
                          <td className="py-3 pr-4">
                            <span
                              className={clsx(
                                "font-bold",
                                tournament.currentLevel === level.level
                                  ? "text-poker-gold"
                                  : "text-white",
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
                          <td className="py-3 pr-4 text-muted">
                            {level.ante.toLocaleString()}
                          </td>
                          <td className="py-3 text-right text-muted">
                            {level.minutes} min
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-muted-dark text-sm mt-4">
                  Late registration closes at the end of Level{" "}
                  {tournament.lateRegEndsLevel}
                </p>
              </motion.div>
            )}

            {activeTab === "prizes" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="mb-4 p-4 bg-subtle-dark/50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-muted">Total Prize Pool</span>
                    <span className="text-2xl font-bold text-green-400">
                      {prizePool.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-muted-dark text-sm mt-2">
                    {tournament.entriesCount} entries ×{" "}
                    {tournament.buyIn.toLocaleString()} buy-in
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-muted text-sm border-b border-line">
                        <th className="pb-3 pr-4">Rank</th>
                        <th className="pb-3 text-right">Prize</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((payout) => (
                        <tr
                          key={payout.position}
                          className="border-b border-line/50 hover:bg-subtle/30"
                        >
                          <td className="py-4 pr-4">
                            <span
                              className={clsx(
                                "font-bold",
                                payout.position === 1 && "text-yellow-400",
                                payout.position === 2 && "text-muted-light",
                                payout.position === 3 && "text-amber-600",
                                payout.position > 3 && "text-white",
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
                            <span className="text-muted-dark text-sm ml-2">
                              ({payout.percentage}%)
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-muted-dark text-sm mt-4">
                  Prize structure updates as more players join. Currently paying{" "}
                  {payouts.length} position{payouts.length > 1 ? "s" : ""}.
                </p>
              </motion.div>
            )}
          </div>
        </SurfaceCard>
      </motion.div>
    </PageShell>
  );
}
