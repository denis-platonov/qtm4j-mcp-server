import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/live/**/*.test.ts"],
    coverage: {
      enabled: false,
    },
  },
});
