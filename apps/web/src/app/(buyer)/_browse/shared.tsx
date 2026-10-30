'use client';
import Link from 'next/link';
import Image from 'next/image';
import type { ProductSummary, PublicVoucher } from '@huspee/sdk';
import { EmptyState } from '@/components/ui';
import { useLang, useT } from '@/i18n';
import { formatCount, formatVnd } from '@/lib/format';
import { messages } from './messages';

export { QueryState as State, QueryState, ApiState } from '@/components/ui';
export function ProductGrid({ products }: { products: ProductSummary[] }) {
  const t = useT(messages);
  const { lang } = useLang();
  if (!products.length) return <EmptyState title={t('empty')} />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p) => (
        <Link
          key={p.item_id}
          href={`/products/${p.item_id}`}
          className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lift"
        >
          <div className="relative aspect-square overflow-hidden bg-gray-100">
            {p.image_url && (
              <Image
                unoptimized
                width={500}
                height={500}
                src={p.image_url}
                alt=""
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
              />
            )}
            {p.has_promotion && p.discount_percent > 0 && (
              <span className="absolute top-2.5 left-2.5 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
                -{p.discount_percent}%
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
            <p className="line-clamp-2 min-h-10 text-sm leading-5 text-gray-800">{p.name}</p>
            <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-semibold text-primary tabular-nums">
                {formatVnd(p.price_min)}
                {p.price_max !== p.price_min && <span className="font-normal text-gray-400"> +</span>}
              </span>
              {p.has_promotion && p.original_price_min > p.price_min && (
                <span className="text-xs text-gray-400 line-through">{formatVnd(p.original_price_min)}</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs whitespace-nowrap text-gray-500">
              <span className="inline-flex min-w-0 items-center gap-1">
                <span className="text-amber-400">★</span>
                {p.rating_star.toFixed(1)}
                <span className="text-gray-300">·</span>
                {t('sold')} {formatCount(p.sold, lang)}
              </span>
              {p.shop.city && <span className="hidden truncate text-gray-400 xl:inline">{p.shop.city}</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
export function Vouchers({ vouchers }: { vouchers: PublicVoucher[] }) {
  const t = useT(messages);
  if (!vouchers.length) return <EmptyState title={t('noVouchers')} />;
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {vouchers.map((v) => (
        <div
          key={v.voucher_code}
          className="relative flex min-w-60 shrink-0 overflow-hidden rounded-2xl border border-primary/20 bg-primary-soft text-sm"
        >
          <div className="flex w-20 shrink-0 flex-col items-center justify-center border-r border-dashed border-primary/30 bg-primary px-2 text-center font-bold text-white">
            <span className="text-lg leading-tight">
              {v.reward_type === 'percentage'
                ? `${v.percentage}%`
                : v.discount_amount != null
                  ? `${Math.round(v.discount_amount / 1000)}K`
                  : ''}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 px-3 py-2.5">
            <strong className="text-ink">{v.voucher_name}</strong>
            <p className="text-xs text-gray-600">
              {t('minSpend')}: {formatVnd(v.min_spend)}
            </p>
            <p className="mt-1 w-fit rounded-md bg-white px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
              {v.voucher_code}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
export const panel = 'rounded-2xl border border-line bg-white p-4 shadow-card sm:p-6';
