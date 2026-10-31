import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, newBuyer, loginAs } from '../helpers/fixtures.js';

let client: Awaited<ReturnType<typeof newBuyer>>['client'];
let buyerId: number;
let conversationId: string;
const shopId = 880003;
const tee = { item_id: 2000301, model_id: 3000306 };
const run = <T>(name: string, args: unknown) => client.http.request<T>('POST', `/api/v1/assistant/_debug/tools/${name}`, { body: { conversation_id: conversationId, args } });
type Result = { success: boolean; text: string; response_language?: string; card?: { action: { action_id: string; status: string } } };

beforeAll(async () => {
  const buyer = await newBuyer();
  client = buyer.client;
  buyerId = (await db().query<{ id: number }>('SELECT id FROM users WHERE email = $1', [buyer.email])).rows[0]!.id;
  conversationId = randomUUID();
  await db().query("INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at) VALUES ($1, $2, $3, 'TEXT', 'ACTIVE', NOW())", [conversationId, shopId, buyerId]);
});

describe('agent tools without speech guessing', () => {
  it('lists public vouchers without claiming basket eligibility or hiding redemption restrictions', async () => {
    const voucher = (await db().query<{ id: number; start_time: Date; end_time: Date; current_usage: number; display_channels: number[] }>("SELECT id, start_time, end_time, current_usage, display_channels FROM vouchers WHERE shop_id = $1 AND code = 'STYLE30K'", [shopId])).rows[0]!;
    const listed = async () => JSON.parse((await run<Result>('get_vouchers', {})).text) as Array<Record<string, unknown>>;
    const style = (rows: Array<Record<string, unknown>>) => rows.find((row) => row.code === 'STYLE30K');
    try {
      expect(style(await listed())).toMatchObject({ discount_amount: 30000, min_spend: 300000, buyer_has_used: false, buyer_redemption_status: 'requires_basket_check', voucher_status: 'ongoing', per_buyer_limit: 1 });
      expect(style(await listed())).not.toHaveProperty('eligible');
      await db().query('UPDATE vouchers SET current_usage = usage_quantity WHERE id = $1', [voucher.id]);
      expect(style(await listed())).toMatchObject({ fully_redeemed: true, buyer_redemption_status: 'fully_redeemed' });
      expect(JSON.parse((await run<Result>('check_voucher', { voucher_code: 'STYLE30K' })).text)).toMatchObject({ status: 'not_redeemable', eligible: false, buyer_redemption_status: 'fully_redeemed', shortfall: null });
      await db().query("UPDATE vouchers SET current_usage = $1, start_time = NOW() + INTERVAL '1 day', end_time = NOW() + INTERVAL '2 days' WHERE id = $2", [voucher.current_usage, voucher.id]);
      expect(style(await listed())).toMatchObject({ voucher_status: 'upcoming', buyer_redemption_status: 'not_started' });
      expect(JSON.parse((await run<Result>('check_voucher', { voucher_code: 'STYLE30K' })).text)).toMatchObject({ status: 'not_redeemable', eligible: false, buyer_redemption_status: 'not_started' });
      await db().query("UPDATE vouchers SET start_time = TIMESTAMP '1999-01-01', end_time = TIMESTAMP '2000-01-01' WHERE id = $1", [voucher.id]);
      expect(style(await listed())).toBeUndefined();
      await db().query('UPDATE vouchers SET start_time = $1, end_time = $2, display_channels = ARRAY[3]::integer[] WHERE id = $3', [voucher.start_time, voucher.end_time, voucher.id]);
      expect(style(await listed())).toBeUndefined();
    } finally {
      await db().query('UPDATE vouchers SET start_time = $1, end_time = $2, current_usage = $3, display_channels = $4 WHERE id = $5', [voucher.start_time, voucher.end_time, voucher.current_usage, voucher.display_channels, voucher.id]);
    }
  });
  it('evaluates one versus two black XL shirts using their actual variant price', async () => {
    const one = await run<Result>('check_voucher', { voucher_code: 'STYLE30K', lines: [{ ...tee, quantity: 1 }] });
    expect(one.success).toBe(true);
    expect(JSON.parse(one.text)).toMatchObject({ eligible: false, items_subtotal: 189000, shortfall: 111000, discount: 0, scope: 'proposed_basket' });
    const two = await run<Result>('check_voucher', { voucher_code: 'STYLE30K', lines: [{ ...tee, quantity: 2 }] });
    expect(JSON.parse(two.text)).toMatchObject({ eligible: true, items_subtotal: 378000, shortfall: 0, discount: 30000 });
    const cart = await client.cart.get();
    expect(cart.shops).toHaveLength(0);
  });
  it('requires an exact basket and refuses phonetic codes, string quantities and cross-shop variants', async () => {
    const empty = await run<Result>('check_voucher', { voucher_code: 'STYLE30K' });
    expect(JSON.parse(empty.text)).toMatchObject({ status: 'needs_basket' });
    for (const args of [
      { voucher_code: 'STYLE30X', lines: [{ ...tee, quantity: 2 }] },
      { voucher_code: 'style ba mươi k', lines: [{ ...tee, quantity: 2 }] },
      { voucher_code: 'STYLE30K', lines: [{ ...tee, quantity: 'hai' }] },
      { voucher_code: 'STYLE30K', lines: [{ item_id: 2000101, model_id: 3000101, quantity: 1 }] },
      { voucher_code: 'STYLE30K', lines: [{ ...tee, quantity: 1 }, { ...tee, quantity: 1 }] },
    ]) expect((await run<Result>('check_voucher', args)).success).toBe(false);
  });
  it('rejects already-used vouchers and reads the current cart without changing it', async () => {
    await client.cart.addItem(tee.model_id, 2);
    const quote = await run<Result>('check_voucher', { voucher_code: 'STYLE30K' });
    expect(JSON.parse(quote.text)).toMatchObject({ scope: 'current_shop_cart', eligible: true, items_subtotal: 378000 });
    const voucher = (await db().query<{ id: number }>("SELECT id FROM vouchers WHERE shop_id = $1 AND code = 'STYLE30K'", [shopId])).rows[0]!;
    const order = await db().query<{ order_sn: string }>("SELECT order_sn FROM orders WHERE shop_id = $1 AND status <> 'CANCELLED' LIMIT 1", [shopId]);
    if (!order.rows[0]) throw new Error('Seeded shop order required');
    const previous = await db().query<{ buyer_id: number; voucher_id: number | null }>('SELECT buyer_id, voucher_id FROM orders WHERE order_sn = $1', [order.rows[0].order_sn]);
    try {
      await db().query('UPDATE orders SET buyer_id = $1, voucher_id = $2 WHERE order_sn = $3', [buyerId, voucher.id, order.rows[0].order_sn]);
      const used = await run<Result>('check_voucher', { voucher_code: 'STYLE30K' });
      expect(JSON.parse(used.text)).toMatchObject({ eligible: false, discount: 0, buyer_has_used: true, buyer_redemption_status: 'already_used', reason: 'This buyer has already used the voucher' });
      const listed = JSON.parse((await run<Result>('get_vouchers', {})).text);
      expect(listed).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'STYLE30K', discount_amount: 30000, min_spend: 300000, buyer_has_used: true, buyer_redemption_status: 'already_used', per_buyer_limit: 1 })]));
      for (const line of (await client.cart.get()).shops.flatMap((shop) => shop.items)) await client.cart.removeItem(line.cart_item_id);
      expect(JSON.parse((await run<Result>('check_voucher', { voucher_code: 'STYLE30K' })).text)).toMatchObject({ status: 'not_redeemable', eligible: false, buyer_redemption_status: 'already_used', shortfall: null });
    } finally {
      await db().query('UPDATE orders SET buyer_id = $1, voucher_id = $2 WHERE order_sn = $3', [previous.rows[0]!.buyer_id, previous.rows[0]!.voucher_id, order.rows[0].order_sn]);
      const cart = await client.cart.get();
      for (const line of cart.shops.flatMap((shop) => shop.items)) await client.cart.removeItem(line.cart_item_id);
    }
  });
  it('exposes exact model attributes and does not auto-select a vaguely similar product', async () => {
    const detail = await run<Result>('get_product_details', { item_id: tee.item_id });
    expect(JSON.parse(detail.text)).toMatchObject({
      tier_variations: expect.arrayContaining([{ name: 'Size', options: ['M', 'L', 'XL'] }]),
      models: expect.arrayContaining([expect.objectContaining({ model_id: tee.model_id, attributes: { 'Màu sắc': 'Đen', Size: 'XL' } })]),
    });
    const noGuess = await run<Result>('search_products', { query: 'Cotton Compact ZZZUNKNOWN' });
    expect(JSON.parse(noGuess.text)).toMatchObject({ items: [], total: 0, has_more: false });
    expect(noGuess.text).not.toContain('confidence');
    expect((await run<Result>('add_to_cart', { ...tee, quantity: 'hai' })).success).toBe(false);
  });
  it('lists the full seeded catalog in stable order and exposes pagination', async () => {
    const full = JSON.parse((await run<Result>('search_products', { query: '' })).text);
    expect(full).toMatchObject({ total: 20, offset: 0, limit: 50, has_more: false });
    expect(full.items).toHaveLength(20);
    expect(full.items.map((item: { item_id: number }) => item.item_id)).toEqual(full.items.map((item: { item_id: number }) => item.item_id).sort((a: number, b: number) => a - b));
    const page = JSON.parse((await run<Result>('search_products', { query: '', limit: 5, offset: 5 })).text);
    expect(page).toMatchObject({ total: 20, offset: 5, has_more: true });
    expect(page.items).toEqual(full.items.slice(5, 10));
    expect((await run<Result>('search_products', { query: '', requested_attributes: { color: 'black' } })).success).toBe(false);
  });
  it('does not count a selection-validation miss as seller demand for a missing option', async () => {
    const isolated = randomUUID();
    await db().query("INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at) VALUES ($1, $2, $3, 'TEXT', 'ACTIVE', NOW())", [isolated, shopId, buyerId]);
    const variant = (await db().query<{ id: number; stock: number }>('SELECT id, stock FROM models WHERE item_id = $1 AND id <> $2 LIMIT 1', [tee.item_id, tee.model_id])).rows[0]!;
    try {
      await db().query('UPDATE models SET stock = 0 WHERE id = $1', [variant.id]);
      const result = await client.http.request<Result & { validation_miss?: unknown; missing?: unknown }>('POST', '/api/v1/assistant/_debug/tools/get_product_details', { body: { conversation_id: isolated, args: { item_id: tee.item_id, requested_attributes: { color: 'black' } } } });
      expect(result.validation_miss).toEqual({ attribute: 'color', value: 'black' });
      expect(result.missing).toBeUndefined();
      const seller = await loginAs('tuan.saigonstyle@example.com');
      const insights = await seller.seller.assistant.insights(shopId);
      expect(insights.missing_requests.some((row) => row.conversation_id === isolated)).toBe(false);
    } finally { await db().query('UPDATE models SET stock = $1 WHERE id = $2', [variant.stock, variant.id]); }
  });
  it('matches checkout availability and does not suggest more spend for unrelated failures', async () => {
    const model = (await db().query<{ stock: number }>('SELECT stock FROM models WHERE id = $1', [tee.model_id])).rows[0]!;
    const voucher = (await db().query<{ id: number; end_time: Date; current_usage: number; display_channels: number[] }>("SELECT id, end_time, current_usage, display_channels FROM vouchers WHERE shop_id = $1 AND code = 'STYLE30K'", [shopId])).rows[0]!;
    const shop = (await db().query<{ holiday_mode: boolean }>('SELECT holiday_mode FROM shops WHERE id = $1', [shopId])).rows[0]!;
    try {
      await db().query('UPDATE models SET stock = 0 WHERE id = $1', [tee.model_id]);
      expect(JSON.parse((await run<Result>('check_voucher', { voucher_code: 'STYLE30K', lines: [{ ...tee, quantity: 2 }] })).text)).toMatchObject({ eligible: false, items_subtotal: 0, requested_items_subtotal: 378000, can_fulfill: false, shortfall: null });
      await db().query('UPDATE models SET stock = $1 WHERE id = $2', [model.stock, tee.model_id]);
      await db().query('UPDATE shops SET holiday_mode = true WHERE id = $1', [shopId]);
      expect(JSON.parse((await run<Result>('check_voucher', { voucher_code: 'STYLE30K', lines: [{ ...tee, quantity: 2 }] })).text)).toMatchObject({ can_fulfill: false, eligible: false, shortfall: null });
      await db().query('UPDATE shops SET holiday_mode = $1 WHERE id = $2', [shop.holiday_mode, shopId]);
      await db().query("UPDATE vouchers SET end_time = TIMESTAMP '2000-01-01' WHERE id = $1", [voucher.id]);
      expect(JSON.parse((await run<Result>('check_voucher', { voucher_code: 'STYLE30K', lines: [{ ...tee, quantity: 1 }] })).text)).toMatchObject({ eligible: false, shortfall: null });
      await db().query('UPDATE vouchers SET end_time = $1, current_usage = usage_quantity WHERE id = $2', [voucher.end_time, voucher.id]);
      expect(JSON.parse((await run<Result>('check_voucher', { voucher_code: 'STYLE30K', lines: [{ ...tee, quantity: 1 }] })).text)).toMatchObject({ eligible: false, shortfall: null });
      await db().query('UPDATE vouchers SET current_usage = $1, display_channels = ARRAY[3]::integer[] WHERE id = $2', [voucher.current_usage, voucher.id]);
      await client.cart.addItem(tee.model_id, 2);
      expect((await run<Result>('check_voucher', { voucher_code: 'STYLE30K' })).success).toBe(false);
      expect((await run<Result>('place_order', { voucher_code: 'STYLE30K' })).success).toBe(false);
    } finally {
      await db().query('UPDATE models SET stock = $1 WHERE id = $2', [model.stock, tee.model_id]);
      await db().query('UPDATE shops SET holiday_mode = $1 WHERE id = $2', [shop.holiday_mode, shopId]);
      await db().query('UPDATE vouchers SET end_time = $1, current_usage = $2, display_channels = $3 WHERE id = $4', [voucher.end_time, voucher.current_usage, voucher.display_channels, voucher.id]);
      for (const line of (await client.cart.get()).shops.flatMap((shop) => shop.items)) await client.cart.removeItem(line.cart_item_id);
    }
  });
  it('sets language explicitly and cancels only the named action in this conversation', async () => {
    expect(await run<Result>('set_response_language', { language: 'en' })).toMatchObject({ success: true, response_language: 'en' });
    expect((await db().query<{ language: string }>('SELECT language FROM conversations WHERE id = $1', [conversationId])).rows[0]!.language).toBe('en');
    const pending = await run<Result>('add_to_cart', { ...tee, quantity: 1 });
    expect(pending.success).toBe(true);
    expect(pending.text).toContain('Ready to add');
    expect((await run<Result>('confirm_action', {})).success).toBe(false);
    const cancelled = await run<Result>('cancel_action', { action_id: pending.card!.action.action_id });
    expect(cancelled.card?.action.status).toBe('CANCELLED');
    expect((await run<Result>('confirm_action', { action_id: pending.card!.action.action_id })).success).toBe(false);
    expect((await run<Result>('cancel_action', { action_id: randomUUID() })).success).toBe(false);
  });
});
