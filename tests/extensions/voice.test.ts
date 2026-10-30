import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { fakeCodexLoginHome } from '../helpers/codex-login.js';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { appendFinalTranscript, applyChannelEvent, type ChannelEvent, type TranscriptEntry } from '../../apps/web/src/components/assistant/transcript.js';
import { readFileSync } from 'node:fs';
import { VoiceRuntime } from '../../apps/api/src/assistant/voice/voice-runtime.js';
import { speechText } from '../../apps/api/src/assistant/voice/speech-check.js';


it('replays captured channel turns without duplicates and marks the overlapping interruption once', () => {
  const fixture = JSON.parse(readFileSync(resolve(__dirname, '../helpers/fake-codex/channel-turns.json'), 'utf8')) as { at: number; event: ChannelEvent }[];
  const entries = fixture.reduce<TranscriptEntry[]>((state, item) => applyChannelEvent(state, item.event, item.at), []);
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  expect(entries.filter((entry) => entry.cutOff).map((entry) => entry.id)).toEqual(['turn-4']);
  expect(entries.find((entry) => entry.id === 'turn-4')).toMatchObject({ text: 'final turn-4', final: true });
});

it('keeps rapid user turns separate and uses only final SSE events as fallback', () => {
  let entries: TranscriptEntry[] = [];
  for (const event of [
    { type: 'turn.created', turn: { id: 'a', role: 'user', transcript: 'one' } },
    { type: 'turn.created', turn: { id: 'b', role: 'user', transcript: 'two' } },
    { type: 'turn.done', turn: { id: 'a', role: 'user', transcript: 'one final' } },
    { type: 'turn.done', turn: { id: 'b', role: 'user', transcript: 'two final' } },
  ] as ChannelEvent[]) entries = applyChannelEvent(entries, event, 100);
  expect(entries.map((entry) => entry.text)).toEqual(['one final', 'two final']);
  expect(appendFinalTranscript([], { role: 'user', text: 'partial', final: false }, 1)).toEqual([]);
  expect(appendFinalTranscript([], { role: 'user', text: 'final', final: true }, 2)).toMatchObject([{ text: 'final' }]);
});

it('starts a text-only fake thread with tools and streams its answer', async () => {
  const calls: unknown[] = []; const saved: unknown[] = [];
  const runtime = new VoiceRuntime({ specs: () => [{ name: 'search_products', description: 'Search', inputSchema: {} }], run: async (_name, _args, ctx) => { calls.push(ctx); return { success: true, text: 'Verified' }; } }, async (_ctx, role, text) => { saved.push({ role, text }); }, async () => undefined);
  const completion: unknown[] = [];
  runtime.onTurnCompleted = (conversationId, status) => completion.push({ conversationId, status, saved: [...saved] });
  const ctx = { conversationId: 'text-session', buyerId: 1, shopId: 2 };
  const config = { shopName: 'Shop', tone: 'FRIENDLY', greetingVi: 'Xin chào', greetingEn: 'Hello', voice: 'spruce' };
  try {
    await runtime.startText(ctx, config);
    const events: Record<string, unknown>[] = [];
    runtime.subscribe(ctx.conversationId, 1, (event) => events.push(event));
    await runtime.text(ctx.conversationId, 1, 'Find a product');
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    expect(calls).toEqual([ctx]);
    expect(events).toContainEqual({ type: 'transcript', role: 'assistant', text: 'Verified product', final: true, item_id: 'text-1' });
    expect(saved).toContainEqual({ role: 'assistant', text: 'Verified product' });
    expect(completion).toEqual([{ conversationId: ctx.conversationId, status: 'completed', saved: expect.arrayContaining([{ role: 'assistant', text: 'Verified product' }, { role: 'assistant', text: 'Final answer' }]) }]);
    await runtime.stop(ctx.conversationId, 1);
  } finally { runtime.close(); }
});

