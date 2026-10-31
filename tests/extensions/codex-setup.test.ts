import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { HuspeeClient } from '@huspee/sdk';
import { serverEnv } from '../setup/global-setup.js';
import { DEMO_PASSWORD, SEED } from '../helpers/env.js';

describe('public Codex setup (fake Codex)', () => {
  const port = 44000 + Math.floor(Math.random() * 10000);
  const baseUrl = `http://localhost:${port}`;
  let server: ChildProcess;
  let home: string;
  const client = () => new HuspeeClient({ baseUrl, cookieJar: true });

  beforeAll(async () => {
    home = await mkdtemp(resolve(tmpdir(), 'huspee-public-codex-'));
    server = spawn(process.execPath, ['dist/main.js'], {
      cwd: resolve(__dirname, '../../apps/api'),
      env: {
        ...serverEnv,
        HOME: home,
        PORT: String(port),
        PUBLIC_BASE_URL: baseUrl,
        ASSISTANT_CODEX_HOME: resolve(home, 'private'),
        FAKE_CODEX_LOGIN_MS: '3000',
      },
      stdio: 'ignore',
    });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error('Test API exited');
      if (await fetch(`${baseUrl}/healthz`).then((res) => res.ok).catch(() => false)) return;
      await new Promise((wait) => setTimeout(wait, 100));
    }
    throw new Error('Test API did not become healthy');
  });

  afterAll(async () => {
    if (server?.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await exited;
    }
    if (home) await rm(home, { recursive: true, force: true });
  });

  it('allows anonymous setup, protects the pending code and cancellation, and keeps logout protected', async () => {
    const owner = client();
    const other = client();
    await expect(owner.auth.me()).rejects.toMatchObject({ status: 401 });
    expect(await owner.assistant.connection.get()).toMatchObject({ installed: true, connected: false, login: null, busy: false });

    const csrf = await fetch(`${baseUrl}/api/v1/assistant/connection/login`, { method: 'POST' });
    expect(csrf.status).toBe(403);
    const pending = await owner.assistant.connection.login();
    expect(pending).toMatchObject({ connected: false, busy: false, login: { user_code: 'FAKE-1234' } });
    expect((await owner.assistant.connection.get()).login).toEqual(pending.login);
    expect(await other.assistant.connection.get()).toMatchObject({ login: null, busy: true });
    await expect(other.assistant.connection.login()).rejects.toMatchObject({ status: 409 });
    await expect(other.assistant.connection.cancel()).rejects.toMatchObject({ status: 403 });
    const seller = client();
    await seller.auth.login(SEED.sellers.techzone.email, DEMO_PASSWORD);
    expect((await seller.seller.assistant.connection.get()).login).toBeNull();

    const response = await owner.http.raw(`${baseUrl}/api/v1/assistant/connection`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const cookie = owner.http.cookieHeader();
    expect(cookie).toContain('huspee_codex_setup=');
    expect(cookie).not.toContain('huspee_sid=');
    await expect(owner.seller.assistant.connection.disconnect()).rejects.toMatchObject({ status: 401 });
    const publicLogout = await owner.http.raw(`${baseUrl}/api/v1/assistant/connection`, {
      method: 'DELETE', headers: { 'X-Requested-With': 'test' },
    });
    expect(publicLogout.status).toBe(404);

    expect(await owner.assistant.connection.cancel()).toMatchObject({ connected: false, login: null, busy: false });
    expect(await other.assistant.connection.get()).toMatchObject({ login: null, busy: false });
    await expect(owner.auth.me()).rejects.toMatchObject({ status: 401 });
  });

  it('finishes sign-in without a Huspee session and cannot replace a connected account', async () => {
    const owner = client();
    const loginResponse = await owner.http.raw(`${baseUrl}/api/v1/assistant/connection/login`, {
      method: 'POST', headers: { 'X-Requested-With': 'test' },
    });
    expect(loginResponse.status).toBe(201);
    const cookie = loginResponse.headers.getSetCookie().find((value) => value.startsWith('huspee_codex_setup='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/assistant\/connection/i);
    await expect.poll(async () => (await owner.assistant.connection.get()).connected, { timeout: 6000 }).toBe(true);
    expect(await client().assistant.connection.get()).toMatchObject({ connected: true, login: null, busy: false });
    await expect(client().assistant.connection.login()).rejects.toMatchObject({ status: 409 });
    await expect(owner.auth.me()).rejects.toMatchObject({ status: 401 });
  });
});
