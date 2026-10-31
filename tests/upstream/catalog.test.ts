/**
 * UPSTREAM COMPATIBILITY: shop, shop_category, product, media and voucher modules through
 * unmodified ShopeeSDK methods. Every write is followed by an SDK read to confirm persistence.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ShopeeSDK } from '@congminh1254/shopee-sdk';
import { SEED } from '../helpers/env.js';
import { connectUpstream, newSellerWithShop } from '../helpers/fixtures.js';

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return (err as { data: { error: string; message: string } }).data;
  }
  throw new Error('Expected failure');
};

describe('seeded shop reads (TechZone)', () => {
  let sdk: ShopeeSDK;
  beforeAll(async () => {
    sdk = await connectUpstream(SEED.sellers.techzone.shopId, SEED.sellers.techzone.email);
  });

  it('shop.get_shop_info / get_profile / get_shop_holiday_mode', async () => {
    const info = await sdk.shop.getShopInfo();
    expect(info).toMatchObject({ shop_name: 'TechZone Official', region: 'VN', status: 'NORMAL', is_cb: false });
    const profile = await sdk.shop.getProfile();
    expect(profile.response).toMatchObject({ shop_name: 'TechZone Official' });
    expect(profile.response.shop_logo).toMatch(/^http:\/\/localhost:\d+\/media\//);
    const holiday = await sdk.shop.getShopHolidayMode();
    expect(holiday.response.holiday_mode_on).toBe(false);
  });

  it('product.get_item_list paginates with offset/has_next_page', async () => {
    const page1 = await sdk.product.getItemList({ offset: 0, page_size: 4, item_status: ['NORMAL'] as never });
    expect(page1.response.total_count).toBe(20);
    expect(page1.response.item).toHaveLength(4);
    expect(page1.response.has_next_page).toBe(true);
    expect(page1.response.next_offset).toBe(4);
    expect(page1.response.item![0]!.update_time).toBeInstanceOf(Date); // SDK timestampPaths conversion
    const page2 = await sdk.product.getItemList({ offset: 4, page_size: 4, item_status: ['NORMAL'] as never });
    expect(page2.response.item).toHaveLength(4);
    expect(page2.response.has_next_page).toBe(true);
    expect(page2.response.next_offset).toBe(8);
    const last = await sdk.product.getItemList({ offset: 16, page_size: 4, item_status: ['NORMAL'] as never });
    expect(last.response.item).toHaveLength(4);
    expect(last.response.has_next_page).toBe(false);
  });

  it('product.search_item is shop-scoped', async () => {
    const res = await sdk.product.searchItem({ page_size: 10, item_name: 'iphone' });
    expect(res.response.item_id_list).toEqual([SEED.items.iphone.itemId]);
    const none = await sdk.product.searchItem({ page_size: 10, item_name: 'Cocoon' });
    expect(none.response.item_id_list).toEqual([]);
  });

  it('product.get_item_base_info returns Shopee shapes and hides other shops\' items', async () => {
    const res = await sdk.product.getItemBaseInfo({ item_id_list: [SEED.items.buds.itemId, SEED.items.iphone.itemId, SEED.items.cocoon.itemId] });
    const items = res.response.item_list!;
    expect(items.map((i) => i.item_id)).toEqual([SEED.items.buds.itemId, SEED.items.iphone.itemId]);
    const buds = items[0]!;
    expect(buds).toMatchObject({
      item_name: 'Tai nghe Bluetooth Xiaomi Redmi Buds 5',
      item_status: 'NORMAL',
      has_model: false,
      has_promotion: true,
      brand: { brand_id: 3003, original_brand_name: 'Xiaomi' },
      price_info: [{ currency: 'VND', original_price: 990000, current_price: 790000 }],
    });
    expect(buds.image!.image_id_list).toHaveLength(2);
    expect(buds.attribute_list![0]).toMatchObject({ attribute_id: 200111, original_attribute_name: 'Connectivity' });
    const iphone = items[1]!;
    expect(iphone.has_model).toBe(true);
    expect(iphone.price_info).toBeUndefined();
  });

  it('product.get_model_list exposes variant price and stock', async () => {
    const res = await sdk.product.getModelList({ item_id: SEED.items.iphone.itemId });
    expect(res.response.tier_variation).toMatchObject([{ name: 'Màu sắc', option_list: [{ option: 'Đen' }, { option: 'Hồng' }, { option: 'Xanh dương' }] }]);
    for (const option of res.response.tier_variation[0]!.option_list)
      expect(option.image?.image_url).toMatch(/^http:\/\/localhost:\d+\/media\/generated-2000101-/);
    const black = res.response.model.find((m) => m.model_id === SEED.items.iphone.blackModel)!;
    expect(black.tier_index).toEqual([0]);
    expect(black.price_info[0]).toMatchObject({ original_price: 19990000, current_price: 18490000 });
    expect(black.stock_info_v2!.seller_stock![0]!.stock).toBe(25);
  });

  it('cross-shop model/item reads fail with error_not_found', async () => {
    const err = await fail(sdk.product.getModelList({ item_id: SEED.items.cocoon.itemId }));
    expect(err.error).toBe('error_not_found');
  });

  it('extra info, comments, promotions', async () => {
    const extra = await sdk.product.getItemExtraInfo({ item_id_list: [SEED.items.buds.itemId] });
    expect(extra.response.item_list![0]).toMatchObject({ item_id: SEED.items.buds.itemId, rating_star: 5, comment_count: 1 });
    const comments = await sdk.product.getComment({ item_id: SEED.items.buds.itemId, cursor: '', page_size: 10 });
    expect(comments.response.item_comment_list![0]).toMatchObject({ rating_star: 5, item_id: SEED.items.buds.itemId, order_sn: '261003SEEDA001' });
    expect(comments.response.item_comment_list![0]!.buyer_username).toMatch(/\*/);
    const promo = await sdk.product.getItemPromotion({ item_id_list: [SEED.items.iphone.itemId] });
    const promotions = promo.response.success_list![0]!.promotion!;
    expect(promotions.map((p) => p.model_id).sort()).toEqual([3000101, 3000102]);
    expect(promotions[0]).toMatchObject({ promotion_type: 'Discount Promotions', promotion_staging: 'ongoing' });
  });

  it('taxonomy: get_category, get_attribute_tree, get_brand_list', async () => {
    const cats = await sdk.product.getCategory({ language: 'vi' });
    const phones = cats.response.category_list!.find((c) => c.category_id === 100010)!;
    expect(phones).toMatchObject({ parent_category_id: 100001, display_category_name: 'Điện thoại', has_children: false });
    const tree = await sdk.product.getAttributeTree({ category_id_list: [100010] });
    expect(tree.response.list![0]!.attribute_tree!.map((a) => a.attribute_id)).toEqual([200101, 200102]);
    const brands = await sdk.product.getBrandList({ offset: 0, page_size: 50, category_id: 100010, status: 1 });
    expect(brands.response.brand_list!.map((b) => b.original_brand_name)).toEqual(expect.arrayContaining(['Apple', 'Samsung', 'Xiaomi']));
    expect(brands.response.brand_list!.map((b) => b.original_brand_name)).not.toContain('Cocoon');
  });

  it('shop_category reads', async () => {
    const list = await sdk.shopCategory.getShopCategoryList({ page_no: 1, page_size: 10 });
    const names = list.response.shop_categorys!.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Điện thoại hot', 'Phụ kiện bán chạy']));
    const hot = list.response.shop_categorys!.find((c) => c.name === 'Điện thoại hot')!;
    const items = await sdk.shopCategory.getItemList({ shop_category_id: hot.shop_category_id! });
    expect(items.response.item_list).toEqual([SEED.items.iphone.itemId, SEED.items.galaxy.itemId]);
  });
});

