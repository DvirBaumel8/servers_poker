import { api } from "./client";

export interface LifetimeStats {
  totalUsers: number;
  totalBots: number;
  totalHandsDealt: number;
  totalTournaments: number;
  totalGames: number;
  totalChipVolume: number;
}

export interface TodayStats {
  newUsers: number;
  activeUsers: number;
  newBots: number;
  activeBots: number;
  gamesPlayed: number;
  handsDealt: number;
  tournamentsCompleted: number;
}

export interface LiveStats {
  activeGames: number;
  activeTournaments: number;
  playersInGames: number;
  currentHandsPerMinute: number;
}

export interface HealthStats {
  avgBotResponseMs: number;
  botTimeoutCount: number;
  botErrorCount: number;
  errorRate: string;
}

export interface PlatformStats {
  lifetime: LifetimeStats;
  today: TodayStats;
  live: LiveStats;
  health: HealthStats;
  generatedAt: string;
}

export interface TopPerformer {
  botId: string;
  botName: string;
  netChips: number;
}

export interface MetricsHistoryEntry {
  date: string;
  hands_dealt: number;
  games_played: number;
  active_users: number;
  active_bots: number;
}

export interface AdminStats extends PlatformStats {
  topPerformers: TopPerformer[];
  metricsHistory: MetricsHistoryEntry[];
}

export const analyticsApi = {
  getPlatformStats: (): Promise<PlatformStats> =>
    api.get<PlatformStats>("/analytics/platform/stats"),

  getAdminStats: (days: number = 30, token?: string): Promise<AdminStats> =>
    api.get<AdminStats>(`/analytics/admin/stats?days=${days}`, token),

  triggerDailySummary: (
    token: string,
  ): Promise<{ success: boolean; message: string }> =>
    api.post<{ success: boolean; message: string }>(
      "/analytics/admin/trigger-summary",
      {},
      token,
    ),

  saveMetricsSnapshot: (
    token: string,
  ): Promise<{ success: boolean; message: string }> =>
    api.post<{ success: boolean; message: string }>(
      "/analytics/admin/save-metrics",
      {},
      token,
    ),

  getEventsSummary: (
    days: number = 7,
    token: string,
  ): Promise<Record<string, number>> =>
    api.get<Record<string, number>>(
      `/analytics/events/summary?days=${days}`,
      token,
    ),

  getMetricsHistory: (
    days: number = 30,
    token: string,
  ): Promise<MetricsHistoryEntry[]> =>
    api.get<MetricsHistoryEntry[]>(
      `/analytics/metrics/history?days=${days}`,
      token,
    ),
};
