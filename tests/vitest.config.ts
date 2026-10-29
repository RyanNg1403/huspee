import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./setup/global-setup.ts'],
    // One shared server + database: run files sequentially for deterministic state.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    include: ['upstream/**/*.test.ts', 'extensions/**/*.test.ts', 'e2e/**/*.test.ts'],
  },
});
