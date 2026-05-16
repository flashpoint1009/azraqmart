import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Vitest configuration for the white-label SaaS test suites.
// - Resolves TypeScript path aliases via tsconfig-paths so `@/...` imports work.
// - Coverage is scoped to `src/lib/**` (the tenancy / billing pure-logic modules)
//   with a 90%+ threshold per design §"Testing Strategy".
// - Property-based tests (fast-check) live under `tests/properties` and are also
//   exercised via the `test:property` npm script with FAST_CHECK_NUM_RUNS=200.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: [
      "tests/**/*.{test,spec}.{ts,tsx}",
      "src/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "node_modules/**",
      "dist/**",
      ".tanstack/**",
      ".wrangler/**",
      "e2e/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/lib/**"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.d.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
