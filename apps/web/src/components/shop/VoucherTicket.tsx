'use client';
import type { PublicVoucher } from '@huspee/sdk';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { formatDate, formatVnd } from '@huspee/web-ui/lib/format';
import { messages } from './messages';
import { voucherStub } from './vouchers';

/** A shop voucher drawn as a ticket: reward stub, conditions and code. */
export function VoucherTicket({ voucher, className = '' }: { voucher: PublicVoucher; className?: string }) {
  const t = useT(messages);
  const { lang } = useLang();
  const muted = voucher.fully_redeemed || voucher.status !== 'ongoing';
  const terms = [
    t('minSpend', { amount: formatVnd(voucher.min_spend) }),
    voucher.reward_type === 'percentage' && voucher.max_discount != null
      ? t('maxDiscount', { amount: formatVnd(voucher.max_discount) })
      : null,
  ].filter(Boolean);
  const state = voucher.fully_redeemed
    ? t('fullyRedeemed')
    : voucher.status === 'upcoming'
      ? t('startsOn', { date: formatDate(voucher.start_time, lang) })
      : t('validUntil', { date: formatDate(voucher.end_time, lang) });
  return (
    <div
      className={`flex min-w-0 overflow-hidden rounded border border-primary/30 bg-primary-soft text-ink ${muted ? 'opacity-60' : ''} ${className}`}
    >
      <span className="flex w-18 shrink-0 items-center justify-center border-r border-dashed border-white/70 bg-primary px-1 text-base font-bold text-white">
        {voucherStub(voucher, lang)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2">
        <strong className="text-[13px] font-semibold leading-snug">{voucher.voucher_name}</strong>
        <span className="text-xs text-muted">{terms.join(' · ')}</span>
        <span className="text-xs text-muted">
          {t('code', { code: voucher.voucher_code })} · {state}
        </span>
      </div>
    </div>
  );
}
