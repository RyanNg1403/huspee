import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { HuspeeApiError } from '@huspee/sdk';
import { CodexAccountService } from '../../apps/api/src/assistant/voice/codex-account.service.js';
import { voiceEnabled } from '../../apps/api/src/assistant/voice/voice-enabled.js';
import type { VoiceService } from '../../apps/api/src/assistant/voice/voice.service.js';
import { fakeCodexLoginHome } from '../helpers/codex-login.js';
import { loginAs, sessionClient } from '../helpers/fixtures.js';
import { SEED } from '../helpers/env.js';

const until = async (check: () => Promise<boolean>, ms = 5000) => {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((wait) => setTimeout(wait, 50));
  }
};

describe('Codex connection from the web app (fake Codex)', () => {
  const saved = { ...process.env };
  let codexHome: string;
  let emptyHome: string;
  let loginHome: string;
  beforeAll(async () => {
    codexHome = await mkdtemp(resolve(tmpdir(), 'huspee-codex-home-'));
    emptyHome = await mkdtemp(resolve(tmpdir(), 'huspee-no-login-'));
    loginHome = await fakeCodexLoginHome();
    process.env.ASSISTANT_CODEX_HOME = codexHome;
    process.env.ASSISTANT_CODEX_BIN = resolve(__dirname, '../helpers/fake-codex/codex');
    delete process.env.ASSISTANT_VOICE_ENABLED;
  });
  afterAll(async () => {
    process.env = saved;
    for (const dir of [codexHome, emptyHome, loginHome]) await rm(dir, { recursive: true, force: true });
  });

  it('signs in with a device code, saves the login privately, and signs out', async () => {
    process.env.HOME = emptyHome;
    let resets = 0;
    const account = new CodexAccountService({ reset: () => resets++ } as unknown as VoiceService);
    try {
      expect(voiceEnabled()).toBe(false);
      expect(await account.status()).toEqual({ installed: true, connected: false, source: null, plan: null, login: null, error: null });

      const pending = await account.start();
      expect(pending).toMatchObject({ connected: false, login: { verification_url: 'https://auth.example.test/codex/device', user_code: 'FAKE-1234' } });
      expect(pending.login!.expires_at).toBeGreaterThan(Date.now() / 1000 + 14 * 60);
      // A second seller gets the same code instead of starting another login.
      expect((await account.start()).login).toEqual(pending.login);

      await until(async () => (await account.status()).connected);
      expect(await account.status()).toEqual({ installed: true, connected: true, source: 'app', plan: 'pro', login: null, error: null });
      expect(voiceEnabled()).toBe(true);
      expect(resets).toBe(1);
      // Stored as a file in the private home, with logins kept out of the system keychain.
      expect((await lstat(resolve(codexHome, 'auth.json'))).isFile()).toBe(true);
      expect(await readFile(resolve(codexHome, 'config.toml'), 'utf8')).toBe('cli_auth_credentials_store = "file"\n');
      await expect(account.start()).rejects.toThrow('already connected');

      expect(await account.disconnect()).toMatchObject({ connected: false, source: null, plan: null });
      expect(existsSync(resolve(codexHome, 'auth.json'))).toBe(false);
      expect(voiceEnabled()).toBe(false);
      expect(resets).toBe(2);
    } finally {
      account.onModuleDestroy();
    }
  });

  it('cancels a waiting sign-in without connecting', async () => {
    process.env.HOME = emptyHome;
    process.env.FAKE_CODEX_LOGIN_MS = '1000';
    const account = new CodexAccountService({ reset: () => undefined } as unknown as VoiceService);
    try {
      expect((await account.start()).login).not.toBeNull();
      expect(await account.cancel()).toMatchObject({ connected: false, login: null, error: null });
      await new Promise((wait) => setTimeout(wait, 1200));
      expect(existsSync(resolve(codexHome, 'auth.json'))).toBe(false);
    } finally {
      delete process.env.FAKE_CODEX_LOGIN_MS;
      account.onModuleDestroy();
    }
  });

  it('uses a `codex login` on the host machine and never signs it out', async () => {
    process.env.HOME = loginHome;
    const account = new CodexAccountService({ reset: () => undefined } as unknown as VoiceService);
    expect(await account.status()).toMatchObject({ connected: true, source: 'host' });
    expect(voiceEnabled()).toBe(true);
    await expect(account.disconnect()).rejects.toThrow('codex logout');
    expect(existsSync(resolve(loginHome, '.codex/auth.json'))).toBe(true);
    // Once the host login is gone, the stale link is dropped so a new login is written here.
    await rm(resolve(loginHome, '.codex/auth.json'));
    expect(await account.status()).toMatchObject({ connected: false, source: null });
    process.env.HOME = emptyHome;
    await account.start();
    await until(async () => (await account.status()).source === 'app');
    expect((await lstat(resolve(codexHome, 'auth.json'))).isFile()).toBe(true);
    await account.disconnect();
  });
});

describe('connection routes', () => {
  it('are for sellers only', async () => {
    const seller = await loginAs(SEED.sellers.techzone.email);
    expect(await seller.seller.assistant.connection.get()).toMatchObject({ installed: true, connected: expect.any(Boolean), login: null });
    const buyer = await loginAs(SEED.buyers.an.email);
    await expect(buyer.seller.assistant.connection.get()).rejects.toMatchObject({ status: 403 });
    await expect(sessionClient().seller.assistant.connection.login()).rejects.toBeInstanceOf(HuspeeApiError);
  });
  it('tell the buyer widget whether the assistant is connected', async () => {
    const profile = await sessionClient().assistant.profile(SEED.sellers.techzone.shopId);
    expect(typeof profile.connected).toBe('boolean');
  });
});
