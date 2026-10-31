import { countBy, matchesSearch } from '../list';

export type OrderStatus =
  | 'UNPAID'
  | 'READY_TO_SHIP'
  | 'PROCESSED'
  | 'SHIPPED'
  | 'TO_CONFIRM_RECEIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'TO_RETURN'
  | 'IN_CANCEL';

export const ORDER_TABS = [
  'all',
  'unpaid',
  'to_ship',
  'shipping',
  'delivered',
  'cancelled',
  'returns',
] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

const TAB_STATUSES: Record<Exclude<OrderTab, 'all'>, OrderStatus[]> = {
  unpaid: ['UNPAID'],
  to_ship: ['READY_TO_SHIP', 'PROCESSED'],
  shipping: ['SHIPPED'],
  delivered: ['TO_CONFIRM_RECEIVE', 'COMPLETED'],
  cancelled: ['CANCELLED', 'IN_CANCEL'],
  returns: ['TO_RETURN'],
};

export function orderTabsOf(status: OrderStatus): OrderTab[] {
  return ['all', ...ORDER_TABS.filter((t) => t !== 'all' && TAB_STATUSES[t].includes(status))];
}

/** `?status=` value (a Shopee order_status, e.g. from the sidebar) → tab; unknown or absent → "all". */
export function tabFromStatus(value: string | null | undefined): OrderTab {
  return ORDER_TABS.find((t) => t !== 'all' && TAB_STATUSES[t].includes(value as OrderStatus)) ?? 'all';
}

/** The status written back to the URL for a tab, so reloads and shared links land on it. */
export function statusForTab(tab: OrderTab): OrderStatus | null {
  return tab === 'all' ? null : TAB_STATUSES[tab][0];
}

/** "Chờ thanh toán" only shows when such orders exist or a link asked for it (checkout never leaves one unpaid). */
export function visibleOrderTabs(counts: Record<OrderTab, number> | null, active: OrderTab): OrderTab[] {
  return ORDER_TABS.filter((t) => t !== 'unpaid' || active === 'unpaid' || (counts?.unpaid ?? 0) > 0);
}

export type OrderRef = { order_sn: string; order_status: OrderStatus };

export function countOrderTabs(list: OrderRef[]): Record<OrderTab, number> {
  return countBy(list, ORDER_TABS, (o) => orderTabsOf(o.order_status));
}

export function filterOrders<T extends OrderRef>(list: T[], tab: OrderTab, query: string): T[] {
  return list.filter((o) => orderTabsOf(o.order_status).includes(tab) && matchesSearch(query, [o.order_sn]));
}

export const DATE_RANGES = ['today', '7d', '30d'] as const;
export type DateRange = (typeof DATE_RANGES)[number];

/** Inclusive [from, to] in unix seconds; "today" starts at local midnight. */
export function resolveDateRange(range: DateRange, now: Date): { from: number; to: number } {
  const to = Math.floor(now.getTime() / 1000);
  if (range === 'today') {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: Math.floor(midnight.getTime() / 1000), to };
  }
  return { from: to - (range === '7d' ? 7 : 30) * 86400, to };
}

/**
 * The order list API accepts at most 15 days per call. Split a longer range into
 * non-overlapping windows, newest first, so concatenated pages stay sorted by create time.
 */
export function splitTimeRange(
  from: number,
  to: number,
  maxSpan = 15 * 86400,
): Array<{ from: number; to: number }> {
  const windows: Array<{ from: number; to: number }> = [];
  let end = to;
  while (end >= from) {
    const start = Math.max(from, end - maxSpan);
    windows.push({ from: start, to: end });
    end = start - 1;
  }
  return windows;
}
