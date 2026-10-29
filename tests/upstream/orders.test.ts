/**
 * UPSTREAM COMPATIBILITY: order, logistics and returns modules via unmodified ShopeeSDK
 * methods. Buyer-side state is created through the custom buyer API (fixture only).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ShopeeSDK } from '@congminh1254/shopee-sdk';
import type { HuspeeClient } from '@huspee/sdk';
import { SEED } from '../helpers/env.js';
import { connectUpstream, newBuyer } from '../helpers/fixtures.js';
import { signedCall } from '../helpers/oauth.js';

const SHOP = SEED.sellers.techzone.shopId;

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return (err as { data: { error: string; message: string } }).data;
  }
  throw new Error('Expected failure');
};

let sdk: ShopeeSDK;
let otherSdk: ShopeeSDK;
let buyer: { client: HuspeeClient; addressId: number };

async function placeOrder(modelId: number, quantity = 1): Promise<string> {
  const result = await buyer.client.checkout.placeOrder({ items: [{ model_id: modelId, quantity }], address_id: buyer.addressId, payment_method: 'COD' });
  return result.order_sn_list[0]!;
}

async function accessToken(s: ShopeeSDK) {
  return (await s.getAuthToken())!.access_token;
}

/** Ship + simulate delivery so the order reaches TO_CONFIRM_RECEIVE. */
async function deliver(orderSn: string) {
  const params = await sdk.logistics.getShippingParameter({ order_sn: orderSn });
  const address = params.response.pickup!.address_list![0]!;
  await sdk.logistics.shipOrder({ order_sn: orderSn, pickup: { address_id: address.address_id!, pickup_time_id: address.time_slot_list![0]!.pickup_time_id } });
  for (const event of ['PICKED_UP', 'DELIVERED']) {
    const res = await signedCall('/custom/logistics/simulate_shipment_event', {
      method: 'POST',
      accessToken: await accessToken(sdk),
      shopId: SHOP,
      body: { order_sn: orderSn, event },
    });
    expect(res.body.error).toBe('');
  }
}

beforeAll(async () => {
  sdk = await connectUpstream(SHOP, SEED.sellers.techzone.email);
  otherSdk = await connectUpstream(SEED.sellers.glowup.shopId, SEED.sellers.glowup.email);
  buyer = await newBuyer();
});

