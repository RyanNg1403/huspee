import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SEED } from '../helpers/env.js';
import { db, loginAs, newBuyer, newSellerWithShop, sessionClient } from '../helpers/fixtures.js';

const shopId = SEED.sellers.techzone.shopId;

describe('assistant platform extensions', () => {
  it('exposes public profile and restricts seller configuration to members', async () => {
    const anonymous = sessionClient();
    expect(await anonymous.assistant.profile(shopId)).toMatchObject({ shop_id: shopId, enabled: true });
    await expect(anonymous.seller.assistant.getConfig(shopId)).rejects.toMatchObject({ status: 401 });
    const otherSeller = await loginAs(SEED.sellers.glowup.email);
    await expect(otherSeller.seller.assistant.getConfig(shopId)).rejects.toMatchObject({ status: 403 });
    const seller = await loginAs(SEED.sellers.techzone.email);
    expect((await seller.seller.assistant.faqs.list(shopId)).length).toBeGreaterThanOrEqual(3);
  });

  it('rejects unauthenticated access to every protected core route', async () => {
    const anonymous = sessionClient();
    const id = '00000000-0000-4000-8000-000000000001';
    const seller = `/api/v1/seller/shops/${shopId}`;
    const routes: Array<[string, string]> = [
      ['GET', `/api/v1/assistant/actions/${id}/options`],
      ['PATCH', `/api/v1/assistant/actions/${id}`],
      ['POST', `/api/v1/assistant/actions/${id}/confirm`],
      ['POST', `/api/v1/assistant/actions/${id}/cancel`],
      ['GET', '/api/v1/buyer/messages'],
      ['GET', '/api/v1/buyer/messages/unread-count'],
      ['GET', '/api/v1/buyer/messages/1'],
      ['POST', '/api/v1/buyer/messages/1/replies'],
      ['GET', `${seller}/assistant/config`],
      ['PUT', `${seller}/assistant/config`],
      ['GET', `${seller}/assistant/faqs`],
      ['POST', `${seller}/assistant/faqs`],
      ['PUT', `${seller}/assistant/faqs/1`],
      ['DELETE', `${seller}/assistant/faqs/1`],
      ['GET', `${seller}/assistant/conversations`],
      ['GET', `${seller}/assistant/conversations/${id}`],
      ['GET', `${seller}/inbox`],
      ['GET', `${seller}/inbox/1`],
      ['POST', `${seller}/inbox/1/replies`],
      ['POST', `${seller}/inbox/1/close`],
    ];
    for (const [method, path] of routes) await expect(anonymous.http.request(method, path, { body: {} })).rejects.toMatchObject({ status: 401 });
  });

  it('enforces shop membership for every seller assistant and inbox route', async () => {
    const stranger = await loginAs(SEED.sellers.glowup.email);
    const id = '00000000-0000-4000-8000-000000000001';
    const seller = `/api/v1/seller/shops/${shopId}`;
    const routes: Array<[string, string]> = [
      ['GET', `${seller}/assistant/config`],
      ['PUT', `${seller}/assistant/config`],
      ['GET', `${seller}/assistant/faqs`],
      ['POST', `${seller}/assistant/faqs`],
      ['PUT', `${seller}/assistant/faqs/1`],
      ['DELETE', `${seller}/assistant/faqs/1`],
      ['GET', `${seller}/assistant/conversations`],
      ['GET', `${seller}/assistant/conversations/${id}`],
      ['GET', `${seller}/inbox`],
      ['GET', `${seller}/inbox/1`],
      ['POST', `${seller}/inbox/1/replies`],
      ['POST', `${seller}/inbox/1/close`],
    ];
    for (const [method, path] of routes) await expect(stranger.http.request(method, path, { body: {} })).rejects.toMatchObject({ status: 403 });
  });

  it('provides defaults and permits only members to manage config and FAQs', async () => {
    const { client, shopId: newShop } = await newSellerWithShop();
    expect(await client.assistant.profile(newShop)).toMatchObject({ enabled: true, voice: 'spruce' });
    expect(await client.seller.assistant.getConfig(newShop)).toMatchObject({ enabled: true, tone: 'FRIENDLY' });
    expect(await client.seller.assistant.updateConfig(newShop, { enabled: false, tone: 'PROFESSIONAL' })).toMatchObject({
      enabled: false,
      tone: 'PROFESSIONAL',
    });
    const faq = await client.seller.assistant.faqs.create(newShop, { question: 'Question?', answer: 'Answer.', lang: 'en', enabled: true });
    expect((await client.seller.assistant.faqs.update(newShop, faq.id, { answer: 'Updated.' })).answer).toBe('Updated.');
    expect(await client.seller.assistant.faqs.remove(newShop, faq.id)).toEqual({ deleted: true });
    await expect(client.seller.assistant.faqs.update(newShop, faq.id, { answer: 'No' })).rejects.toMatchObject({ status: 404 });
  });

  it('requires an exact pending action and uses catalog variant strings without aliases', async () => {
    const { client, email } = await newBuyer();
    const buyer = await db().query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
    const conversationId = randomUUID();
    await db().query('INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at) VALUES ($1, $2, $3, $4, $5, NOW())', [conversationId, shopId, buyer.rows[0]!.id, 'TEXT', 'ACTIVE']);
    const run = <T>(name: string, args: unknown) => client.http.request<T>('POST', `/api/v1/assistant/_debug/tools/${name}`, { body: { conversation_id: conversationId, args } });
    const missing = await run<{ validation_miss: { attribute: string; value: string } }>('get_product_details', { item_id: SEED.items.iphone.itemId, requested_attributes: { color: 'nonexistent-color-xyz' } });
    expect(missing.validation_miss).toEqual({ attribute: 'color', value: 'nonexistent-color-xyz' });
    const translated = await run<{ validation_miss?: unknown }>('get_product_details', { item_id: SEED.items.iphone.itemId, requested_attributes: { color: ' BLACK ' } });
    expect(translated.validation_miss).toEqual({ attribute: 'color', value: 'BLACK' });
    const exact = await run<{ validation_miss?: unknown }>('get_product_details', { item_id: SEED.items.iphone.itemId, requested_attributes: { 'Màu sắc': 'Đen' } });
    expect(exact.validation_miss).toBeUndefined();
    const capacity = await run<{ validation_miss?: unknown }>('get_product_details', { item_id: 2000102, requested_attributes: { 'Dung lượng': '128GB' } });
    expect(capacity.validation_miss).toBeUndefined();
    const variant = await db().query<{ tier_variation: Array<{ name: string; option_list: Array<{ option: string }> }>; tier_index: number[]; stock: number }>('SELECT i.tier_variation, m.tier_index, m.stock FROM items i JOIN models m ON m.item_id = i.id WHERE m.id = $1', [SEED.items.iphone.blackModel]);
    const row = variant.rows[0]!;
    const option = row.tier_variation[0]!.option_list[row.tier_index[0]!]!.option;
    try {
      await db().query('UPDATE models SET stock = 0 WHERE id = $1', [SEED.items.iphone.blackModel]);
      const unavailable = await run<{ out_of_stock?: boolean }>('get_product_details', { item_id: SEED.items.iphone.itemId, requested_attributes: { [row.tier_variation[0]!.name]: option } });
      expect(unavailable.out_of_stock).toBe(true);
    } finally {
      await db().query('UPDATE models SET stock = $1 WHERE id = $2', [row.stock, SEED.items.iphone.blackModel]);
    }
    const add = () => run<{ card: { action: { action_id: string } } }>('add_to_cart', { item_id: SEED.items.iphone.itemId, model_id: SEED.items.iphone.blackModel, quantity: 1 });
    const a = await add();
    const b = await add();
    const ids = [a.card.action.action_id, b.card.action.action_id].sort();
    await db().query('UPDATE pending_actions SET created_at = $1 WHERE id = ANY($2::uuid[])', [new Date('2026-01-01T00:00:00Z'), ids]);
    expect((await run<{ success: boolean }>('confirm_action', {})).success).toBe(false);
    expect((await run<{ success: boolean }>('confirm_action', { action_id: ids[1] })).success).toBe(true);
    const states = await db().query<{ id: string; status: string }>('SELECT id, status FROM pending_actions WHERE id = ANY($1::uuid[]) ORDER BY id', [ids]);
    expect(states.rows.map((row) => row.status)).toEqual(['PENDING', 'EXECUTED']);
  });

  it('shows buyers only their own past conversations, with stored cards and the full product card', async () => {
    const { client, email } = await newBuyer();
    const other = await newBuyer();
    const buyer = await db().query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
    const conversationId = randomUUID();
    await db().query('INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at) VALUES ($1, $2, $3, $4, $5, NOW())', [conversationId, shopId, buyer.rows[0]!.id, 'VOICE', 'ACTIVE']);
    await db().query("INSERT INTO conversation_messages (conversation_id, role, text, created_at) VALUES ($1, 'USER', 'Cho mình xem iPhone', NOW() - interval '2 seconds'), ($1, 'ASSISTANT', 'Đây là iPhone nhé', NOW() - interval '1 second')", [conversationId]);
    const run = <T>(name: string, args: unknown) => client.http.request<T>('POST', `/api/v1/assistant/_debug/tools/${name}`, { body: { conversation_id: conversationId, args } });
    const detail = await run<{ text: string; card: Record<string, unknown> & { images: string[]; attributes: unknown[]; reviews: Array<Record<string, unknown>> } }>('get_product_details', { item_id: SEED.items.iphone.itemId });
    expect(detail.card).toMatchObject({ kind: 'product', item_id: SEED.items.iphone.itemId, category: expect.any(String), sold: expect.any(Number), days_to_ship: expect.any(Number), description: expect.any(String) });
    expect(detail.card.images.length).toBeGreaterThan(0);
    expect(Array.isArray(detail.card.attributes)).toBe(true);
    for (const review of detail.card.reviews) expect(Object.keys(review).sort()).toEqual(['buyer_name', 'comment', 'model_name', 'rating']);
    expect(JSON.parse(detail.text)).toMatchObject({ category: detail.card.category, sold: detail.card.sold, recent_reviews: detail.card.reviews });
    await db().query("UPDATE conversations SET status = 'ENDED', ended_at = NOW() WHERE id = $1", [conversationId]);

    const list = await client.assistant.conversations.list(shopId);
    expect(list).toContainEqual(expect.objectContaining({ conversation_id: conversationId, channel: 'VOICE', status: 'ENDED', preview: 'Cho mình xem iPhone', message_count: 2 }));
    const history = await client.assistant.conversations.get(conversationId);
    expect(history.messages.map((message) => [message.role, message.text])).toEqual([['user', 'Cho mình xem iPhone'], ['assistant', 'Đây là iPhone nhé']]);
    expect(history.cards.map((entry) => entry.card.kind)).toEqual(['product']);
    expect(await other.client.assistant.conversations.list(shopId)).toEqual([]);
    await expect(other.client.assistant.conversations.get(conversationId)).rejects.toMatchObject({ status: 404 });
    await expect(sessionClient().assistant.conversations.list(shopId)).rejects.toMatchObject({ status: 401 });
  });

  it('reissues edited cart actions with shop-scoped options and invalidates old consent', async () => {
    const { client, email } = await newBuyer();
    const other = await newBuyer();
    const buyer = await db().query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
    const conversationId = randomUUID();
    await db().query('INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at) VALUES ($1, $2, $3, $4, $5, NOW())', [conversationId, shopId, buyer.rows[0]!.id, 'TEXT', 'ACTIVE']);
    const run = <T>(name: string, args: unknown) => client.http.request<T>('POST', `/api/v1/assistant/_debug/tools/${name}`, { body: { conversation_id: conversationId, args } });
    const prepared = await run<{ card: { action: { action_id: string } } }>('add_to_cart', { item_id: SEED.items.iphone.itemId, model_id: SEED.items.iphone.blackModel, quantity: 2 });
    const id = prepared.card.action.action_id;
    const options = await client.assistant.actions.options(id);
    expect(options.quantity).toBe(2);
    await expect(other.client.assistant.actions.options(id)).rejects.toMatchObject({ status: 404 });
    await expect(other.client.assistant.actions.edit(id, { quantity: 3, model_id: options.model_id })).rejects.toMatchObject({ status: 404 });
    await expect(client.http.request('PATCH', `/api/v1/assistant/actions/${id}`, { body: { quantity: 3, model_id: options.model_id, price: 1 } })).rejects.toMatchObject({ status: 400 });
    const next = await client.assistant.actions.edit(id, { quantity: 3, model_id: options.model_id });
    expect(next.action.action_id).not.toBe(id);
    expect(next.action.summary.lines.some((line) => line.value === '3')).toBe(true);
    expect((await run<{ success: boolean }>('confirm_action', { action_id: id })).success).toBe(false);
    expect((await run<{ success: boolean }>('confirm_action', { action_id: next.action.action_id })).success).toBe(true);
  });

  it('lets the buyer edit a cart line on the order card and requires a fresh tap for the new order', async () => {
    const { client, email, addressId } = await newBuyer();
    const other = await newBuyer();
    const buyer = await db().query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
    const conversationId = randomUUID();
    await db().query('INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at) VALUES ($1, $2, $3, $4, $5, NOW())', [conversationId, shopId, buyer.rows[0]!.id, 'TEXT', 'ACTIVE']);
    const run = <T>(name: string, args: unknown) => client.http.request<T>('POST', `/api/v1/assistant/_debug/tools/${name}`, { body: { conversation_id: conversationId, args } });
    await client.cart.addItem(SEED.items.iphone.blackModel, 1);
    const order = await run<{ text: string; card: { action: { action_id: string } } }>('place_order', { address_id: addressId });
    // The spoken read-back keeps variant, quantity and unit price.
    expect(order.text).toMatch(/readback_vi: .*Đen.*số lượng 1, đơn giá \d+ VND/);
    expect(order.text).toMatch(/readback_en: .*quantity 1, unit price \d+ VND/);
    const id = order.card.action.action_id;
    const options = await client.assistant.actions.options(id);
    expect(options.lines).toHaveLength(1);
    expect(options).toMatchObject({ quantity: 1, model_id: SEED.items.iphone.blackModel });
    await expect(other.client.assistant.actions.options(id)).rejects.toMatchObject({ status: 404 });
    await expect(other.client.assistant.actions.edit(id, { quantity: 2, model_id: options.model_id })).rejects.toMatchObject({ status: 404 });
    await expect(client.assistant.actions.edit(id, { quantity: 2, model_id: 999999 })).rejects.toMatchObject({ status: 404 });
    const next = await client.assistant.actions.edit(id, { quantity: 2, model_id: options.model_id, line_index: 0 });
    expect(next.action).toMatchObject({ type: 'PLACE_ORDER', status: 'PENDING', requires_tap: true });
    expect(next.action.action_id).not.toBe(id);
    expect(next.action.summary.lines.some((line) => line.value.includes('× 2'))).toBe(true);
    const cart = await db().query<{ quantity: number }>('SELECT quantity FROM cart_items WHERE user_id = $1 AND model_id = $2', [buyer.rows[0]!.id, SEED.items.iphone.blackModel]);
    expect(cart.rows[0]!.quantity).toBe(2);
    const old = await db().query<{ status: string }>('SELECT status FROM pending_actions WHERE id = $1', [id]);
    expect(old.rows[0]!.status).toBe('CANCELLED');
    // The new order action still cannot be executed by a tool call alone.
    expect((await run<{ success: boolean }>('confirm_action', { action_id: next.action.action_id })).success).toBe(false);
  });

  it('scopes search and executes a spoken cart confirmation only once', async () => {
    const { client, email, addressId } = await newBuyer();
    const buyer = await db().query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
    const conversationId = randomUUID();
    await db().query('INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at) VALUES ($1, $2, $3, $4, $5, NOW())', [
      conversationId,
      shopId,
      buyer.rows[0]!.id,
      'TEXT',
      'ACTIVE',
    ]);
    const run = <T>(name: string, args: unknown) =>
      client.http.request<T>('POST', `/api/v1/assistant/_debug/tools/${name}`, { body: { conversation_id: conversationId, args } });
    expect((await run<{ success: boolean }>('confirm_action', {})).success).toBe(false);
    const otherConversation = randomUUID();
    await db().query('INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at) VALUES ($1, $2, $3, $4, $5, NOW())', [otherConversation, shopId, buyer.rows[0]!.id, 'TEXT', 'ACTIVE']);
    await client.http.request('POST', '/api/v1/assistant/_debug/tools/add_to_cart', { body: { conversation_id: otherConversation, args: { item_id: SEED.items.iphone.itemId, model_id: SEED.items.iphone.blackModel, quantity: 1 } } });
    expect((await run<{ success: boolean }>('confirm_action', {})).success).toBe(false);
    const search = await run<{ success: boolean; card: { items: Array<{ item_id: number }> } }>('search_products', { query: '' });
    expect(search.success).toBe(true);
    expect(search.card.items.some((item) => item.item_id === SEED.items.cocoon.itemId)).toBe(false);
    expect((await run<{ success: boolean }>('compare_products', { item_ids: [SEED.items.iphone.itemId, SEED.items.galaxy.itemId] })).success).toBe(
      true,
    );
    expect((await run<{ success: boolean }>('compare_products', { item_ids: [SEED.items.iphone.itemId, SEED.items.cocoon.itemId] })).success).toBe(
      false,
    );
    expect((await run<{ success: boolean }>('get_shop_faqs', {})).success).toBe(true);
    expect((await run<{ success: boolean }>('get_return_policy', {})).success).toBe(true);
    expect((await run<{ success: boolean }>('get_shipping_info', { item_id: SEED.items.iphone.itemId })).success).toBe(true);
    expect((await run<{ success: boolean }>('get_vouchers', {})).success).toBe(true);
    const literal = await run<{ card: { items: Array<{ name: string }> } }>('search_products', { query: 'iphon' });
    expect(literal.card.items.some((item) => item.name.toLowerCase().includes('iphone'))).toBe(true);
    expect((await run<{ success: boolean; text: string }>('place_order', { voucher_code: 'nonexistent', address_id: addressId })).success).toBe(false);
    expect((await run<{ success: boolean }>('get_cart', {})).success).toBe(true);
    expect((await run<{ success: boolean }>('get_order_status', {})).success).toBe(true);
    expect(
      (await run<{ success: boolean }>('add_to_cart', { item_id: SEED.items.iphone.itemId, model_id: SEED.items.iphone.blackModel, quantity: 0 }))
        .success,
    ).toBe(false);
    expect((await run<{ success: boolean }>('get_product_details', { item_id: SEED.items.cocoon.itemId })).success).toBe(false);
    const hidden = await db().query<{ status: string }>('UPDATE items SET status = $1 WHERE id = $2 RETURNING status', [
      'UNLIST',
      SEED.items.galaxy.itemId,
    ]);
    try {
      expect(hidden.rowCount).toBe(1);
      expect((await run<{ success: boolean }>('get_product_details', { item_id: SEED.items.galaxy.itemId })).success).toBe(false);
    } finally {
      await db().query('UPDATE items SET status = $1 WHERE id = $2', ['NORMAL', SEED.items.galaxy.itemId]);
    }
    const expired = await run<{ card: { action: { action_id: string } } }>('add_to_cart', {
      item_id: SEED.items.iphone.itemId,
      model_id: SEED.items.iphone.blackModel,
      quantity: 1,
    });
    const other = await newBuyer();
    await expect(other.client.assistant.actions.confirm(expired.card.action.action_id, randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(other.client.assistant.actions.cancel(expired.card.action.action_id)).rejects.toMatchObject({ status: 404 });
    const stillPending = await db().query<{ status: string }>('SELECT status FROM pending_actions WHERE id = $1', [expired.card.action.action_id]);
    expect(stillPending.rows[0]?.status).toBe('PENDING');
    await db().query("UPDATE pending_actions SET expires_at = TIMESTAMP '2000-01-01 00:00:00' WHERE id = $1", [expired.card.action.action_id]);
    expect((await run<{ success: boolean }>('confirm_action', { action_id: expired.card.action.action_id })).success).toBe(false);
    expect(
      (await db().query<{ status: string }>('SELECT status FROM pending_actions WHERE id = $1', [expired.card.action.action_id])).rows[0]?.status,
    ).toBe('EXPIRED');
    const prepared = await run<{ success: boolean; text: string; card: { action: { action_id: string; requires_tap: boolean } } }>('add_to_cart', {
      item_id: SEED.items.iphone.itemId,
      model_id: SEED.items.iphone.blackModel,
      quantity: 1,
    });
    expect(prepared.success).toBe(true);
    expect(prepared.card.action.requires_tap).toBe(false);
    expect(prepared.text).toContain(prepared.card.action.action_id);
    const id = prepared.card.action.action_id;
    expect((await run<{ success: boolean }>('confirm_action', { action_id: id })).success).toBe(true);
    expect((await run<{ success: boolean }>('confirm_action', { action_id: id })).success).toBe(true);
    const cart = await client.cart.get();
    const item = cart.shops.flatMap((shop) => shop.items).find((line) => line.model_id === SEED.items.iphone.blackModel);
    expect(item?.quantity).toBe(1);
    const voucherAction = await run<{ success: boolean; card: { action: { action_id: string; summary: { lines: Array<{ value: string }> } } } }>('place_order', { address_id: addressId, voucher_code: 'TECH50K' });
    expect(voucherAction.success).toBe(true);
    expect(voucherAction.card.action.summary.lines.some((line) => line.value === 'TECH50K')).toBe(true);
    expect((await run<{ success: boolean }>('place_order', { address_id: addressId, voucher_code: 'tech năm mươi k' })).success).toBe(false);
    await client.assistant.actions.cancel(voucherAction.card.action.action_id);
    const stale = await run<{ card: { action: { action_id: string } } }>('place_order', { address_id: addressId, payment_method: 'COD' });
    await client.cart.updateItem(item!.cart_item_id, { quantity: 2 });
    await expect(client.assistant.actions.confirm(stale.card.action.action_id, 'stale-test-key')).rejects.toMatchObject({ status: 409 });
    await client.cart.updateItem(item!.cart_item_id, { quantity: 1 });
    const update = await run<{ success: boolean; card: { action: { action_id: string } } }>('update_cart_item', {
      model_id: SEED.items.iphone.blackModel,
      quantity: 2,
    });
    expect(update.success).toBe(true);
    expect((await run<{ success: boolean }>('confirm_action', { action_id: update.card.action.action_id })).success).toBe(true);
    expect(
      (await client.cart.get()).shops.flatMap((shop) => shop.items).find((line) => line.model_id === SEED.items.iphone.blackModel)?.quantity,
    ).toBe(2);
    await client.cart.updateItem(item!.cart_item_id, { quantity: 1 });
    const cancel = await run<{ card: { action: { action_id: string } } }>('place_order', { address_id: addressId });
    expect((await client.assistant.actions.cancel(cancel.card.action.action_id)).action.status).toBe('CANCELLED');
    await expect(client.assistant.actions.confirm(cancel.card.action.action_id, 'cancel-test-key')).rejects.toMatchObject({ status: 409 });
    const older = await run<{ card: { action: { action_id: string } } }>('add_to_cart', { item_id: SEED.items.iphone.itemId, model_id: SEED.items.iphone.blackModel, quantity: 1 });
    const place = await run<{ success: boolean; card: { action: { action_id: string; requires_tap: boolean } } }>('place_order', {
      address_id: addressId,
      payment_method: 'COD',
    });
    expect(place.success).toBe(true);
    expect(place.card.action.requires_tap).toBe(true);
    const orderAction = place.card.action.action_id;
    expect((await run<{ success: boolean }>('confirm_action', {})).success).toBe(false);
    expect((await db().query<{ status: string }>('SELECT status FROM pending_actions WHERE id = $1', [older.card.action.action_id])).rows[0]?.status).toBe('PENDING');
    expect((await run<{ success: boolean; text: string }>('confirm_action', { action_id: orderAction })).text).toMatch(/tap/i);
    const [order, replay] = await Promise.all([
      client.assistant.actions.confirm(orderAction, 'checkout-test-key'),
      client.assistant.actions.confirm(orderAction, 'checkout-test-key'),
    ]);
    expect(order.action.result?.order_sn).toBeTruthy();
    expect(replay.action.result).toEqual(order.action.result);
    await expect(client.assistant.actions.confirm(orderAction, 'different-test-key')).rejects.toMatchObject({ status: 409 });
    await db().query('UPDATE models SET stock = stock + 1 WHERE id = $1', [SEED.items.iphone.blackModel]);
    await db().query('UPDATE items SET sales = sales - 1 WHERE id = $1', [SEED.items.iphone.itemId]);
    const orderSn = order.action.result!.order_sn!;
    const returnArgs = {
      order_sn: orderSn,
      items: [{ item_id: SEED.items.iphone.itemId, model_id: SEED.items.iphone.blackModel, quantity: 1 }],
      reason: 'ITEM_DAMAGED',
      solution: 'RETURN_REFUND',
    };
    expect((await run<{ success: boolean }>('open_return', returnArgs)).success).toBe(false);
    await db().query("UPDATE orders SET status = 'COMPLETED', completed_at = NOW() WHERE order_sn = $1", [orderSn]);
    const openReturn = await run<{ success: boolean; text: string; card: { action: { action_id: string } } }>('open_return', returnArgs);
    expect(openReturn.success).toBe(true);
    // The read-back names the reason and solution in words, never the enum codes.
    expect(openReturn.text).toContain('Lý do: Hàng bị hư hỏng; Phương án: Trả hàng và hoàn tiền');
    expect(openReturn.text).toContain('Reason: Item damaged; Solution: Return and refund');
    expect(openReturn.text).not.toMatch(/ITEM_DAMAGED|RETURN_REFUND/);
    const originalReturn = openReturn.card.action.action_id;
    const returnOptions = await client.assistant.actions.options(originalReturn);
    expect(returnOptions.lines[0]?.model_id).toBe(SEED.items.iphone.blackModel);
    const replacementReturn = await client.assistant.actions.edit(originalReturn, { quantity: 1, model_id: SEED.items.iphone.blackModel, line_index: 0 });
    const returnAction = replacementReturn.action.action_id;
    expect(returnAction).not.toBe(originalReturn);
    await expect(client.assistant.actions.confirm(originalReturn, 'old-return-key')).rejects.toMatchObject({ status: 409 });
    expect((await run<{ success: boolean }>('confirm_action', { action_id: returnAction })).success).toBe(false);
    await expect(client.assistant.actions.confirm(returnAction, 'checkout-test-key')).rejects.toMatchObject({ status: 409 });
    const createdReturn = await client.assistant.actions.confirm(returnAction, 'return-test-key');
    expect(createdReturn.action.result?.return_sn).toBeTruthy();
    expect((await client.assistant.actions.confirm(returnAction, 'return-test-key')).action.result).toEqual(createdReturn.action.result);
    const seller = await loginAs(SEED.sellers.techzone.email);
    expect((await seller.seller.assistant.conversations.get(shopId, conversationId)).conversation_id).toBe(conversationId);
    expect(
      (await seller.seller.assistant.conversations.list(shopId, { status: 'ACTIVE' })).data.some(
        (conversation) => conversation.conversation_id === conversationId,
      ),
    ).toBe(true);
    const stranger = await loginAs(SEED.buyers.binh.email);
    await expect(stranger.assistant.actions.confirm(orderAction, 'checkout-test-key')).rejects.toMatchObject({ status: 404 });
    await expect(stranger.assistant.actions.cancel(orderAction)).rejects.toMatchObject({ status: 404 });
    await expect(
      stranger.http.request('POST', '/api/v1/assistant/_debug/tools/search_products', {
        body: { conversation_id: conversationId, args: { query: '' } },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
