import { describe, expect, it } from 'vitest';
import type { CategoryNode, ProductDetail, ProductModel, ProductSummary, PublicVoucher } from '@huspee/sdk';
import {
  discountPercent,
  emptySelection,
  optionState,
  selectedModel,
  soldOutModels,
  toggleOption,
} from '../../apps/web/src/components/product/variants.js';
import { dayRange } from '../../apps/web/src/components/product/shipping.js';
import { categoryPath, categoryTabs } from '../../apps/web/src/components/shop/categories.js';
import { voucherStub, vouchersForItem } from '../../apps/web/src/components/shop/vouchers.js';

const model = (id: number, tier: number[], stock: number, price = 100): ProductModel => ({
  model_id: id,
  tier_index: tier,
  name: tier.join(','),
  price,
  original_price: price,
  promotion_end_time: null,
  stock,
  available: stock > 0,
});
const product = (tiers: string[][], models: ProductModel[]) =>
  ({
    tier_variations: tiers.map((options, i) => ({ name: `tier${i}`, options: options.map((option) => ({ option, image_url: null })) })),
    models,
  }) as ProductDetail;

// Colour × storage, like the seeded Galaxy A55, with Navy 256GB sold out and no Lilac 512GB.
const phone = product(
  [
    ['Navy', 'Lilac'],
    ['128GB', '256GB', '512GB'],
  ],
  [model(1, [0, 0], 30), model(2, [0, 1], 0), model(3, [1, 0], 22), model(4, [1, 1], 3, 120), model(5, [0, 2], 2)],
);

describe('product variations', () => {
  it('finds the model only for a complete selection', () => {
    expect(selectedModel(phone, emptySelection(phone))).toBeUndefined();
    expect(selectedModel(phone, [1, -1])).toBeUndefined();
    expect(selectedModel(phone, [1, 1])?.model_id).toBe(4);
    const single = product([], [model(9, [], 5)]);
    expect(selectedModel(single, [])?.model_id).toBe(9);
  });

  it('disables sold-out options and options ruled out by other choices', () => {
    expect(optionState(phone, [-1, -1], 1, 1)).toBe('available'); // Lilac 256GB has stock
    expect(optionState(phone, [0, -1], 1, 1)).toBe('unavailable'); // Navy 256GB is sold out
    expect(optionState(phone, [1, -1], 1, 2)).toBe('unavailable'); // no Lilac 512GB
    const mouse = product([['Black', 'Blue']], [model(1, [0], 4), model(2, [1], 0)]);
    expect(optionState(mouse, [-1], 0, 1)).toBe('sold_out');
    expect(soldOutModels(mouse)).toBe(1);
  });

  it('toggles a choice and keeps the other tiers', () => {
    expect(toggleOption([0, 1], 0, 1)).toEqual([1, 1]);
    expect(toggleOption([1, 1], 0, 1)).toEqual([-1, 1]);
  });

  it('rounds the discount like the marketplace search', () => {
    expect(discountPercent(18_490_000, 19_990_000)).toBe(8);
    expect(discountPercent(790_000, 990_000)).toBe(20);
    expect(discountPercent(100, 100)).toBe(0);
  });
});

describe('shop catalog helpers', () => {
  const tree: CategoryNode[] = [
    {
      category_id: 1,
      name: 'phones',
      display_name: 'Phones & Accessories',
      image_url: null,
      children: [
        { category_id: 10, name: 'phone', display_name: 'Phones', image_url: null, children: [] },
        { category_id: 11, name: 'audio', display_name: 'Headphones', image_url: null, children: [] },
      ],
    },
  ];
  const summary = (category_id: number) => ({ category_id }) as ProductSummary;

  it('lists the categories a shop sells in, most products first', () => {
    expect(categoryTabs([summary(11), summary(10), summary(11), summary(99)], tree)).toEqual([
      { category_id: 11, name: 'Headphones', count: 2 },
      { category_id: 10, name: 'Phones', count: 1 },
    ]);
  });

  it('builds the breadcrumb path to a category', () => {
    expect(categoryPath(tree, 10).map((c) => c.display_name)).toEqual(['Phones & Accessories', 'Phones']);
    expect(categoryPath(tree, 42)).toEqual([]);
  });

  it('formats voucher stubs and keeps only vouchers that apply to the item', () => {
    const voucher = (over: Partial<PublicVoucher>) =>
      ({ reward_type: 'fixed_amount', discount_amount: 50_000, percentage: null, voucher_type: 'shop', item_id_list: [], status: 'ongoing', ...over }) as PublicVoucher;
    expect(voucherStub(voucher({}), 'vi')).toBe('50K');
    expect(voucherStub(voucher({ discount_amount: 1_500_000 }), 'vi')).toBe('1,5TR');
    expect(voucherStub(voucher({ discount_amount: 1_500_000 }), 'en')).toBe('1.5M');
    expect(voucherStub(voucher({ reward_type: 'percentage', percentage: 10 }), 'en')).toBe('10%');
    const list = [
      voucher({ voucher_code: 'SHOP' }),
      voucher({ voucher_code: 'ITEM', voucher_type: 'product', item_id_list: [7] }),
      voucher({ voucher_code: 'OTHER', voucher_type: 'product', item_id_list: [8] }),
      voucher({ voucher_code: 'OLD', status: 'expired' }),
    ];
    expect(vouchersForItem(list, 7).map((v) => v.voucher_code)).toEqual(['SHOP', 'ITEM']);
  });

  it('formats shipping day ranges as the API sends them', () => {
    expect(dayRange('2-4')).toBe('2–4');
    expect(dayRange('1-1')).toBe('1');
    expect(dayRange('3')).toBe('3');
  });
});