describe('order module', () => {
  let orderSn: string;

  it('buyer checkout appears in get_order_list and get_order_detail', async () => {
    orderSn = await placeOrder(SEED.items.anker.modelId);
    const now = Math.floor(Date.now() / 1000);
    const list = await sdk.order.getOrderList({
      time_range_field: 'create_time',
      time_from: now - 3600,
      time_to: now + 60,
      page_size: 50,
      response_optional_fields: 'order_status',
    });
    expect(list.response.order_list).toContainEqual({ order_sn: orderSn, order_status: 'READY_TO_SHIP' });

    const detail = await sdk.order.getOrderDetail({
      order_sn_list: [orderSn],
      response_optional_fields: 'buyer_user_id,buyer_username,item_list,recipient_address,package_list,pay_time' as never,
    });
    const order = detail.response.order_list![0]!;
    expect(order).toMatchObject({
      order_sn: orderSn,
      region: 'VN',
      currency: 'VND',
      cod: true,
      order_status: 'READY_TO_SHIP',
      total_amount: 890000, // 890k item, free shipping >= 500k
      payment_method: 'Cash on Delivery',
      recipient_address: { name: 'Khách Hàng Test', city: 'TP. Hồ Chí Minh' },
    });
    expect(order.item_list![0]).toMatchObject({ item_id: SEED.items.anker.itemId, model_id: 0, model_quantity_purchased: 1, model_original_price: 890000 });
    expect(order.package_list![0]!.logistics_status).toBe('LOGISTICS_READY');
  });

  it('get_order_detail omits optional blocks unless requested', async () => {
    const detail = await sdk.order.getOrderDetail({ order_sn_list: [orderSn] });
    const order = detail.response.order_list![0]! as Record<string, unknown>;
    expect(order.item_list).toBeUndefined();
    expect(order.recipient_address).toBeUndefined();
  });

  it('get_order_list enforces the 15-day window', async () => {
    const now = Math.floor(Date.now() / 1000);
    const err = await fail(sdk.order.getOrderList({ time_range_field: 'create_time', time_from: now - 20 * 86400, time_to: now, page_size: 10 }));
    expect(err).toMatchObject({ error: 'error_param', message: 'Time range cannot exceed 15 days' });
  });

  it('other shops cannot see or act on the order', async () => {
    const detail = await otherSdk.order.getOrderDetail({ order_sn_list: [orderSn] });
    expect(detail.response.order_list).toEqual([]);
    const err = await fail(otherSdk.logistics.shipOrder({ order_sn: orderSn, dropoff: {} }));
    expect(err.error).toBe('error_not_found');
  });

  it('logistics: channels, addresses, shipping parameter, ship_order, tracking', async () => {
    const channels = await sdk.logistics.getChannelList();
    expect(channels.response.logistics_channel_list!.map((c) => c.logistics_channel_name)).toEqual(
      expect.arrayContaining(['SPX Express', 'Giao Hàng Nhanh', 'Giao Hàng Tiết Kiệm']),
    );
    const addresses = await sdk.logistics.getAddressList();
    expect(addresses.response.address_list![0]).toMatchObject({ city: 'Hà Nội', address_type: ['DEFAULT_ADDRESS', 'PICKUP_ADDRESS', 'RETURN_ADDRESS'] });

    const params = await sdk.logistics.getShippingParameter({ order_sn: orderSn });
    expect(params.response.info_needed!.pickup).toEqual(['address_id', 'pickup_time_id']);
    const address = params.response.pickup!.address_list![0]!;
    const slot = address.time_slot_list![0]!;
    expect(slot.date).toBeInstanceOf(Date);

    const before = await sdk.logistics.getTrackingNumber({ order_sn: orderSn });
    expect(before.response.tracking_number).toBe('');

    await sdk.logistics.shipOrder({ order_sn: orderSn, pickup: { address_id: address.address_id!, pickup_time_id: slot.pickup_time_id } });
    const detail = await sdk.order.getOrderDetail({ order_sn_list: [orderSn] });
    expect(detail.response.order_list![0]!.order_status).toBe('PROCESSED');

    const tracking = await sdk.logistics.getTrackingNumber({ order_sn: orderSn });
    expect(tracking.response.tracking_number).toMatch(/^[A-Z]+\d{10}$/);
    const info = await sdk.logistics.getTrackingInfo({ order_sn: orderSn });
    expect(info.response.logistics_status).toBe('LOGISTICS_REQUEST_CREATED');
    expect(info.response.tracking_info![0]!.update_time).toBeInstanceOf(Date);

    const again = await fail(sdk.logistics.shipOrder({ order_sn: orderSn, dropoff: {} }));
    expect(again.error).toBe('error_invalid_status');
  });

  it('cancel_order validates reason/items, restores stock, and rejects shipped orders', async () => {
    const stockOf = async () => {
      const info = await sdk.product.getItemBaseInfo({ item_id_list: [SEED.items.anker.itemId] });
      return (info.response.item_list![0] as { stock_info_v2: { seller_stock: Array<{ stock: number }> } }).stock_info_v2.seller_stock[0]!.stock;
    };
    const before = await stockOf();
    const sn = await placeOrder(SEED.items.anker.modelId, 2);
    expect(await stockOf()).toBe(before - 2);

    const missingItems = await fail(sdk.order.cancelOrder({ order_sn: sn, cancel_reason: 'OUT_OF_STOCK' }));
    expect(missingItems.error).toBe('error_param');
    const res = await sdk.order.cancelOrder({ order_sn: sn, cancel_reason: 'OUT_OF_STOCK', item_list: [{ item_id: SEED.items.anker.itemId, model_id: 0 }] });
    expect(res.response.update_time).toBeInstanceOf(Date);
    const detail = await sdk.order.getOrderDetail({ order_sn_list: [sn], response_optional_fields: 'cancel_by,cancel_reason' as never });
    expect(detail.response.order_list![0]).toMatchObject({ order_status: 'CANCELLED', cancel_by: 'seller', cancel_reason: 'OUT_OF_STOCK' });
    expect(await stockOf()).toBe(before);

    const processed = await fail(sdk.order.cancelOrder({ order_sn: orderSn, cancel_reason: 'CUSTOMER_REQUEST' }));
    expect(processed.error).toBe('error_invalid_status');
  });
});

