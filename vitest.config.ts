import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // v8 coverage instrumentation multiplies the combinatorial scheduler tests
    // by roughly ten: reverse-pairs runs comfortably under the 5s default
    // normally and took 7.2s under --coverage, so `npm run test:coverage`
    // failed on a timeout while the code itself was fine.
    testTimeout: 20000,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/scheduler/**"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
