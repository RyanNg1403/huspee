import { describe, expect, it } from 'vitest';
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
  transport.start = async () => undefined;
  transport.close = () => undefined;
  transport.send = (message) => replies.push(message);
  transport.request = async (method, params) => {
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
  return { runtime, speech, replies, emit, tool, finish, stop: () => runtime.stop('conversation', 1).finally(() => runtime.close()) };
}

describe('prepared-action speech delivery', () => {
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
