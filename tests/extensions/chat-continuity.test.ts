import { afterAll, beforeAll, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CodexTransport } from '../../apps/api/src/assistant/voice/codex-transport.js';
import { VoiceRuntime } from '../../apps/api/src/assistant/voice/voice-runtime.js';
import { applyChannelEvent, scopeCallEvent, type TranscriptEntry } from '../../apps/web/src/components/assistant/transcript.js';
import { fakeCodexLoginHome } from '../helpers/codex-login.js';
import { collectConversationProducts } from '../../apps/web/src/components/assistant/conversation-products.js';

let home: string;
const original = { HOME: process.env.HOME, ASSISTANT_CODEX_HOME: process.env.ASSISTANT_CODEX_HOME, ASSISTANT_CODEX_BIN: process.env.ASSISTANT_CODEX_BIN };
beforeAll(async () => {
  home = await fakeCodexLoginHome();
  process.env.HOME = home;
  process.env.ASSISTANT_CODEX_HOME = resolve(home, 'runtime');
  process.env.ASSISTANT_CODEX_BIN = resolve(__dirname, '../helpers/fake-codex/codex');
});
afterAll(async () => {
  for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await rm(home, { recursive: true, force: true });
});
const config = { shopName: 'GlowUp', tone: 'FRIENDLY', greetingVi: 'Xin chào', greetingEn: 'Hello', voice: 'spruce' };
const ctx = { conversationId: 'shared-chat', buyerId: 1, shopId: 880002 };

it('rejects unsupported RPC names instead of silently accepting them in the fake transport', async () => {
  const transport = new CodexTransport();
  try {
    await transport.start();
    // CLI 0.166.0 ClientRequest.json uses snake_case here despite its camelCase schema title.
    await expect(transport.request('thread/injectItems', { threadId: 'missing', items: [] })).rejects.toThrow('Codex request failed');
  } finally { transport.close(); }
});

it('lists only tool-returned products, merging text and voice provenance by catalog identity', () => {
  const laRoche = { kind: 'product' as const, item_id: 2000201, name: 'La Roche', image: '/la-roche.jpg', models: [] };
  const cocoon = { kind: 'product' as const, item_id: 2000202, name: 'Cocoon', image: '/cocoon.jpg', models: [] };
  let products = collectConversationProducts([], laRoche, 'text');
  products = collectConversationProducts(products, cocoon, 'voice');
  products = collectConversationProducts(products, laRoche, 'voice');
  products = collectConversationProducts(products, { kind: 'cart', total: 1, lines: [{ item_id: 2000201, model_id: 1, name: 'La Roche', quantity: 1, price: 1 }] }, 'text');
  expect(products).toEqual([
    { item_id: 2000201, name: 'La Roche', image: '/la-roche.jpg', sources: ['text', 'voice'] },
    { item_id: 2000202, name: 'Cocoon', image: '/cocoon.jpg', sources: ['voice'] },
  ]);
  expect(collectConversationProducts(products, { kind: 'handoff', ticket_id: 1 }, 'text')).toBe(products);
});
async function until(predicate: () => boolean) {
  const end = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Fake app-server event timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}
function harness() {
  const events: Record<string, unknown>[] = [], saved: Array<{ role: string; text: string }> = [], ended: string[] = [];
  let turns = 0;
  const runtime = new VoiceRuntime({ specs: () => [], run: async () => ({ success: true, text: 'Verified' }) }, async (_ctx, role, text) => { saved.push({ role, text }); }, async (ctx) => { ended.push(ctx.conversationId); });
  runtime.onTurnCompleted = () => { turns++; };
  const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  const transport = (runtime as unknown as { transport: { request(method: string, params: Record<string, unknown>): Promise<unknown> } }).transport;
  const request = transport.request.bind(transport);
  transport.request = (method, params) => { requests.push({ method, params: structuredClone(params) }); return request(method, params); };
  return { runtime, events, saved, ended, requests, turns: () => turns };
}

it('keeps La Roche text, Cocoon speech and subsequent text on one model thread and conversation', async () => {
  const h = harness();
  try {
    await h.runtime.startText(ctx, config);
    h.runtime.subscribe(ctx.conversationId, ctx.buyerId, (event) => h.events.push(event));
    await h.runtime.text(ctx.conversationId, ctx.buyerId, 'Does the shop have a discount for La Roche?');
    await until(() => h.turns() === 1);
    const call = await h.runtime.startCall(ctx.conversationId, ctx.buyerId, 'continuity-offer');
    await until(() => h.saved.some((item) => item.text.includes('Cocoon')));
    await h.runtime.stopCall(ctx.conversationId, ctx.buyerId, call.call_id);
    expect(h.ended).toEqual([]);
    expect(h.events.filter((event) => event.type === 'error')).toEqual([]);
    expect(h.runtime.poll(ctx.conversationId, ctx.buyerId, 0).closed).toBe(false);
    await h.runtime.text(ctx.conversationId, ctx.buyerId, 'CONTINUITY_RECALL');
    await until(() => h.turns() === 2);
    expect(h.saved).toContainEqual({ role: 'assistant', text: 'La Roche and Cocoon' });
    const firstThread = h.requests.find((r) => r.method === 'turn/start')!.params.threadId;
    expect(h.requests.filter((r) => r.method === 'thread/start')).toHaveLength(1);
    expect(h.requests.filter((r) => ['turn/start', 'thread/realtime/start', 'thread/inject_items'].includes(r.method)).every((r) => r.params.threadId === firstThread)).toBe(true);
    expect(JSON.stringify(h.requests.find((r) => r.method === 'thread/realtime/start')!.params.initialItems)).toContain('La Roche');
    expect(JSON.stringify(h.requests.find((r) => r.method === 'thread/inject_items')!.params.items)).toContain('Cocoon');
    expect(h.requests.filter((r) => r.method === 'thread/unsubscribe')).toHaveLength(0);
    const next = await h.runtime.startCall(ctx.conversationId, ctx.buyerId, 'continuity-offer');
    expect(next.call_id).not.toBe(call.call_id);
    const stops = h.requests.filter((r) => r.method === 'thread/realtime/stop').length;
    await h.runtime.stopCall(ctx.conversationId, ctx.buyerId, call.call_id);
    expect(h.requests.filter((r) => r.method === 'thread/realtime/stop')).toHaveLength(stops);
    await h.runtime.stopCall(ctx.conversationId, ctx.buyerId, next.call_id);
    await h.runtime.stop(ctx.conversationId, ctx.buyerId);
    expect(h.ended).toEqual([ctx.conversationId]);
  } finally { h.runtime.close(); }
});

