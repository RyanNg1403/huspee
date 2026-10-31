import type { Lang } from '@huspee/web-ui/i18n/types';

/** Hours and minutes of a millisecond timestamp, e.g. "14:30". */
export function formatClock(ms: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(ms);
}

/** Seconds left before a pending action expires, never negative; undefined without an expiry. */
export function secondsLeft(expiresAt: number | undefined, now: number): number | undefined {
  if (expiresAt === undefined) return undefined;
  return Math.max(0, Math.floor(expiresAt - now / 1000));
}

export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
