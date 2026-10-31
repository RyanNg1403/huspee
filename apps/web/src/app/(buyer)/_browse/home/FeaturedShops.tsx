'use client';
import Link from 'next/link';
import type { PublicShop } from '@huspee/sdk';
import { EmptyState, QueryState } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { ShopAvatar } from '@/components/catalog';
import { compactVnd, usableShopVouchers, voucherBadge, type ShopOffers } from '../offers';
import { messages } from './messages';
import type { useShopOffers } from './use-shop-offers';

/** "Giảm 50K · Giảm 10% · Freeship từ 500K" from the shop's own vouchers and shipping policy. */
function useOfferLine(offer: ShopOffers | undefined) {
  const t = useT(messages);
  const { lang } = useLang();
  if (!offer) return '';
  const parts = usableShopVouchers(offer.vouchers).map((v) =>
    t('discount', { value: voucherBadge(v, lang) }),
  );
  if (offer.freeShippingMinSpend !== null) {
    parts.push(t('freeShippingFrom', { amount: compactVnd(offer.freeShippingMinSpend, lang) }));
  }
  return parts.join(' · ');
}

function ShopCard({ shop, offer }: { shop: PublicShop; offer?: ShopOffers }) {
  const t = useT(messages);
  const offerLine = useOfferLine(offer);
  const stats = [
    shop.city,
    shop.rating_count > 0 ? `★ ${shop.rating_star.toFixed(1)}` : null,
    t('productCount', { count: shop.item_count }),
  ].filter(Boolean);
  return (
    <Link
      href={`/shops/${shop.shop_id}`}
      className="group flex h-full gap-2 rounded-sm border border-line px-2.5 py-2 text-ink md:flex-col md:gap-2.5 md:rounded-none md:border-0 md:px-5 md:py-4"
    >
      <span className="flex min-w-0 items-center gap-2 md:gap-2.5">
        <ShopAvatar shop={shop} className="h-9 w-9 text-[13px] md:h-11 md:w-11 md:text-sm" />
        <span className="min-w-0">
          <strong className="block text-[13px] leading-tight font-semibold group-hover:text-primary md:text-sm">
            {shop.shop_name}
          </strong>
          <span className="line-clamp-2 text-[11px] leading-tight text-primary md:hidden">{offerLine}</span>
          <span className="hidden text-xs leading-snug text-muted md:block">{stats.join(' · ')}</span>
        </span>
      </span>
      <span
        className={`hidden min-h-5 text-[13px] leading-snug md:line-clamp-2 ${offerLine ? 'text-primary' : 'text-muted'}`}
      >
        {offerLine || shop.description}
      </span>
      <span className="mt-auto hidden h-[34px] items-center justify-center rounded-sm border border-line-strong text-[13px] group-hover:border-primary group-hover:text-primary md:flex">
        {t('viewShop')}
      </span>
    </Link>
  );
}

export function FeaturedShops({
  shops,
  offers,
}: {
  shops: ReturnType<typeof useShopOffers>['shops'];
  offers: ShopOffers[];
}) {
  const t = useT(messages);
  const list = shops.data?.data ?? [];
  return (
    <section aria-labelledby="home-shops" className="bg-white md:rounded-sm md:shadow-card">
      <h2
        id="home-shops"
        className="px-3 pt-2.5 pb-2 text-sm font-semibold text-primary uppercase md:border-b md:border-line-soft md:px-5 md:py-4 md:text-[15px] md:font-medium md:tracking-[0.02em]"
      >
        {t('featuredShops')}
      </h2>
      {shops.loading || shops.error ? (
        <div className="px-3 pb-3 md:p-4">
          <QueryState {...shops} retry={shops.reload} className="h-16 w-full md:h-36" />
        </div>
      ) : list.length ? (
        <ul className="flex gap-2 overflow-x-auto px-3 pb-3 [scrollbar-width:none] md:grid md:grid-cols-4 md:gap-0 md:overflow-visible md:p-0 [&::-webkit-scrollbar]:hidden">
          {list.map((shop) => (
            <li
              key={shop.shop_id}
              className="w-[168px] shrink-0 md:w-auto md:border-r md:border-line-soft md:[&:nth-child(4n)]:border-r-0"
            >
              <ShopCard shop={shop} offer={offers.find((o) => o.shop.shop_id === shop.shop_id)} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('noShops')} />
      )}
    </section>
  );
}
