import path from "path";
import { defineConfig } from "vitest/config";

/** End-to-end: real `next dev` server + dedicated local database. Run with `npm run test:e2e`. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.ts"],
    globalSetup: ["tests/e2e/global-setup.ts"],
    fileParallelism: false,
    // First request to each route compiles it in dev mode.
    testTimeout: 120_000,
    hookTimeout: 240_000,
  },
});
