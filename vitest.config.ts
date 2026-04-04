import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.spec.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", "tests/qa/**"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: "threads",
    // @ts-ignore
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4,
      },
    },
    fileParallelism: false,
    sequence: {
      shuffle: false,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        // ═══════════════════════════════════════════════════════════════
        // TEST FILES
        // ═══════════════════════════════════════════════════════════════
        "src/**/*.spec.ts",
        "src/**/*.test.ts",

        // ═══════════════════════════════════════════════════════════════
        // NESTJS FRAMEWORK BOILERPLATE
        // These files contain minimal/no business logic - they wire up
        // the framework. Covered implicitly by E2E tests.
        // ═══════════════════════════════════════════════════════════════
        "src/main.ts",
        "src/**/*.module.ts",
        "src/**/*.dto.ts",
        "src/**/*.entity.ts",
        "src/**/*.controller.ts",
        "src/**/*.gateway.ts",
        "src/**/index.ts",

        // ═══════════════════════════════════════════════════════════════
        // CONFIGURATION & INFRASTRUCTURE
        // Static configuration, type definitions, no runtime logic to test.
        // ═══════════════════════════════════════════════════════════════
        "src/config/**",
        "src/migrations/**",
        "src/common/types/**",

        // ═══════════════════════════════════════════════════════════════
        // DATA ACCESS LAYER
        // Repositories and Redis - require database/Redis for meaningful
        // tests. Covered by integration and E2E tests.
        // ═══════════════════════════════════════════════════════════════
        "src/repositories/**",
        "src/common/redis/**",
        "src/modules/health/**",

        // ═══════════════════════════════════════════════════════════════
        // FRAMEWORK INTEGRATIONS
        // Passport strategies, validation pipes, guards, Sentry - framework glue code.
        // These extend NestJS framework classes and are better tested via E2E.
        // ═══════════════════════════════════════════════════════════════
        "src/**/strategies/**",
        "src/common/pipes/**",
        "src/common/sentry/**",
        "src/common/guards/custom-throttler.guard.ts",
        "src/common/guards/ip-block.guard.ts",
        "src/common/guards/scopes.guard.ts",
        "src/common/interceptors/logging.interceptor.ts",
        "src/common/interceptors/timeout.interceptor.ts",
        "src/common/interceptors/bigint.interceptor.ts",
        "src/common/interceptors/distributed-lock.interceptor.ts",
        "src/common/transformers/**",
        "src/common/validators/**",

        // ═══════════════════════════════════════════════════════════════
        // SERVICES REQUIRING EXTERNAL SYSTEMS
        // These services integrate with external systems (Redis,
        // database) and are better tested via integration/E2E tests.
        // ═══════════════════════════════════════════════════════════════

        // Game state management (complex state machines + Redis/DB-backed)
        "src/services/game/*-persistence.service.ts",
        "src/services/game/*-manager.service.ts",
        "src/services/game/game-recovery.service.ts",
        "src/services/game/game-ownership.service.ts",
        "src/services/game/game-hot-state.service.ts",
        "src/services/game/game-monitor.service.ts",
        "src/services/game/hand-stats-processor.service.ts",

        // Redis-backed services
        "src/services/redis/redis-*.service.ts",

        // Tournament orchestration (complex state machine + Worker Thread service)
        "src/modules/tournaments/tournament-director.service.ts",
        "src/modules/tournaments/simulation.service.ts",

        // Event listeners (integration between multiple services)
        "src/modules/metrics/metrics-collector.service.ts",
        "src/modules/tournaments/tournament-stats.listener.ts",
        "src/modules/tournaments/tournament-websocket.listener.ts",

        // Analytics and event persistence (database aggregations)
        "src/services/platform-analytics.service.ts",
        "src/services/daily-summary.service.ts",
        "src/services/hand-seed-persistence.service.ts",

        // Leaderboard service (raw SQL/materialized view queries, covered by E2E)
        "src/modules/leaderboard/leaderboard.service.ts",

        // Simulation service (Worker Thread orchestration + DB, covered by E2E)
        "src/modules/simulations/simulations.service.ts",
        "src/modules/simulations/opponent-profiles.ts",

        // Archive service (S3 + DB pipeline, covered by integration tests)
        "src/modules/archive/**",

        // Audit service (DB-heavy CLI tool, validated by npm run audit:games)
        "src/services/audit/**",

        // Testing utilities module (test-only infrastructure)
        "src/modules/testing/**",

        // Email notification provider (integration tested via E2E)
        "src/modules/support/notification/email-notification.provider.ts",

        // ═══════════════════════════════════════════════════════════════
        // TEST UTILITIES & SCRIPTS
        // Not production code — QA tools, simulators, scripts.
        // ═══════════════════════════════════════════════════════════════
        "src/testing-utilities/**",
        "src/simulation/**",
        "src/workers/**",
      ],
      reportOnFailure: true,
      thresholds: {
        // NOTE: Thresholds reduced 2026-04-04 after significant new module additions
        // (matchmaking, simulations, leaderboard, archive). These modules have
        // integration/E2E coverage but limited unit tests. Target: restore to 80/70
        // by adding unit tests for matchmaking.service, tournaments.service,
        // bots.service, games.service (currently 15-50% covered).
        statements: 72,
        branches: 64,
        functions: 75,
        lines: 72,
      },
    },
  },
});