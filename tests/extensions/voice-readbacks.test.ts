import { describe, expect, it, vi } from 'vitest';
import { VoiceRuntime } from '../../apps/api/src/assistant/voice/voice-runtime.js';
import { speechText } from '../../apps/api/src/assistant/voice/speech.js';

type Message = { id?: number; method?: string; params?: Record<string, unknown> };
type Output = { success: boolean; text: string; card: { kind: string; action: { action_id: string; requires_tap: boolean } } };
const prepared = (id: string, text: string, tap = false): Output => ({ success: true, text: `readback_vi: ${text}\nreadback_en: ${text}`, card: { kind: 'action', action: { action_id: id, requires_tap: tap } } });

/** A manually driven transport: no clock guesses about when a model finishes, and no Codex process. */
async function harness(output: () => Promise<Output>) {
  const runtime = new VoiceRuntime({ specs: () => [], run: output }, async () => undefined, async () => undefined);
  const transport = (runtime as unknown as { transport: { start(): Promise<void>; request(method: string, params: Record<string, unknown>): Promise<unknown>; send(message: unknown): void; close(): void; onMessage?: (message: Message) => void } }).transport;
  const speech: string[] = [];
  const replies: unknown[] = [];
  const turns: Record<string, unknown>[] = [];
  transport.start = async () => undefined;
  transport.close = () => undefined;
  transport.send = (message) => replies.push(message);
  transport.request = async (method, params) => {
    if (method === 'turn/start') turns.push(params);
    if (method === 'thread/start') return { thread: { id: 'thread' } };
    if (method === 'thread/realtime/start') queueMicrotask(() => emit('thread/realtime/sdp', { sdp: 'answer' }));
    if (method === 'thread/realtime/stop') queueMicrotask(() => emit('thread/realtime/closed'));
    if (method === 'thread/realtime/appendSpeech') speech.push(String(params.text));
    return {};
  };
  function emit(method: string, params: Record<string, unknown> = {}, id?: number) {
    transport.onMessage?.({ method, id, params: { threadId: 'thread', ...params } });
  }
  await runtime.start({ conversationId: 'conversation', buyerId: 1, shopId: 2 }, { shopName: 'Shop', tone: 'FRIENDLY', voice: 'spruce', greetingVi: 'Chào', greetingEn: 'Hi' }, 'offer');
  emit('thread/realtime/transcript/done', { role: 'user', text: 'Add these items' });
  emit('turn/started', { turn: { id: 'turn' } });
  const tool = (id: number) => emit('item/tool/call', { tool: 'add_cart_items', arguments: {} }, id);
  const finish = () => {
    emit('item/completed', { item: { type: 'agentMessage', text: 'Model paraphrase that must not repeat the action.' } });
    emit('turn/completed', { turn: { id: 'turn', status: 'completed' } });
  };
  return { runtime, speech, replies, turns, emit, tool, finish, stop: () => runtime.stop('conversation', 1).finally(() => runtime.close()) };
}

