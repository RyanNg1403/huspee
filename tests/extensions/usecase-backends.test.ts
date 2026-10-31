/**
 * Backends for the redesigned buyer and seller screens (commit 3454f7f): null product specs,
 * richer assistant tools, buyer order counts/badges, return shop names, seller inbox search,
 * conversation channel filter and the insights funnel.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SEED } from '../helpers/env.js';
import { db, loginAs, newBuyer, sessionClient, uid } from '../helpers/fixtures.js';

const shopId = SEED.sellers.techzone.shopId;

async function conversation(email: string, channel: 'TEXT' | 'VOICE' = 'TEXT', shop = shopId) {
  const buyer = await db().query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
  const id = randomUUID();
  await db().query('INSERT INTO conversations (id, shop_id, buyer_id, channel, status, started_at) VALUES ($1, $2, $3, $4, $5, NOW())', [id, shop, buyer.rows[0]!.id, channel, 'ACTIVE']);
  return id;
}

const tool = <T>(client: ReturnType<typeof sessionClient>, conversationId: string) => (name: string, args: unknown) =>
  client.http.request<T>('POST', `/api/v1/assistant/_debug/tools/${name}`, { body: { conversation_id: conversationId, args } });

describe('use-case backends', () => {
  it('product detail lists every category attribute in id order with null for unfilled specs', async () => {
    const galaxy = await sessionClient().marketplace.getProduct(SEED.items.galaxy.itemId);
    expect(galaxy.attributes).toEqual([
      { name: 'Dung lượng lưu trữ', value: '128GB' },
      { name: 'Loại bảo hành', value: 'Bảo hành chính hãng' },
      { name: 'RAM', value: '8GB' },
      { name: 'Camera chính', value: '50MP OIS' },
      { name: 'Màn hình', value: 'Super AMOLED 120Hz' },
      { name: 'Dung lượng pin', value: '5000mAh' },
      { name: 'Kháng nước', value: 'IP67' },
      { name: 'Cổng sạc', value: null },
    ]);
    const iphone = await sessionClient().marketplace.getProduct(SEED.items.iphone.itemId);
    expect(iphone.attributes.map((a) => a.value)).toEqual(['128GB', 'Bảo hành chính hãng', null, '48MP', null, null, null, 'USB-C']);
  });

  it('assistant compare/details/order tools and the order quote carry the new fields; orders show placed_via_assistant', async () => {
    const { client, email, addressId } = await newBuyer();
    const conversationId = await conversation(email);
    const run = tool<any>(client, conversationId);

    const compare = await run('compare_products', { item_ids: [SEED.items.galaxy.itemId, SEED.items.iphone.itemId] });
    expect(compare.success).toBe(true);
    const [galaxy, iphone] = compare.card.items;
    expect([galaxy.item_id, iphone.item_id]).toEqual([SEED.items.galaxy.itemId, SEED.items.iphone.itemId]);
    expect(galaxy).toMatchObject({ price_min: 9490000, price_max: 10490000, rows: { stock: expect.any(String) } });
    expect(galaxy.specs).toContainEqual({ name: 'Cổng sạc', value: null });
    expect(iphone.specs).toContainEqual({ name: 'Cổng sạc', value: 'USB-C' });
    expect(galaxy.models).toHaveLength(4);
    expect(galaxy.models[0]).toEqual({ model_id: 3000111, name: expect.any(String), price: 9490000, stock: expect.any(Number) });

    const details = await run('get_product_details', { item_id: SEED.items.iphone.itemId });
    expect(details.card.attributes).toContainEqual({ name: 'RAM', value: null });

    // Normal checkout: not placed via the assistant.
    const normal = await client.checkout.placeOrder({ address_id: addressId, items: [{ model_id: SEED.items.buds.modelId, quantity: 1 }], payment_method: 'COD' });
    expect((await client.buyer.orders.get(normal.order_sn_list[0]!)).placed_via_assistant).toBeNull();

    await client.cart.addItem(SEED.items.anker.modelId, 1);
    const place = await run('place_order', { address_id: addressId, payment_method: 'COD' });
    const shipping = place.card.action.summary.lines.find((line: { label: string }) => line.label === 'Vận chuyển / Shipping');
    expect(shipping?.value).toMatch(/^.+ · \d+–\d+ ngày \(ước tính\) \/ days \(estimated\)$/);
    const confirmed = await client.assistant.actions.confirm(place.card.action.action_id, `uc-${uid()}`);
    const orderSn = confirmed.action.result!.order_sn!;
    const order = await client.buyer.orders.get(orderSn);
    expect(order.placed_via_assistant).toEqual({ conversation_id: conversationId, placed_at: expect.any(Number) });
    expect(shipping.value.startsWith(`${order.logistics.shipping_carrier} · `)).toBe(true);
    expect(order.latest_tracking).toMatchObject({ logistics_status: 'LOGISTICS_NOT_START', time: expect.any(Number) });
    expect(order.shipped_time).toBeNull();
    const listed = (await client.buyer.orders.list()).data;
    expect(listed.find((o) => o.order_sn === orderSn)?.placed_via_assistant?.conversation_id).toBe(conversationId);

    const status = await run('get_order_status', { order_sn: orderSn });
    expect(status.card).toMatchObject({
      order_sn: orderSn,
      shipping_carrier: order.logistics.shipping_carrier,
      tracking_number: null,
      delivered_time: null,
      return: { window_days: expect.any(Number), due_time: null, eligible: false, request: null },
    });
    // Delivered recently -> eligible; past the window -> not eligible.
    await db().query("UPDATE orders SET status = 'TO_CONFIRM_RECEIVE' WHERE order_sn = $1", [orderSn]);
    await db().query('UPDATE shipments SET delivered_at = NOW() WHERE order_sn = $1', [orderSn]);
    expect((await run('get_order_status', { order_sn: orderSn })).card.return).toMatchObject({ eligible: true, due_time: expect.any(Number) });
    await db().query("UPDATE shipments SET delivered_at = NOW() - interval '60 days' WHERE order_sn = $1", [orderSn]);
    expect((await run('get_order_status', { order_sn: orderSn })).card.return.eligible).toBe(false);
  });

  it('buyer order counts match the list; returns carry shop name and images', async () => {
    const { client, addressId } = await newBuyer();
    expect(await client.buyer.orders.counts()).toEqual({ total: 0, by_status: {}, returns: 0 });
    const placed = await client.checkout.placeOrder({ address_id: addressId, items: [{ model_id: SEED.items.mouse.blackModel, quantity: 1 }], payment_method: 'COD' });
    const orderSn = placed.order_sn_list[0]!;
    await client.checkout.placeOrder({ address_id: addressId, items: [{ model_id: SEED.items.mouse.blackModel, quantity: 1 }], payment_method: 'COD' });
    await db().query("UPDATE orders SET status = 'COMPLETED', completed_at = NOW() WHERE order_sn = $1", [orderSn]);
    const ret = await client.buyer.returns.create({ order_sn: orderSn, reason: 'ITEM_DAMAGED', solution: 'REFUND_ONLY', image_urls: ['https://cdn.example.com/damage-1.jpg'] } as any);
    expect(ret).toMatchObject({ shop_name: 'TechZone Official', image_urls: ['https://cdn.example.com/damage-1.jpg'] });
    expect((await client.buyer.returns.list()).data[0]).toMatchObject({ return_sn: ret.return_sn, shop_name: 'TechZone Official' });

    const counts = await client.buyer.orders.counts();
    const list = await client.buyer.orders.list({ page_size: 50 });
    expect(counts.total).toBe(list.page.total);
    expect(counts.returns).toBe(1);
    for (const [status, n] of Object.entries(counts.by_status)) expect(list.data.filter((o) => o.status === status)).toHaveLength(n!);
    expect(counts.by_status).toEqual({ READY_TO_SHIP: 1, TO_RETURN: 1 });
  });

  it('seller inbox search and conversation channel filter carry buyer names', async () => {
    const tag = uid();
    const a = await newBuyer();
    const b = await newBuyer();
    await db().query('UPDATE users SET name = $1 WHERE email = $2', [`Zeta ${tag}`, a.email]);
    const convA = await conversation(a.email, 'VOICE');
    const convB = await conversation(b.email, 'TEXT');
    const ticketA = (await tool<any>(a.client, convA)('handoff_to_seller', { question: 'Bảo hành mấy tháng?', reason: 'x' })).card.ticket_id;
    const ticketB = (await tool<any>(b.client, convB)('handoff_to_seller', { question: `Giao hỏa tốc ${tag}?`, reason: 'x' })).card.ticket_id;

    const seller = await loginAs(SEED.sellers.techzone.email);
    const byName = await seller.seller.inbox.list(shopId, { q: `ZETA ${tag}` });
    expect(byName.data.map((t) => t.ticket_id)).toEqual([ticketA]);
    expect(byName.data[0]!.buyer_name).toBe(`Zeta ${tag}`);
    const bySubject = await seller.seller.inbox.list(shopId, { q: `hỏa tốc ${tag.toUpperCase()}` });
    expect(bySubject.data.map((t) => t.ticket_id)).toEqual([ticketB]);
    expect((await seller.seller.inbox.list(shopId, { q: `nothing-${tag}` })).data).toEqual([]);
    const glow = await loginAs(SEED.sellers.glowup.email);
    expect((await glow.seller.inbox.list(SEED.sellers.glowup.shopId, { q: tag })).data).toEqual([]);

    const voice = await seller.seller.assistant.conversations.list(shopId, { channel: 'VOICE', page_size: 100 });
    expect(voice.data.every((c) => c.channel === 'VOICE')).toBe(true);
    expect(voice.data.find((c) => c.conversation_id === convA)?.buyer_name).toBe(`Zeta ${tag}`);
    expect(voice.data.some((c) => c.conversation_id === convB)).toBe(false);
    const text = await seller.seller.assistant.conversations.list(shopId, { channel: 'TEXT', page_size: 100 });
    expect(text.data.some((c) => c.conversation_id === convB)).toBe(true);
    expect((await seller.seller.assistant.conversations.get(shopId, convA)).buyer_name).toBe(`Zeta ${tag}`);
  });

  it('insights add unique buyers, assistant order revenue, funnel and grouped unanswered questions', async () => {
    const seller = await loginAs(SEED.sellers.techzone.email);
    const start = Math.floor(Date.now() / 1000) - 1;
    const range = { from: start, to: start + 3600 };
    const before = await seller.seller.assistant.insights(shopId, range);
    const tag = uid();
    const a = await newBuyer();
    const b = await newBuyer();
    const convA = await conversation(a.email);
    const convB = await conversation(b.email);
    const runA = tool<any>(a.client, convA);
    const runB = tool<any>(b.client, convB);
    await runA('get_product_details', { item_id: SEED.items.anker.itemId });
    const cart = await runA('add_to_cart', { item_id: SEED.items.anker.itemId, model_id: SEED.items.anker.modelId, quantity: 1 });
    await runA('confirm_action', { action_id: cart.card.action.action_id });
    const place = await runA('place_order', { address_id: a.addressId, payment_method: 'COD' });
    const confirmed = await a.client.assistant.actions.confirm(place.card.action.action_id, `uc-${uid()}`);
    const order = await a.client.buyer.orders.get(confirmed.action.result!.order_sn!);

    for (const [conv, run, text] of [[convA, runA, `Pin dùng bao lâu ${tag}?`], [convB, runB, `pin dung bao lau ${tag}`]] as const) {
      await db().query("INSERT INTO conversation_messages (conversation_id, role, text, created_at) VALUES ($1, 'USER', $2, NOW())", [conv, text]);
      await run('search_products', { query: `no-such-product-${tag}` });
    }

    const after = await seller.seller.assistant.insights(shopId, range);
    expect(after.unique_buyers - before.unique_buyers).toBe(2);
    expect(after.orders_revenue - before.orders_revenue).toBe(order.amounts.total_amount);
    const delta = Object.fromEntries(Object.entries(after.funnel).map(([k, v]) => [k, v - before.funnel[k as keyof typeof before.funnel]]));
    expect(delta).toEqual({ conversations: 2, asked_product: 1, quoted: 1, cart_confirmed: 1, ordered: 1 });
    const f = after.funnel;
    expect([f.conversations, f.asked_product, f.quoted, f.ordered]).toEqual([...[f.conversations, f.asked_product, f.quoted, f.ordered]].sort((x, y) => y - x));
    const group = after.unanswered_groups.find((g) => g.question.includes(tag));
    expect(group).toMatchObject({ question: `pin dung bao lau ${tag}`, count: 2, buyers: 2 });
    expect(group!.conversation_ids.sort()).toEqual([convA, convB].sort());
    expect(after.unanswered_groups.filter((g) => g.question.includes(tag))).toHaveLength(1);
  });
});
