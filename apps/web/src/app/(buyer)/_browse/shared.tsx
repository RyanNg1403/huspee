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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {products.map((p) => (
        <Link
          key={p.item_id}
          href={`/products/${p.item_id}`}
          className="group overflow-hidden border border-transparent bg-white shadow-sm hover:border-[#ee4d2d]"
        >
          <div className="relative aspect-square bg-gray-100">
            {p.image_url && (
              <Image
                unoptimized
                width={500}
                height={500}
                src={p.image_url}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
            {p.has_promotion && p.discount_percent > 0 && (
              <span className="absolute right-0 top-0 bg-amber-300 px-2 py-1 text-xs text-red-700">
                -{p.discount_percent}%
              </span>
            )}
          </div>
          <div className="space-y-2 p-3">
            <p className="line-clamp-2 min-h-10 text-sm">{p.name}</p>
            <div className="text-[#ee4d2d]">
              {formatVnd(p.price_min)}
              {p.price_max !== p.price_min && ` – ${formatVnd(p.price_max)}`}
            </div>
            {p.has_promotion && p.original_price_min > p.price_min && (
              <div className="text-xs text-gray-400 line-through">{formatVnd(p.original_price_min)}</div>
            )}
            <div className="flex justify-between gap-1 text-xs text-gray-500">
              <span>★ {p.rating_star.toFixed(1)}</span>
              <span>
                {t('sold')} {formatCount(p.sold, lang)}
              </span>
            </div>
            {p.shop.city && <div className="text-right text-xs text-gray-400">{p.shop.city}</div>}
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
    <div className="flex gap-3 overflow-x-auto">
      {vouchers.map((v) => (
        <div
          key={v.voucher_code}
          className="min-w-48 border border-dashed border-[#ee4d2d] bg-orange-50 p-3 text-sm"
        >
          <strong>{v.voucher_name}</strong>
          <p>
            {v.reward_type === 'percentage'
              ? `${v.percentage}%`
              : v.discount_amount != null
                ? formatVnd(v.discount_amount)
                : ''}
          </p>
          <p>
            {t('minSpend')}: {formatVnd(v.min_spend)}
          </p>
          <p>{v.voucher_code}</p>
        </div>
      ))}
    </div>
  );
}
export const panel = 'bg-white p-4 shadow-sm sm:p-6';