let home: string;
let loginHome: string;
beforeAll(async () => {
  home = await mkdtemp(resolve(tmpdir(), 'huspee-voice-test-'));
  loginHome = await fakeCodexLoginHome();
  process.env.ASSISTANT_CODEX_HOME = home;
  process.env.ASSISTANT_CODEX_BIN = resolve(__dirname, '../helpers/fake-codex/codex');
  process.env.ASSISTANT_MAX_VOICE_SESSIONS = '1';
});
afterAll(async () => {
  delete process.env.ASSISTANT_CODEX_HOME;
  delete process.env.ASSISTANT_CODEX_BIN;
  delete process.env.ASSISTANT_MAX_VOICE_SESSIONS;
  await rm(home, { recursive: true, force: true });
  await rm(loginHome, { recursive: true, force: true });
});

describe('voice runtime with fake app-server', () => {
  it('correlates SDP, isolates context, streams transcript and card, and enforces capacity and ownership', async () => {
    const seen: unknown[] = [];
    const saved: unknown[] = [];
    const ended: unknown[] = [];
    const runtime = new VoiceRuntime(
      {
        specs: () => [{ name: 'search_products', description: 'Search', inputSchema: { type: 'object' } }],
        run: async (_name, _args, ctx) => {
          seen.push(ctx);
          return { success: true, text: 'Verified', card: { kind: 'products', items: [] } };
        },
      },
      async (ctx, role, text) => {
        saved.push({ ctx, role, text });
      },
      async (ctx) => {
        ended.push(ctx);
      },
    );
    const ctx = { conversationId: 'conversation-1', buyerId: 1, shopId: 2 };
    const config = { shopName: 'Shop', tone: 'FRIENDLY', greetingVi: 'Xin chào', greetingEn: 'Hello', voice: 'spruce' };
    try {
      expect(await runtime.start(ctx, config, 'offer')).toBe('fake-answer');
      await expect(runtime.start({ ...ctx, conversationId: 'conversation-2' }, config, 'offer')).rejects.toThrow(
        'assistant_busy',
      );
      expect(() => runtime.subscribe(ctx.conversationId, 999, () => undefined)).toThrow('not_found');
      const events: Record<string, unknown>[] = [];
      runtime.subscribe(ctx.conversationId, 1, (event) => events.push(event));
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      expect(seen).toEqual([ctx]);
      expect(saved).toEqual([{ ctx, role: 'user', text: 'Find a product' }]);
      expect(events).toEqual(
        expect.arrayContaining([
          { type: 'card', card: { kind: 'products', items: [] } },
          { type: 'tool', name: 'search_products', status: 'done' },
        ]),
      );
      runtime.action(ctx.conversationId, {
        status: 'EXECUTED',
        requires_tap: true,
        summary: { title: 'Order confirmed' },
        result: { order_sn: 'SN1' },
      });
      await new Promise((resolveWait) => setTimeout(resolveWait, 30));
      // A fixed server sentence is spoken; the realtime model's reply to the app note is not.
      expect(events).toContainEqual(expect.objectContaining({ type: 'transcript', role: 'assistant', text: speechText.orderPlaced.en }));
      expect(JSON.stringify(events.filter((event) => event.final))).not.toContain('[App]');
      expect(events).toContainEqual({
        type: 'action',
        action: { status: 'EXECUTED', requires_tap: true, summary: { title: 'Order confirmed' }, result: { order_sn: 'SN1' } },
      });
      await runtime.text(ctx.conversationId, 1, 'Typed question');
      expect(events).toContainEqual({ type: 'transcript', role: 'user', text: 'Typed question', final: true });
      await runtime.stop(ctx.conversationId, 1);
      expect(ended).toEqual([ctx]);
    } finally {
      runtime.close();
    }
  });

  it('emits an error before closing on a realtime session error', async () => {
    const runtime = new VoiceRuntime({ specs: () => [], run: async () => ({ success: true, text: 'ok' }) }, async () => undefined, async () => undefined);
    const ctx = { conversationId: 'error-session', buyerId: 1, shopId: 2 };
    const config = { shopName: 'Shop', tone: 'FRIENDLY', greetingVi: 'Xin chào', greetingEn: 'Hello', voice: 'spruce' };
    try {
      await runtime.start(ctx, config, 'offer');
      const events: Record<string, unknown>[] = [];
      runtime.subscribe(ctx.conversationId, 1, (event) => events.push(event));
      await runtime.text(ctx.conversationId, 1, 'FAKE_ERROR');
      await new Promise((resolveWait) => setTimeout(resolveWait, 30));
      expect(events.findIndex((event) => event.type === 'error')).toBeLessThan(events.findIndex((event) => event.type === 'closed'));
      expect(events).toContainEqual({ type: 'error', message: 'Assistant session unavailable' });
    } finally { runtime.close(); }
  });

  it('closes sessions after a process exit and lazily restarts the server', async () => {
    const ended: string[] = [];
    const runtime = new VoiceRuntime(
      { specs: () => [], run: async () => ({ success: true, text: 'ok' }) },
      async () => undefined,
      async (ctx) => {
        ended.push(ctx.conversationId);
      },
    );
    const ctx = { conversationId: 'restart-1', buyerId: 1, shopId: 2 };
    const config = { shopName: 'Shop', tone: 'FRIENDLY', greetingVi: 'Xin chào', greetingEn: 'Hello', voice: 'spruce' };
    try {
      await runtime.start(ctx, config, 'offer');
      const events: Record<string, unknown>[] = [];
      runtime.subscribe(ctx.conversationId, 1, (event) => events.push(event));
      await expect(runtime.text(ctx.conversationId, 1, 'FAKE_EXIT')).rejects.toThrow();
      await new Promise((resolveWait) => setTimeout(resolveWait, 30));
      expect(events).toContainEqual({ type: 'error', message: 'Assistant runtime unavailable' });
      expect(events).toContainEqual({ type: 'closed', reason: 'runtime_unavailable' });
      expect(ended).toContain(ctx.conversationId);
      expect(await runtime.start({ ...ctx, conversationId: 'restart-2' }, config, 'offer')).toBe('fake-answer');
      await runtime.stop('restart-2', 1);
    } finally {
      runtime.close();
    }
  });
});

