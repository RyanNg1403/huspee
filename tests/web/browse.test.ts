import { describe, expect, it } from 'vitest';
import type { CategoryNode, PublicShop, PublicVoucher } from '@huspee/sdk';
import {
  activeFilterCount,
  CLEARED_FILTERS,
  parsePrice,
  parseSearch,
  pickFilters,
  searchHref,
  toApiQuery,
  validPriceRange,
} from '../../apps/web/src/app/(buyer)/_browse/search-query.js';
import {
  compactVnd,
  featuredFreeShipping,
  featuredVoucher,
  usableShopVouchers,
  voucherBadge,
  type ShopOffers,
} from '../../apps/web/src/app/(buyer)/_browse/offers.js';
import { addToHistory, HISTORY_LIMIT, parseHistory } from '../../apps/web/src/components/layout/search-history.js';
import { mobileChrome } from '../../apps/web/src/components/layout/chrome.js';
import {
  categoryChoices,
  categoryLabel,
  findCategory,
  rootOf,
  shortcutCategories,
} from '../../apps/web/src/components/catalog/categories.js';

const params = (qs: string) => new URLSearchParams(qs);

describe('search URL state', () => {
  it('reads only filters the marketplace search supports', () => {
    const state = parseSearch(
      params('q=%20iphone%20&category_id=100010&min_price=abc&max_price=11000000&min_rating=9&has_promotion=true&in_stock=yes&sort=bogus&page=2&city=Ha+Noi'),
    );
    expect(state).toEqual({
      q: 'iphone',
      category_id: 100010,
      shop_id: undefined,
      min_price: undefined,
      max_price: 11_000_000,
      min_rating: undefined,
      has_promotion: true,
      in_stock: undefined,
      sort: 'relevance',
      page: 2,
    });
    expect(toApiQuery(state)).toMatchObject({ q: 'iphone', page: 2, page_size: 30, sort: 'relevance' });
  });

  it('builds canonical links and returns to page 1 on any change', () => {
    const state = parseSearch(params('q=iphone&page=3&sort=price_asc'));
    expect(searchHref(state, { has_promotion: true })).toBe('/search?q=iphone&has_promotion=true&sort=price_asc');
    expect(searchHref(state, { page: 2 })).toBe('/search?q=iphone&sort=price_asc&page=2');
    expect(searchHref(state, { sort: 'relevance' })).toBe('/search?q=iphone');
    expect(searchHref(parseSearch(params('')))).toBe('/search');
  });

  it('clears filters but keeps keyword and sort', () => {
    const state = parseSearch(params('q=ao&sort=newest&category_id=100004&min_price=1&max_price=2&in_stock=true'));
    expect(activeFilterCount(pickFilters(state))).toBe(3);
    expect(searchHref(state, CLEARED_FILTERS)).toBe('/search?q=ao&sort=newest');
  });

  it('parses typed prices and validates the range', () => {
    expect(parsePrice('11.000.000')).toBe(11_000_000);
    expect(parsePrice(' ')).toBeUndefined();
    expect(validPriceRange(5, undefined)).toBe(true);
    expect(validPriceRange(10, 5)).toBe(false);
  });
});

const voucher = (over: Partial<PublicVoucher>): PublicVoucher => ({
  voucher_code: 'X',
  voucher_name: 'X',
  voucher_type: 'shop',
  reward_type: 'fixed_amount',
  discount_amount: 50_000,
  percentage: null,
  max_discount: null,
  min_spend: 500_000,
  item_id_list: [],
  start_time: 0,
  end_time: 0,
  status: 'ongoing',
  fully_redeemed: false,
  ...over,
});
const shop = (shop_id: number) => ({ shop_id, shop_name: `S${shop_id}` }) as PublicShop;

