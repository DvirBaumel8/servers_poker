import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { gamesApi } from "../api/games";
import type { LeaderboardEntry } from "../types";
import {
  AlertBanner,
  EmptyState,
  LoadingBlock,
  MetricCard,
  PageHeader,
  PageShell,
  SegmentedTabs,
  SurfaceCard,
} from "../components/ui/primitives";

type TimeRange = "all" | "month" | "week";

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const loadLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("Loading leaderboard with period:", timeRange);
      const data = await gamesApi.getLeaderboard({
        limit: 50,
        period: timeRange,
      });
      console.log("Leaderboard data received:", data);
      setEntries(data);
    } catch (err) {
      console.error("Failed to load leaderboard:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load leaderboard",
      );
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const topNet = entries[0]?.totalNet ?? 0;
  const topHands = entries[0]?.totalHands ?? 0;
  const showLoadingState = loading;

  return (
    <PageShell className="space-y-8">
      <PageHeader
        eyebrow="Leaderboard"
        title="Platform performance rankings"
        description="Track top-performing bots across all time, the current month, or the current week."
        actions={
          <SegmentedTabs
            value={timeRange}
            onChange={setTimeRange}
            items={[
              { value: "all", label: "All time" },
              { value: "month", label: "This month" },
              { value: "week", label: "This week" },
            ]}
          />
        }
      />

      {error && (
        <AlertBanner
          dismissible
          onDismiss={() => setError(null)}
          title="Leaderboard unavailable"
        >
          {error}
        </AlertBanner>
      )}

      {showLoadingState ? (
        <LoadingBlock label="Loading leaderboard" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Ranked bots"
              value={entries.length}
              hint="Bots with reported results"
              accent
            />
            <MetricCard
              label="Top net"
              value={
                topNet >= 0
                  ? `+${topNet.toLocaleString()}`
                  : topNet.toLocaleString()
              }
              hint="Current best leaderboard profit"
            />
            <MetricCard
              label="Top sample size"
              value={topHands.toLocaleString()}
              hint="Hands played by current leader"
            />
          </div>
          {entries.length === 0 ? (
        <EmptyState
          title="No leaderboard data yet"
          description="As bots complete games and tournaments, rankings will appear here."
        />
          ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <SurfaceCard className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-black/10">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Rank
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Bot
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Net profit
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Games
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Wins
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Hands
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {entries.map((entry, index) => (
                    <tr key={entry.botId} className="hover:bg-white/[0.03]">
                      <td className="px-6 py-4">
                        <span
                          className={`text-2xl font-semibold ${
                            index === 0
                              ? "text-yellow-300"
                              : index === 1
                                ? "text-slate-300"
                                : index === 2
                                  ? "text-amber-500"
                                  : "text-slate-500"
                          }`}
                        >
                          #{index + 1}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-white">
                        {entry.botName}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={
                            entry.totalNet >= 0
                              ? "font-semibold text-emerald-300"
                              : "font-semibold text-red-300"
                          }
                        >
                          {entry.totalNet >= 0 ? "+" : ""}
                          {entry.totalNet.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-white">
                        {entry.totalTournaments}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-accent">
                        {entry.tournamentWins}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-400">
                        {entry.totalHands.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SurfaceCard>
        </motion.div>
          )}
        </>
      )}
    </PageShell>
  );
}
