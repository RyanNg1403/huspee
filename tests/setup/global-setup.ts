/**
 * Boots the real API against a freshly migrated + seeded test database. Tests talk to it over
 * HTTP only (SDK-driven), so they exercise routing, auth, signing and persistence end to end.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, DATABASE_URL, PARTNER_ID, PARTNER_KEY, TEST_PORT, TOKEN_ENCRYPTION_KEY } from '../helpers/env.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apiDir = resolve(root, 'apps/api');

export const serverEnv = {
  ...process.env,
  NODE_ENV: 'test',
  ASSISTANT_TOOL_DEBUG: 'true',
  // Voice is on by default and would find a real Codex CLI on PATH; tests never start real Codex.
  ASSISTANT_VOICE_ENABLED: 'false',
  // The connection status reads the account through Codex; point it at the fake and a scratch home.
  ASSISTANT_CODEX_BIN: resolve(root, 'tests/helpers/fake-codex/codex'),
  ASSISTANT_CODEX_HOME: resolve(tmpdir(), 'huspee-test-codex-home'),
  DATABASE_URL,
  PORT: String(TEST_PORT),
  PUBLIC_BASE_URL: API,
  WEB_APP_URL: 'http://localhost:3001',
  COOKIE_SECURE: 'false',
  // Direct API/SDK tests keep absolute URLs, regardless of the local phone-demo .env.
  BROWSER_PROXY_ENABLED: 'false',
  HUSPEE_PARTNER_ID: String(PARTNER_ID),
  HUSPEE_PARTNER_KEY: PARTNER_KEY,
  HUSPEE_TOKEN_ENCRYPTION_KEY: TOKEN_ENCRYPTION_KEY,
};

let server: ChildProcess | undefined;

export default async function setup() {
  if (!existsSync(resolve(apiDir, 'dist/main.js'))) {
    throw new Error('API is not built. Run `pnpm build` (or `pnpm test`, which builds first).');
  }
  // Non-destructive migration, then the deterministic seed (which truncates and reloads the
  // dedicated test database only).
  for (const args of [['prisma', 'migrate', 'deploy'], ['prisma', 'db', 'seed']]) {
    const run = spawnSync('npx', args, { cwd: apiDir, env: serverEnv, encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`${args.join(' ')} failed:\n${run.stdout}\n${run.stderr}`);
  }

  server = spawn(process.execPath, ['dist/main.js'], { cwd: apiDir, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  server.stdout?.on('data', (d) => (logs += d));
  server.stderr?.on('data', (d) => (logs += d));

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`API exited early:\n${logs}`);
    try {
      const res = await fetch(`${API}/healthz`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (Date.now() >= deadline) throw new Error(`API did not become healthy:\n${logs}`);

  return async () => {
    server?.kill('SIGTERM');
    if (process.env.TEST_SHOW_SERVER_LOGS) console.log(logs);
  };
}
