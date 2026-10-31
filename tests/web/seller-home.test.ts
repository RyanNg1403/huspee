import { describe, expect, it } from 'vitest';
import {
  chartPath,
  compare,
  conversationIssues,
  cumulativeByHour,
  dayStarts,
  niceStep,
  salesPoints,
} from '../../apps/seller-web/src/app/(seller)/_home/aggregate.js';
import { activeNavKey, sellerNav } from '../../apps/seller-web/src/components/shell/nav.js';

const DAY = Math.floor(new Date(2026, 9, 31).getTime() / 1000);
const at = (hour: number, minute = 0) => DAY + hour * 3600 + minute * 60;

describe('seller overview aggregation', () => {
  it('finds local midnight of today and yesterday', () => {
    expect(dayStarts(new Date(2026, 9, 31, 14, 50))).toEqual({
      today: DAY,
      yesterday: Math.floor(new Date(2026, 9, 30).getTime() / 1000),
    });
  });

  it('accumulates values by hour and ignores points outside the day', () => {
    const points = [
      { time: at(8, 12), value: 366_100 },
      { time: at(9, 40), value: 890_000 },
      { time: at(9, 59), value: 10 },
      { time: at(14, 39), value: 10_190_000 },
      { time: DAY - 60, value: 999 },
      { time: at(15), value: 1 },
    ];
    const series = cumulativeByHour(points, DAY, 15);
    expect(series).toHaveLength(15);
    expect(series.slice(7, 11)).toEqual([0, 366_100, 1_256_110, 1_256_110]);
    expect(series[14]).toBe(11_446_110);
  });

  it('counts revenue like the dashboard summary: no cancelled or unpaid orders', () => {
    const { revenue, orders } = salesPoints([
      { create_time: at(9), order_status: 'READY_TO_SHIP', total_amount: 790_000 },
      { create_time: at(10), order_status: 'CANCELLED', total_amount: 349_000 },
      { create_time: at(11), order_status: 'UNPAID', total_amount: 120_000 },
      { create_time: at(12), order_status: 'COMPLETED', total_amount: 648_000 },
    ]);
    expect(revenue).toEqual([
      { time: at(9), value: 790_000 },
      { time: at(12), value: 648_000 },
    ]);
    expect(orders).toHaveLength(4);
    expect(orders.every((o) => o.value === 1)).toBe(true);
  });

  it('picks axis steps that cover the maximum in four steps', () => {
    expect(niceStep(15_219_000, false)).toBe(5_000_000);
    expect(niceStep(13_624_100, false)).toBe(5_000_000);
    expect(niceStep(10, false)).toBe(2.5);
    expect(niceStep(10, true)).toBe(5);
    expect(niceStep(6, true)).toBe(2);
    expect(niceStep(0, true)).toBe(1);
    expect(niceStep(3, true)).toBe(1);
  });

  it('draws one chart point per hour from the bottom of a 230×100 box', () => {
    expect(chartPath([0, 5, 10], 10)).toBe('M0,100 L10,50 L20,0');
    expect(chartPath([0, 0], 0)).toBe('M0,100 L10,100');
    expect(chartPath([], 4)).toBe('');
  });

  it('compares today with the same time yesterday', () => {
    expect(compare(13_624_100, 9_870_000)).toMatchObject({ direction: 'up', diff: 3_754_100 });
    expect(compare(13_624_100, 9_870_000).percent).toBeCloseTo(38.04, 2);
    expect(compare(5, 6)).toMatchObject({ direction: 'down', diff: -1 });
    expect(compare(5, 6).percent).toBeCloseTo(-16.67, 2);
    expect(compare(3, 0)).toEqual({ direction: 'up', diff: 3, percent: null });
    expect(compare(0, 0)).toEqual({ direction: 'same', diff: 0, percent: null });
  });

  it('merges repeated assistant questions into counted, linked rows', () => {
    const row = (question: string, conversation: string, created: number, tool = 'search_products') => ({
      conversation_id: conversation,
      question,
      tool,
      created_at: created,
    });
    const issues = conversationIssues({
      missing_requests: [
        row('iPhone 15 xanh dương còn không?', 'c1', 10),
        row('iPhone 15 Xanh dương còn không? ', 'c2', 30),
        row('Galaxy A55 512GB?', 'c3', 20),
        row('   ', 'c4', 40),
      ],
      unanswered_questions: [
        row('Shop có gói quà không?', 'c5', 50, 'handoff_to_seller'),
        row('Pin iPhone 15 bao nhiêu mAh?', 'c6', 60, 'get_product_details'),
        row('Pin iPhone 15 bao nhiêu mAh?', 'c7', 55, 'get_product_details'),
      ],
      top_products: [
        { item_id: 2, name: 'Galaxy A55', count: 33 },
        { item_id: 1, name: 'iPhone 15', count: 41 },
      ],
    });
    expect(issues).toEqual([
      { kind: 'missing', text: 'iPhone 15 xanh dương còn không?', count: 2, conversationId: 'c2' },
      { kind: 'missing', text: 'Galaxy A55 512GB?', count: 1, conversationId: 'c3' },
      { kind: 'handoff', text: 'Shop có gói quà không?', count: 1, conversationId: 'c5' },
      { kind: 'unanswered', text: 'Pin iPhone 15 bao nhiêu mAh?', count: 2, conversationId: 'c6' },
      { kind: 'popular', text: 'iPhone 15', count: 41, itemId: 1 },
      { kind: 'popular', text: 'Galaxy A55', count: 33, itemId: 2 },
    ]);
    expect(conversationIssues({ missing_requests: [], unanswered_questions: [], top_products: [] })).toEqual(
      [],
    );
  });

  it('limits each kind of conversation issue', () => {
    const top = Array.from({ length: 5 }, (_, i) => ({ item_id: i, name: `P${i}`, count: 10 - i }));
    const issues = conversationIssues(
      { missing_requests: [], unanswered_questions: [], top_products: top },
      2,
    );
    expect(issues.map((i) => i.itemId)).toEqual([0, 1]);
  });
});

