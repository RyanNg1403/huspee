import { describe, expect, it, vi } from 'vitest';

// Seller Centre commerce helpers are pure modules; load them like the proxy tests load route files.
const root = '../../apps/seller-web/src/components/commerce';
type OrderRef = { order_sn: string; order_status: string };
type ReturnRef = { return_sn: string; order_sn: string; status: string; negotiation_status?: string; user?: { username?: string } };
type Variant = { model_id: number; options: string[]; label: string; sku: string; stock: number; current_price: number; original_price: number };
type Product = { item_name: string; item_sku: string; item_status: string; sale: number; variants: Variant[] };
type Row = { modelId: number | null; tierIndex: number[]; price: string; stock: string; sku: string };
type Tier = { name: string; options: string[] };

const orders = await vi.importActual<{
  tabFromStatus: (v: string | null) => string;
  statusForTab: (tab: string) => string | null;
  visibleOrderTabs: (counts: Record<string, number> | null, active: string) => string[];
  countOrderTabs: (list: OrderRef[]) => Record<string, number>;
  filterOrders: (list: OrderRef[], tab: string, query: string) => OrderRef[];
  resolveDateRange: (range: string, now: Date) => { from: number; to: number };
  splitTimeRange: (from: number, to: number, span?: number) => Array<{ from: number; to: number }>;
}>(`${root}/orders/order-filters.ts`);
const returns = await vi.importActual<{
  returnTabOf: (r: ReturnRef) => string;
  countReturnTabs: (list: ReturnRef[]) => Record<string, number>;
  filterReturns: (list: ReturnRef[], tab: string, query: string) => ReturnRef[];
}>(`${root}/returns/return-filters.ts`);
const stock = await vi.importActual<{
  LOW_STOCK_THRESHOLD: number;
  stockLevel: (n: number) => string;
  summarizeVariants: (v: Variant[]) => { totalStock: number; minPrice: number; maxPrice: number; out: Variant[]; low: Variant[] };
  countProductTabs: (list: Product[]) => Record<string, number>;
  filterProducts: (list: Product[], tab: string, query: string) => Product[];
  sortProducts: (list: Product[], sort: string) => Product[];
}>(`${root}/products/stock.ts`);
const draft = await vi.importActual<{
  combinations: (tiers: Tier[]) => number[][];
  syncRows: (tiers: Tier[], saved: number[], rows: Row[]) => Row[];
  planVariants: (saved: { tiers: Tier[]; rows: Row[] }, draft: { tiers: Tier[]; rows: Row[] }) => {
    tiersChanged: boolean;
    added: Row[];
    price: Array<{ model_id: number; original_price: number }>;
    stock: Array<{ model_id: number; seller_stock: Array<{ stock: number }> }>;
    sku: Array<{ model_id: number; model_sku: string }>;
  };
}>(`${root}/products/draft.ts`);
const vouchers = await vi.importActual<{
  voucherState: (start: number, end: number, now: number) => string;
  countVoucherTabs: (list: Array<{ voucher_code: string; voucher_name: string; start_time: number; end_time: number }>, now: number) => Record<string, number>;
  voucherBadge: (reward: number, amount?: number, pct?: number) => string;
  fromDateTimeLocal: (value: string, original?: number) => number;
  toDateTimeLocal: (unix: number) => string;
}>(`${root}/vouchers/voucher-filters.ts`);
const voucherForm = await vi.importActual<{
  initialForm: (now: number) => Record<string, unknown>;
  validateVoucher: (form: Record<string, unknown>, original: null, now: number) => string[];
}>(`${root}/vouchers/voucher-form.ts`);
const search = await vi.importActual<{ matchesSearch: (q: string, fields: string[]) => boolean }>(`${root}/list.ts`);

const variant = (model_id: number, stock: number, price = 100_000): Variant => ({
  model_id,
  options: [`M${model_id}`],
  label: `M${model_id}`,
  sku: `SKU-${model_id}`,
  stock,
  current_price: price,
  original_price: price,
});

