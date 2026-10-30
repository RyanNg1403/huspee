import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { checkSpeech, detectLanguage, extractNumbers, speechText, statesFact } from '../../apps/api/src/assistant/voice/speech-check.js';
import { VoiceRuntime, voiceOutputMode, type SpeechLog } from '../../apps/api/src/assistant/voice/voice-runtime.js';
import { realtimeIdentity, voicePrompt } from '../../apps/api/src/assistant/voice/prompt.js';

const evidence = [
  '{"name":"Apple iPhone 15 128GB Chính Hãng VN/A","models":[{"name":"Đen","price":18490000,"stock":25},{"name":"Hồng","price":18490000,"stock":12}]}',
  '{"code":"TECH50K","discount":50000,"min_spend":500000}',
];

describe('speech check', () => {
  it('parses written Vietnamese and English amounts', () => {
    expect(extractNumbers('18.490.000₫, 18,490,000 VND, 790k, 1,5 triệu').map((n) => n.value)).toEqual([18490000, 18490000, 790000, 1500000]);
    expect(extractNumbers('tổng 1 triệu 580 nghìn đồng, phí 15 nghìn').map((n) => n.value)).toEqual([1580000, 15000]);
    expect(extractNumbers('2 million 500 thousand').map((n) => n.value)).toEqual([2500000]);
  });
  it('accepts facts from evidence, names, totals and quantity x price', () => {
    expect(checkSpeech('iPhone 15 128GB màu Đen còn 25 máy, giá 18.490.000₫; tổng 37 máy; hai máy 36.980.000đ; mã TECH50K giảm 50k.', evidence)).toEqual({ ok: true, unsupported: [] });
  });
  it('rejects invented prices and codes', () => {
    expect(checkSpeech('Màu tím giá 17.990.000₫, dùng mã TECH80K.', evidence).unsupported).toEqual(['17.990.000', '80k', 'TECH80K', 'tím']);
    expect(checkSpeech('Có màu đen và màu hồng.', evidence).ok).toBe(true);
    expect(checkSpeech('It comes in black and blue.', evidence).unsupported).toEqual(['blue']);
  });
  it('tells acknowledgements from statements of fact', () => {
    for (const text of ['Dạ, để mình xem nhé.', 'Let me check that for you.', 'Ok, để mình xác nhận.']) expect(statesFact(text)).toBe(false);
    for (const text of ['Không, iPhone 15 không có màu tím.', 'Còn hàng bạn nhé.', 'Shipping is free.', 'Giá 790k.', 'Dùng mã TECH50K.'])
      expect(statesFact(text)).toBe(true);
  });
  it('detects the buyer language', () => {
    expect(detectLanguage('How much is the black one?')).toBe('en');
    expect(detectLanguage('bao nhiêu tiền')).toBe('vi');
    expect(detectLanguage(undefined)).toBe('vi');
  });
});

