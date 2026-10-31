import { describe, expect, it } from 'vitest';
import type { AssistantConversationDetail, HandoffMessage } from '@huspee/sdk';
import {
  conversationOverview,
  outcomeOf,
  toolEntries,
  transcriptEntries,
  type ToolCall,
} from '../../apps/seller-web/src/components/assistant-review/conversation-log.js';
import { parseHandoffBody, threadItems, ticketState } from '../../apps/seller-web/src/components/assistant-review/handoff.js';
import { elapsed, formatDay } from '../../apps/seller-web/src/components/assistant-review/time.js';

let nextId = 1;
const call = (tool: string, at: number, result: Record<string, unknown>, args: unknown = {}, success = true): ToolCall => ({
  id: nextId++,
  tool,
  args,
  result: { success, ...result },
  success,
  error: success ? null : String(result.text ?? 'failed'),
  latency_ms: 5,
  created_at: at,
});
const message = (id: number, role: 'USER' | 'ASSISTANT', text: string, at: number) => ({ id, role, text, created_at: at });
const productCard = (name: string, prices: number[]) => ({
  kind: 'product',
  item_id: 2000101,
  name,
  image: null,
  models: prices.map((price, i) => ({ model_id: 3000101 + i, name: `M${i}`, price, stock: 10 + i })),
});
const action = (id: string, type: string, status: string, total?: number) => ({
  kind: 'action',
  action: { action_id: id, type, status, requires_tap: type === 'PLACE_ORDER', summary: { title: 'Đặt hàng / Place order', lines: [], total } },
});
const log = (messages: AssistantConversationDetail['messages'], tool_calls: ToolCall[]) => ({ messages, tool_calls });

describe('seller inbox handoff tickets', () => {
  it('splits the assistant handoff into question, reason and excerpt', () => {
    const body = 'Shop có gói quà không?\n\nReason: Không có trong FAQ.\n\nUSER: Có gói quà không?\nASSISTANT: Mình gửi cho shop nhé.\nhai dòng\nUSER: Ừ.';
    expect(parseHandoffBody(body)).toEqual({
      question: 'Shop có gói quà không?',
      reason: 'Không có trong FAQ.',
      excerpt: [
        { role: 'buyer', text: 'Có gói quà không?' },
        { role: 'assistant', text: 'Mình gửi cho shop nhé.\nhai dòng' },
        { role: 'buyer', text: 'Ừ.' },
      ],
    });
    expect(parseHandoffBody('Just a question')).toEqual({ question: 'Just a question', reason: null, excerpt: [] });
    expect(parseHandoffBody('Q\n\nReason: R\n\n').excerpt).toEqual([]);
  });

  it('marks the newest unread seller replies as not yet seen', () => {
    const messages: HandoffMessage[] = [
      { id: 1, ticket_id: 9, author: 'ASSISTANT', author_user_id: null, body: 'Q\n\nReason: R\n\nUSER: Q', created_at: 100 },
      { id: 2, ticket_id: 9, author: 'SELLER', author_user_id: 101, body: 'A1', created_at: 200 },
      { id: 3, ticket_id: 9, author: 'BUYER', author_user_id: 1, body: 'B', created_at: 300 },
      { id: 4, ticket_id: 9, author: 'SELLER', author_user_id: 101, body: 'A2', created_at: 400 },
    ];
    const items = threadItems(messages, 1);
    expect(items.map((item) => item.kind)).toEqual(['handoff', 'seller', 'buyer', 'seller']);
    expect(items.flatMap((item) => (item.kind === 'seller' ? [item.seen] : []))).toEqual([true, false]);
    expect(threadItems(messages, 0).filter((item) => item.kind === 'seller').every((item) => item.kind === 'seller' && item.seen)).toBe(true);
  });

  it('derives waiting, answered and closed states', () => {
    const last = { id: 1, ticket_id: 1, author_user_id: null, body: 'x', created_at: 500 };
    expect(ticketState({ status: 'OPEN', updated_at: 600, last_message: { ...last, author: 'ASSISTANT' } })).toEqual({ kind: 'waiting', since: 500 });
    expect(ticketState({ status: 'ANSWERED', updated_at: 900, last_message: { ...last, author: 'SELLER' } })).toEqual({ kind: 'answered', at: 500 });
    expect(ticketState({ status: 'CLOSED', updated_at: 900, last_message: null })).toEqual({ kind: 'closed' });
  });
});

