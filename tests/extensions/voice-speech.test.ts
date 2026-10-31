import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { speechText } from '../../apps/api/src/assistant/voice/speech.js';
import { VoiceRuntime } from '../../apps/api/src/assistant/voice/voice-runtime.js';
import { realtimeIdentity, voicePrompt } from '../../apps/api/src/assistant/voice/prompt.js';

describe('voice runtime delegates meaning to the agent', () => {
  const run = async (
    shopName: string,
    toolText: string,
    card?: { kind: string; action?: unknown },
    midway?: (runtime: VoiceRuntime, conversationId: string) => void,
    options: { handoffWait?: number; language?: 'vi' | 'en' } = {},
  ) => {
    const runtime = new VoiceRuntime(
      { specs: () => [], run: async () => ({ success: true, text: toolText, ...(options.language ? { response_language: options.language } : {}), ...(card ? { card } : {}) }) },
      async () => undefined,
      async () => undefined,
    );
    runtime.stallMs = options.handoffWait ?? 2500;
    const ctx = { conversationId: `speech-${shopName}`, buyerId: 1, shopId: 2 };
    const events: Record<string, unknown>[] = [];
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const transport = (runtime as unknown as { transport: { request: (method: string, params: Record<string, unknown>) => Promise<unknown> } }).transport;
    const request = transport.request.bind(transport);
    transport.request = (method, params) => {
      requests.push({ method, params });
      return request(method, params);
    };
    try {
      await runtime.start(ctx, { shopName, tone: 'FRIENDLY', greetingVi: 'Xin chào', greetingEn: 'Hello', voice: 'spruce' }, 'offer');
      runtime.subscribe(ctx.conversationId, 1, (event) => events.push(event));
      if (midway) setTimeout(() => midway(runtime, ctx.conversationId), 80);
      await new Promise((r) => setTimeout(r, 250));
      await runtime.stop(ctx.conversationId, 1);
    } finally {
      runtime.close();
    }
    const spoken = events.filter((e) => e.type === 'transcript' && e.role === 'assistant' && e.final).map((e) => e.text);
    return { spoken, events, requests };
  };

  it('speaks a verified thread answer', async () => {
    const { spoken } = await run('SPEECH_OK', '{"price":790000}');
    expect(spoken).toContain('Giá 790.000đ');
  });
  it('does not judge a delegated answer by matching its numbers against other tool values', async () => {
    const { spoken, events } = await run('SPEECH_BLOCKED', '{"price":790000}');
    expect(spoken).toContain('Giá 999.000đ');
    expect(events.some((event) => event.type === 'speech_check')).toBe(false);
  });
  it('recovers a missing protocol handoff without looking for acknowledgement keywords', async () => {
    const { requests } = await run('SPEECH_STALL', '{}', undefined, undefined, { handoffWait: 20 });
    expect(requests.some((request) => request.method === 'turn/start')).toBe(true);
  });
  it('does not re-delegate a request whose thread answer already completed', async () => {
    const { requests } = await run('SPEECH_OK', '{}', undefined, undefined, { handoffWait: 100 });
    expect(requests.some((request) => request.method === 'turn/start')).toBe(false);
  });
  it('uses the explicitly selected language for app readbacks, without detecting accents', async () => {
    const text = 'readback_vi: Sẵn sàng thêm.\nreadback_en: Ready to add.';
    const { spoken } = await run('SPEECH_OK', text, { kind: 'action', action: { requires_tap: false } }, undefined, { language: 'en' });
    expect(spoken).toContain('Ready to add. ' + speechText.confirm.en);
  });
  it('speaks the server read-back instead of the model wording', async () => {
    const text = 'Action ID (do not read aloud): a1\nreadback_vi: Thêm vào giỏ hàng. Sản phẩm: Tai nghe; Số lượng: 1. Tổng cộng: 790000 VND.\nreadback_en: Add to cart. Item: Earbuds; Quantity: 1. Total: 790000 VND.';
    const { spoken } = await run('SPEECH_OK', text, { kind: 'action', action: { requires_tap: false } });
    expect(spoken).toEqual([`Thêm vào giỏ hàng. Sản phẩm: Tai nghe; Số lượng: 1. Tổng cộng: 790000 VND. ${speechText.confirm.vi}`]);
  });
  it('a tap while the thread is still answering drops its stale "please tap" and tells the thread', async () => {
      const text = 'Action ID (do not read aloud): a1\nreadback_vi: Đặt hàng. Tai nghe x 1. Tổng cộng: 790000 VND.\nreadback_en: Place order. Earbuds x 1. Total: 790000 VND.';
      const { spoken, requests } = await run('SPEECH_TAP', text, { kind: 'action', action: { requires_tap: true } }, (runtime, id) =>
        runtime.action(id, { status: 'EXECUTED', requires_tap: true, summary: { title: 'Order confirmed' }, result: { order_sn: 'SN1' } }),
        { handoffWait: 200 },
      );
      expect(spoken).toContain(speechText.orderPlaced.vi);
      expect(spoken.join(' ')).not.toContain(speechText.confirmTap.vi);
      expect(spoken.join(' ')).not.toContain('Giá 790.000đ');
      const note = requests.find((r) => r.method === 'turn/start' && JSON.stringify(r.params).includes('[App] Order confirmed: EXECUTED'));
      expect(note).toBeDefined();
      // The note waits for the thread's running turn instead of racing it.
      expect(requests.indexOf(note!)).toBeGreaterThan(requests.findIndex((r) => r.method === 'thread/realtime/appendText'));
      expect(spoken).not.toContain('OK');
      expect(requests.filter((request) => request.method === 'turn/start' && !JSON.stringify(request.params).includes('[App]'))).toHaveLength(0);
    });
  it('preserves a replacement order readback when the agent cancels the old order', async () => {
    const text = 'readback_vi: Sẵn sàng đặt lại hai áo.\nreadback_en: Ready to order two shirts.';
    const { spoken, requests } = await run('SPEECH_TAP', text, { kind: 'action', action: { action_id: 'new', requires_tap: true } }, (runtime, id) =>
      runtime.action(id, { action_id: 'old', status: 'CANCELLED', requires_tap: true, summary: { title: 'Old order' } }, undefined, 'agent'),
    );
    expect(spoken).toContain('Sẵn sàng đặt lại hai áo. ' + speechText.confirmTap.vi);
    expect(spoken).not.toContain(speechText.cancelled.vi);
    expect(requests.some((request) => request.method === 'turn/start' && JSON.stringify(request.params).includes('[App]'))).toBe(false);
  });
  it('delivers typed input after a tap even when a silent app-note turn intervenes', async () => {
    const { spoken, requests } = await run('SPEECH_TAP', '{}', undefined, (runtime, id) => {
      runtime.action(id, { status: 'EXECUTED', requires_tap: true, summary: { title: 'Order' }, result: { order_sn: 'SN1' } });
      void runtime.text(id, 1, 'Show me another product');
    }, { handoffWait: 10 });
    expect(spoken).toContain('Final answer');
    expect(requests.some((request) => request.method === 'turn/start' && JSON.stringify(request.params).includes('Show me another product'))).toBe(true);
  });
  it.each(['FAILED', 'EMPTY'])('reports a failed or empty delegated turn instead of silently abandoning it: %s', async (kind) => {
    const { events, spoken } = await run('SPEECH_' + kind, '{}', undefined, undefined, { handoffWait: 100 });
    expect(events.some((event) => event.type === 'error')).toBe(true);
    expect(spoken).toContain(speechText.replyUnavailable.vi);
  });
  it('speaking over a running answer stops it and answers the new question instead', async () => {
      const { spoken, requests } = await run('SPEECH_BARGE', '{"price":790000}');
      expect(requests).toContainEqual({ method: 'turn/interrupt', params: { threadId: expect.any(String), turnId: 'v-turn' } });
      expect(spoken).not.toContain('Giá 790.000đ');
      const next = requests.filter((r) => r.method === 'turn/start').at(-1);
      expect(JSON.stringify(next?.params)).toContain('sạc dự phòng');
      expect(spoken).toContain('Final answer');
    });
  it('does not interrupt a handed-off turn whose question is transcribed after it starts', async () => {
    const { spoken, requests } = await run('SPEECH_EARLY', '{"price":790000}');
    expect(requests.some((r) => r.method === 'turn/interrupt')).toBe(false);
    expect(spoken).toContain('Giá 790.000đ');
  });
  it('asks for the tap alone on orders and returns, not a spoken yes', () => {
    expect(speechText.confirmTap.vi).not.toContain('đồng ý');
    expect(speechText.confirmTap.en).not.toMatch(/say yes/);
  });
  it.each(['OWN', 'PERSONA', 'NOSHOP', 'STALL'])('does not classify or rewrite the voice using wording rules: %s', async (kind) => {
    const { events, requests } = await run('SPEECH_' + kind, '{"price":790000}', undefined, undefined, { handoffWait: 20 });
    expect(events.some((event) => event.type === 'speech_check')).toBe(false);
    expect(requests.filter((request) => request.method === 'turn/start')).toHaveLength(1);
  });
  it('gives a continued conversation its earlier messages as context, not as facts', () => {
    const config = { shopName: 'TechZone', tone: 'FRIENDLY', greetingVi: 'Chào', greetingEn: 'Hi', history: [{ role: 'user' as const, text: 'Tai nghe giá bao nhiêu?' }] };
    for (const prompt of [voicePrompt(config), realtimeIdentity(config)]) {
      expect(prompt).toContain('Buyer: Tai nghe giá bao nhiêu?');
      expect(prompt).toContain('check them again with tools');
    }
    expect(voicePrompt({ ...config, history: undefined })).not.toContain('continuing an earlier conversation');
  });
});

let home: string;
beforeAll(async () => {
  home = await mkdtemp(resolve(tmpdir(), 'huspee-speech-test-'));
  process.env.ASSISTANT_CODEX_HOME = home;
  process.env.ASSISTANT_CODEX_BIN = resolve(__dirname, '../helpers/fake-codex/codex');
});
afterAll(async () => {
  delete process.env.ASSISTANT_CODEX_HOME;
  delete process.env.ASSISTANT_CODEX_BIN;
  await rm(home, { recursive: true, force: true });
});