describe('voice runtime speaks only checked answers', () => {
  const run = async (shopName: string, toolText: string, card?: { kind: string; action?: unknown }, output = 'checked') => {
    process.env.ASSISTANT_VOICE_OUTPUT = output;
    const logs: SpeechLog[] = [];
    const runtime = new VoiceRuntime(
      { specs: () => [], run: async () => ({ success: true, text: toolText, ...(card ? { card } : {}) }) },
      async () => undefined,
      async () => undefined,
    );
    runtime.onSpeechCheck = (_ctx, log) => logs.push(log);
    runtime.stallMs = 20;
    const ctx = { conversationId: `speech-${shopName}`, buyerId: 1, shopId: 2 };
    const events: Record<string, unknown>[] = [];
    try {
      await runtime.start(ctx, { shopName, tone: 'FRIENDLY', greetingVi: 'Xin chào', greetingEn: 'Hello', voice: 'spruce' }, 'offer');
      runtime.subscribe(ctx.conversationId, 1, (event) => events.push(event));
      await new Promise((r) => setTimeout(r, 200));
      await runtime.stop(ctx.conversationId, 1);
    } finally {
      runtime.close();
      delete process.env.ASSISTANT_VOICE_OUTPUT;
    }
    const spoken = events.filter((e) => e.type === 'transcript' && e.role === 'assistant' && e.final).map((e) => e.text);
    return { logs, spoken, events };
  };

  it('speaks a verified thread answer', async () => {
    const { spoken, logs, events } = await run('SPEECH_OK', '{"price":790000}');
    expect(spoken).toEqual(['Giá 790.000đ']);
    expect(logs).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'speak', text: 'Giá 790.000đ', lang: 'vi' }),
    );
  });
  it('speaks the voice model acknowledgement but never its unprompted facts', async () => {
    const { spoken, logs, events } = await run('SPEECH_ACK', '{"price":790000}');
    expect(spoken).toEqual(['Dạ, để mình xem nhé.', 'Giá 790.000đ']);
    expect(logs).toEqual([]);
    expect(JSON.stringify(events)).not.toContain('Còn 3 máy');
  });
  it('drops a fact the voice model states without a lookup and asks the thread instead', async () => {
    const { spoken, logs, events } = await run('SPEECH_OWN', '{"price":790000}');
    expect(spoken).toEqual([speechText.checking.vi, 'Final answer']);
    expect(logs).toEqual([{ kind: 'blocked_unverified', text: 'Màu tím giá 17.990.000đ', unsupported: ['17.990.000', 'tím'], spoken: speechText.checking.vi }]);
    expect(JSON.stringify(events)).not.toContain('17.990.000');
  });
  it('sends the request on when the voice promises to check but never hands off', async () => {
    const { spoken, logs } = await run('SPEECH_STALL', '{"price":790000}');
    expect(spoken).toEqual(['Cảm ơn bạn, để mình chốt giúp nhé.', 'Final answer']);
    expect(logs).toEqual([]);
  });
  it('blocks an unverified answer, speaks the fallback and logs it', async () => {
    const { spoken, logs, events } = await run('SPEECH_BLOCKED', '{"price":790000}');
    expect(spoken).toEqual([speechText.fallback.vi]);
    expect(logs).toEqual([{ kind: 'blocked_unverified', text: 'Giá 999.000đ', unsupported: ['999.000'], spoken: speechText.fallback.vi }]);
    expect(events).toContainEqual({ type: 'speech_check', status: 'blocked' });
  });
  it('speaks the server read-back instead of the model wording', async () => {
    const text = 'Action ID (do not read aloud): a1\nreadback_vi: Thêm vào giỏ hàng. Sản phẩm: Tai nghe; Số lượng: 1. Tổng cộng: 790000 VND.\nreadback_en: Add to cart. Item: Earbuds; Quantity: 1. Total: 790000 VND.';
    const { spoken } = await run('SPEECH_OK', text, { kind: 'action', action: { requires_tap: false } });
    expect(spoken).toEqual([`Thêm vào giỏ hàng. Sản phẩm: Tai nghe; Số lượng: 1. Tổng cộng: 790000 VND. ${speechText.confirm.vi}`]);
  });
  it('codex output: corrects the voice out loud when it states an unverified fact itself', async () => {
    const { spoken, logs } = await run('SPEECH_OWN', '{"price":790000}', undefined, 'codex');
    expect(spoken).toContain(speechText.correction.vi);
    expect(logs[0]).toMatchObject({ kind: 'corrected', unsupported: ['17.990.000', 'tím'] });
  });
  it('codex output: an answer the voice gave itself as a general AI goes to the thread instead', async () => {
    const { spoken } = await run('SPEECH_PERSONA', '{"items":[]}', undefined, 'codex');
    // 'Final answer' only comes from a thread turn, which the voice itself never started here.
    expect(spoken).toContain('Final answer');
  });
  it('codex output: a short reply denying the shop also goes to the thread', async () => {
    const { spoken } = await run('SPEECH_NOSHOP', '{"items":[]}', undefined, 'codex');
    expect(spoken).toContain('Final answer');
  });
  it('gives a continued conversation its earlier messages as context, not as facts', () => {
    const config = { shopName: 'TechZone', tone: 'FRIENDLY', greetingVi: 'Chào', greetingEn: 'Hi', history: [{ role: 'user' as const, text: 'Tai nghe giá bao nhiêu?' }] };
    for (const prompt of [voicePrompt(config), realtimeIdentity(config)]) {
      expect(prompt).toContain('Buyer: Tai nghe giá bao nhiêu?');
      expect(prompt).toContain('check them again with tools');
    }
    expect(voicePrompt({ ...config, history: undefined })).not.toContain('continuing an earlier conversation');
  });
  it("defaults to Codex's own voice", () => {
    delete process.env.ASSISTANT_VOICE_OUTPUT;
    expect(voiceOutputMode()).toBe('codex');
    process.env.ASSISTANT_VOICE_OUTPUT = 'checked';
    expect(voiceOutputMode()).toBe('checked');
    delete process.env.ASSISTANT_VOICE_OUTPUT;
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
