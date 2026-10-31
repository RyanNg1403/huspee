import type { Lang } from '@huspee/web-ui/i18n/types';
export function formatVnd(n: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(n);
}
const date = (value: number | string) => new Date(typeof value === 'number' ? value * 1000 : value);
export function formatDate(value: number | string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
  }).format(date(value));
}
export function formatDateTime(value: number | string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date(value));
}
export function formatCount(n: number, lang: Lang) {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}
