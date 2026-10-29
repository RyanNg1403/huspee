/**
 * UPSTREAM COMPATIBILITY: additional operations served beyond the P0/P1 inventory
 * (holiday mode, deletes, comment replies, lost push messages) via unmodified SDK methods.
 */
import { createServer } from 'node:http';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ShopeeSDK } from '@congminh1254/shopee-sdk';
import type { HuspeeClient } from '@huspee/sdk';
import { API } from '../helpers/env.js';
import { connectUpstream, newBuyer, newSellerWithShop } from '../helpers/fixtures.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let sdk: ShopeeSDK;
let seller: { client: HuspeeClient; email: string; shopId: number };
let itemId: number;
let modelIds: number[];

beforeAll(async () => {
  seller = await newSellerWithShop();
  sdk = await connectUpstream(seller.shopId, seller.email);
  const image = (await sdk.mediaSpace.uploadImage({ image: PNG })).response.image_info!.image_id!;
  itemId = (
    await sdk.product.addItem({
      original_price: 120000,
      description: 'Ly thủy tinh',
      weight: 0.3,
      item_name: 'Ly thủy tinh Extras',
      category_id: 100060,
      image: { image_id_list: [image] },
      logistic_info: [{ logistic_id: 50011, enabled: true }],
      seller_stock: [{ stock: 10 }],
    })
  ).response.item_id;
  const init = await sdk.product.initTierVariation({
    item_id: itemId,
    tier_variation: [{ name: 'Dung tích', option_list: [{ option: '300ml' }, { option: '500ml' }] }],
    model: [
      { tier_index: [0], original_price: 120000, seller_stock: [{ stock: 10 }] },
      { tier_index: [1], original_price: 150000, seller_stock: [{ stock: 10 }] },
    ],
  } as never);
  modelIds = init.response.model!.map((m) => m.model_id!);
});

describe('extra shop/product/voucher operations', () => {
  it('set_shop_holiday_mode blocks checkout until turned off', async () => {
    await sdk.shop.setShopHolidayMode({ holiday_mode_on: true });
    expect((await sdk.shop.getShopHolidayMode()).response.holiday_mode_on).toBe(true);
    const buyer = await newBuyer();
    const quote = await buyer.client.checkout.preview({ items: [{ model_id: modelIds[0]!, quantity: 1 }] });
    expect(quote.issues[0]).toMatch(/holiday/);
    await sdk.shop.setShopHolidayMode({ holiday_mode_on: false });
    expect((await buyer.client.checkout.preview({ items: [{ model_id: modelIds[0]!, quantity: 1 }] })).can_checkout).toBe(true);
  });

  it('delete_model keeps at least one model', async () => {
    await sdk.product.deleteModel({ item_id: itemId, model_id: modelIds[1]! });
    const models = await sdk.product.getModelList({ item_id: itemId });
    expect(models.response.model.map((m) => m.model_id)).toEqual([modelIds[0]]);
    await expect(sdk.product.deleteModel({ item_id: itemId, model_id: modelIds[0]! })).rejects.toMatchObject({ data: { error: 'error_invalid_status' } });
  });

  it('delete_item_list and delete_shop_category', async () => {
    const category = (await sdk.shopCategory.addShopCategory({ name: 'Tạm thời' })).response.shop_category_id!;
    await sdk.shopCategory.addItemList({ shop_category_id: category, item_list: [itemId] });
    await sdk.shopCategory.deleteItemList({ shop_category_id: category, item_list: [itemId] });
    expect((await sdk.shopCategory.getItemList({ shop_category_id: category })).response.item_list).toEqual([]);
    await sdk.shopCategory.deleteShopCategory({ shop_category_id: category });
    const list = await sdk.shopCategory.getShopCategoryList({ page_no: 1, page_size: 10 });
    expect(list.response.shop_categorys!.map((c) => c.shop_category_id)).not.toContain(category);
  });

  it('delete_voucher only for upcoming vouchers', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { voucher_id } = (
      await sdk.voucher.addVoucher({
        voucher_name: 'Sắp diễn ra',
        voucher_code: 'SOON1',
        start_time: now + 86400,
        end_time: now + 2 * 86400,
        voucher_type: 1,
        reward_type: 2,
        percentage: 5,
        usage_quantity: 10,
        min_basket_price: 0,
      })
    ).response;
    await sdk.voucher.deleteVoucher({ voucher_id: voucher_id! });
    await expect(sdk.voucher.getVoucher({ voucher_id: voucher_id! })).rejects.toMatchObject({ data: { error: 'error_not_found' } });
  });

  it('reply_comment is shown on the public review', async () => {
    const buyer = await newBuyer();
    const order = await buyer.client.checkout.placeOrder({ address_id: buyer.addressId, items: [{ model_id: modelIds[0]!, quantity: 1 }] });
    const sn = order.order_sn_list[0]!;
    await sdk.logistics.shipOrder({ order_sn: sn, dropoff: {} });
    const token = (await sdk.getAuthToken())!;
    const { signedCall } = await import('../helpers/oauth.js');
    for (const event of ['PICKED_UP', 'DELIVERED']) {
      await signedCall('/custom/logistics/simulate_shipment_event', { method: 'POST', accessToken: token.access_token, shopId: seller.shopId, body: { order_sn: sn, event } });
    }
    await buyer.client.buyer.orders.confirmReceipt(sn);
    await buyer.client.buyer.orders.review(sn, { item_id: itemId, rating: 2, comment: 'Ly hơi mỏng' });
    const comments = await sdk.product.getComment({ item_id: itemId, cursor: '', page_size: 5 });
    const commentId = Number(comments.response.item_comment_list![0]!.comment_id);
    await sdk.product.replyComment({ comment_list: [{ comment_id: commentId, comment: 'Shop xin lỗi, sẽ đổi mẫu dày hơn ạ.' }] });
    const reviews = await buyer.client.marketplace.getReviews(itemId);
    expect(reviews.data[0]).toMatchObject({ rating: 2, seller_reply: 'Shop xin lỗi, sẽ đổi mẫu dày hơn ạ.' });

    const returns = await buyer.client.buyer.returns.list();
    expect(returns.data).toEqual([]);
    const ret = await buyer.client.buyer.returns.create({ order_sn: sn, reason: 'PHYSICAL_DMG', solution: 'REFUND_ONLY' });
    const listed = await buyer.client.buyer.returns.list({ status: 'REQUESTED' });
    expect(listed.data.map((r) => r.return_sn)).toEqual([ret.return_sn]);
    expect((await buyer.client.buyer.returns.cancel(ret.return_sn)).status).toBe('CANCELLED');
    expect((await buyer.client.buyer.orders.get(sn)).status).toBe('COMPLETED');
  });
});