describe('seller conversation review', () => {
  it('describes tool calls with names and values, never internal IDs', () => {
    const entries = toolEntries([
      call('get_product_details', 10, { card: productCard('iPhone 15', [18490000, 19990000]) }, { item_id: 2000101, requested_attributes: { color: 'Đen' } }),
      call('get_vouchers', 11, { text: JSON.stringify([{ code: 'TECH50K' }, { code: 'TECH10' }]) }),
      call('get_shipping_info', 12, { text: JSON.stringify({ channels: [{ name: 'SPX Express' }] }) }, { item_id: 2000102 }),
      call('add_to_cart', 13, { text: 'Product not found.' }, { item_id: 1, model_id: 2, quantity: 1 }, false),
      call('speech_check', 14, { text: '{}' }),
    ]);
    expect(entries.map((entry) => entry.tool)).toEqual(['get_product_details', 'get_vouchers', 'get_shipping_info', 'add_to_cart']);
    expect(entries[0]).toMatchObject({
      input: { products: ['iPhone 15'], attributes: ['Đen'] },
      output: { kind: 'product', name: 'iPhone 15', priceMin: 18490000, priceMax: 19990000, stock: 21, variants: 2 },
    });
    expect(entries[1]!.output).toEqual({ kind: 'vouchers', codes: ['TECH50K', 'TECH10'] });
    expect(entries[2]!.output).toEqual({ kind: 'shipping', channels: ['SPX Express'] });
    expect(entries[3]).toMatchObject({ success: false, output: { kind: 'failed' }, input: { quantity: 1 } });
    for (const entry of entries) expect(JSON.stringify(entry.input)).not.toMatch(/2000101|2000102|3000101/);
  });

  it('reports the furthest observed outcome', () => {
    const handoff = call('handoff_to_seller', 5, { card: { kind: 'handoff', ticket_id: 7 } }, { question: 'Q', reason: 'R' });
    const missing = call('search_products', 4, { card: { kind: 'products', items: [] }, missing: { attribute: 'Dung lượng', value: '512GB' } });
    const failed = call('get_cart', 3, { text: 'Requested data is unavailable.' }, {}, false);
    const quote = call('place_order', 6, { card: action('a1', 'PLACE_ORDER', 'PENDING', 10190000) }, { voucher_code: 'TECH10' });
    expect(outcomeOf([handoff, quote])).toEqual({ kind: 'order_quote', total: 10190000 });
    expect(outcomeOf([missing, handoff])).toEqual({ kind: 'handoff', ticketId: 7 });
    expect(outcomeOf([failed, missing])).toEqual({ kind: 'missing' });
    expect(outcomeOf([failed])).toEqual({ kind: 'unanswered' });
    expect(outcomeOf([call('get_vouchers', 1, { text: '[]' })])).toEqual({ kind: 'asked' });
    expect(outcomeOf([])).toEqual({ kind: 'none' });
  });

  it('summarizes the first question, products and turns for the list', () => {
    const overview = conversationOverview(
      log(
        [message(1, 'USER', '  Màu đen còn không? ', 1), message(2, 'ASSISTANT', 'Còn ạ', 2), message(3, 'USER', 'So với A55?', 3)],
        [
          call('get_product_details', 2, { card: productCard('iPhone 15', [1]) }),
          call('compare_products', 3, { card: { kind: 'compare', items: [{ name: 'iPhone 15' }, { name: 'Galaxy A55' }] } }),
          call('search_products', 4, { card: { kind: 'products', items: [{ name: 'A' }, { name: 'B' }] } }),
        ],
      ),
    );
    expect(overview).toEqual({ firstQuestion: 'Màu đen còn không?', products: ['iPhone 15', 'Galaxy A55'], turns: 2, outcome: { kind: 'asked' } });
  });

  it('orders the transcript with page context, merged action cards and speech corrections', () => {
    const entries = transcriptEntries(
      log(
        [
          message(1, 'USER', 'Màu đen còn không?', 10),
          message(2, 'ASSISTANT', 'Giá 9 triệu', 20),
          message(3, 'ASSISTANT', 'Mình nói chưa chính xác.', 21),
          message(4, 'USER', 'Thêm vào giỏ', 30),
        ],
        [
          call('get_viewed_product', 10, { card: productCard('iPhone 15', [1]) }),
          call('get_viewed_product', 15, { card: productCard('iPhone 15', [1]) }),
          call('speech_check', 20, { text: JSON.stringify({ kind: 'corrected', text: 'Giá 9 triệu', unsupported: ['9 triệu'], spoken: 'x' }) }),
          call('speech_check', 25, { text: JSON.stringify({ kind: 'blocked_unverified', text: 'Còn 99 máy', unsupported: ['99'], spoken: 'x' }) }),
          call('add_to_cart', 30, { card: action('c1', 'ADD_TO_CART', 'PENDING') }),
          call('confirm_action', 31, { card: action('c1', 'ADD_TO_CART', 'EXECUTED') }),
          call('handoff_to_seller', 32, { card: { kind: 'handoff', ticket_id: 3 } }),
        ],
      ),
    );
    expect(entries.map((entry) => entry.kind)).toEqual(['message', 'context', 'card', 'card', 'message', 'message', 'blocked', 'message', 'card', 'card']);
    expect(entries[1]).toMatchObject({ kind: 'context', product: 'iPhone 15' });
    expect(entries[4]).toMatchObject({ kind: 'message', text: 'Giá 9 triệu', flag: { kind: 'corrected', unsupported: ['9 triệu'] } });
    expect(entries[5]).not.toHaveProperty('flag');
    expect(entries[6]).toMatchObject({ kind: 'blocked', text: 'Còn 99 máy', flag: { kind: 'blocked', unsupported: ['99'] } });
    const cart = entries[8];
    expect(cart?.kind === 'card' && cart.card.kind === 'action' && cart.card.action.status).toBe('EXECUTED');
    expect(entries[9]).toMatchObject({ kind: 'card', card: { kind: 'handoff' } });
  });

  it('formats short days and waiting times', () => {
    const at = new Date(2026, 9, 31, 14, 30).getTime() / 1000;
    expect(formatDay(at, 'vi')).toBe('31/10');
    expect(formatDay(at, 'en')).toBe('10/31');
    expect(elapsed(at, at)).toEqual({ unit: 'minutes', value: 1 });
    expect(elapsed(at, at + 3 * 3600)).toEqual({ unit: 'hours', value: 3 });
    expect(elapsed(at, at + 2 * 86400)).toEqual({ unit: 'days', value: 2 });
  });
});