describe('order tabs', () => {
  const list: OrderRef[] = [
    { order_sn: 'A1', order_status: 'READY_TO_SHIP' },
    { order_sn: 'A2', order_status: 'PROCESSED' },
    { order_sn: 'B1', order_status: 'SHIPPED' },
    { order_sn: 'C1', order_status: 'COMPLETED' },
    { order_sn: 'C2', order_status: 'TO_CONFIRM_RECEIVE' },
    { order_sn: 'D1', order_status: 'CANCELLED' },
    { order_sn: 'E1', order_status: 'TO_RETURN' },
    { order_sn: 'U1', order_status: 'UNPAID' },
  ];

  it('groups statuses into the seller tabs and counts them', () => {
    expect(orders.countOrderTabs(list)).toEqual({
      all: 8,
      unpaid: 1,
      to_ship: 2,
      shipping: 1,
      delivered: 2,
      cancelled: 1,
      returns: 1,
    });
    expect(orders.filterOrders(list, 'to_ship', '').map((o) => o.order_sn)).toEqual(['A1', 'A2']);
    expect(orders.filterOrders(list, 'all', 'c').map((o) => o.order_sn)).toEqual(['C1', 'C2']);
  });

  it('maps the ?status= order_status to a tab and back', () => {
    expect(orders.tabFromStatus('READY_TO_SHIP')).toBe('to_ship');
    expect(orders.tabFromStatus('PROCESSED')).toBe('to_ship');
    expect(orders.tabFromStatus('IN_CANCEL')).toBe('cancelled');
    expect(orders.tabFromStatus('UNPAID')).toBe('unpaid');
    expect(orders.tabFromStatus('nope')).toBe('all');
    expect(orders.tabFromStatus(null)).toBe('all');
    for (const tab of ['unpaid', 'to_ship', 'shipping', 'delivered', 'cancelled', 'returns']) {
      expect(orders.tabFromStatus(orders.statusForTab(tab))).toBe(tab);
    }
    expect(orders.statusForTab('all')).toBeNull();
  });

  it('shows the unpaid tab only when it has orders or is requested', () => {
    const none = orders.countOrderTabs(list.filter((o) => o.order_status !== 'UNPAID'));
    expect(orders.visibleOrderTabs(none, 'all')).not.toContain('unpaid');
    expect(orders.visibleOrderTabs(none, 'unpaid')).toContain('unpaid');
    expect(orders.visibleOrderTabs(orders.countOrderTabs(list), 'all')).toContain('unpaid');
  });

  it('splits a long range into non-overlapping 15-day windows, newest first', () => {
    const day = 86400;
    const windows = orders.splitTimeRange(0, 30 * day);
    expect(windows[0].to).toBe(30 * day);
    expect(windows.at(-1)!.from).toBe(0);
    for (const w of windows) expect(w.to - w.from).toBeLessThanOrEqual(15 * day);
    for (let i = 1; i < windows.length; i++) expect(windows[i].to).toBe(windows[i - 1].from - 1);
    expect(orders.splitTimeRange(100, 200)).toEqual([{ from: 100, to: 200 }]);
  });

  it('starts "today" at local midnight', () => {
    const now = new Date(2026, 9, 31, 14, 30);
    const { from, to } = orders.resolveDateRange('today', now);
    expect(new Date(from * 1000).getHours()).toBe(0);
    expect(to).toBe(Math.floor(now.getTime() / 1000));
    expect(orders.resolveDateRange('30d', now).from).toBe(to - 30 * 86400);
  });
});

describe('return tabs', () => {
  const list: ReturnRef[] = [
    { return_sn: 'R1', order_sn: 'O1', status: 'REQUESTED', negotiation_status: 'PENDING_RESPOND', user: { username: 'Nguyễn Văn An' } },
    { return_sn: 'R2', order_sn: 'O2', status: 'REQUESTED', negotiation_status: 'PENDING_BUYER_RESPOND' },
    { return_sn: 'R3', order_sn: 'O3', status: 'JUDGING' },
    { return_sn: 'R4', order_sn: 'O4', status: 'ACCEPTED' },
    { return_sn: 'R5', order_sn: 'O5', status: 'CANCELLED' },
  ];

  it('only an unanswered request waits for the shop', () => {
    expect(list.map(returns.returnTabOf)).toEqual(['pending', 'processing', 'processing', 'refunded', 'closed']);
    expect(returns.countReturnTabs(list)).toEqual({ all: 5, pending: 1, processing: 2, refunded: 1, closed: 1 });
  });

  it('searches return, order and buyer without diacritics', () => {
    expect(returns.filterReturns(list, 'all', 'nguyen van').map((r) => r.return_sn)).toEqual(['R1']);
    expect(returns.filterReturns(list, 'all', 'o4').map((r) => r.return_sn)).toEqual(['R4']);
    expect(search.matchesSearch('dang', ['Đặng Minh'])).toBe(true);
    expect(search.matchesSearch('', [])).toBe(true);
  });
});

describe('product stock', () => {
  it(`treats 1–${stock.LOW_STOCK_THRESHOLD} as low and 0 as sold out`, () => {
    expect([0, 1, 10, 11].map(stock.stockLevel)).toEqual(['out', 'low', 'low', 'ok']);
  });

  it('summarises variants and counts product tabs', () => {
    const products: Product[] = [
      { item_name: 'iPhone', item_sku: 'IP', item_status: 'NORMAL', sale: 5, variants: [variant(1, 25, 200), variant(2, 0, 190)] },
      { item_name: 'Galaxy', item_sku: 'GA', item_status: 'NORMAL', sale: 9, variants: [variant(3, 3, 100)] },
      { item_name: 'Cable', item_sku: 'CB', item_status: 'UNLIST', sale: 1, variants: [variant(4, 50, 50)] },
    ];
    expect(stock.summarizeVariants(products[0].variants)).toMatchObject({ totalStock: 25, minPrice: 190, maxPrice: 200 });
    expect(stock.countProductTabs(products)).toEqual({ all: 3, active: 2, hidden: 1, out: 1, low: 1 });
    expect(stock.filterProducts(products, 'all', 'sku-3').map((p) => p.item_name)).toEqual(['Galaxy']);
    expect(stock.sortProducts(products, 'sales').map((p) => p.item_name)).toEqual(['Galaxy', 'iPhone', 'Cable']);
    expect(stock.sortProducts(products, 'priceAsc').map((p) => p.item_name)).toEqual(['Cable', 'Galaxy', 'iPhone']);
    expect(stock.sortProducts(products, 'default')).toBe(products);
  });
});