describe('seller sidebar', () => {
  it('marks the entry for each Seller Centre route', () => {
    const cases: Array<[string, string | null, string | null]> = [
      ['/', null, 'overview'],
      ['/orders', null, 'ordersAll'],
      ['/orders', 'READY_TO_SHIP', 'ordersToShip'],
      ['/orders', 'SHIPPED', 'ordersAll'],
      ['/orders/261031R6TB84', null, 'ordersAll'],
      ['/returns/RT2610310012', null, 'returns'],
      ['/products', null, 'productsAll'],
      ['/products/2000101', null, 'productsAll'],
      ['/products/new', null, 'productsNew'],
      ['/vouchers/new', null, 'vouchers'],
      ['/inbox/12', null, 'inbox'],
      ['/assistant', null, 'settings'],
      ['/assistant/conversations/abc', null, 'conversations'],
      ['/assistant/insights', null, 'insights'],
      ['/assistant/faqs', null, 'faqs'],
      ['/shops', null, 'connection'],
      ['/shops/880001', null, 'shopProfile'],
      ['/shops/880001/connect', null, null],
      ['/ordersx', null, null],
    ];
    for (const [path, status, key] of cases)
      expect([path, status, activeNavKey(path, status)]).toEqual([path, status, key]);
  });

  it('builds shop links for the selected shop only', () => {
    const shop = sellerNav(880002, 'http://localhost:3001/').find((g) => g.key === 'shop')!;
    expect(shop.items).toEqual([
      { key: 'shopProfile', href: '/shops/880002' },
      { key: 'connection', href: '/shops' },
      { key: 'viewShop', href: 'http://localhost:3001/shops/880002', external: true },
    ]);
    const none = sellerNav(null, 'http://localhost:3001').find((g) => g.key === 'shop')!;
    expect(none.items.map((i) => i.href)).toEqual(['/shops', '/shops']);
    const orders = sellerNav(1, 'http://x').find((g) => g.key === 'orders')!;
    expect(orders.items.find((i) => i.key === 'ordersToShip')).toEqual({
      key: 'ordersToShip',
      href: '/orders?status=READY_TO_SHIP',
      count: 'toShip',
    });
  });
});
