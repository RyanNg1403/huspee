'use client';
import type { ProductSummary, PublicVoucher } from '@huspee/sdk';
import { EmptyState } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { ProductCard } from '@/components/catalog';
import { messages } from './messages';

export { QueryState as State, QueryState, ApiState } from '@huspee/web-ui/components/ui';
/**
 * Home and search page frame: edge to edge under the mobile header (cancels the layout's padding),
 * the 1152px column of the desktop header from `md`.
 */
export const browsePage = '-mx-4 -mt-6 sm:-mt-8 md:mx-auto md:-mt-3 md:max-w-[1152px]';

const GRID_COLUMNS = {
  /** Home "Gợi ý hôm nay": 6 per row on desktop. */
  wide: 'md:grid-cols-4 md:gap-2 lg:grid-cols-6',
  /** Search results and shop pages: 5 per row on desktop. */
  default: 'md:grid-cols-3 md:gap-2.5 lg:grid-cols-5',
} as const;

export function ProductGrid({
  products,
  officialShopIds,
  showLocation = false,
  columns = 'default',
}: {
  products: ProductSummary[];
  officialShopIds?: ReadonlySet<number>;
  showLocation?: boolean;
  columns?: keyof typeof GRID_COLUMNS;
}) {
  const t = useT(messages);
  if (!products.length) return <EmptyState title={t('empty')} />;
  return (
    <div className={`grid grid-cols-2 gap-1.5 ${GRID_COLUMNS[columns]}`}>
      {products.map((p) => (
        <ProductCard
          key={p.item_id}
          product={p}
          official={officialShopIds?.has(p.shop.shop_id)}
          showLocation={showLocation}
        />
      ))}
    </div>
  );
}

/** Placeholder cards while a product grid loads. */
export function ProductGridSkeleton({
  count,
  columns = 'default',
}: {
  count: number;
  columns?: keyof typeof GRID_COLUMNS;
}) {
  return (
    <div aria-hidden="true" className={`grid grid-cols-2 gap-1.5 ${GRID_COLUMNS[columns]}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-white">
          <div className="aspect-square animate-pulse bg-gray-200/70" />
          <div className="space-y-2 p-2">
            <div className="h-3 animate-pulse rounded-sm bg-gray-200/70" />
            <div className="h-3 w-2/3 animate-pulse rounded-sm bg-gray-200/70" />
          </div>
        </div>
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