describe('product variant drafts', () => {
  const saved = {
    tiers: [{ name: 'Màu', options: ['Đen', 'Hồng'] }],
    rows: [
      { modelId: 11, tierIndex: [0], price: '100000', stock: '5', sku: 'A' },
      { modelId: 12, tierIndex: [1], price: '100000', stock: '0', sku: 'B' },
    ],
  };

  it('lists every combination of two tiers', () => {
    expect(draft.combinations([{ name: 'a', options: ['x', 'y'] }, { name: 'b', options: ['1', '2'] }])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it('adds rows only for appended options and keeps existing edits', () => {
    const tiers = [{ name: 'Màu', options: ['Đen', 'Hồng', 'Xanh'] }];
    const rows = draft.syncRows(tiers, [2], saved.rows);
    expect(rows.map((r) => [r.modelId, r.tierIndex])).toEqual([[11, [0]], [12, [1]], [null, [2]]]);
    expect(draft.syncRows(saved.tiers, [2], rows)).toEqual(saved.rows);
  });

  it('turns an item without variations into rows for every new combination', () => {
    const single = [{ modelId: 0, tierIndex: [], price: '50000', stock: '9', sku: '' }];
    const rows = draft.syncRows([{ name: 'Size', options: ['S', 'M'] }], [], single);
    expect(rows.map((r) => r.tierIndex)).toEqual([[0], [1]]);
    expect(rows.every((r) => r.modelId === null)).toBe(true);
  });

  it('plans only the changed price, stock, SKU and new variants', () => {
    const tiers = [{ name: 'Màu', options: ['Đen', 'Hồng', 'Xanh'] }];
    const rows = [
      { ...saved.rows[0], price: '120000' },
      { ...saved.rows[1], stock: '7', sku: 'B2' },
      { modelId: null, tierIndex: [2], price: '90000', stock: '3', sku: '' },
    ];
    expect(draft.planVariants(saved, { tiers, rows })).toEqual({
      tiersChanged: true,
      added: [rows[2]],
      price: [{ model_id: 11, original_price: 120000 }],
      stock: [{ model_id: 12, seller_stock: [{ stock: 7 }] }],
      sku: [{ model_id: 12, model_sku: 'B2' }],
    });
    expect(draft.planVariants(saved, saved)).toMatchObject({ tiersChanged: false, added: [], price: [], stock: [], sku: [] });
  });
});

describe('vouchers', () => {
  it('derives state and tab counts from the period', () => {
    expect(vouchers.voucherState(10, 20, 5)).toBe('upcoming');
    expect(vouchers.voucherState(10, 20, 15)).toBe('ongoing');
    expect(vouchers.voucherState(10, 20, 20)).toBe('expired');
    const list = [
      { voucher_code: 'A', voucher_name: 'a', start_time: 0, end_time: 100 },
      { voucher_code: 'B', voucher_name: 'b', start_time: 60, end_time: 100 },
    ];
    expect(vouchers.countVoucherTabs(list, 50)).toEqual({ all: 2, ongoing: 1, upcoming: 1, expired: 0 });
  });

  it('formats badges and round-trips datetime-local values', () => {
    expect(vouchers.voucherBadge(1, 50_000)).toBe('50K');
    expect(vouchers.voucherBadge(1, 1_500_000)).toBe('1,5M');
    expect(vouchers.voucherBadge(2, undefined, 10)).toBe('10%');
    const unix = 1_793_000_000;
    expect(vouchers.fromDateTimeLocal(vouchers.toDateTimeLocal(unix), unix)).toBe(unix);
  });

  it('validates a new voucher before calling the API', () => {
    const now = 1_793_000_000;
    const empty = voucherForm.initialForm(now);
    expect(voucherForm.validateVoucher(empty, null, now)).toEqual(['name', 'code', 'minBasket', 'reward', 'usage']);
    const ok = { ...empty, name: 'Giảm 20K', code: 'TECH20', amount: '20000', minBasket: '100000', usage: '50' };
    expect(voucherForm.validateVoucher(ok, null, now)).toEqual([]);
    expect(voucherForm.validateVoucher({ ...ok, amount: '200000' }, null, now)).toEqual(['reward']);
  });
});