describe('product lifecycle on a fresh shop (writes persist)', () => {
  let sdk: ShopeeSDK;
  let imageId: string;
  let itemId: number;

  beforeAll(async () => {
    const seller = await newSellerWithShop();
    sdk = await connectUpstream(seller.shopId, seller.email);
  });

  it('media_space.upload_image (multipart) and media.upload_image', async () => {
    const res = await sdk.mediaSpace.uploadImage({ image: PNG });
    imageId = res.response.image_info!.image_id!;
    expect(imageId).toMatch(/^vn-11134207-/);
    const url = res.response.image_info!.image_url_list![0]!.image_url!;
    const fetched = await fetch(url);
    expect(fetched.headers.get('content-type')).toBe('image/png');

    const legacy = await sdk.media.uploadImage({ business: 2, scene: 1, images: PNG });
    expect(legacy.response.image_list![0]!.image_id).toMatch(/^vn-/);
  });

  it('add_item -> get_item_base_info read-back', async () => {
    const res = await sdk.product.addItem({
      original_price: 250000,
      description: 'Bình giữ nhiệt inox 500ml, giữ nóng 12 giờ.',
      weight: 0.4,
      item_name: 'Bình giữ nhiệt Test 500ml',
      category_id: 100060,
      image: { image_id_list: [imageId] },
      logistic_info: [{ logistic_id: 50011, enabled: true }, { logistic_id: 50018, enabled: true }],
      seller_stock: [{ stock: 30 }],
      attribute_list: [{ attribute_id: 200601, attribute_value_list: [{ value_id: 1 }] }],
      item_sku: 'TEST-BOTTLE',
      brand: { brand_id: 0, original_brand_name: 'NoBrand' },
    });
    itemId = res.response.item_id;
    expect(res.response).toMatchObject({ item_name: 'Bình giữ nhiệt Test 500ml', item_status: 'NORMAL' });
    const read = await sdk.product.getItemBaseInfo({ item_id_list: [itemId] });
    expect(read.response.item_list![0]).toMatchObject({
      item_sku: 'TEST-BOTTLE',
      price_info: [{ original_price: 250000, current_price: 250000 }],
      stock_info_v2: { seller_stock: [{ stock: 30 }] },
      logistic_info: [{ logistic_id: 50011, enabled: true }, { logistic_id: 50018, enabled: true }],
    });
  });

  it('add_item validation errors use error_param', async () => {
    const err = await fail(
      sdk.product.addItem({
        original_price: 250000,
        description: 'x',
        weight: 0.4,
        item_name: 'Bad',
        category_id: 100006, // not a leaf
        image: { image_id_list: [imageId] },
        logistic_info: [{ logistic_id: 50011, enabled: true }],
        seller_stock: [{ stock: 1 }],
      }),
    );
    expect(err).toMatchObject({ error: 'error_param', message: 'category_id must be a leaf category' });
  });

  it('update_item, update_price and update_stock (model_id 0) persist', async () => {
    await sdk.product.updateItem({ item_id: itemId, item_name: 'Bình giữ nhiệt Test 750ml', description: 'Phiên bản 750ml.' });
    const price = await sdk.product.updatePrice({ item_id: itemId, price_list: [{ model_id: 0, original_price: 279000 }] });
    expect(price.response.success_list).toEqual([{ model_id: 0, original_price: 279000 }]);
    const stock = await sdk.product.updateStock({ item_id: itemId, stock_list: [{ model_id: 0, seller_stock: [{ stock: 12 }] }] });
    expect(stock.response.success_list).toEqual([{ model_id: 0, location_id: '', stock: 12 }]);
    const read = (await sdk.product.getItemBaseInfo({ item_id_list: [itemId] })).response.item_list![0]!;
    expect(read.item_name).toBe('Bình giữ nhiệt Test 750ml');
    expect(read.price_info![0]!.original_price).toBe(279000);
    expect((read as { stock_info_v2?: { seller_stock: Array<{ stock: number }> } }).stock_info_v2!.seller_stock[0]!.stock).toBe(12);
  });

  it('init_tier_variation, add_model, update_model, update_price per model', async () => {
    const init = await sdk.product.initTierVariation({
      item_id: itemId,
      tier_variation: [{ name: 'Màu', option_list: [{ option: 'Bạc' }, { option: 'Đen' }] }],
      model: [
        { tier_index: [0], original_price: 279000, model_sku: 'BOT-SLV', seller_stock: [{ stock: 5 }] },
        { tier_index: [1], original_price: 289000, model_sku: 'BOT-BLK', seller_stock: [{ stock: 7 }] },
      ],
    } as never);
    expect(init.response.model).toHaveLength(2);
    // Add a third option then a model for it.
    await sdk.product.updateTierVariation({ item_id: itemId, tier_variation: [{ name: 'Màu', option_list: [{ option: 'Bạc' }, { option: 'Đen' }, { option: 'Xanh' }] }] } as never);
    const added = await sdk.product.addModel({ item_id: itemId, model_list: [{ tier_index: [2], original_price: 299000, seller_stock: [{ stock: 3 }] }] });
    const blueId = added.response.model![0]!.model_id!;
    await sdk.product.updateModel({ item_id: itemId, model: [{ model_id: blueId, model_sku: 'BOT-BLU' }] });
    await sdk.product.updatePrice({ item_id: itemId, price_list: [{ model_id: blueId, original_price: 309000 }] });
    const dup = await fail(sdk.product.addModel({ item_id: itemId, model_list: [{ tier_index: [2], original_price: 1000, seller_stock: [{ stock: 1 }] }] }));
    expect(dup.error).toBe('error_param');

    const models = await sdk.product.getModelList({ item_id: itemId });
    expect(models.response.tier_variation[0]!.option_list.map((o) => o.option)).toEqual(['Bạc', 'Đen', 'Xanh']);
    const blue = models.response.model.find((m) => m.model_id === blueId)!;
    expect(blue).toMatchObject({ model_sku: 'BOT-BLU', tier_index: [2], price_info: [{ original_price: 309000 }] });
    const base = (await sdk.product.getItemBaseInfo({ item_id_list: [itemId] })).response.item_list![0]!;
    expect(base.has_model).toBe(true);
  });

  it('update_stock reports failures for unknown models', async () => {
    const res = await sdk.product.updateStock({ item_id: itemId, stock_list: [{ model_id: 999999999, seller_stock: [{ stock: 1 }] }] });
    expect(res.response.failure_list).toEqual([{ model_id: 999999999, failed_reason: 'model not found' }]);
  });

  it('unlist_item and delete_item change item_status', async () => {
    await sdk.product.unlistItem({ item_list: [{ item_id: itemId, unlist: true }] });
    const unlisted = await sdk.product.getItemList({ offset: 0, page_size: 10, item_status: ['UNLIST'] as never });
    expect(unlisted.response.item!.map((i) => i.item_id)).toContain(itemId);
    await sdk.product.deleteItem({ item_id: itemId });
    const deleted = await sdk.product.getItemList({ offset: 0, page_size: 10, item_status: ['SELLER_DELETE'] as never });
    expect(deleted.response.item!.map((i) => i.item_id)).toContain(itemId);
    const gone = await fail(sdk.product.getModelList({ item_id: itemId }));
    expect(gone.error).toBe('error_not_found');
  });

  it('shop.update_profile and shop_category writes', async () => {
    await sdk.shop.updateProfile({ description: 'Mô tả mới cho shop test' });
    expect((await sdk.shop.getProfile()).response.description).toBe('Mô tả mới cho shop test');

    const created = await sdk.shopCategory.addShopCategory({ name: 'Hàng mới về', sort_weight: 10 });
    const categoryId = created.response.shop_category_id!;
    await sdk.shopCategory.updateShopCategory({ shop_category_id: categoryId, name: 'Hàng mới về 2026' });
    const item = await sdk.product.addItem({
      original_price: 99000,
      description: 'Muỗng inox',
      weight: 0.1,
      item_name: 'Muỗng inox Test',
      category_id: 100060,
      image: { image_id_list: [imageId] },
      logistic_info: [{ logistic_id: 50011, enabled: true }],
      seller_stock: [{ stock: 100 }],
    });
    const added = await sdk.shopCategory.addItemList({ shop_category_id: categoryId, item_list: [item.response.item_id, SEED.items.iphone.itemId] });
    expect(added.response.current_count).toBe(1);
    expect(added.response.invalid_item_id_list).toHaveLength(1);
    const list = await sdk.shopCategory.getShopCategoryList({ page_no: 1, page_size: 10 });
    expect(list.response.shop_categorys).toEqual([{ shop_category_id: categoryId, status: 1, name: 'Hàng mới về 2026', sort_weight: 10, created_by: 'Seller' }]);
    expect((await sdk.shopCategory.getItemList({ shop_category_id: categoryId })).response.item_list).toEqual([item.response.item_id]);
  });
});

