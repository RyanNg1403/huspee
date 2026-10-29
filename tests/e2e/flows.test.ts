/**
 * END-TO-END: buyer <-> seller flows over one shared persisted state, mixing the browser-safe
 * session client, the seller dashboard gateway, the server-side signed client and unmodified
 * upstream SDK methods.
 */
import { createServer, type IncomingMessage } from 'node:http';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ShopeeSDK } from '@congminh1254/shopee-sdk';
import { HuspeeApiError, type HuspeeClient } from '@huspee/sdk';
import { createShopClient, HuspeeShopeeSDK, ShopTokenStore, verifyPushSignature } from '@huspee/sdk/server';
import { API_V2, PARTNER_ID, PARTNER_KEY, PARTNER_REDIRECT, SEED } from '../helpers/env.js';
import { connectUpstream, connectViaDashboard, newBuyer, newSellerWithShop, sessionClient } from '../helpers/fixtures.js';
import { approveConsent } from '../helpers/oauth.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const anon = sessionClient();

const apiError = async (p: Promise<unknown>): Promise<HuspeeApiError> => {
  try {
    await p;
  } catch (err) {
    if (err instanceof HuspeeApiError) return err;
    throw err;
  }
  throw new Error('Expected HuspeeApiError');
};

function ok<T>(envelope: { error: string; message: string; response?: T }): T {
  if (envelope.error) throw new Error(`${envelope.error}: ${envelope.message}`);
  return envelope.response as T;
}