describe('voice HTTP routes', () => {
  it('returns a clear disabled error through the session SDK', async () => {
    const { loginAs } = await import('../helpers/fixtures.js');
    const client = await loginAs('an.nguyen@example.com');
    await expect(client.assistant.voice.start({ shop_id: 880001, sdp_offer: 'offer' })).rejects.toMatchObject({
      code: 'assistant_unavailable',
      status: 503,
    });
  });
});

it('serves a fake voice session over HTTP and protects its event stream', async () => {
  const { spawn } = await import('node:child_process');
  const { HuspeeClient } = await import('@huspee/sdk');
  const { serverEnv } = await import('../setup/global-setup.js');
  const port = 44000 + Math.floor(Math.random() * 10000);
  const baseUrl = `http://localhost:${port}`;
  const server = spawn(process.execPath, ['dist/main.js'], {
    cwd: resolve(__dirname, '../../apps/api'),
    env: {
      ...serverEnv,
      PORT: String(port),
      PUBLIC_BASE_URL: baseUrl,
      ASSISTANT_VOICE_ENABLED: 'true',
      HOME: loginHome,
      ASSISTANT_CODEX_HOME: home,
      ASSISTANT_CODEX_BIN: resolve(__dirname, '../helpers/fake-codex/codex'),
      ASSISTANT_MAX_VOICE_SESSIONS: '1',
    },
    stdio: 'ignore',
  });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error('Fake voice API exited');
      try {
        if ((await fetch(`${baseUrl}/healthz`)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* Starting. */
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    expect(ready).toBe(true);
    const buyer = new HuspeeClient({ baseUrl, cookieJar: true });
    const other = new HuspeeClient({ baseUrl, cookieJar: true });
    await buyer.auth.login('an.nguyen@example.com', 'Password123!');
    await other.auth.login('binh.tran@example.com', 'Password123!');
    expect((await buyer.assistant.voices()).voices).toEqual(['spruce']);
    const started = await buyer.assistant.voice.start({ shop_id: 880001, sdp_offer: 'offer' });
    expect(started.sdp_answer).toBe('fake-answer');
    await expect(buyer.assistant.voice.start({ shop_id: 880001, sdp_offer: 'offer' })).rejects.toMatchObject({
      code: 'assistant_busy',
    });
    const forbidden = await fetch(other.assistant.voice.eventsUrl(started.conversation_id), {
      headers: { cookie: other.http.cookieHeader() ?? '' },
    });
    expect(forbidden.status).toBe(404);
    const controller = new AbortController();
    const response = await fetch(buyer.assistant.voice.eventsUrl(started.conversation_id), {
      headers: { cookie: buyer.http.cookieHeader() ?? '' },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    let data = '';
    const deadline = Date.now() + 5000;
    while (!data.includes('"type":"card"') && Date.now() < deadline) {
      const result = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Event timeout')), 5000)),
      ]);
      if (result.done) break;
      data += new TextDecoder().decode(result.value);
    }
    expect(data).toContain('"type":"transcript"');
    expect(data).toContain('"type":"tool"');
    expect(data).toContain('"type":"card"');
    await buyer.assistant.voice.stop(started.conversation_id);
    controller.abort();
    const textSession = await buyer.assistant.text.start({ shop_id: 880001, lang: 'vi' });
    await expect(other.assistant.voice.text(textSession.conversation_id, 'test')).rejects.toMatchObject({ status: 404 });
    await buyer.assistant.voice.text(textSession.conversation_id, 'Find a product');
    const textEvents = await fetch(buyer.assistant.voice.eventsUrl(textSession.conversation_id), { headers: { cookie: buyer.http.cookieHeader() ?? '' } });
    expect(textEvents.status).toBe(200);
    const textReader = textEvents.body!.getReader();
    let textData = '';
    while (!textData.includes('Verified product')) {
      const part = await Promise.race([textReader.read(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Text event timeout')), 5000))]);
      if (part.done) break;
      textData += new TextDecoder().decode(part.value);
    }
    expect(textData).toContain('Verified product');
    await buyer.assistant.voice.stop(textSession.conversation_id);
    await textReader.cancel();
    // Continuing a conversation is limited to the buyer who had it.
    await expect(other.assistant.text.start({ shop_id: 880001, resume_conversation_id: textSession.conversation_id })).rejects.toMatchObject({ status: 404 });
    const resumed = await buyer.assistant.text.start({ shop_id: 880001, resume_conversation_id: textSession.conversation_id });
    expect(resumed.conversation_id).not.toBe(textSession.conversation_id);
    await buyer.assistant.voice.stop(resumed.conversation_id);
  } finally {
    server.kill('SIGTERM');
  }
}, 30000);

describe('voice availability', () => {
  it('is on by default with Codex installed and logged in, and off when turned off or either is missing', async () => {
    const { voiceEnabled } = await import('../../apps/api/src/assistant/voice/voice-enabled.js');
    const saved = { enabled: process.env.ASSISTANT_VOICE_ENABLED, bin: process.env.ASSISTANT_CODEX_BIN, home: process.env.HOME };
    try {
      process.env.HOME = loginHome;
      delete process.env.ASSISTANT_VOICE_ENABLED;
      process.env.ASSISTANT_CODEX_BIN = resolve(__dirname, '../helpers/fake-codex/codex');
      expect(voiceEnabled()).toBe(true);
      process.env.ASSISTANT_VOICE_ENABLED = 'false';
      expect(voiceEnabled()).toBe(false);
      delete process.env.ASSISTANT_VOICE_ENABLED;
      process.env.ASSISTANT_CODEX_BIN = resolve(__dirname, '../helpers/fake-codex/missing-codex');
      expect(voiceEnabled()).toBe(false);
      process.env.ASSISTANT_CODEX_BIN = 'huspee-no-such-codex';
      expect(voiceEnabled()).toBe(false);
      process.env.ASSISTANT_CODEX_BIN = resolve(__dirname, '../helpers/fake-codex/codex');
      // No login on the host and none in an unused private home.
      process.env.HOME = home;
      process.env.ASSISTANT_CODEX_HOME = resolve(home, 'unused-codex-home');
      expect(voiceEnabled()).toBe(false);
    } finally {
      process.env.HOME = saved.home;
      process.env.ASSISTANT_CODEX_HOME = home;
      if (saved.enabled === undefined) delete process.env.ASSISTANT_VOICE_ENABLED;
      else process.env.ASSISTANT_VOICE_ENABLED = saved.enabled;
      if (saved.bin === undefined) delete process.env.ASSISTANT_CODEX_BIN;
      else process.env.ASSISTANT_CODEX_BIN = saved.bin;
    }
  });
});
