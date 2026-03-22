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

        // ═══════════════════════════════════════════════════════════════
        // SERVICES REQUIRING EXTERNAL SYSTEMS
        // These services integrate with external systems (bots, Redis,
        // database) and are better tested via integration/E2E tests.
        // ═══════════════════════════════════════════════════════════════

        // Bot communication services
        "src/services/bot/bot-caller.service.ts",
        "src/services/bot/bot-validator.service.ts",
        "src/services/bot/bot-health-scheduler.service.ts",

        // Game state management (complex state machines)
        "src/services/game/*-persistence.service.ts",
        "src/services/game/*-manager.service.ts",
        "src/services/game/game-recovery.service.ts",
        "src/services/game/game-ownership.service.ts",

        // Redis-backed services
        "src/services/redis/redis-*.service.ts",

        // Tournament orchestration (complex state machine)
        "src/modules/tournaments/tournament-director.service.ts",

        // Event listeners (integration between multiple services)
        "src/modules/metrics/metrics-collector.service.ts",
        "src/modules/tournaments/tournament-stats.listener.ts",
        "src/modules/tournaments/tournament-websocket.listener.ts",

        // Analytics and event persistence (database aggregations)
        "src/services/platform-analytics.service.ts",
        "src/services/daily-summary.service.ts",
        "src/services/hand-seed-persistence.service.ts",

        // Security services (complex mocking required)
        "src/common/security/api-key-rotation.service.ts",

        // ═══════════════════════════════════════════════════════════════
        // SCRIPTS & ONE-TIME RUNNERS
        // Not production code - scripts and simulations.
        // ═══════════════════════════════════════════════════════════════
        "src/simulation/**",
        "src/workers/**",
        "src/botValidator.ts",
      ],
      reportOnFailure: true,
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});