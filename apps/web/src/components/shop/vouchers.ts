import type { PublicVoucher } from '@huspee/sdk';

type Lang = 'vi' | 'en';

/** Short reward label for the ticket stub, e.g. "50K", "1,5TR" or "10%". */
export function voucherStub(voucher: PublicVoucher, lang: Lang): string {
  if (voucher.reward_type === 'percentage') return `${voucher.percentage ?? 0}%`;
  const amount = voucher.discount_amount ?? 0;
  const number = new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 1 });
  if (amount >= 1_000_000) return `${number.format(amount / 1_000_000)}${lang === 'vi' ? 'TR' : 'M'}`;
  return `${number.format(amount / 1000)}K`;
}

/** Shop-wide vouchers plus product vouchers that list this item; expired ones are left out. */
export const vouchersForItem = (vouchers: PublicVoucher[], itemId: number) =>
  vouchers.filter(
    (v) => v.status !== 'expired' && (v.voucher_type === 'shop' || v.item_id_list.includes(itemId)),
  );
