import { Injectable, OnModuleInit, Inject, Optional } from "@nestjs/common";
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import { Counter, Gauge, Histogram } from "prom-client";
import { DataSource } from "typeorm";
import * as Sentry from "@sentry/node";

@Injectable()
export class MetricsService implements OnModuleInit {
  constructor(
    @InjectMetric("poker_http_requests_total")
    public readonly httpRequestsTotal: Counter<string>,
    @InjectMetric("poker_http_request_duration_seconds")
    public readonly httpRequestDuration: Histogram<string>,
    @InjectMetric("poker_active_games")
    public readonly activeGames: Gauge<string>,
    @InjectMetric("poker_active_tournaments")
    public readonly activeTournaments: Gauge<string>,
    @InjectMetric("poker_connected_bots")
    public readonly connectedBots: Gauge<string>,
    @InjectMetric("poker_websocket_connections")
    public readonly websocketConnections: Gauge<string>,
    @InjectMetric("poker_hands_dealt_total")
    public readonly handsDealtTotal: Counter<string>,
    @InjectMetric("poker_bot_actions_total")
    public readonly botActionsTotal: Counter<string>,
    @InjectMetric("poker_bot_errors_total")
    public readonly botErrorsTotal: Counter<string>,
    @InjectMetric("poker_bot_response_time_seconds")
    public readonly botResponseTime: Histogram<string>,
    @InjectMetric("poker_tournament_entries_total")
    public readonly tournamentEntriesTotal: Counter<string>,
    @InjectMetric("poker_tournament_completions_total")
    public readonly tournamentCompletionsTotal: Counter<string>,
    @InjectMetric("poker_database_pool_size")
    public readonly databasePoolSize: Gauge<string>,
    @InjectMetric("poker_database_pool_active")
    public readonly databasePoolActive: Gauge<string>,
    @InjectMetric("poker_websocket_messages_total")
    public readonly websocketMessagesTotal: Counter<string>,
    @InjectMetric("poker_errors_total")
    public readonly errorsTotal: Counter<string>,
    @InjectMetric("poker_games_started_total")
    public readonly gamesStartedTotal: Counter<string>,
    @InjectMetric("poker_bot_timeout_seconds")
    public readonly botTimeoutSeconds: Histogram<string>,
    @Optional()
    @Inject(DataSource)
    private readonly dataSource: DataSource | null,
  ) {}

  onModuleInit(): void {
    this.activeGames.set(0);
    this.activeTournaments.set(0);
    this.connectedBots.set(0);
    this.websocketConnections.set(0);
    this.databasePoolSize.set(0);
    this.databasePoolActive.set(0);

    this.initializeCounters();
  }

  private initializeCounters(): void {
    this.handsDealtTotal.inc(0);
    this.tournamentEntriesTotal.inc(0);
    this.tournamentCompletionsTotal.inc(0);

    const commonActions = ["fold", "check", "call", "raise", "bet"];
    for (const action of commonActions) {
      this.botActionsTotal.inc({ action_type: action, bot_id: "_init_" }, 0);
    }

    const commonErrors = [
      "call_failed",
      "circuit_opened",
      "used_fallback",
      "unhealthy_in_game",
    ];
    for (const errorType of commonErrors) {
      this.botErrorsTotal.inc({ error_type: errorType, bot_id: "_init_" }, 0);
    }
  }

  recordHttpRequest(
    method: string,
    path: string,
    status: number,
    durationSeconds: number,
  ): void {
    const normalizedPath = this.normalizePath(path);
    this.httpRequestsTotal.inc({ method, path: normalizedPath, status });
    this.httpRequestDuration.observe(
      { method, path: normalizedPath, status },
      durationSeconds,
    );
  }

  recordBotAction(actionType: string, botId: string): void {
    this.botActionsTotal.inc({ action_type: actionType, bot_id: botId });
  }

  recordBotError(errorType: string, botId: string): void {
    this.botErrorsTotal.inc({ error_type: errorType, bot_id: botId });
  }

  recordBotResponseTime(botId: string, durationSeconds: number): void {
    this.botResponseTime.observe({ bot_id: botId }, durationSeconds);
  }

  incrementHandsDealt(): void {
    this.handsDealtTotal.inc();
  }

  incrementTournamentEntries(): void {
    this.tournamentEntriesTotal.inc();
  }

  incrementTournamentCompletions(): void {
    this.tournamentCompletionsTotal.inc();
  }

  setActiveGames(count: number): void {
    this.activeGames.set(count);
  }

  setActiveTournaments(count: number): void {
    this.activeTournaments.set(count);
  }

  setConnectedBots(count: number): void {
    this.connectedBots.set(count);
  }

  setWebsocketConnections(count: number): void {
    this.websocketConnections.set(count);
  }

  setDatabasePoolStats(size: number, active: number): void {
    this.databasePoolSize.set(size);
    this.databasePoolActive.set(active);
  }

  recordWebSocketMessage(eventType: string): void {
    this.websocketMessagesTotal.inc({ event_type: eventType });
  }

  recordError(type: string, endpoint: string, statusCode: number): void {
    this.errorsTotal.inc({
      type,
      endpoint: this.normalizePath(endpoint),
      status_code: String(statusCode),
    });
  }

  incrementGamesStarted(): void {
    this.gamesStartedTotal.inc();
  }

  recordBotTimeout(
    botId: string,
    failureType: string,
    durationSeconds: number,
  ): void {
    this.botTimeoutSeconds.observe(
      { bot_id: botId, failure_type: failureType },
      durationSeconds,
    );
  }

  addBreadcrumb(
    category: string,
    message: string,
    data?: Record<string, unknown>,
    level: Sentry.SeverityLevel = "info",
  ): void {
    Sentry.addBreadcrumb({
      category,
      message,
      data,
      level,
      timestamp: Date.now() / 1000,
    });
  }

  updateDatabasePoolMetrics(): void {
    if (!this.dataSource || !this.dataSource.isInitialized) {
      return;
    }

    try {
      const driver = this.dataSource.driver as any;
      if (driver && driver.master) {
        const pool = driver.master;
        // pg pool exposes these properties when using node-postgres (pg)
        const totalCount = pool.totalCount ?? pool._clients?.length ?? 0;
        const idleCount = pool.idleCount ?? pool._idle?.length ?? 0;
        const waitingCount =
          pool.waitingCount ?? pool._pendingQueue?.length ?? 0;
        const activeCount = totalCount - idleCount;

        this.databasePoolSize.set(totalCount);
        this.databasePoolActive.set(activeCount + waitingCount);
      }
    } catch {
      // Pool metrics collection failed, metrics will show 0
    }
  }

  private normalizePath(path: string): string {
    return path
      .replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        "/:id",
      )
      .replace(/\/\d+/g, "/:id")
      .replace(/\?.*$/, "");
  }
}
