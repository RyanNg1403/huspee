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
    const prepared = await run<{ success: boolean; card: { action: { action_id: string; requires_tap: boolean } } }>('add_to_cart', {
      item_id: SEED.items.iphone.itemId,
      model_id: SEED.items.iphone.blackModel,
      quantity: 1,
    });
    expect(prepared.success).toBe(true);
    expect(prepared.card.action.requires_tap).toBe(false);
    const id = prepared.card.action.action_id;
    expect((await run<{ success: boolean }>('confirm_action', { action_id: id })).success).toBe(true);
    expect((await run<{ success: boolean }>('confirm_action', { action_id: id })).success).toBe(true);
    const cart = await client.cart.get();
    const item = cart.shops.flatMap((shop) => shop.items).find((line) => line.model_id === SEED.items.iphone.blackModel);
    expect(item?.quantity).toBe(1);
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
    const place = await run<{ success: boolean; card: { action: { action_id: string; requires_tap: boolean } } }>('place_order', {
      address_id: addressId,
      payment_method: 'COD',
    });
    expect(place.success).toBe(true);
    expect(place.card.action.requires_tap).toBe(true);
    const orderAction = place.card.action.action_id;
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
    const openReturn = await run<{ success: boolean; card: { action: { action_id: string } } }>('open_return', returnArgs);
    expect(openReturn.success).toBe(true);
    const returnAction = openReturn.card.action.action_id;
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
