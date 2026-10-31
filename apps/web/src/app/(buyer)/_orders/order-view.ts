import type { BuyerOrder, BuyerOrderCounts, OrderStatus } from '@huspee/sdk';

const pad = (n: number) => String(n).padStart(2, '0');
const at = (seconds: number) => new Date(seconds * 1000);

/** "dd/MM" in local time. */
export function formatDayMonth(seconds: number): string {
  const d = at(seconds);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** "dd/MM HH:mm" in local time. */
export function formatDayMonthTime(seconds: number): string {
  const d = at(seconds);
  return `${formatDayMonth(seconds)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "dd/MM/yyyy" in local time. */
export function formatFullDate(seconds: number): string {
  return `${formatDayMonth(seconds)}/${at(seconds).getFullYear()}`;
}

/** Sum of the order counts for the statuses a tab lists. */
export function countFor(counts: BuyerOrderCounts | null | undefined, statuses: OrderStatus[]): number {
  if (!counts) return 0;
  return statuses.reduce((sum, s) => sum + (counts.by_status[s] ?? 0), 0);
}

/** "Label (n)" when n > 0, else the label alone. */
export function withCount(label: string, count: number): string {
  return count > 0 ? `${label} (${count})` : label;
}

/** Latest carrier event while the order is on its way, else null. */
export function inTransitTracking(order: Pick<BuyerOrder, 'status' | 'latest_tracking'>) {
  return order.status === 'SHIPPED' && order.latest_tracking ? order.latest_tracking : null;
}

/** Order numbers from the success page's `orders` query value. */
export function parseOrderSns(value: string | null): string[] {
  return value
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}