describe('lost push messages', () => {
  it('failed deliveries become retrievable lost messages and can be confirmed', async () => {
    const failing = createServer((_req, res) => {
      res.statusCode = 500;
      res.end('nope');
    });
    await new Promise<void>((r) => failing.listen(0, r));
    const url = `http://127.0.0.1:${(failing.address() as { port: number }).port}/push`;
    try {
      await sdk.push.setAppPushConfig({ callback_url: url, set_push_config_on: [8] });
      await sdk.product.updateStock({ item_id: itemId, stock_list: [{ model_id: modelIds[0]!, seller_stock: [{ stock: 42 }] }] });
      let lost: Awaited<ReturnType<typeof sdk.push.getLostPushMessage>> | undefined;
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        lost = await sdk.push.getLostPushMessage();
        if (lost.response.push_message_list?.some((m) => m.shop_id === seller.shopId)) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      const message = lost!.response.push_message_list!.find((m) => m.shop_id === seller.shopId)!;
      expect(message.code).toBe(8);
      expect(JSON.parse(message.data!)).toMatchObject({ item_id: itemId });
      await sdk.push.confirmConsumedLostPushMessage({ last_message_id: lost!.response.last_message_id! });
      const after = await sdk.push.getLostPushMessage();
      expect(after.response.push_message_list!.filter((m) => m.shop_id === seller.shopId)).toEqual([]);
    } finally {
      await sdk.push.setAppPushConfig({ callback_url: '', set_push_config_off: [8] });
      failing.close();
    }
  }, 20_000);
});

describe('platform meta', () => {
  it('lists served compat operations with provenance', async () => {
    const res = await fetch(`${API}/api/v1/meta/compat-operations`).then((r) => r.json());
    const paths = res.data.map((o: { path: string }) => o.path);
    expect(paths).toEqual(expect.arrayContaining(['/api/v2/product/get_item_list', '/api/v2/custom/shop/get_policies']));
    expect(res.data.find((o: { path: string }) => o.path === '/api/v2/custom/shop/get_policies').provenance).toBe('custom-signed');
  });
});