describe('seller onboarding -> listing -> buyer purchase -> fulfilment -> review -> return', () => {
  let seller: { client: HuspeeClient; email: string; shopId: number };
  let signed: HuspeeShopeeSDK;
  let buyer: { client: HuspeeClient; addressId: number };
  let itemId: number;
  let modelIds: number[];
  let orderSn: string;

  beforeAll(async () => {
    seller = await newSellerWithShop();
    buyer = await newBuyer();
  });

  it('seller connects the shop through the dashboard and lists a product with variants via the gateway', async () => {
    await connectViaDashboard(seller.client, seller.shopId);
    const upload = await seller.client.seller.shopee.uploadImage(seller.shopId, new Blob([PNG], { type: 'image/png' }));
    const imageId = upload.response!.image_info.image_id;
    const added = ok(
      await seller.client.seller.shopee.call<{ item_id: number }>(seller.shopId, '/product/add_item', {
        item_name: 'Áo sơ mi linen E2E',
        description: 'Áo sơ mi vải lanh thoáng mát.',
        original_price: 350000,
        weight: 0.3,
        category_id: 100040,
        image: { image_id_list: [imageId] },
        logistic_info: [{ logistic_id: 50011, enabled: true }, { logistic_id: 50012, enabled: true }],
        seller_stock: [{ stock: 0 }],
        attribute_list: [{ attribute_id: 200401, attribute_value_list: [{ value_id: 3 }] }],
      }),
    );
    itemId = added.item_id;
    const init = ok(
      await seller.client.seller.shopee.call<{ model: Array<{ model_id: number }> }>(seller.shopId, '/product/init_tier_variation', {
        item_id: itemId,
        tier_variation: [{ name: 'Size', option_list: [{ option: 'M' }, { option: 'L' }] }],
        model: [
          { tier_index: [0], original_price: 350000, seller_stock: [{ stock: 5 }] },
          { tier_index: [1], original_price: 370000, seller_stock: [{ stock: 1 }] },
        ],
      }),
    );
    modelIds = init.model.map((m) => m.model_id);
  });

  it('buyer discovers it in cross-shop search with correct public price and stock', async () => {
    const results = await anon.marketplace.searchProducts({ q: 'sơ mi linen' });
    expect(results.data.map((p) => p.item_id)).toContain(itemId);
    const detail = await anon.marketplace.getProduct(itemId);
    expect(detail).toMatchObject({ price_min: 350000, price_max: 370000, stock: 6 });
    expect(detail.attributes).toContainEqual({ name: 'Chất liệu', value: 'Vải lanh' });
  });

  it('seller price/stock updates are visible to the buyer immediately', async () => {
    ok(await seller.client.seller.shopee.call(seller.shopId, '/product/update_price', { item_id: itemId, price_list: [{ model_id: modelIds[0], original_price: 320000 }] }));
    ok(
      await seller.client.seller.shopee.call(seller.shopId, '/product/update_stock', {
        item_id: itemId,
        stock_list: [{ model_id: modelIds[1], seller_stock: [{ stock: 0 }] }],
      }),
    );
    const detail = await anon.marketplace.getProduct(itemId);
    expect(detail.models.find((m) => m.model_id === modelIds[0])).toMatchObject({ price: 320000, stock: 5, available: true });
    expect(detail.models.find((m) => m.model_id === modelIds[1])).toMatchObject({ stock: 0, available: false });
    expect((await apiError(buyer.client.cart.addItem(modelIds[1]!, 1))).code).toBe('OUT_OF_STOCK');
  });

  it('unlisted products disappear from the storefront', async () => {
    ok(await seller.client.seller.shopee.call(seller.shopId, '/product/unlist_item', { item_list: [{ item_id: itemId, unlist: true }] }));
    expect((await apiError(anon.marketplace.getProduct(itemId))).status).toBe(404);
    ok(await seller.client.seller.shopee.call(seller.shopId, '/product/unlist_item', { item_list: [{ item_id: itemId, unlist: false }] }));
    expect((await anon.marketplace.getProduct(itemId)).item_id).toBe(itemId);
  });

  it('buyer checks out -> sees the order -> seller sees the same order through the upstream SDK', async () => {
    await buyer.client.cart.addItem(modelIds[0]!, 2);
    const result = await buyer.client.checkout.placeOrder({ address_id: buyer.addressId, payment_method: 'COD' });
    orderSn = result.order_sn_list[0]!;
    const mine = await buyer.client.buyer.orders.get(orderSn);
    expect(mine).toMatchObject({ status: 'READY_TO_SHIP', amounts: { items_subtotal: 640000 } });

    const store = new ShopTokenStore();
    signed = createShopClient({ partner_id: PARTNER_ID, partner_key: PARTNER_KEY, base_url: API_V2 }, store, seller.shopId);
    const { code } = await approveConsent({ authUrl: signed.buildAuthPartnerUrl(PARTNER_REDIRECT), shopId: seller.shopId, sellerEmail: seller.email });
    await signed.authenticateWithCode(code, seller.shopId);
    const detail = await signed.order.getOrderDetail({ order_sn_list: [orderSn], response_optional_fields: 'item_list,buyer_username' as never });
    expect(detail.response.order_list![0]).toMatchObject({
      order_sn: orderSn,
      order_status: 'READY_TO_SHIP',
      total_amount: mine.amounts.total_amount,
      buyer_username: 'Khách Hàng Test',
      item_list: [{ item_id: itemId, model_id: modelIds[0], model_quantity_purchased: 2, model_discounted_price: 320000 }],
    });
    const summary = await seller.client.seller.dashboardSummary(seller.shopId);
    expect(summary).toMatchObject({ order_count: 1, to_ship_count: 1, items_sold: 2 });
  });

  it('seller ships and advances the simulated shipment; buyer tracks every step', async () => {
    const params = await signed.logistics.getShippingParameter({ order_sn: orderSn });
    const address = params.response.pickup!.address_list![0]!;
    await signed.logistics.shipOrder({ order_sn: orderSn, pickup: { address_id: address.address_id!, pickup_time_id: address.time_slot_list![1]!.pickup_time_id } });
    let tracking = await buyer.client.buyer.orders.tracking(orderSn);
    expect(tracking).toMatchObject({ order_status: 'PROCESSED', logistics_status: 'LOGISTICS_REQUEST_CREATED' });
    expect(tracking.tracking_number).toMatch(/^SPXVN\d{10}$/);

    expect((await apiError(buyer.client.buyer.orders.cancel(orderSn))).code).toBe('INVALID_STATE');

    await signed.custom.logistics.simulateShipmentEvent({ order_sn: orderSn, event: 'PICKED_UP' });
    await signed.custom.logistics.simulateShipmentEvent({ order_sn: orderSn, event: 'IN_TRANSIT' });
    expect((await buyer.client.buyer.orders.get(orderSn)).status).toBe('SHIPPED');
    const early = await signed.custom.logistics.simulateShipmentEvent({ order_sn: orderSn, event: 'PICKED_UP' }).catch((e) => e);
    expect(early.data.error).toBe('error_invalid_status');
    await signed.custom.logistics.simulateShipmentEvent({ order_sn: orderSn, event: 'DELIVERED' });

    tracking = await buyer.client.buyer.orders.tracking(orderSn);
    expect(tracking.order_status).toBe('TO_CONFIRM_RECEIVE');
    expect(tracking.events.map((e) => e.logistics_status)).toEqual([
      'LOGISTICS_DELIVERY_DONE',
      'LOGISTICS_PICKUP_DONE',
      'LOGISTICS_PICKUP_DONE',
      'LOGISTICS_REQUEST_CREATED',
      'LOGISTICS_NOT_START',
    ]);
    const sellerView = await signed.logistics.getTrackingInfo({ order_sn: orderSn });
    expect(sellerView.response.logistics_status).toBe('LOGISTICS_DELIVERY_DONE');
  });

  it('buyer confirms receipt and reviews; review shows publicly and to the seller', async () => {
    expect((await apiError(buyer.client.buyer.orders.review(orderSn, { item_id: itemId, rating: 5 }))).code).toBe('INVALID_STATE');
    const confirmed = await buyer.client.buyer.orders.confirmReceipt(orderSn);
    expect(confirmed.status).toBe('COMPLETED');
    await buyer.client.buyer.orders.review(orderSn, { item_id: itemId, rating: 4, comment: 'Vải mát, đường may ổn.' });
    expect((await apiError(buyer.client.buyer.orders.review(orderSn, { item_id: itemId, rating: 5 }))).code).toBe('CONFLICT');
    const pub = await anon.marketplace.getReviews(itemId);
    expect(pub.data[0]).toMatchObject({ rating: 4, comment: 'Vải mát, đường may ổn.', model_name: 'M', verified_purchase: true });
    const comments = await signed.product.getComment({ item_id: itemId, cursor: '', page_size: 10 });
    expect(comments.response.item_comment_list![0]).toMatchObject({ order_sn: orderSn, rating_star: 4 });
  });

  it('buyer return -> seller confirms via gateway -> refund visible to buyer', async () => {
    const ret = await buyer.client.buyer.returns.create({
      order_sn: orderSn,
      reason: 'DIFFERENT_DESCRIPTION',
      solution: 'REFUND_ONLY',
      items: [{ item_id: itemId, model_id: modelIds[0]!, quantity: 1 }],
    });
    expect(ret).toMatchObject({ status: 'REQUESTED', refund_amount: 320000 });
    expect((await buyer.client.buyer.orders.get(orderSn)).status).toBe('TO_RETURN');
    expect((await apiError(buyer.client.buyer.returns.create({ order_sn: orderSn, reason: 'OTHER' }))).code).toBe('INVALID_STATE');

    const list = ok(await seller.client.seller.shopee.call<{ return: Array<{ return_sn: string }> }>(seller.shopId, '/returns/get_return_list', { page_no: 0, page_size: 10 }));
    expect(list.return.map((r) => r.return_sn)).toEqual([ret.return_sn]);
    ok(await seller.client.seller.shopee.call(seller.shopId, '/returns/confirm', { return_sn: ret.return_sn }));

    const after = await buyer.client.buyer.returns.get(ret.return_sn);
    expect(after).toMatchObject({ status: 'ACCEPTED', refund_paid: true });
    expect((await buyer.client.buyer.orders.get(orderSn)).status).toBe('COMPLETED');
    const summary = await seller.client.seller.dashboardSummary(seller.shopId);
    expect(summary.refunded_amount).toBe(320000);

    // Only one unit remains returnable.
    const second = await buyer.client.buyer.returns.create({ order_sn: orderSn, reason: 'ITEM_DAMAGED', solution: 'REFUND_ONLY' });
    expect(second.items).toEqual([expect.objectContaining({ quantity: 1 })]);
    await buyer.client.buyer.returns.cancel(second.return_sn);
  });
});

