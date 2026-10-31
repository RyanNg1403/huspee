import type { Lang } from '@huspee/web-ui/i18n/types';

// Short clock and day formats for dense seller tables; the shared helpers only offer full date-times.
const locale = (lang: Lang) => (lang === 'vi' ? 'vi-VN' : 'en-US');
const at = (seconds: number) => new Date(seconds * 1000);

export function formatClock(seconds: number, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at(seconds));
}

/** "31/10" in Vietnamese, "10/31" in English. */
export function formatDay(seconds: number, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { day: '2-digit', month: '2-digit' })
    .formatToParts(at(seconds))
    .map((part) => (part.type === 'literal' ? '/' : part.value))
    .join('');
}

function sameDay(a: number, b: number): boolean {
  return at(a).toDateString() === at(b).toDateString();
}

/** "14:30" today, "30/10 14:30" on other days. */
export function formatStamp(seconds: number, lang: Lang, now: number): string {
  return sameDay(seconds, now)
    ? formatClock(seconds, lang)
    : `${formatDay(seconds, lang)} ${formatClock(seconds, lang)}`;
}

/** Whole minutes between two instants, at least 1 once any time has passed. */
export function minutesBetween(start: number, end: number): number {
  const seconds = Math.max(0, end - start);
  return seconds === 0 ? 0 : Math.max(1, Math.round(seconds / 60));
}

export type Elapsed = { unit: 'minutes' | 'hours' | 'days'; value: number };
export function elapsed(since: number, now: number): Elapsed {
  const minutes = Math.max(1, minutesBetween(since, now));
  if (minutes < 60) return { unit: 'minutes', value: minutes };
  if (minutes < 60 * 24) return { unit: 'hours', value: Math.floor(minutes / 60) };
  return { unit: 'days', value: Math.floor(minutes / (60 * 24)) };
}
