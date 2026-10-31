'use client';
import Link from 'next/link';
import type { PublicShop } from '@huspee/sdk';
import { useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { ShopAvatar } from '@/components/catalog';
import { messages } from './messages';

function OfficialLabel({ className = '' }: { className?: string }) {
  const t = useT(messages);
  return (
    <span className={`shrink-0 rounded-sm bg-primary px-1 font-semibold text-white ${className}`}>
      {t('official')}
    </span>
  );
}

function DesktopShop({ shop, query }: { shop: PublicShop; query: string }) {
  const t = useT(messages);
  return (
    <section aria-labelledby="related-shop-h" className="hidden md:block">
      <h2 id="related-shop-h" className="mb-2.5 text-sm text-muted">
        {t('relatedShop')} &quot;<span className="text-primary">{query}</span>&quot;
      </h2>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4 rounded-sm bg-white px-5 py-4 shadow-card">
        <ShopAvatar shop={shop} className="h-16 w-16 text-[22px]" />
        <div className="min-w-0 flex-[1_1_220px]">
          <div className="flex items-center gap-2">
            <strong className="truncate text-base font-semibold">{shop.shop_name}</strong>
            {shop.is_official && <OfficialLabel className="text-[11px] leading-[18px]" />}
          </div>
          {shop.city && <div className="text-[13px] text-muted">{shop.city}</div>}
        </div>
        <dl className="flex gap-7 text-center text-[13px]">
          <div className="flex flex-col-reverse">
            <dt className="text-muted">{t('products')}</dt>
            <dd className="text-base text-primary">{shop.item_count}</dd>
          </div>
          {shop.rating_count > 0 && (
            <div className="flex flex-col-reverse">
              <dt className="text-muted">{t('rating')}</dt>
              <dd className="text-base text-primary">{shop.rating_star.toFixed(1)}</dd>
            </div>
          )}
        </dl>
        <Link
          href={`/shops/${shop.shop_id}`}
          className="flex h-[34px] items-center rounded-sm border border-line-strong px-3.5 text-[13px] text-ink hover:border-primary hover:text-primary"
        >
          {t('viewShop')}
        </Link>
      </div>
    </section>
  );
}

function MobileShop({ shop }: { shop: PublicShop }) {
  const t = useT(messages);
  const stats = [
    shop.city,
    shop.rating_count > 0 ? `★ ${shop.rating_star.toFixed(1)}` : null,
    t('productCount', { count: shop.item_count }),
  ].filter(Boolean);
  return (
    <Link
      href={`/shops/${shop.shop_id}`}
      className="mt-2 flex items-center gap-2.5 bg-white p-3 text-ink md:hidden"
    >
      <ShopAvatar shop={shop} className="h-11 w-11 text-[15px]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {shop.is_official && <OfficialLabel className="text-[10px] leading-[15px]" />}
          <strong className="truncate font-semibold">{shop.shop_name}</strong>
        </span>
        <span className="block truncate text-xs text-muted">{stats.join(' · ')}</span>
      </span>
      <span className="flex h-7 shrink-0 items-center rounded-sm border border-primary px-2.5 text-xs text-primary">
        {t('viewShop')}
      </span>
    </Link>
  );
}

/** The shop whose name matches the keyword, if any (marketplace shop search). */
export function RelatedShop({ query }: { query: string }) {
  const match = useApi(() => getApiClient().marketplace.listShops({ q: query, page_size: 1 }), [query]);
  const shop = match.data?.data[0];
  if (!shop) return null;
  return (
    <>
      <DesktopShop shop={shop} query={query} />
      <MobileShop shop={shop} />
    </>
  );
}
