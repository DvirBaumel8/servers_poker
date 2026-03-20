import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.spec.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.spec.ts",
        "src/**/*.test.ts",
        "src/main.ts",
        "src/**/*.module.ts",
        "src/**/*.dto.ts",
      ],
      reportOnFailure: true,
      thresholds: {
        statements: 10,
        branches: 10,
        functions: 10,
        lines: 10,
      },
    },
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
  },
});
