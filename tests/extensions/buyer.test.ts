/**
 * PLATFORM EXTENSIONS: public marketplace, cart, addresses, checkout (pricing, vouchers,
 * shipping, idempotency) through the browser-safe @huspee/sdk session client.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { HuspeeApiError, HuspeeClient } from '@huspee/sdk';
import { SEED } from '../helpers/env.js';
import { db, loginAs, newBuyer, sessionClient, uid } from '../helpers/fixtures.js';

const apiError = async (p: Promise<unknown>): Promise<HuspeeApiError> => {
  try {
    await p;
  } catch (err) {
    if (err instanceof HuspeeApiError) return err;
    throw err;
  }
  throw new Error('Expected HuspeeApiError');
};

const anon = sessionClient();

describe('public marketplace', () => {
  it('categories form a tree', async () => {
    const tree = await anon.marketplace.categories();
    const phones = tree.find((c) => c.category_id === 100001)!;
    expect(phones.display_name).toBe('Điện Thoại & Phụ Kiện');
    expect(phones.children.map((c) => c.category_id)).toEqual([100010, 100011, 100012, 100013, 100014]);
  });

  it('lists shops and shop detail with collections', async () => {
    const shops = await anon.marketplace.listShops();
    expect(shops.data.map((s) => s.shop_name)).toEqual(expect.arrayContaining(['TechZone Official', 'GlowUp Beauty', 'Saigon Style', 'Nhà Xinh Home']));
    const shop = await anon.marketplace.getShop(SEED.sellers.saigonStyle.shopId);
    expect(shop).toMatchObject({ shop_name: 'Saigon Style', city: 'TP. Hồ Chí Minh' });
    expect(shop.collections!.map((c) => c.name)).toEqual(expect.arrayContaining(['Basic hằng ngày']));
    expect((await apiError(anon.marketplace.getShop(999999))).status).toBe(404);
  });

  it('cross-shop search, category subtree, price filter, sorting and pagination', async () => {
    const tee = await anon.marketplace.searchProducts({ q: 'áo thun' });
    expect(tee.data[0]!.item_id).toBe(SEED.items.tee.itemId);

    const fashion = await anon.marketplace.searchProducts({ category_id: 100004, sort: 'price_asc' });
    // Other suites may add products; only assert on seeded fixtures (ids below 2100000).
    expect(fashion.data.map((p) => p.item_id)).toEqual(expect.arrayContaining([SEED.items.tee.itemId, 2000305, 2000304, 2000302, 2000310, 2000317]));
    for (const womensItem of [2000303, 2000306, 2000313, 2000315]) expect(fashion.data.map((p) => p.item_id)).not.toContain(womensItem);
    for (let i = 1; i < fashion.data.length; i++) expect(fashion.data[i - 1]!.price_min).toBeLessThanOrEqual(fashion.data[i]!.price_min);

    const all = await anon.marketplace.searchProducts({ page_size: 100 });
    expect(new Set(all.data.map((p) => p.shop.shop_id)).size).toBeGreaterThanOrEqual(4);

    const cheap = await anon.marketplace.searchProducts({ max_price: 300000, sort: 'price_desc', page_size: 100 });
    expect(cheap.data.every((p) => p.price_min <= 300000)).toBe(true);
    for (let i = 1; i < cheap.data.length; i++) expect(cheap.data[i - 1]!.price_min).toBeGreaterThanOrEqual(cheap.data[i]!.price_min);

    const page = await anon.marketplace.searchProducts({ page_size: 5, page: 2 });
    expect(page.page).toMatchObject({ page: 2, page_size: 5, has_next: true });
    expect(page.data).toHaveLength(5);

    const promo = await anon.marketplace.searchProducts({ has_promotion: true, page_size: 100 });
    expect(promo.data.map((p) => p.item_id)).toEqual(expect.arrayContaining([SEED.items.iphone.itemId, SEED.items.buds.itemId]));
    expect(promo.data.find((p) => p.item_id === SEED.items.buds.itemId)).toMatchObject({ price_min: 790000, original_price_min: 990000, discount_percent: 20 });
  });

  it('product detail exposes variants, availability and promotion price but no seller-only fields', async () => {
    const p = await anon.marketplace.getProduct(SEED.items.iphone.itemId);
    expect(p.tier_variations[0]!.options.map((o) => o.option)).toEqual(['Đen', 'Hồng', 'Xanh dương']);
    const blue = p.models.find((m) => m.model_id === SEED.items.iphone.blueOutOfStock)!;
    expect(blue).toMatchObject({ name: 'Xanh dương', stock: 0, available: false, price: 19990000 });
    expect(p.models.find((m) => m.model_id === SEED.items.iphone.blackModel)).toMatchObject({ price: 18490000, original_price: 19990000 });
    expect(p.attributes).toContainEqual({ name: 'Dung lượng lưu trữ', value: '128GB' });
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/sku|reserved|TZ-IP15/i);
  });

  it('reviews are public with masked buyer names; summary by star', async () => {
    const r = await anon.marketplace.getReviews(SEED.items.cocoon.itemId);
    expect(r.data[0]).toMatchObject({ rating: 5, verified_purchase: true });
    expect(r.data[0]!.buyer_name).toMatch(/^\S\*+\S$/);
    expect(r.summary['5']).toBe(1);
  });

  it('public vouchers exclude hidden and expired codes; policies come from persisted rules', async () => {
    const glow = await anon.marketplace.shopVouchers(SEED.sellers.glowup.shopId);
    expect(glow.map((v) => v.voucher_code).sort()).toEqual(['GLOW15', 'SERUM30K']);
    const style = await anon.marketplace.shopVouchers(SEED.sellers.saigonStyle.shopId);
    expect(style.map((v) => v.voucher_code)).toEqual(['STYLE30K']);
    const policy = await anon.marketplace.shopPolicies(SEED.sellers.saigonStyle.shopId);
    expect(policy).toMatchObject({ return_window_days: 15, free_shipping_min_spend: 399000 });
    expect(policy.shipping_channels!.length).toBe(5);
  });
});

describe('addresses and cart', () => {
  let buyer: { client: HuspeeClient; addressId: number };
  let other: { client: HuspeeClient };

  beforeAll(async () => {
    buyer = await newBuyer();
    other = await newBuyer();
  });

  it('address CRUD keeps exactly one default and is owner-scoped', async () => {
    const second = await buyer.client.buyer.addresses.create({
      name: 'Văn phòng',
      phone: '+84909000333',
      state: 'Hà Nội',
      city: 'Hà Nội',
      district: 'Quận Hoàn Kiếm',
      address: '5 Tràng Tiền',
      is_default: true,
    });
    let list = await buyer.client.buyer.addresses.list();
    expect(list.filter((a) => a.is_default).map((a) => a.address_id)).toEqual([second.address_id]);
    await buyer.client.buyer.addresses.update(buyer.addressId, { is_default: true, address: '2 Đường Ba Tháng Hai' });
    list = await buyer.client.buyer.addresses.list();
    expect(list[0]).toMatchObject({ address_id: buyer.addressId, is_default: true, address: '2 Đường Ba Tháng Hai' });
    expect((await apiError(other.client.buyer.addresses.update(buyer.addressId, { name: 'hack' }))).status).toBe(404);
    expect((await apiError(buyer.client.buyer.addresses.create({ ...list[0]!, phone: '12345' }))).code).toBe('VALIDATION');
    await buyer.client.buyer.addresses.remove(second.address_id);
    expect((await buyer.client.buyer.addresses.list()).map((a) => a.address_id)).toEqual([buyer.addressId]);
  });

  it('cart add/merge/update/remove with stock checks', async () => {
    let cart = await buyer.client.cart.addItem(SEED.items.tee.whiteM, 1);
    cart = await buyer.client.cart.addItem(SEED.items.tee.whiteM, 2);
    const line = cart.shops[0]!.items[0]!;
    expect(line).toMatchObject({ quantity: 3, unit_price: 159000, line_total: 477000, available: true });

    expect((await apiError(buyer.client.cart.addItem(SEED.items.iphone.blueOutOfStock, 1))).code).toBe('OUT_OF_STOCK');
    expect((await apiError(buyer.client.cart.addItem(SEED.items.tee.whiteM, 999))).code).toBe('OUT_OF_STOCK');

    cart = await buyer.client.cart.updateItem(line.cart_item_id, { model_id: SEED.items.tee.blackM, quantity: 1 });
    expect(cart.shops[0]!.items[0]).toMatchObject({ model_id: SEED.items.tee.blackM, model_name: 'Đen, M', unit_price: 189000 });
    expect((await apiError(buyer.client.cart.updateItem(line.cart_item_id, { model_id: SEED.items.mouse.blackModel }))).code).toBe('VALIDATION');

    expect((await apiError(other.client.cart.removeItem(line.cart_item_id))).status).toBe(404);
    cart = await buyer.client.cart.removeItem(line.cart_item_id);
    expect(cart.item_count).toBe(0);
  });
});

describe('checkout', () => {
  let buyer: { client: HuspeeClient; addressId: number };

  beforeAll(async () => {
    buyer = await newBuyer();
  });

  it('preview groups by shop, applies promotion prices, free shipping and vouchers', async () => {
    const quote = await buyer.client.checkout.preview({
      items: [
        { model_id: SEED.items.effaclar.small, quantity: 1 }, // 329k promo
        { model_id: SEED.items.serum.modelId, quantity: 1 }, // 650k
        { model_id: SEED.items.pan.small, quantity: 1 }, // 189k, Nhà Xinh (no free shipping)
      ],
      payment_method: 'CARD_SIM',
      shops: [{ shop_id: SEED.sellers.glowup.shopId, voucher_code: 'glow15' }],
    });
    expect(quote.can_checkout).toBe(true);
    const glow = quote.groups.find((g) => g.shop_id === SEED.sellers.glowup.shopId)!;
    expect(glow.items_subtotal).toBe(979000);
    expect(glow.voucher).toMatchObject({ code: 'GLOW15', eligible: true, discount: 60000 }); // 15% capped at 60k
    expect(glow.shipping_discount).toBe(glow.shipping_fee); // >= 299k free shipping
    expect(glow.total).toBe(919000);
    const nx = quote.groups.find((g) => g.shop_id === SEED.sellers.nhaXinh.shopId)!;
    expect(nx.shipping_discount).toBe(0);
    expect(nx.shipping_fee).toBe(Math.min(...nx.shipping_options.map((o) => o.shipping_fee)));
    expect(quote.totals.total).toBe(glow.total + nx.total);
  });

  it('product vouchers only discount eligible items and enforce min spend', async () => {
    const quote = await buyer.client.checkout.preview({
      items: [{ model_id: SEED.items.cocoon.modelId, quantity: 2 }],
      shops: [{ shop_id: SEED.sellers.glowup.shopId, voucher_code: 'SERUM30K' }],
    });
    expect(quote.groups[0]!.voucher).toMatchObject({ eligible: false, reason: 'No eligible items for this voucher' });
    expect(quote.can_checkout).toBe(false);
    const tooSmall = await buyer.client.checkout.preview({
      items: [{ model_id: SEED.items.cocoon.modelId, quantity: 1 }],
      shops: [{ shop_id: SEED.sellers.glowup.shopId, voucher_code: 'GLOW15' }],
    });
    expect(tooSmall.groups[0]!.voucher!.reason).toMatch(/Minimum spend/);
    const expired = await buyer.client.checkout.preview({
      items: [{ model_id: SEED.items.tee.whiteM, quantity: 3 }],
      shops: [{ shop_id: SEED.sellers.saigonStyle.shopId, voucher_code: 'SUMMER25' }],
    });
    expect(expired.groups[0]!.voucher!.reason).toBe('Voucher is not active');
  });

  it('COD excludes channels without COD support', async () => {
    const quote = await buyer.client.checkout.preview({
      items: [{ model_id: SEED.items.buds.modelId, quantity: 1 }],
      payment_method: 'COD',
      shops: [{ shop_id: SEED.sellers.techzone.shopId, logistics_channel_id: 50066 }],
    });
    expect(quote.groups[0]!.shipping_options.map((o) => o.logistics_channel_id)).not.toContain(50066);
    expect(quote.can_checkout).toBe(false);
  });

  it('places orders per shop, decrements stock, clears purchased cart lines; idempotent on retry', async () => {
    const before = await anon.marketplace.getProduct(SEED.items.tee.itemId);
    const stockBefore = before.models.find((m) => m.model_id === SEED.items.tee.whiteM)!.stock;
    await buyer.client.cart.addItem(SEED.items.tee.whiteM, 2);
    await buyer.client.cart.addItem(SEED.items.cocoon.modelId, 1);
    const key = `checkout-${uid()}`;
    const input = { address_id: buyer.addressId, payment_method: 'SHOPEEPAY_SIM' as const };
    const first = await buyer.client.checkout.placeOrder(input, { idempotencyKey: key });
    expect(first.replayed).toBe(false);
    expect(first.orders).toHaveLength(2);
    expect(first.orders.every((o) => o.status === 'READY_TO_SHIP' && o.pay_time !== null && !o.cod)).toBe(true);

    const retry = await buyer.client.checkout.placeOrder(input, { idempotencyKey: key });
    expect(retry).toMatchObject({ replayed: true, checkout_id: first.checkout_id, order_sn_list: first.order_sn_list });
    expect((await apiError(buyer.client.checkout.placeOrder({ ...input, payment_method: 'COD' }, { idempotencyKey: key }))).code).toBe('CONFLICT');

    expect((await buyer.client.cart.get()).item_count).toBe(0);
    const after = await anon.marketplace.getProduct(SEED.items.tee.itemId);
    expect(after.models.find((m) => m.model_id === SEED.items.tee.whiteM)!.stock).toBe(stockBefore - 2);
    const history = await buyer.client.buyer.orders.list();
    expect(history.data.map((o) => o.order_sn)).toEqual(expect.arrayContaining(first.order_sn_list));
  });

  it('rejects out-of-stock checkout without side effects', async () => {
    const err = await apiError(
      buyer.client.checkout.placeOrder({ address_id: buyer.addressId, items: [{ model_id: SEED.items.iphone.blueOutOfStock, quantity: 1 }] }),
    );
    expect(err).toMatchObject({ status: 409, code: 'OUT_OF_STOCK' });
  });

  it('sellers cannot buy from their own shop; foreign address ids are rejected', async () => {
    const seller = await loginAs(SEED.sellers.techzone.email);
    const quote = await seller.checkout.preview({ items: [{ model_id: SEED.items.buds.modelId, quantity: 1 }] });
    expect(quote.issues[0]).toMatch(/own shop/);
    const err = await apiError(buyer.client.checkout.placeOrder({ address_id: 1, items: [{ model_id: SEED.items.buds.modelId, quantity: 1 }] }));
    expect(err.status).toBe(404);
  });

  it('shipping quote lists options per shop', async () => {
    const quote = await buyer.client.shipping.quote([{ model_id: SEED.items.pan.small, quantity: 3 }], 'CARD_SIM');
    expect(quote[0]!.options.map((o) => o.logistics_channel_id)).toEqual([50011, 50012, 50018, 50021, 50066]);
    const ghtk = quote[0]!.options.find((o) => o.logistics_channel_id === 50018)!;
    expect(ghtk.shipping_fee).toBe(15000 + 4000 * 3); // 3.3kg -> ceil(2.3) = 3 extra kg
  });

  it('buyers cannot read each other\'s orders', async () => {
    const mine = (await buyer.client.buyer.orders.list()).data[0]!;
    const stranger = await newBuyer();
    expect((await apiError(stranger.client.buyer.orders.get(mine.order_sn))).status).toBe(404);
    expect((await apiError(stranger.client.buyer.orders.tracking(mine.order_sn))).status).toBe(404);
    expect((await apiError(stranger.client.buyer.orders.cancel(mine.order_sn))).status).toBe(404);
  });

  it('buyer cancellation restores stock and voucher usage', async () => {
    const order = await buyer.client.checkout.placeOrder({
      address_id: buyer.addressId,
      items: [{ model_id: SEED.items.tee.blackM, quantity: 2 }],
      shops: [{ shop_id: SEED.sellers.saigonStyle.shopId, voucher_code: 'STYLE30K' }],
    });
    const placed = order.orders[0]!;
    // 2 x 189k = 378k >= 300k minimum spend -> 30k off; free shipping threshold is 399k so shipping is charged.
    expect(placed.amounts).toMatchObject({ items_subtotal: 378000, voucher_discount: 30000, shipping_discount: 0 });
    expect(placed.amounts.total_amount).toBe(378000 - 30000 + placed.amounts.shipping_fee);
    const usage = async () => (await db().query(`SELECT current_usage FROM vouchers WHERE code = 'STYLE30K'`)).rows[0].current_usage as number;
    const stock = async () => (await anon.marketplace.getProduct(SEED.items.tee.itemId)).models.find((m) => m.model_id === SEED.items.tee.blackM)!.stock;
    const [usageBefore, stockBefore] = [await usage(), await stock()];

    // A second order with the same voucher is rejected (one use per buyer).
    const again = await buyer.client.checkout.preview({
      items: [{ model_id: SEED.items.tee.blackM, quantity: 2 }],
      shops: [{ shop_id: SEED.sellers.saigonStyle.shopId, voucher_code: 'STYLE30K' }],
    });
    expect(again.groups[0]!.voucher!.reason).toBe('You have already used this voucher');

    const cancelled = await buyer.client.buyer.orders.cancel(placed.order_sn, 'Đặt nhầm size');
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancel_by: 'buyer', cancel_reason: 'Đặt nhầm size' });
    expect(await usage()).toBe(usageBefore - 1);
    expect(await stock()).toBe(stockBefore + 2);
    expect((await apiError(buyer.client.buyer.orders.cancel(placed.order_sn))).code).toBe('INVALID_STATE');
  });

  it('buyer orders list filters by multiple statuses with server-side pagination', async () => {
    const readyOnly = await buyer.client.buyer.orders.list({ status: 'READY_TO_SHIP' });
    expect(readyOnly.data.length).toBeGreaterThanOrEqual(1);
    expect(readyOnly.data.every((o) => o.status === 'READY_TO_SHIP')).toBe(true);

    const multiArray = await buyer.client.buyer.orders.list({
      status: ['READY_TO_SHIP', 'CANCELLED'],
      page: 1,
      page_size: 1,
    });
    expect(multiArray.data).toHaveLength(1);
    expect(['READY_TO_SHIP', 'CANCELLED']).toContain(multiArray.data[0]!.status);
    expect(multiArray.page.page).toBe(1);
    expect(multiArray.page.page_size).toBe(1);
    expect(multiArray.page.total).toBeGreaterThanOrEqual(2);
    expect(multiArray.page.has_next).toBe(true);

    const multiCsv = await buyer.client.buyer.orders.list({
      status: 'READY_TO_SHIP,CANCELLED',
      page: 1,
      page_size: 10,
    });
    const statuses = multiCsv.data.map((o) => o.status);
    expect(statuses).toContain('READY_TO_SHIP');
    expect(statuses).toContain('CANCELLED');
    expect(statuses.every((s) => s === 'READY_TO_SHIP' || s === 'CANCELLED')).toBe(true);
  });
});
