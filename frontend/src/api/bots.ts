import { api } from "./client";
import type {
  Bot,
  LeaderboardEntry,
  BotActivity,
  ActiveBotsResponse,
  BotSubscription,
  SubscriptionStats,
} from "../types";

interface BotApiResponse {
  id: string;
  name: string;
  endpoint: string;
  description?: string;
  active: boolean;
  user_id: string;
  created_at: string;
  last_validation_score?: number;
}

function transformBot(raw: BotApiResponse): Bot {
  return {
    id: raw.id,
    name: raw.name,
    endpoint: raw.endpoint,
    description: raw.description,
    active: raw.active,
    userId: raw.user_id,
    createdAt: raw.created_at,
    lastValidationScore: raw.last_validation_score,
  };
}

export const botsApi = {
  getAll: async (): Promise<Bot[]> => {
    const raw = await api.get<BotApiResponse[]>("/bots");
    return raw.map(transformBot);
  },

  getById: async (id: string): Promise<Bot> => {
    const raw = await api.get<BotApiResponse>(`/bots/${id}`);
    return transformBot(raw);
  },

  getMy: async (token: string): Promise<Bot[]> => {
    const raw = await api.get<BotApiResponse[]>("/bots/my", token);
    return raw.map(transformBot);
  },

  create: (
    data: { name: string; endpoint: string; description?: string },
    token: string,
  ) => api.post<Bot>("/bots", data, token),

  update: (
    id: string,
    data: { endpoint?: string; description?: string },
    token: string,
  ) => api.put<Bot>(`/bots/${id}`, data, token),

  validate: (id: string, token: string) =>
    api.post<{
      valid: boolean;
      score: number;
      details: {
        reachable: boolean;
        respondedCorrectly: boolean;
        responseTimeMs: number;
        errors: string[];
      };
    }>(`/bots/${id}/validate`, undefined, token),

  activate: (id: string, token: string) =>
    api.post<{ success: boolean }>(`/bots/${id}/activate`, undefined, token),

  deactivate: (id: string, token: string) =>
    api.delete<{ success: boolean }>(`/bots/${id}`, token),

  getProfile: (id: string) =>
    api.get<{
      bot: Bot;
      stats: {
        totalHands: number;
        totalTournaments: number;
        tournamentWins: number;
        totalNet: number;
      };
      vpip: number;
      pfr: number;
      aggression: number;
    }>(`/bots/${id}/profile`),

  getLeaderboard: () => api.get<LeaderboardEntry[]>("/analytics/leaderboard"),

  getActivity: (id: string): Promise<BotActivity> =>
    api.get<BotActivity>(`/bots/${id}/activity`),

  getMyActivity: (token: string): Promise<ActiveBotsResponse> =>
    api.get<ActiveBotsResponse>("/bots/my/activity", token),

  getActiveBots: (): Promise<ActiveBotsResponse> =>
    api.get<ActiveBotsResponse>("/bots/active"),

  getSubscriptions: (
    botId: string,
    token: string,
  ): Promise<BotSubscription[]> =>
    api.get<BotSubscription[]>(`/bots/${botId}/subscriptions`, token),

  getSubscriptionStats: (
    botId: string,
    token: string,
  ): Promise<SubscriptionStats> =>
    api.get<SubscriptionStats>(`/bots/${botId}/subscriptions/stats`, token),

  createSubscription: (
    botId: string,
    data: {
      tournament_id?: string;
      tournament_type_filter?: "rolling" | "scheduled";
      min_buy_in?: number;
      max_buy_in?: number;
      priority?: number;
      expires_at?: string;
    },
    token: string,
  ): Promise<BotSubscription> =>
    api.post<BotSubscription>(`/bots/${botId}/subscriptions`, data, token),

  updateSubscription: (
    botId: string,
    subscriptionId: string,
    data: {
      tournament_type_filter?: "rolling" | "scheduled" | null;
      min_buy_in?: number | null;
      max_buy_in?: number | null;
      priority?: number;
      status?: "active" | "paused";
      expires_at?: string | null;
    },
    token: string,
  ): Promise<BotSubscription> =>
    api.put<BotSubscription>(
      `/bots/${botId}/subscriptions/${subscriptionId}`,
      data,
      token,
    ),

  deleteSubscription: (
    botId: string,
    subscriptionId: string,
    token: string,
  ): Promise<{ success: boolean }> =>
    api.delete<{ success: boolean }>(
      `/bots/${botId}/subscriptions/${subscriptionId}`,
      token,
    ),

  pauseSubscription: (
    botId: string,
    subscriptionId: string,
    token: string,
  ): Promise<BotSubscription> =>
    api.post<BotSubscription>(
      `/bots/${botId}/subscriptions/${subscriptionId}/pause`,
      undefined,
      token,
    ),

  resumeSubscription: (
    botId: string,
    subscriptionId: string,
    token: string,
  ): Promise<BotSubscription> =>
    api.post<BotSubscription>(
      `/bots/${botId}/subscriptions/${subscriptionId}/resume`,
      undefined,
      token,
    ),
};
