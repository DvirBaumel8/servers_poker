import { describe, it, expect, beforeEach, vi } from "vitest";
import { MetricsService } from "../../../src/modules/metrics/metrics.service";

describe("MetricsService", () => {
  let metricsService: MetricsService;
  let mockHttpRequestsTotal: any;
  let mockHttpRequestDuration: any;
  let mockActiveGames: any;
  let mockActiveTournaments: any;
  let mockConnectedBots: any;
  let mockWebsocketConnections: any;
  let mockHandsDealtTotal: any;
  let mockBotActionsTotal: any;
  let mockBotErrorsTotal: any;
  let mockBotResponseTime: any;
  let mockTournamentEntriesTotal: any;
  let mockTournamentCompletionsTotal: any;
  let mockDatabasePoolSize: any;
  let mockDatabasePoolActive: any;
  let mockWebsocketMessagesTotal: any;
  let mockErrorsTotal: any;
  let mockGamesStartedTotal: any;
  let mockBotTimeoutSeconds: any;

  beforeEach(() => {
    mockHttpRequestsTotal = { inc: vi.fn() };
    mockHttpRequestDuration = { observe: vi.fn() };
    mockActiveGames = { set: vi.fn() };
    mockActiveTournaments = { set: vi.fn() };
    mockConnectedBots = { set: vi.fn() };
    mockWebsocketConnections = { set: vi.fn() };
    mockHandsDealtTotal = { inc: vi.fn() };
    mockBotActionsTotal = { inc: vi.fn() };
    mockBotErrorsTotal = { inc: vi.fn() };
    mockBotResponseTime = { observe: vi.fn() };
    mockTournamentEntriesTotal = { inc: vi.fn() };
    mockTournamentCompletionsTotal = { inc: vi.fn() };
    mockDatabasePoolSize = { set: vi.fn() };
    mockDatabasePoolActive = { set: vi.fn() };
    mockWebsocketMessagesTotal = { inc: vi.fn() };
    mockErrorsTotal = { inc: vi.fn() };
    mockGamesStartedTotal = { inc: vi.fn() };
    mockBotTimeoutSeconds = { observe: vi.fn() };

    metricsService = new MetricsService(
      mockHttpRequestsTotal,
      mockHttpRequestDuration,
      mockActiveGames,
      mockActiveTournaments,
      mockConnectedBots,
      mockWebsocketConnections,
      mockHandsDealtTotal,
      mockBotActionsTotal,
      mockBotErrorsTotal,
      mockBotResponseTime,
      mockTournamentEntriesTotal,
      mockTournamentCompletionsTotal,
      mockDatabasePoolSize,
      mockDatabasePoolActive,
      mockWebsocketMessagesTotal,
      mockErrorsTotal,
      mockGamesStartedTotal,
      mockBotTimeoutSeconds,
      null,
    );
  });

  describe("onModuleInit", () => {
    it("should initialize all gauges to 0", () => {
      metricsService.onModuleInit();

      expect(mockActiveGames.set).toHaveBeenCalledWith(0);
      expect(mockActiveTournaments.set).toHaveBeenCalledWith(0);
      expect(mockConnectedBots.set).toHaveBeenCalledWith(0);
      expect(mockWebsocketConnections.set).toHaveBeenCalledWith(0);
      expect(mockDatabasePoolSize.set).toHaveBeenCalledWith(0);
      expect(mockDatabasePoolActive.set).toHaveBeenCalledWith(0);
    });

    it("should initialize counters with 0 increments", () => {
      metricsService.onModuleInit();

      expect(mockHandsDealtTotal.inc).toHaveBeenCalledWith(0);
      expect(mockTournamentEntriesTotal.inc).toHaveBeenCalledWith(0);
      expect(mockTournamentCompletionsTotal.inc).toHaveBeenCalledWith(0);
    });

    it("should initialize bot action counters for common actions", () => {
      metricsService.onModuleInit();

      const expectedActions = ["fold", "check", "call", "raise", "bet"];
      for (const action of expectedActions) {
        expect(mockBotActionsTotal.inc).toHaveBeenCalledWith(
          { action_type: action, bot_id: "_init_" },
          0,
        );
      }
    });

    it("should initialize bot error counters for common errors", () => {
      metricsService.onModuleInit();

      const expectedErrors = [
        "call_failed",
        "circuit_opened",
        "used_fallback",
        "unhealthy_in_game",
      ];
      for (const errorType of expectedErrors) {
        expect(mockBotErrorsTotal.inc).toHaveBeenCalledWith(
          { error_type: errorType, bot_id: "_init_" },
          0,
        );
      }
    });
  });

  describe("recordHttpRequest", () => {
    it("should record HTTP request metrics", () => {
      metricsService.recordHttpRequest("GET", "/api/v1/games", 200, 0.123);

      expect(mockHttpRequestsTotal.inc).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/v1/games",
        status: 200,
      });
      expect(mockHttpRequestDuration.observe).toHaveBeenCalledWith(
        { method: "GET", path: "/api/v1/games", status: 200 },
        0.123,
      );
    });

    it("should normalize paths with UUIDs", () => {
      metricsService.recordHttpRequest(
        "GET",
        "/api/v1/games/550e8400-e29b-41d4-a716-446655440000",
        200,
        0.05,
      );

      expect(mockHttpRequestsTotal.inc).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/v1/games/:id",
        status: 200,
      });
    });

    it("should normalize paths with numeric IDs", () => {
      metricsService.recordHttpRequest("GET", "/api/v1/users/123", 200, 0.05);

      expect(mockHttpRequestsTotal.inc).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/v1/users/:id",
        status: 200,
      });
    });

    it("should strip query parameters from paths", () => {
      metricsService.recordHttpRequest(
        "GET",
        "/api/v1/games?page=1&limit=10",
        200,
        0.05,
      );

      expect(mockHttpRequestsTotal.inc).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/v1/games",
        status: 200,
      });
    });
  });

  describe("bot metrics", () => {
    it("should record bot action", () => {
      metricsService.recordBotAction("call", "bot-123");

      expect(mockBotActionsTotal.inc).toHaveBeenCalledWith({
        action_type: "call",
        bot_id: "bot-123",
      });
    });

    it("should record bot error", () => {
      metricsService.recordBotError("timeout", "bot-456");

      expect(mockBotErrorsTotal.inc).toHaveBeenCalledWith({
        error_type: "timeout",
        bot_id: "bot-456",
      });
    });

    it("should record bot response time", () => {
      metricsService.recordBotResponseTime("bot-789", 0.234);

      expect(mockBotResponseTime.observe).toHaveBeenCalledWith(
        { bot_id: "bot-789" },
        0.234,
      );
    });

    it("should record bot timeout", () => {
      metricsService.recordBotTimeout("bot-123", "timeout", 5.5);

      expect(mockBotTimeoutSeconds.observe).toHaveBeenCalledWith(
        { bot_id: "bot-123", failure_type: "timeout" },
        5.5,
      );
    });
  });

  describe("counter increments", () => {
    it("should increment hands dealt", () => {
      metricsService.incrementHandsDealt();
      expect(mockHandsDealtTotal.inc).toHaveBeenCalled();
    });

    it("should increment tournament entries", () => {
      metricsService.incrementTournamentEntries();
      expect(mockTournamentEntriesTotal.inc).toHaveBeenCalled();
    });

    it("should increment tournament completions", () => {
      metricsService.incrementTournamentCompletions();
      expect(mockTournamentCompletionsTotal.inc).toHaveBeenCalled();
    });

    it("should increment games started", () => {
      metricsService.incrementGamesStarted();
      expect(mockGamesStartedTotal.inc).toHaveBeenCalled();
    });
  });

  describe("gauge setters", () => {
    it("should set active games", () => {
      metricsService.setActiveGames(5);
      expect(mockActiveGames.set).toHaveBeenCalledWith(5);
    });

    it("should set active tournaments", () => {
      metricsService.setActiveTournaments(3);
      expect(mockActiveTournaments.set).toHaveBeenCalledWith(3);
    });

    it("should set connected bots", () => {
      metricsService.setConnectedBots(10);
      expect(mockConnectedBots.set).toHaveBeenCalledWith(10);
    });

    it("should set websocket connections", () => {
      metricsService.setWebsocketConnections(25);
      expect(mockWebsocketConnections.set).toHaveBeenCalledWith(25);
    });

    it("should set database pool stats", () => {
      metricsService.setDatabasePoolStats(20, 5);
      expect(mockDatabasePoolSize.set).toHaveBeenCalledWith(20);
      expect(mockDatabasePoolActive.set).toHaveBeenCalledWith(5);
    });
  });

  describe("websocket and error recording", () => {
    it("should record websocket message", () => {
      metricsService.recordWebSocketMessage("game_update");

      expect(mockWebsocketMessagesTotal.inc).toHaveBeenCalledWith({
        event_type: "game_update",
      });
    });

    it("should record error", () => {
      metricsService.recordError("ValidationError", "/api/v1/games", 400);

      expect(mockErrorsTotal.inc).toHaveBeenCalledWith({
        type: "ValidationError",
        endpoint: "/api/v1/games",
        status_code: "400",
      });
    });

    it("should normalize error endpoint paths", () => {
      metricsService.recordError(
        "NotFoundError",
        "/api/v1/games/550e8400-e29b-41d4-a716-446655440000",
        404,
      );

      expect(mockErrorsTotal.inc).toHaveBeenCalledWith({
        type: "NotFoundError",
        endpoint: "/api/v1/games/:id",
        status_code: "404",
      });
    });
  });

  describe("updateDatabasePoolMetrics", () => {
    it("should handle null dataSource gracefully", () => {
      expect(() => metricsService.updateDatabasePoolMetrics()).not.toThrow();
    });

    it("should handle uninitialized dataSource gracefully", () => {
      const serviceWithDataSource = new MetricsService(
        mockHttpRequestsTotal,
        mockHttpRequestDuration,
        mockActiveGames,
        mockActiveTournaments,
        mockConnectedBots,
        mockWebsocketConnections,
        mockHandsDealtTotal,
        mockBotActionsTotal,
        mockBotErrorsTotal,
        mockBotResponseTime,
        mockTournamentEntriesTotal,
        mockTournamentCompletionsTotal,
        mockDatabasePoolSize,
        mockDatabasePoolActive,
        mockWebsocketMessagesTotal,
        mockErrorsTotal,
        mockGamesStartedTotal,
        mockBotTimeoutSeconds,
        { isInitialized: false } as any,
      );

      expect(() =>
        serviceWithDataSource.updateDatabasePoolMetrics(),
      ).not.toThrow();
    });

    it("should update pool metrics when dataSource is available", () => {
      const mockDataSource = {
        isInitialized: true,
        driver: {
          master: {
            totalCount: 10,
            idleCount: 3,
            waitingCount: 1,
          },
        },
      };

      const serviceWithDataSource = new MetricsService(
        mockHttpRequestsTotal,
        mockHttpRequestDuration,
        mockActiveGames,
        mockActiveTournaments,
        mockConnectedBots,
        mockWebsocketConnections,
        mockHandsDealtTotal,
        mockBotActionsTotal,
        mockBotErrorsTotal,
        mockBotResponseTime,
        mockTournamentEntriesTotal,
        mockTournamentCompletionsTotal,
        mockDatabasePoolSize,
        mockDatabasePoolActive,
        mockWebsocketMessagesTotal,
        mockErrorsTotal,
        mockGamesStartedTotal,
        mockBotTimeoutSeconds,
        mockDataSource as any,
      );

      serviceWithDataSource.updateDatabasePoolMetrics();

      expect(mockDatabasePoolSize.set).toHaveBeenCalledWith(10);
      expect(mockDatabasePoolActive.set).toHaveBeenCalledWith(8);
    });
  });

  describe("addBreadcrumb", () => {
    it("should call Sentry.addBreadcrumb", () => {
      expect(() =>
        metricsService.addBreadcrumb("test", "test message", { key: "value" }),
      ).not.toThrow();
    });

    it("should handle different severity levels", () => {
      expect(() =>
        metricsService.addBreadcrumb("test", "warning message", {}, "warning"),
      ).not.toThrow();
      expect(() =>
        metricsService.addBreadcrumb("test", "error message", {}, "error"),
      ).not.toThrow();
    });
  });
});