describe('shop offers', () => {
  const tech50 = voucher({ voucher_code: 'TECH50K' });
  const tech10 = voucher({ voucher_code: 'TECH10', reward_type: 'percentage', percentage: 10, max_discount: 300_000, discount_amount: null });
  const offers: ShopOffers[] = [
    { shop: shop(1), vouchers: [tech50, tech10], freeShippingMinSpend: 500_000 },
    { shop: shop(2), vouchers: [voucher({ status: 'expired' })], freeShippingMinSpend: 299_000 },
  ];

  it('keeps only usable shop-wide vouchers', () => {
    expect(
      usableShopVouchers([tech50, voucher({ fully_redeemed: true }), voucher({ voucher_type: 'product' }), voucher({ status: 'upcoming' })]),
    ).toEqual([tech50]);
  });

  it('features the voucher with the highest configured ceiling and another shop for free shipping', () => {
    expect(featuredVoucher(offers)?.voucher.voucher_code).toBe('TECH10');
    expect(featuredFreeShipping(offers, 1)).toEqual({ shop: shop(2), minSpend: 299_000 });
    expect(featuredFreeShipping(offers.slice(0, 1), 1)?.shop.shop_id).toBe(1);
    expect(featuredVoucher([offers[1]!])).toBeNull();
  });

  it('formats compact amounts', () => {
    expect(voucherBadge(tech10)).toBe('10%');
    expect(voucherBadge(tech50)).toBe('50K');
    expect(compactVnd(2_000_000)).toBe('2tr');
    expect(compactVnd(1_500_000, 'en')).toBe('1.5M');
    expect(compactVnd(1_500_000, 'vi')).toBe('1,5tr');
  });
});

describe('search history', () => {
  it('puts the newest keyword first without case-insensitive duplicates', () => {
    expect(addToHistory(['tai nghe', 'Áo thun'], ' áo thun ')).toEqual(['áo thun', 'tai nghe']);
    expect(addToHistory(['a'], '  ')).toEqual(['a']);
    const full = Array.from({ length: HISTORY_LIMIT }, (_, i) => `k${i}`);
    expect(addToHistory(full, 'new')).toHaveLength(HISTORY_LIMIT);
  });

  it('ignores corrupted storage', () => {
    expect(parseHistory('{bad')).toEqual([]);
    expect(parseHistory('{"a":1}')).toEqual([]);
    expect(parseHistory('["iphone", 3, ""]')).toEqual(['iphone']);
  });
});

describe('mobile chrome', () => {
  it('shows the tab bar only on tab roots and leaves the search page its own header', () => {
    expect(mobileChrome('/')).toEqual({ header: true, tabs: true, back: false });
    expect(mobileChrome('/messages').tabs).toBe(true);
    expect(mobileChrome('/messages/5').tabs).toBe(false);
    expect(mobileChrome('/account/addresses').tabs).toBe(true);
    expect(mobileChrome('/search').header).toBe(false);
    expect(mobileChrome('/products/1')).toEqual({ header: true, tabs: false, back: true });
  });
});

const node = (category_id: number, children: CategoryNode[] = []): CategoryNode => ({
  category_id,
  name: `en${category_id}`,
  display_name: `vi${category_id}`,
  image_url: null,
  children,
});

describe('category helpers', () => {
  const tree = [node(1, [node(10), node(11)]), node(2, [node(20)]), node(3)];

  it('finds categories and their roots', () => {
    expect(findCategory(tree, 20)?.category_id).toBe(20);
    expect(findCategory(tree, 99)).toBeNull();
    expect(rootOf(tree, 11)?.category_id).toBe(1);
    expect(categoryLabel(tree[0]!, 'en')).toBe('en1');
    expect(categoryLabel(tree[0]!, 'vi')).toBe('vi1');
  });

  it('expands only the selected root among filter choices', () => {
    expect(categoryChoices(tree, 10).map((c) => [c.category.category_id, c.depth])).toEqual([
      [1, 0],
      [10, 1],
      [11, 1],
      [2, 0],
      [3, 0],
    ]);
    expect(categoryChoices(tree, undefined)).toHaveLength(3);
  });

  it('spreads shortcuts across departments', () => {
    expect(shortcutCategories(tree, 2).map((c) => c.category_id)).toEqual([10, 20]);
    expect(shortcutCategories(tree, 5).map((c) => c.category_id)).toEqual([10, 20, 3]);
  });
});
