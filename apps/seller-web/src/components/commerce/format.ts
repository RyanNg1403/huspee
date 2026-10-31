import type { Lang } from '@huspee/web-ui/i18n';

const locale = (lang: Lang) => (lang === 'vi' ? 'vi-VN' : 'en-GB');
const parts = (unix: number, lang: Lang, options: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat(locale(lang), { hour12: false, ...options })
      .formatToParts(new Date(unix * 1000))
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

/** "31/10 14:39": dense table timestamps. */
export function formatShortDateTime(unix: number, lang: Lang): string {
  const p = parts(unix, lang, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** "31/10/2026 14:39". */
export function formatFullDateTime(unix: number, lang: Lang): string {
  const p = parts(unix, lang, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** "31/10/2026". */
export function formatDay(unix: number, lang: Lang): string {
  const p = parts(unix, lang, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${p.day}/${p.month}/${p.year}`;
}

/** Keep only digits from a typed amount ("19.990.000" → "19990000"). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Group a digit string for display ("19990000" → "19.990.000" in vi). */
export function groupDigits(value: string, lang: Lang): string {
  return value ? new Intl.NumberFormat(locale(lang)).format(Number(value)) : '';
}

/** Counts with thousands grouping ("2.100"). */
export function formatInt(value: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang)).format(value);
}
