/**
 * Date and time helpers for Seller Ops.
 * Handles datetime-local formatting and parsing in local time (e.g. Asia/Ho_Chi_Minh)
 * while preserving exact timestamp round-trip without timezone drift.
 */

export function unixToDateTimeLocal(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hr = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hr}:${min}`;
}

export function dateTimeLocalToUnix(val: string, origUnixSec?: number): number {
  if (origUnixSec !== undefined && unixToDateTimeLocal(origUnixSec) === val) {
    return origUnixSec;
  }
  const [datePart, timePart] = val.split('T');
  if (!datePart || !timePart) {
    return Math.floor(new Date(val).getTime() / 1000);
  }
  const [y, m, d] = datePart.split('-').map(Number);
  const [hr, min] = timePart.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hr, min, 0, 0);
  return Math.floor(dt.getTime() / 1000);
}

export function getVoucherStatus(
  startTime: number,
  endTime: number,
  nowSec = Math.floor(Date.now() / 1000),
): 'upcoming' | 'ongoing' | 'expired' {
  if (startTime > nowSec) return 'upcoming';
  if (endTime <= nowSec) return 'expired';
  return 'ongoing';
}