describe('prepared-action speech delivery', () => {
  it('silently retires a card during an edit and reads the replacement without a cancellation announcement', async () => {
    const h = await harness(async () => prepared('new', 'Updated refund with two photos.', true));
    const notify = vi.spyOn(h.runtime, 'notifyAction');
    try {
      h.runtime.action('conversation', { action_id: 'old', status: 'CANCELLED', requires_tap: true, summary: { title: 'Refund' } }, undefined, 'edit');
      expect(notify).toHaveBeenCalledWith('conversation', 'Refund: CANCELLED');
      h.runtime.action('conversation', { action_id: 'new', status: 'PENDING', requires_tap: true, summary: { title: 'Refund' } }, {
        text: 'New refund summary',
        readback: { vi: 'Updated refund with two photos.', en: 'Updated refund with two photos.', tap: true, actionId: 'new' },
      });
      await expect.poll(() => h.speech.length).toBe(1);
      await new Promise((resolve) => setImmediate(resolve));
      expect(h.turns).toHaveLength(0);
      h.finish();
      await expect.poll(() => h.turns.length).toBe(1);
      for (const id of ['cancellation-note', 'replacement-note']) {
        h.emit('turn/started', { turn: { id } });
        h.emit('item/completed', { item: { type: 'agentMessage', text: 'OK' } });
        h.emit('turn/completed', { turn: { id, status: 'completed' } });
        await new Promise((resolve) => setImmediate(resolve));
      }
      expect(h.turns).toHaveLength(2);
      expect(JSON.stringify(h.turns[1])).toContain('New refund summary');
      expect(h.speech).toEqual(['Updated refund with two photos. ' + speechText.confirmTap.vi]);
      expect(h.speech).not.toContain(speechText.cancelled.vi);
    } finally { notify.mockRestore(); await h.stop(); }
  });
  it.each([
    ['CANCEL_RETURN', speechText.returnCancelled.vi],
    ['ACCEPT_RETURN_OFFER', speechText.returnOfferAccepted.vi],
  ])('announces the actual %s outcome rather than opening another return', async (type, expected) => {
    const h = await harness(async () => prepared('unused', 'unused'));
    try {
      h.runtime.action('conversation', { type, action_id: 'action', status: 'EXECUTED', requires_tap: true, summary: { title: 'Refund action' }, result: { return_sn: 'RET' } });
      await expect.poll(() => h.speech.length).toBe(1);
      expect(h.speech).toEqual([expected]);
      expect(h.speech).not.toContain(speechText.returnOpened.vi);
    } finally { await h.stop(); }
  });
  it('sends the whole batch readback before the thread finishes and does not repeat it', async () => {
    const h = await harness(async () => prepared('batch', 'Product A, blue, quantity 1. Product B, large, quantity 2. Total 123000 VND.'));
    try {
      h.tool(1);
      await expect.poll(() => h.speech.length).toBe(1);
      expect(h.speech[0]).toBe('Product A, blue, quantity 1. Product B, large, quantity 2. Total 123000 VND. ' + speechText.confirm.vi);
      // No turn/completed notification has been sent yet.
      h.finish();
      await new Promise((resolve) => setImmediate(resolve));
      expect(h.speech).toHaveLength(1);
    } finally { await h.stop(); }
  });
  it('preserves separate action readbacks rather than overwriting the first one', async () => {
    let action = 0;
    const h = await harness(async () => prepared(String(++action), `Action ${action}`));
    try {
      h.tool(1); h.tool(2);
      await expect.poll(() => h.speech.length).toBe(2);
      expect(h.speech).toEqual(['Action 1 ' + speechText.confirm.vi, 'Action 2 ' + speechText.confirm.vi]);
      h.finish();
      await new Promise((resolve) => setImmediate(resolve));
      expect(h.speech).toHaveLength(2);
    } finally { await h.stop(); }
  });
  it('does not speak a late tool readback after the buyer supersedes its request', async () => {
    let resolveTool!: (output: Output) => void;
    const h = await harness(() => new Promise<Output>((resolve) => { resolveTool = resolve; }));
    try {
      h.tool(1);
      h.emit('thread/realtime/transcript/done', { role: 'user', text: 'Cancel that, show another product' });
      resolveTool(prepared('old', 'Obsolete selection'));
      await expect.poll(() => h.replies.length).toBe(1);
      expect(h.speech).toEqual([]);
    } finally { await h.stop(); }
  });
  it('does not ask for a tap when execution arrived before the tool finished returning', async () => {
    let resolveTool!: (output: Output) => void;
    const h = await harness(() => new Promise<Output>((resolve) => { resolveTool = resolve; }));
    try {
      h.tool(1);
      h.runtime.action('conversation', { action_id: 'order', status: 'EXECUTED', requires_tap: true, summary: { title: 'Order' }, result: { order_sn: 'SN' } });
      resolveTool(prepared('order', 'Stale order summary', true));
      await expect.poll(() => h.replies.length).toBe(1);
      expect(h.speech).toEqual([speechText.orderPlaced.vi]);
    } finally { await h.stop(); }
  });
});