describe('voucher module', () => {
  let sdk: ShopeeSDK;
  beforeAll(async () => {
    const seller = await newSellerWithShop();
    sdk = await connectUpstream(seller.shopId, seller.email);
  });

  it('add -> get -> list -> update -> end', async () => {
    const now = Math.floor(Date.now() / 1000);
    const added = await sdk.voucher.addVoucher({
      voucher_name: 'Giảm 20K',
      voucher_code: 'TEST20K',
      start_time: now + 3600,
      end_time: now + 7 * 86400,
      voucher_type: 1,
      reward_type: 1,
      usage_quantity: 100,
      min_basket_price: 200000,
      discount_amount: 20000,
    });
    const voucherId = added.response.voucher_id!;
    const got = await sdk.voucher.getVoucher({ voucher_id: voucherId });
    expect(got.response).toMatchObject({ voucher_code: 'TEST20K', reward_type: 1, discount_amount: 20000, min_basket_price: 200000, usage_quantity: 100 });

    const upcoming = await sdk.voucher.getVoucherList({ page_no: 1, page_size: 10, status: 'upcoming' });
    expect(upcoming.response.voucher_list!.map((v) => v.voucher_id)).toContain(voucherId);

    await sdk.voucher.updateVoucher({ voucher_id: voucherId, start_time: now + 5, usage_quantity: 150 });
    const dupe = await fail(
      sdk.voucher.addVoucher({ voucher_name: 'x', voucher_code: 'TEST20K', start_time: now + 60, end_time: now + 3600, voucher_type: 1, reward_type: 1, usage_quantity: 1, min_basket_price: 0, discount_amount: 1000 }),
    );
    expect(dupe.error).toBe('voucher.error_duplicate_code');

    await new Promise((r) => setTimeout(r, 6000));
    const ongoing = await sdk.voucher.getVoucherList({ page_no: 1, page_size: 10, status: 'ongoing' });
    expect(ongoing.response.voucher_list!.map((v) => v.voucher_id)).toContain(voucherId);
    const locked = await fail(sdk.voucher.updateVoucher({ voucher_id: voucherId, discount_amount: 50000 }));
    expect(locked.error).toBe('error_invalid_status');

    await sdk.voucher.endVoucher({ voucher_id: voucherId });
    const expired = await sdk.voucher.getVoucherList({ page_no: 1, page_size: 10, status: 'expired' });
    expect(expired.response.voucher_list!.map((v) => v.voucher_id)).toContain(voucherId);
  }, 20_000);

  it('rejects coin cashback and invalid windows', async () => {
    const now = Math.floor(Date.now() / 1000);
    const coin = await fail(
      sdk.voucher.addVoucher({ voucher_name: 'x', voucher_code: 'COIN', start_time: now + 60, end_time: now + 3600, voucher_type: 1, reward_type: 3, usage_quantity: 1, min_basket_price: 0, percentage: 5 }),
    );
    expect(coin.error).toBe('error_param');
    const window = await fail(
      sdk.voucher.addVoucher({ voucher_name: 'x', voucher_code: 'WIN', start_time: now + 3600, end_time: now + 60, voucher_type: 1, reward_type: 1, usage_quantity: 1, min_basket_price: 0, discount_amount: 1000 }),
    );
    expect(window.message).toBe('end_time must be after start_time');
  });
});
