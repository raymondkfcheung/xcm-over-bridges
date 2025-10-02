import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globals: true,
    testTimeout: 30000,
    coverage: { provider: "v8" },
  },
});
