'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import type { ProductSummary, PublicShop } from '@huspee/sdk';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { formatCount, formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { featuredFreeShipping, featuredVoucher, voucherBadge, type ShopOffers } from '../offers';
import { TruckIcon } from './icons';
import { messages } from './messages';

/** "TechZone Official · Chính hãng" when the shop is official, else the shop name. */
function shopLine(product: ProductSummary, shops: PublicShop[], officialLabel: string) {
  const official = shops.find((s) => s.shop_id === product.shop.shop_id)?.is_official;
  return official ? `${product.shop.shop_name} · ${officialLabel}` : product.shop.shop_name;
}

/** Desktop: the best-selling discounted product with two more deals beside it. */
function DealCard({ products, shops }: { products: ProductSummary[]; shops: PublicShop[] }) {
  const t = useT(messages);
  const { lang } = useLang();
  const [lead] = products;
  if (!lead) return null;
  const facts = [
    lead.discount_percent > 0 &&
      t('heroFacts', {
        original: formatVnd(lead.original_price_min),
        percent: lead.discount_percent,
        sold: formatCount(lead.sold, lang),
      }),
  ].filter(Boolean);
  return (
    <div className="flex min-h-[236px] min-w-0 flex-[2_1_560px] items-center gap-6 overflow-hidden rounded-sm bg-white px-8 py-7 shadow-card">
      <div className="flex min-w-0 flex-[1_1_280px] flex-col items-start gap-3">
        <span className="text-[13px] font-semibold text-primary">{shopLine(lead, shops, t('official'))}</span>
        <h2 className="text-[28px] leading-[1.2] font-bold tracking-[-0.02em]">
          <span className="line-clamp-2">{lead.name}</span>
          <span className="block">{t('heroPrice', { price: formatVnd(lead.price_min) })}</span>
        </h2>
        {facts.length > 0 && <p className="text-[15px] text-muted">{facts.join(' · ')}</p>}
        <Link
          href={`/products/${lead.item_id}`}
          className="mt-1 flex h-[42px] items-center rounded-sm bg-primary px-5 font-semibold text-white transition hover:bg-primary-hover"
        >
          {t('buyNow')}
        </Link>
      </div>
      <div className="grid flex-[0_1_300px] grid-cols-3 gap-2">
        {products.map((p) => (
          <Link
            key={p.item_id}
            href={`/products/${p.item_id}`}
            className="block overflow-hidden rounded-sm bg-gray-100"
          >
            {p.image_url && (
              <Image
                unoptimized
                width={200}
                height={266}
                src={p.image_url}
                alt={p.name}
                className="aspect-[3/4] w-full object-cover transition duration-300 hover:scale-[1.03]"
              />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Mobile: the same deals as swipeable slides under the orange header. */
function DealCarousel({ products, shops }: { products: ProductSummary[]; shops: PublicShop[] }) {
  const t = useT(messages);
  const [index, setIndex] = useState(0);
  return (
    <div className="bg-[linear-gradient(var(--color-primary)_0_60px,transparent_60px)] px-3 pb-2 md:hidden">
      <div className="relative overflow-hidden rounded">
        <div
          onScroll={(event) =>
            setIndex(
              Math.round(event.currentTarget.scrollLeft / Math.max(1, event.currentTarget.clientWidth)),
            )
          }
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {products.map((p) => (
            <Link
              key={p.item_id}
              href={`/products/${p.item_id}`}
              className="flex min-h-[136px] w-full shrink-0 snap-center items-center gap-3 bg-ink px-4 pt-4 pb-5 text-white"
            >
              <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <span className="text-xs text-white/80">{shopLine(p, shops, t('official'))}</span>
                <span className="line-clamp-2 text-[15px] leading-tight font-bold">{p.name}</span>
                <span className="text-[17px] leading-tight font-bold">
                  {t('heroPrice', { price: formatVnd(p.price_min) })}
                </span>
                <span className="mt-1.5 flex h-7 items-center rounded-sm bg-primary px-3 text-[13px] font-semibold">
                  {t('buyNow')}
                </span>
              </span>
              {p.image_url && (
                <Image
                  unoptimized
                  width={192}
                  height={208}
                  src={p.image_url}
                  alt=""
                  className="h-[104px] w-24 shrink-0 rounded object-cover"
                />
              )}
            </Link>
          ))}
        </div>
        {products.length > 1 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1"
          >
            {products.map((p, i) => (
              <span
                key={p.item_id}
                className={`h-1 rounded-sm ${i === index ? 'w-3.5 bg-white' : 'w-1 bg-white/50'}`}
              />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

/** Desktop tiles for one shop voucher and one free-shipping threshold, as the shops configured them. */
function OfferTiles({ offers }: { offers: ShopOffers[] }) {
  const t = useT(messages);
  const { lang } = useLang();
  const voucher = featuredVoucher(offers);
  const freeShipping = featuredFreeShipping(offers, voucher?.shop.shop_id);
  if (!voucher && !freeShipping) return null;
  const tile =
    'flex min-h-[114px] flex-1 items-center gap-3.5 rounded-sm px-5 py-4 text-ink transition hover:opacity-90';
  const badge = 'flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-sm text-white';
  return (
    <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2">
      {voucher && (
        <Link href={`/shops/${voucher.shop.shop_id}`} className={`${tile} bg-primary-soft`}>
          <span className={`${badge} bg-primary text-[19px] font-bold`}>
            {voucherBadge(voucher.voucher, lang)}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <strong className="text-[15px] font-semibold">
              {t('voucherTitle', { shop: voucher.shop.shop_name, voucher: voucher.voucher.voucher_name })}
            </strong>
            <span className="text-[13px] text-muted">
              {t('voucherTerms', {
                amount: formatVnd(voucher.voucher.min_spend),
                code: voucher.voucher.voucher_code,
              })}
            </span>
          </span>
        </Link>
      )}
      {freeShipping && (
        <Link href={`/shops/${freeShipping.shop.shop_id}`} className={`${tile} bg-success/10`}>
          <span className={`${badge} bg-success`}>
            <TruckIcon className="h-7 w-7" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <strong className="text-[15px] font-semibold">
              {t('freeShippingTitle', { shop: freeShipping.shop.shop_name })}
            </strong>
            <span className="text-[13px] text-muted">
              {t('freeShippingTerms', { amount: formatVnd(freeShipping.minSpend) })}
            </span>
          </span>
        </Link>
      )}
    </div>
  );
}

export function Highlights({ shops, offers }: { shops: PublicShop[]; offers: ShopOffers[] }) {
  const t = useT(messages);
  const deals = useApi(
    () =>
      getApiClient().marketplace.searchProducts({
        has_promotion: true,
        in_stock: true,
        sort: 'top_sales',
        page_size: 3,
      }),
    [],
  );
  if (deals.loading) {
    return (
      <div aria-hidden="true" className="px-3 pb-2 md:px-0 md:pb-0">
        <div className="h-[136px] animate-pulse rounded-sm bg-gray-200/70 md:h-[236px]" />
      </div>
    );
  }
  const products = deals.data?.data ?? [];
  if (!products.length && !offers.length) return null;
  return (
    <section aria-label={t('highlights')}>
      {products.length > 0 && <DealCarousel products={products} shops={shops} />}
      <div className="hidden flex-wrap gap-2 md:flex">
        <DealCard products={products} shops={shops} />
        <OfferTiles offers={offers} />
      </div>
    </section>
  );
}
