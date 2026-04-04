import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/e2e/**/*.e2e.spec.ts"],
    globalSetup: ["tests/e2e/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    sequence: { shuffle: false },
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
} as any);
