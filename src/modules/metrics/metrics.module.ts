import { Module, forwardRef, Global } from "@nestjs/common";
import {
  PrometheusModule,
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
} from "@willsoto/nestjs-prometheus";
import { MetricsService } from "./metrics.service";
import { MetricsController } from "./metrics.controller";
import { MetricsCollectorService } from "./metrics-collector.service";
import { ServicesModule } from "../../services/services.module";
import { TournamentsModule } from "../tournaments/tournaments.module";
import { GamesModule } from "../games/games.module";

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      controller: MetricsController,
      defaultMetrics: {
        enabled: true,
      },
    }),
    forwardRef(() => ServicesModule),
    forwardRef(() => TournamentsModule),
    forwardRef(() => GamesModule),
  ],
  providers: [
    MetricsService,
    MetricsCollectorService,
    makeCounterProvider({
      name: "poker_http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "path", "status"],
    }),
    makeHistogramProvider({
      name: "poker_http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "path", "status"],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    makeGaugeProvider({
      name: "poker_active_games",
      help: "Number of currently active games",
    }),
    makeGaugeProvider({
      name: "poker_active_tournaments",
      help: "Number of currently active tournaments",
    }),
    makeGaugeProvider({
      name: "poker_connected_bots",
      help: "Number of connected bots",
    }),
    makeGaugeProvider({
      name: "poker_websocket_connections",
      help: "Number of active WebSocket connections",
    }),
    makeCounterProvider({
      name: "poker_hands_dealt_total",
      help: "Total number of hands dealt",
    }),
    makeCounterProvider({
      name: "poker_bot_actions_total",
      help: "Total number of bot actions",
      labelNames: ["action_type", "bot_id"],
    }),
    makeCounterProvider({
      name: "poker_bot_errors_total",
      help: "Total number of bot errors",
      labelNames: ["error_type", "bot_id"],
    }),
    makeHistogramProvider({
      name: "poker_bot_response_time_seconds",
      help: "Bot response time in seconds",
      labelNames: ["bot_id"],
      buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    makeCounterProvider({
      name: "poker_tournament_entries_total",
      help: "Total tournament entries",
    }),
    makeCounterProvider({
      name: "poker_tournament_completions_total",
      help: "Total tournaments completed",
    }),
    makeGaugeProvider({
      name: "poker_database_pool_size",
      help: "Database connection pool size",
    }),
    makeGaugeProvider({
      name: "poker_database_pool_active",
      help: "Active database connections",
    }),
    makeCounterProvider({
      name: "poker_websocket_messages_total",
      help: "Total WebSocket messages received",
      labelNames: ["event_type"],
    }),
    makeCounterProvider({
      name: "poker_errors_total",
      help: "Total errors by type and endpoint",
      labelNames: ["type", "endpoint", "status_code"],
    }),
    makeCounterProvider({
      name: "poker_games_started_total",
      help: "Total number of games started",
    }),
    makeHistogramProvider({
      name: "poker_bot_timeout_seconds",
      help: "Bot timeout/failure response times in seconds",
      labelNames: ["bot_id", "failure_type"],
      buckets: [1, 2.5, 5, 10, 15, 30],
    }),
  ],
  exports: [MetricsService, MetricsCollectorService],
})
export class MetricsModule {}
