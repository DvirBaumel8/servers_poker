import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.spec.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
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
    fileParallelism: true,
    sequence: {
      shuffle: false,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        // Test files
        "src/**/*.spec.ts",
        "src/**/*.test.ts",
        // NestJS boilerplate (no business logic)
        "src/main.ts",
        "src/**/*.module.ts",
        "src/**/*.dto.ts",
        "src/**/*.entity.ts",
        // Controllers - thin wrappers, better for E2E tests
        "src/**/*.controller.ts",
        // WebSocket gateways - complex setup, E2E tests preferred
        "src/**/*.gateway.ts",
        // Database migrations - schema definitions, not logic
        "src/migrations/**",
        // Worker threads - require integration testing
        "src/workers/**",
        // Simulation/scripts - one-time runners
        "src/simulation/**",
        "src/botValidator.ts",
        // Config files - just exports
        "src/config/**",
        // Index re-exports
        "src/**/index.ts",
        // Repositories - database access, integration tests
        "src/repositories/**",
        // Redis services - external service, integration tests
        "src/common/redis/**",
        // Passport strategies - framework integration
        "src/**/strategies/**",
        // Validation pipes - framework integration
        "src/common/pipes/**",
        // Services that require external systems (better for integration tests)
        "src/services/*-persistence.service.ts",
        "src/services/*-manager.service.ts",
        "src/services/redis-*.service.ts",
        "src/services/bot-caller.service.ts",
        "src/services/bot-validator.service.ts",
        "src/services/bot-health-scheduler.service.ts",
        "src/services/game-recovery.service.ts",
        "src/services/game-ownership.service.ts",
        // Tournament director - complex state machine, integration tests
        "src/modules/tournaments/tournament-director.service.ts",
        // Security services that require complex mocking
        "src/common/security/api-key-rotation.service.ts",
        // Analytics services - require database integration
        "src/services/platform-analytics.service.ts",
        "src/services/daily-summary.service.ts",
      ],
      reportOnFailure: true,
      thresholds: {
        statements: 40,
        branches: 35,
        functions: 40,
        lines: 40,
      },
    },
  },
});