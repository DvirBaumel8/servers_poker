import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { analyticsApi, AdminStats } from "../api";
import { useAuth } from "../hooks/useAuth";
import { usePageTracking } from "../hooks/usePageTracking";
import {
  AlertBanner,
  Button,
  LoadingBlock,
  PageHeader,
  PageShell,
  SegmentedTabs,
  SurfaceCard,
} from "../components/ui/primitives";

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  color?: string;
}

function KPICard({
  title,
  value,
  subtitle,
  trend,
  color = "accent",
}: KPICardProps) {
  return (
    <SurfaceCard className="p-6">
      <div className="text-sm text-muted mb-2">{title}</div>
      <div
        className={
          color === "accent"
            ? "gold-gradient-text text-3xl font-bold"
            : "text-3xl font-bold text-white"
        }
      >
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
      {subtitle && <div className="text-sm text-muted-dark mt-1">{subtitle}</div>}
      {trend !== undefined && (
        <div
          className={`text-sm mt-2 ${trend >= 0 ? "text-green-400" : "text-red-400"}`}
        >
          {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% from yesterday
        </div>
      )}
    </SurfaceCard>
  );
}

export function AdminAnalytics() {
  usePageTracking();
  const { token, user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [isSendingSummary, setIsSendingSummary] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    setIsLoading(true);
    analyticsApi
      .getAdminStats(days, token)
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setIsLoading(false));
  }, [token, days]);

  const handleTriggerSummary = async () => {
    if (!token) return;
    setIsSendingSummary(true);
    setSummaryMessage(null);

    try {
      const result = await analyticsApi.triggerDailySummary(token);
      setSummaryMessage(result.message);
    } catch (err) {
      setSummaryMessage(
        err instanceof Error ? err.message : "Failed to send summary",
      );
    } finally {
      setIsSendingSummary(false);
    }
  };

  if (user?.role !== "admin") {
    return (
      <PageShell>
        <SurfaceCard className="p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-muted">
            You need admin privileges to view this page.
          </p>
        </SurfaceCard>
      </PageShell>
    );
  }

  if (isLoading) {
    return (
      <LoadingBlock label="Loading platform analytics" className="page-shell" />
    );
  }

  if (error) {
    return (
      <PageShell>
        <AlertBanner title="Analytics load failed">{error}</AlertBanner>
      </PageShell>
    );
  }

  if (!stats) return null;

  const chartData = stats.metricsHistory.map((m) => ({
    date: m.date.split("-").slice(1).join("/"),
    hands: m.hands_dealt,
    games: m.games_played,
    activeUsers: m.active_users,
    activeBots: m.active_bots,
  }));

  return (
    <PageShell className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <PageHeader
          eyebrow="Admin analytics"
          title="Platform analytics"
          description="Real-time metrics and performance data for the full poker platform."
          actions={
            <>
              <SegmentedTabs
                value={String(days)}
                onChange={(value) => setDays(parseInt(value))}
                items={[
                  { value: "7", label: "7d" },
                  { value: "14", label: "14d" },
                  { value: "30", label: "30d" },
                  { value: "90", label: "90d" },
                ]}
              />
              <Button
                onClick={handleTriggerSummary}
                disabled={isSendingSummary}
              >
                {isSendingSummary ? "Sending..." : "Send Daily Summary"}
              </Button>
            </>
          }
        />

        {summaryMessage && (
          <AlertBanner
            tone={summaryMessage.includes("success") ? "success" : "danger"}
          >
            {summaryMessage}
          </AlertBanner>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard
            title="Total Users"
            value={stats.lifetime.totalUsers}
            subtitle={`+${stats.today.newUsers} today`}
          />
          <KPICard
            title="Total Bots"
            value={stats.lifetime.totalBots}
            subtitle={`${stats.today.activeBots} active today`}
          />
          <KPICard
            title="Hands Dealt"
            value={formatNumber(stats.lifetime.totalHandsDealt)}
            subtitle={`+${formatNumber(stats.today.handsDealt)} today`}
            color="white"
          />
          <KPICard
            title="Chip Volume"
            value={formatLargeNumber(stats.lifetime.totalChipVolume)}
            subtitle="Total transacted"
            color="white"
          />
        </div>

        {/* Live Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="glass-panel p-4 text-center">
            <div className="text-sm text-muted">Active Games</div>
            <div className="text-2xl font-bold text-green-400">
              {stats.live.activeGames}
            </div>
          </div>
          <div className="glass-panel p-4 text-center">
            <div className="text-sm text-muted">Active Tournaments</div>
            <div className="text-2xl font-bold text-green-400">
              {stats.live.activeTournaments}
            </div>
          </div>
          <div className="glass-panel p-4 text-center">
            <div className="text-sm text-muted">Players in Games</div>
            <div className="text-2xl font-bold text-white">
              {stats.live.playersInGames}
            </div>
          </div>
          <div className="glass-panel p-4 text-center">
            <div className="text-sm text-muted">Hands/Minute</div>
            <div className="text-2xl font-bold text-white">
              {stats.live.currentHandsPerMinute}
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hands Dealt Chart */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Hands Dealt Over Time
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#666" fontSize={12} />
                  <YAxis stroke="#666" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1a2e",
                      border: "1px solid #333",
                      borderRadius: "8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="hands"
                    stroke="#c9a227"
                    fill="#c9a227"
                    fillOpacity={0.2}
                    name="Hands"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Activity Chart */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              User & Bot Activity
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#666" fontSize={12} />
                  <YAxis stroke="#666" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1a1a2e",
                      border: "1px solid #333",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="activeUsers"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    name="Active Users"
                  />
                  <Line
                    type="monotone"
                    dataKey="activeBots"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Active Bots"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Performance & Top Performers Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Metrics */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Performance Metrics (Today)
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted">Avg Bot Response Time</span>
                <span className="text-white font-mono">
                  {stats.health.avgBotResponseMs}ms
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted">Bot Timeouts</span>
                <span
                  className={
                    stats.health.botTimeoutCount > 0
                      ? "text-red-400"
                      : "text-green-400"
                  }
                >
                  {stats.health.botTimeoutCount}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted">Bot Errors</span>
                <span
                  className={
                    stats.health.botErrorCount > 0
                      ? "text-red-400"
                      : "text-green-400"
                  }
                >
                  {stats.health.botErrorCount}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted">Error Rate</span>
                <span className="text-white">{stats.health.errorRate}</span>
              </div>
              <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <span className="text-muted">Games Today</span>
                  <span className="text-white">{stats.today.gamesPlayed}</span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-muted">Tournaments Today</span>
                  <span className="text-white">
                    {stats.today.tournamentsCompleted}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Performers */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Top Performing Bots
            </h3>
            {stats.topPerformers.length > 0 ? (
              <div className="space-y-3">
                {stats.topPerformers.map((performer, index) => (
                  <div
                    key={performer.botId}
                    className="flex items-center justify-between p-3 bg-surface-400 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0
                            ? "bg-yellow-500/20 text-yellow-400"
                            : index === 1
                              ? "bg-gray-400/20 text-muted-light"
                              : index === 2
                                ? "bg-orange-500/20 text-orange-400"
                                : "bg-surface-300 text-muted"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="text-white font-medium">
                        {performer.botName}
                      </span>
                    </div>
                    <span
                      className={
                        performer.netChips >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {performer.netChips >= 0 ? "+" : ""}
                      {formatNumber(performer.netChips)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-dark py-8">
                No bot activity in this period
              </div>
            )}
          </div>
        </div>

        {/* Games Chart */}
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Games Played Over Time
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a2e",
                    border: "1px solid #333",
                    borderRadius: "8px",
                  }}
                />
                <Bar
                  dataKey="games"
                  fill="#c9a227"
                  radius={[4, 4, 0, 0]}
                  name="Games"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lifetime Totals */}
        <div className="glass-panel p-6 bg-gradient-to-r from-accent/5 to-transparent">
          <h3 className="text-lg font-semibold text-accent mb-4">
            Lifetime Platform Statistics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div>
              <div className="text-sm text-muted">Total Users</div>
              <div className="text-2xl font-bold text-white">
                {formatNumber(stats.lifetime.totalUsers)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted">Total Bots</div>
              <div className="text-2xl font-bold text-white">
                {formatNumber(stats.lifetime.totalBots)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted">Total Hands</div>
              <div className="text-2xl font-bold text-white">
                {formatNumber(stats.lifetime.totalHandsDealt)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted">Total Games</div>
              <div className="text-2xl font-bold text-white">
                {formatNumber(stats.lifetime.totalGames)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted">Total Tournaments</div>
              <div className="text-2xl font-bold text-white">
                {formatNumber(stats.lifetime.totalTournaments)}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted-dark">
          Last updated: {new Date(stats.generatedAt).toLocaleString()}
        </div>
      </motion.div>
    </PageShell>
  );
}