describe('privacy and tenant isolation', () => {
  let buyerA: { client: HuspeeClient; addressId: number };
  let buyerB: { client: HuspeeClient; addressId: number };
  let orderSn: string;
  let techzone: ShopeeSDK;
  let glowup: ShopeeSDK;

  beforeAll(async () => {
    buyerA = await newBuyer();
    buyerB = await newBuyer();
    techzone = await connectUpstream(SEED.sellers.techzone.shopId, SEED.sellers.techzone.email);
    glowup = await connectUpstream(SEED.sellers.glowup.shopId, SEED.sellers.glowup.email);
    const res = await buyerA.client.checkout.placeOrder({
      address_id: buyerA.addressId,
      items: [
        { model_id: SEED.items.buds.modelId, quantity: 1 },
        { model_id: SEED.items.cocoon.modelId, quantity: 1 },
      ],
    });
    orderSn = res.order_sn_list.find((sn) => res.orders.find((o) => o.order_sn === sn)!.shop.shop_id === SEED.sellers.techzone.shopId)!;
    expect(res.order_sn_list).toHaveLength(2);
  });

  it('each seller sees only its own part of a multi-shop checkout', async () => {
    const tz = await techzone.order.getOrderDetail({ order_sn_list: [orderSn] });
    expect(tz.response.order_list).toHaveLength(1);
    const gu = await glowup.order.getOrderDetail({ order_sn_list: [orderSn] });
    expect(gu.response.order_list).toHaveLength(0);
  });

  it('another buyer cannot read or act on the order or its returns', async () => {
    expect((await apiError(buyerB.client.buyer.orders.get(orderSn))).status).toBe(404);
    expect((await apiError(buyerB.client.buyer.returns.create({ order_sn: orderSn, reason: 'OTHER' }))).status).toBe(404);
    const list = await buyerB.client.buyer.orders.list();
    expect(list.data).toEqual([]);
  });

  it('seller APIs stay shop-scoped even for public catalog items', async () => {
    const res = await glowup.product.getItemBaseInfo({ item_id_list: [SEED.items.buds.itemId] });
    expect(res.response.item_list).toEqual([]);
    const search = await glowup.product.searchItem({ page_size: 50, item_name: 'Redmi' });
    expect(search.response.item_id_list).toEqual([]);
  });

  it('public payloads carry no buyer PII', async () => {
    const reviews = await anon.marketplace.getReviews(SEED.items.buds.itemId);
    const json = JSON.stringify(reviews);
    expect(json).not.toMatch(/@example\.com|090\d{7}|buyer_id/);
  });
});