it('keeps chat usable after failed or cancelled calls and refuses concurrent or foreign joins', async () => {
  const h = harness();
  try {
    await h.runtime.startText(ctx, config);
    await expect(h.runtime.startCall(ctx.conversationId, 999, 'offer')).rejects.toThrow('not_found');
    await expect(h.runtime.stopCall(ctx.conversationId, 999)).rejects.toThrow('not_found');
    await expect(h.runtime.startCall(ctx.conversationId, ctx.buyerId, 'failed-offer')).rejects.toThrow();
    const pending = h.runtime.startCall(ctx.conversationId, ctx.buyerId, 'delayed-offer');
    const cancelled = expect(pending).rejects.toThrow('call_cancelled');
    await until(() => h.requests.some((r) => r.method === 'thread/realtime/start' && JSON.stringify(r.params).includes('delayed-offer')));
    await expect(h.runtime.startCall(ctx.conversationId, ctx.buyerId, 'offer')).rejects.toThrow('assistant_busy');
    await h.runtime.stopCall(ctx.conversationId, ctx.buyerId);
    await cancelled;
    await h.runtime.text(ctx.conversationId, ctx.buyerId, 'La Roche is still in this chat');
    await expect(h.runtime.startCall(ctx.conversationId, ctx.buyerId, 'offer')).rejects.toThrow('assistant_busy');
    await until(() => h.turns() === 1);
    expect(h.ended).toEqual([]);
    const final = await h.runtime.startCall(ctx.conversationId, ctx.buyerId, 'continuity-offer');
    await h.runtime.stopCall(ctx.conversationId, ctx.buyerId, final.call_id);
    expect(h.runtime.poll(ctx.conversationId, ctx.buyerId, 0).closed).toBe(false);
  } finally { h.runtime.close(); }
});

it('retains text and voice transcript entries when a later call reuses the same turn ID', () => {
  let entries: TranscriptEntry[] = [{ id: 'text-1', role: 'user', text: 'La Roche', final: true }];
  for (const [call, text] of [['first', 'Cocoon'], ['second', 'Both products']]) {
    entries = applyChannelEvent(entries, scopeCallEvent({ type: 'turn.created', turn: { id: 'same-id', role: 'user', transcript: '' } }, call!), 100);
    entries = applyChannelEvent(entries, scopeCallEvent({ type: 'turn.done', turn: { id: 'same-id', role: 'user', transcript: text! } }, call!), 200);
  }
  expect(entries.map((item) => item.text)).toEqual(['La Roche', 'Cocoon', 'Both products']);
  expect(new Set(entries.map((item) => item.id)).size).toBe(3);
});

it('retries unsynced voice history and delivers an in-flight checked reply as text after hangup', async () => {
  const h = harness();
  try {
    await h.runtime.startText(ctx, config);
    h.runtime.subscribe(ctx.conversationId, ctx.buyerId, (event) => h.events.push(event));
    const call = await h.runtime.startCall(ctx.conversationId, ctx.buyerId, 'continuity-offer');
    await until(() => h.saved.some((item) => item.text.includes('Cocoon')));
    const internals = h.runtime as unknown as {
      transport: { request(method: string, params: Record<string, unknown>): Promise<unknown> };
      handle(message: unknown): Promise<void>;
    };
    const threadId = h.requests.find((r) => r.method === 'thread/realtime/start')!.params.threadId;
    await internals.handle({ method: 'turn/started', params: { threadId, turn: { id: 'pending-reply' } } });
    await internals.handle({ method: 'item/completed', params: { threadId, item: { type: 'agentMessage', text: 'Let me help with Cocoon.' } } });
    const request = internals.transport.request.bind(internals.transport);
    let fail = true;
    internals.transport.request = (method, params) => {
      if (method === 'thread/inject_items' && fail) { fail = false; return Promise.reject(new Error('Transient sync failure')); }
      return request(method, params);
    };
    await h.runtime.stopCall(ctx.conversationId, ctx.buyerId, call.call_id);
    await internals.handle({ method: 'turn/completed', params: { threadId, turn: { id: 'pending-reply', status: 'completed' } } });
    expect(h.events).toContainEqual(expect.objectContaining({ type: 'transcript', role: 'assistant', text: 'Let me help with Cocoon.', source: 'text' }));
    await h.runtime.text(ctx.conversationId, ctx.buyerId, 'CONTINUITY_RECALL');
    await until(() => h.turns() === 1);
    expect(h.saved).toContainEqual({ role: 'assistant', text: 'Cocoon' });
    expect(h.ended).toEqual([]);
  } finally { h.runtime.close(); }
});
