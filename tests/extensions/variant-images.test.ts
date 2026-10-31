import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SEED } from '../helpers/env.js';
import { db, newBuyer, sessionClient, uid } from '../helpers/fixtures.js';

const anonymous = sessionClient();

describe('selected variant images', () => {
  it('keeps the selected color through cart edits, checkout and persisted order history', async () => {
    const buyer = await newBuyer();
    const product = await anonymous.marketplace.getProduct(SEED.items.tee.itemId);
    const black = product.models.find((model) => model.model_id === SEED.items.tee.blackM)!;
    const white = product.models.find((model) => model.model_id === SEED.items.tee.whiteM)!;
    const colorIndex = product.tier_variations.findIndex((tier) => /màu/i.test(tier.name));
    const blackImage = product.tier_variations[colorIndex]!.options[black.tier_index[colorIndex]!]!.image_url;
    const whiteImage = product.tier_variations[colorIndex]!.options[white.tier_index[colorIndex]!]!.image_url;
    expect(blackImage).toBeTruthy();
    expect(blackImage).not.toBe(whiteImage);

    const initial = await buyer.client.cart.addItem(white.model_id, 1);
    const line = initial.shops[0]!.items[0]!;
    expect(line.image_url).toBe(whiteImage);
    const updated = await buyer.client.cart.updateItem(line.cart_item_id, { model_id: black.model_id });
    expect(updated.shops[0]!.items[0]).toMatchObject({ model_id: black.model_id, image_url: blackImage });

    const input = { address_id: buyer.addressId, payment_method: 'COD' as const };
    const preview = await buyer.client.checkout.preview(input);
    expect(preview.groups[0]!.lines[0]).toMatchObject({ model_id: black.model_id, image_url: blackImage });
    const placed = await buyer.client.checkout.placeOrder(input, { idempotencyKey: `variant-photo-${uid()}` });
    const order = placed.orders[0]!;
    try {
      expect(order.items[0]).toMatchObject({ model_id: black.model_id, image_url: blackImage });
      expect((await buyer.client.buyer.orders.get(order.order_sn)).items[0]).toMatchObject({ model_id: black.model_id, image_url: blackImage });
      expect((await buyer.client.buyer.orders.list()).data.find((entry) => entry.order_sn === order.order_sn)!.items[0]!.image_url).toBe(blackImage);
    } finally {
      await buyer.client.buyer.orders.cancel(order.order_sn, 'Variant image regression cleanup');
    }
  });

  it('uses the product hero when a selected size has no dedicated image', async () => {
    const buyer = await newBuyer();
    const product = await anonymous.marketplace.getProduct(SEED.items.pan.itemId);
    const cart = await buyer.client.cart.addItem(SEED.items.pan.small, 1);
    expect(cart.shops[0]!.items[0]!.image_url).toBe(product.images[0]);
    const quote = await buyer.client.checkout.preview({ address_id: buyer.addressId });
    expect(quote.groups[0]!.lines[0]).toMatchObject({ image_url: product.images[0] });
  });

  it('shows the requested color in assistant product and search cards without choosing an unspecified color', async () => {
    const buyer = await newBuyer();
    const user = (await db().query<{ id: number }>('SELECT id FROM users WHERE email = $1', [buyer.email])).rows[0]!;
    const conversationId = randomUUID();
    await db().query('INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at) VALUES ($1, $2, $3, $4, $5, NOW())', [conversationId, SEED.sellers.saigonStyle.shopId, user.id, 'TEXT', 'ACTIVE']);
    const product = await anonymous.marketplace.getProduct(SEED.items.tee.itemId);
    const blackImage = product.tier_variations[0]!.options.find((option) => option.option === 'Đen')!.image_url;
    const run = (name: string, args: unknown) => buyer.client.http.request<{ card: { image?: string | null; items?: Array<{ item_id: number; image: string | null }> } }>('POST', `/api/v1/assistant/_debug/tools/${name}`, { body: { conversation_id: conversationId, args } });
    const detail = await run('get_product_details', { item_id: product.item_id, requested_attributes: { color: 'black' } });
    expect(detail.card.image).toBe(blackImage);
    const search = await run('search_products', { query: 'áo thun', requested_attributes: { color: 'black' } });
    expect(search.card.items!.find((item) => item.item_id === product.item_id)!.image).toBe(blackImage);
    const sizeOnly = await run('get_product_details', { item_id: product.item_id, requested_attributes: { size: 'M' } });
    expect(sizeOnly.card.image).toBe(product.images[0]);
  });
});