describe('concurrency and idempotency', () => {
  it('two buyers racing for the last unit: exactly one order succeeds', async () => {
    const seller = await newSellerWithShop();
    await connectViaDashboard(seller.client, seller.shopId);
    const upload = await seller.client.seller.shopee.uploadImage(seller.shopId, new Blob([PNG], { type: 'image/png' }));
    const item = ok(
      await seller.client.seller.shopee.call<{ item_id: number }>(seller.shopId, '/product/add_item', {
        item_name: 'Hàng hiếm còn 1 chiếc',
        description: 'Chỉ còn một sản phẩm.',
        original_price: 100000,
        weight: 0.2,
        category_id: 100060,
        image: { image_id_list: [upload.response!.image_info.image_id] },
        logistic_info: [{ logistic_id: 50011, enabled: true }],
        seller_stock: [{ stock: 1 }],
      }),
    );
    const modelId = (await anon.marketplace.getProduct(item.item_id)).models[0]!.model_id;
    const [a, b] = await Promise.all([newBuyer(), newBuyer()]);
    const results = await Promise.allSettled([
      a.client.checkout.placeOrder({ address_id: a.addressId, items: [{ model_id: modelId, quantity: 1 }] }),
      b.client.checkout.placeOrder({ address_id: b.addressId, items: [{ model_id: modelId, quantity: 1 }] }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as HuspeeApiError).code).toBe('OUT_OF_STOCK');
    expect((await anon.marketplace.getProduct(item.item_id)).stock).toBe(0);
  });

  it('concurrent retries with one Idempotency-Key create a single order set', async () => {
    const buyer = await newBuyer();
    const input = { address_id: buyer.addressId, items: [{ model_id: SEED.items.cocoon.modelId, quantity: 1 }] };
    const results = await Promise.all([1, 2, 3].map(() => buyer.client.checkout.placeOrder(input, { idempotencyKey: 'same-key-123456' })));
    expect(new Set(results.map((r) => r.checkout_id)).size).toBe(1);
    expect((await buyer.client.buyer.orders.list()).data).toHaveLength(1);
  });
});

describe('simulated push delivery', () => {
  it('delivers signed order_status pushes to the configured callback', async () => {
    const received: Array<{ body: string; auth: string | undefined }> = [];
    const server = createServer((req: IncomingMessage, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ body, auth: req.headers.authorization });
        res.end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const callback = `http://127.0.0.1:${(server.address() as { port: number }).port}/push`;
    const sdk = await connectUpstream(SEED.sellers.nhaXinh.shopId, SEED.sellers.nhaXinh.email);
    try {
      await sdk.push.setAppPushConfig({ callback_url: callback, set_push_config_on: [3] });
      const buyer = await newBuyer();
      const order = await buyer.client.checkout.placeOrder({ address_id: buyer.addressId, items: [{ model_id: SEED.items.pan.small, quantity: 1 }] });
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !received.some((r) => r.body.includes(order.order_sn_list[0]!))) await new Promise((r) => setTimeout(r, 100));
      const push = received.find((r) => r.body.includes(order.order_sn_list[0]!))!;
      expect(push).toBeDefined();
      expect(JSON.parse(push.body)).toMatchObject({ shop_id: SEED.sellers.nhaXinh.shopId, code: 3, data: { ordersn: order.order_sn_list[0], status: 'READY_TO_SHIP' } });
      expect(verifyPushSignature(PARTNER_KEY, callback, push.body, push.auth)).toBe(true);
    } finally {
      await sdk.push.setAppPushConfig({ callback_url: '', set_push_config_off: [3] });
      server.close();
    }
  });
});
