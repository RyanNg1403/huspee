import type { Lang } from '@huspee/web-ui/i18n/types';

/** Action summaries are written by the server in both languages as "vi / en". */
const BILINGUAL = /^(.*\S) \/ ([A-Za-z][A-Za-z ]*)$/;
const MONEY_LABELS = new Set(['Unit price', 'Items subtotal', 'Shipping fee', 'Shipping discount', 'Voucher discount']);

/** The buyer's half of a server "vi / en" string; anything else (a product name, an address) is kept. */
export function pickLanguage(text: string, lang: Lang): string {
  const match = BILINGUAL.exec(text);
  if (!match) return text;
  return lang === 'en' ? match[2]! : match[1]!;
}

export type SummaryRow = { label: string; value: string; heard: boolean };

/**
 * Presents the server's summary lines as they were sent: only the language is picked and plain VND
 * amounts are formatted. Nothing is recalculated.
 */
export function summaryRows(
  lines: Array<{ label: string; value: string }>,
  lang: Lang,
  formatMoney: (amount: number) => string,
): SummaryRow[] {
  return lines.map((line) => {
    const english = BILINGUAL.exec(line.label)?.[2];
    const money = english !== undefined && MONEY_LABELS.has(english) && /^-?\d+$/.test(line.value);
    const value = money
      ? formatMoney(Number(line.value))
      : pickLanguage(line.value, lang).replace(/\b(\d+) VND\b/g, (_, amount: string) => formatMoney(Number(amount)));
    return { label: pickLanguage(line.label, lang), value, heard: english === 'Heard' };
  });
}
