import { countBy, matchesSearch } from '../list';

export type VoucherState = 'upcoming' | 'ongoing' | 'expired';

export function voucherState(start: number, end: number, nowSec: number): VoucherState {
  if (start > nowSec) return 'upcoming';
  return end <= nowSec ? 'expired' : 'ongoing';
}

export const VOUCHER_TABS = ['all', 'ongoing', 'upcoming', 'expired'] as const;
export type VoucherTab = (typeof VOUCHER_TABS)[number];

export type VoucherRef = { voucher_code: string; voucher_name: string; start_time: number; end_time: number };

export function countVoucherTabs(list: VoucherRef[], nowSec: number): Record<VoucherTab, number> {
  return countBy(list, VOUCHER_TABS, (v) => ['all', voucherState(v.start_time, v.end_time, nowSec)]);
}

export function filterVouchers<T extends VoucherRef>(
  list: T[],
  tab: VoucherTab,
  query: string,
  nowSec: number,
): T[] {
  return list.filter(
    (v) =>
      (tab === 'all' || voucherState(v.start_time, v.end_time, nowSec) === tab) &&
      matchesSearch(query, [v.voucher_code, v.voucher_name]),
  );
}

/** Short badge text: "50K", "1,5M" or "10%". */
export function voucherBadge(
  rewardType: number,
  amount: number | undefined,
  percentage: number | undefined,
): string {
  if (rewardType === 2) return `${percentage ?? 0}%`;
  const value = amount ?? 0;
  const short = (n: number, unit: string) => `${String(Math.round(n * 10) / 10).replace('.', ',')}${unit}`;
  if (value >= 1_000_000) return short(value / 1_000_000, 'M');
  if (value >= 1_000) return short(value / 1_000, 'K');
  return String(value);
}

/** Local "YYYY-MM-DDTHH:mm" for datetime-local inputs, and back to unix seconds. */
export function toDateTimeLocal(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value: string, original?: number): number {
  if (original !== undefined && toDateTimeLocal(original) === value) return original;
  const [date, time = '00:00'] = value.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Math.floor(new Date(y, m - 1, d, hh, mm).getTime() / 1000);
}
