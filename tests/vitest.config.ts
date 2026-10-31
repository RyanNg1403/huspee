import { defineConfig } from 'vitest/config';
import { DATABASE_URL, TOKEN_ENCRYPTION_KEY } from './helpers/env.js';

export default defineConfig({
  test: {
    globalSetup: ['./setup/global-setup.ts'],
    // In-process domain tests need the same isolated DB/config as the API child process.
    env: { DATABASE_URL, HUSPEE_TOKEN_ENCRYPTION_KEY: TOKEN_ENCRYPTION_KEY, ASSISTANT_VOICE_ENABLED: 'false' },
    // One shared server + database: run files sequentially for deterministic state.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    include: ['upstream/**/*.test.ts', 'extensions/**/*.test.ts', 'e2e/**/*.test.ts', 'web/**/*.test.ts'],
  },
});