describe('returns module', () => {
  it('list/detail/available solutions, then seller confirm refunds the buyer', async () => {
    const sn = await placeOrder(SEED.items.mouse.blackModel, 2);
    await deliver(sn);
    const ret = await buyer.client.buyer.returns.create({ order_sn: sn, reason: 'ITEM_DAMAGED', text_reason: 'Chuột bị liệt nút trái', solution: 'RETURN_REFUND' });

    const list = await sdk.returns.getReturnList({ page_no: 0, page_size: 20, status: 'REQUESTED' });
    expect(list.response.return!.map((r) => r.return_sn)).toContain(ret.return_sn);

    const detail = await sdk.returns.getReturnDetail({ return_sn: ret.return_sn });
    expect(detail.response).toMatchObject({
      return_sn: ret.return_sn,
      order_sn: sn,
      status: 'REQUESTED',
      reason: 'ITEM_DAMAGED',
      refund_amount: 698000,
      return_solution: 0,
      negotiation: { negotiation_status: 'PENDING_RESPOND' },
    });
    expect(detail.response.item![0]).toMatchObject({ item_id: SEED.items.mouse.itemId, amount: 2, item_price: 349000 });

    const solutions = await sdk.returns.getAvailableSolutions({ return_sn: ret.return_sn });
    expect(solutions.response.offer_refund).toMatchObject({ eligibility: true, refund_amount_adjustable: true, max_refund_amount: 698000 });

    await sdk.returns.confirm({ return_sn: ret.return_sn });
    const after = await sdk.returns.getReturnDetail({ return_sn: ret.return_sn });
    expect(after.response.status).toBe('ACCEPTED');
    const reverse = await sdk.returns.getReverseTrackingInfo({ return_sn: ret.return_sn });
    expect(reverse.response.reverse_logistics_status).toBe('LOGISTICS_DELIVERY_DONE');
    expect((await buyer.client.buyer.returns.get(ret.return_sn)).refund_paid).toBe(true);
    expect((await buyer.client.buyer.orders.get(sn)).status).toBe('COMPLETED');

    const again = await fail(sdk.returns.confirm({ return_sn: ret.return_sn }));
    expect(again.error).toBe('error_invalid_status');
  });

  it('seller offer -> buyer accepts partial refund', async () => {
    const sn = await placeOrder(SEED.items.buds.modelId);
    await deliver(sn);
    const ret = await buyer.client.buyer.returns.create({ order_sn: sn, reason: 'FUNCTIONAL_DMG', solution: 'RETURN_REFUND' });
    const tooMuch = await fail(sdk.returns.offer({ return_sn: ret.return_sn, proposed_solution: 'refund', proposed_adjusted_refund_amount: 10_000_000 }));
    expect(tooMuch.error).toBe('error_param');
    await sdk.returns.offer({ return_sn: ret.return_sn, proposed_solution: 'refund', proposed_adjusted_refund_amount: 300000 });
    const detail = await sdk.returns.getReturnDetail({ return_sn: ret.return_sn });
    expect(detail.response.negotiation).toMatchObject({ negotiation_status: 'PENDING_BUYER_RESPOND', latest_solution: 'refund', latest_offer_amount: 300000 });

    const accepted = await buyer.client.buyer.returns.acceptOffer(ret.return_sn);
    expect(accepted).toMatchObject({ status: 'ACCEPTED', refund_amount: 300000, solution: 'REFUND_ONLY', refund_paid: true });
  });

  it('dispute -> JUDGING -> cancel_dispute', async () => {
    const sn = await placeOrder(SEED.items.mouse.blackModel);
    await deliver(sn);
    const ret = await buyer.client.buyer.returns.create({ order_sn: sn, reason: 'CHANGE_MIND' });
    const reasons = await sdk.returns.getReturnDisputeReason({ return_sn: ret.return_sn });
    expect((reasons.response as { dispute_reason_list: unknown[] }).dispute_reason_list.length).toBeGreaterThan(0);
    await sdk.returns.dispute({ return_sn: ret.return_sn, email: 'huy.techzone@example.com', dispute_reason_id: 2, dispute_text_reason: 'Hàng trả về đã qua sử dụng' });
    expect((await sdk.returns.getReturnDetail({ return_sn: ret.return_sn })).response.status).toBe('JUDGING');
    await sdk.returns.cancelDispute({ return_sn: ret.return_sn });
    expect((await sdk.returns.getReturnDetail({ return_sn: ret.return_sn })).response.status).toBe('REQUESTED');
  });

  it('returns are shop-scoped', async () => {
    const mine = await sdk.returns.getReturnList({ page_no: 0, page_size: 100 });
    const mineSns = mine.response.return!.map((r) => r.return_sn);
    expect(mineSns.length).toBeGreaterThanOrEqual(3);
    const theirs = await otherSdk.returns.getReturnList({ page_no: 0, page_size: 100 });
    expect((theirs.response.return ?? []).filter((r) => mineSns.includes(r.return_sn))).toEqual([]);
    const sn = mineSns[0]!;
    const err = await fail(otherSdk.returns.getReturnDetail({ return_sn: sn }));
    expect(err.error).toBe('error_not_found');
  });
});

describe('push configuration', () => {
  it('set_app_push_config / get_app_push_config round-trip', async () => {
    await sdk.push.setAppPushConfig({ callback_url: 'http://localhost:9/push', set_push_config_on: [3, 4], set_push_config_off: [8] });
    const cfg = await sdk.push.getAppPushConfig();
    expect(cfg.response).toMatchObject({ callback_url: 'http://localhost:9/push', live_push_status: 'Normal' });
    expect(cfg.response.push_config_on_list).toEqual([3, 4]);
    expect(cfg.response.push_config_off_list).toContain(8);
    const bad = await fail(sdk.push.setAppPushConfig({ set_push_config_on: [777] }));
    expect(bad.error).toBe('error_param');
    await sdk.push.setAppPushConfig({ callback_url: '', set_push_config_off: [3, 4] });
  });
});
