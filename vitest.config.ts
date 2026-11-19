import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/**/*.test.ts", "client/tests/**/*.test.ts", "server/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["shared/**/*.ts"],
      exclude: ["shared/**/*.test.ts"],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 85,
      },
    },
  },
});
