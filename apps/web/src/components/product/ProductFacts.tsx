'use client';
import type { ReactNode } from 'react';
import type { ProductDetail, PublicVoucher, ShopPolicies } from '@huspee/sdk';
import { useT } from '@huspee/web-ui/i18n';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { InlineState } from '../shop/InlineState';
import { vouchersForItem } from '../shop/vouchers';
import { messages } from './messages';
import { dayRange } from './shipping';

type Query<T> = { data: T | null; loading: boolean; error: unknown; reload: () => void };

/** Label/value row: a bordered list row on phones, a plain two-column row on wider screens. */
export function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-line-soft px-3 py-3 sm:grid-cols-[112px_minmax(0,1fr)] sm:border-0 sm:p-0">
      <span className="text-muted sm:pt-0.5">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Shipping({ product, policies }: { product: ProductDetail; policies: ShopPolicies }) {
  const t = useT(messages);
  const channels = policies.shipping_channels ?? [];
  return (
    <div className="flex flex-col gap-1">
      {policies.free_shipping_min_spend != null && (
        <span className="text-success">
          {t('freeShippingFrom', { amount: formatVnd(policies.free_shipping_min_spend) })}
        </span>
      )}
      <span className="text-sm text-muted">{t('shipsIn', { days: product.days_to_ship })}</span>
      {channels.length > 0 && (
        <details className="group text-sm">
          <summary className="w-fit cursor-pointer list-none text-link hover:underline [&::-webkit-details-marker]:hidden">
            {t('carriers', { count: channels.length })}
            <span aria-hidden="true" className="ml-1 inline-block transition group-open:rotate-180">
              ▾
            </span>
          </summary>
          <ul className="mt-1.5 space-y-1 text-muted">
            {channels.map((c) => (
              <li key={c.logistics_channel_id}>
                <span className="text-ink">{c.name}</span> ·{' '}
                {t('carrierDays', { days: dayRange(c.estimated_days) })}
                {c.cod_enabled && <> · {t('cod')}</>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Vouchers, shipping and returns for the product, all as the API returns them. */
export function ProductFacts({
  product,
  vouchers,
  policies,
  children,
}: {
  product: ProductDetail;
  vouchers: Query<PublicVoucher[]>;
  policies: Query<ShopPolicies>;
  /** Extra rows placed after shipping (the variation summary on phones). */
  children?: ReactNode;
}) {
  const t = useT(messages);
  const applicable = vouchers.data ? vouchersForItem(vouchers.data, product.item_id) : [];
  return (
    <div className="flex flex-col sm:gap-5">
      {(!vouchers.data || applicable.length > 0) && (
        <FactRow label={t('vouchers')}>
          <InlineState {...vouchers} retry={vouchers.reload} className="h-7 w-48" />
          {applicable.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {applicable.map((v) => (
                <li
                  key={v.voucher_code}
                  className="rounded-sm border border-dashed border-primary bg-primary-soft px-1.5 py-0.5 text-xs font-semibold text-primary-hover sm:px-2.5 sm:py-1 sm:text-[13px]"
                >
                  {v.voucher_name}
                </li>
              ))}
            </ul>
          )}
        </FactRow>
      )}
      <FactRow label={t('shipping')}>
        <InlineState {...policies} retry={policies.reload} />
        {policies.data && <Shipping product={product} policies={policies.data} />}
      </FactRow>
      {children}
      <FactRow label={t('returns')}>
        <InlineState {...policies} retry={policies.reload} />
        {policies.data && <span>{policies.data.return_policy || t('noInfo')}</span>}
      </FactRow>
    </div>
  );
}
