import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.spec.ts", "tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.spec.ts",
        "src/**/*.test.ts",
        "src/main.ts",
        "src/**/*.module.ts",
        "src/**/*.dto.ts",
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    sequence: {
      shuffle: false,
    },
  },
});
