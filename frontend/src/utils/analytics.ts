function uuidv4(): string {
  return crypto.randomUUID();
}

type AnalyticsEventType =
  | "page_view"
  | "bot_created"
  | "bot_validated"
  | "tournament_joined"
  | "tournament_watched"
  | "game_watched"
  | "subscription_toggled"
  | "leaderboard_viewed"
  | "profile_viewed"
  | "login"
  | "logout"
  | "signup"
  | "feature_used";

interface AnalyticsEvent {
  event_type: AnalyticsEventType;
  event_data?: Record<string, unknown>;
  session_id: string;
  page_url?: string;
  referrer?: string;
}

const SESSION_KEY = "poker_analytics_session_id";
const API_BASE = "/api/v1";

class Analytics {
  private sessionId: string;
  private queue: AnalyticsEvent[] = [];
  private isProcessing = false;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.startFlushInterval();
  }

  private getOrCreateSessionId(): string {
    if (typeof window === "undefined") {
      return uuidv4();
    }

    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      return existing;
    }
    const newId = uuidv4();
    sessionStorage.setItem(SESSION_KEY, newId);
    return newId;
  }

  private startFlushInterval(): void {
    if (typeof window === "undefined") return;

    this.flushInterval = setInterval(() => {
      this.flush();
    }, 5000);

    window.addEventListener("beforeunload", () => {
      this.flush();
    });
  }

  track(
    eventType: AnalyticsEventType,
    eventData?: Record<string, unknown>,
  ): void {
    const event: AnalyticsEvent = {
      event_type: eventType,
      event_data: eventData,
      session_id: this.sessionId,
      page_url:
        typeof window !== "undefined" ? window.location.pathname : undefined,
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
    };

    this.queue.push(event);

    if (this.queue.length >= 10) {
      this.flush();
    }
  }

  trackPageView(pageName?: string): void {
    this.track("page_view", {
      page:
        pageName ||
        (typeof window !== "undefined" ? window.location.pathname : "unknown"),
      title: typeof document !== "undefined" ? document.title : undefined,
    });
  }

  trackBotCreated(botId: string, botName: string): void {
    this.track("bot_created", { botId, botName });
  }

  trackBotValidated(botId: string, score: number): void {
    this.track("bot_validated", { botId, score });
  }

  trackTournamentJoined(tournamentId: string, botId: string): void {
    this.track("tournament_joined", { tournamentId, botId });
  }

  trackTournamentWatched(tournamentId: string): void {
    this.track("tournament_watched", { tournamentId });
  }

  trackGameWatched(gameId: string): void {
    this.track("game_watched", { gameId });
  }

  trackSubscriptionToggled(botId: string, enabled: boolean): void {
    this.track("subscription_toggled", { botId, enabled });
  }

  trackLeaderboardViewed(period?: string): void {
    this.track("leaderboard_viewed", { period });
  }

  trackProfileViewed(botId: string): void {
    this.track("profile_viewed", { botId });
  }

  trackLogin(): void {
    this.track("login");
  }

  trackLogout(): void {
    this.track("logout");
  }

  trackSignup(): void {
    this.track("signup");
  }

  trackFeatureUsed(feature: string, details?: Record<string, unknown>): void {
    this.track("feature_used", { feature, ...details });
  }

  private async flush(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const events = [...this.queue];
    this.queue = [];

    try {
      await Promise.all(
        events.map((event) =>
          fetch(`${API_BASE}/analytics/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(event),
          }).catch(() => {
            // Silently fail - analytics should not break the app
          }),
        ),
      );
    } finally {
      this.isProcessing = false;
    }
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}

export const analytics = new Analytics();
