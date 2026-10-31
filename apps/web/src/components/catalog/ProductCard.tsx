'use client';
import Image from 'next/image';
import Link from 'next/link';
import type { ProductSummary } from '@huspee/sdk';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { formatCount } from '@huspee/web-ui/lib/format';
import { messages } from './messages';
import { PriceTag } from './PriceTag';

export interface ProductCardProps {
  product: ProductSummary;
  /** The product's shop is official: adds the "Chính hãng" label before the name. */
  official?: boolean;
  /** Adds the shop's city under the price. */
  showLocation?: boolean;
}

/** Grid card for a public product summary; every value comes from the marketplace API. */
export function ProductCard({ product: p, official = false, showLocation = false }: ProductCardProps) {
  const t = useT(messages);
  const { lang } = useLang();
  return (
    <Link
      href={`/products/${p.item_id}`}
      className="group flex flex-col overflow-hidden rounded-sm bg-white text-ink transition md:rounded-none md:border md:border-line md:hover:-translate-y-px md:hover:border-primary md:hover:shadow-card"
    >
      <span className="relative block aspect-square bg-gray-100">
        {p.image_url && (
          <Image
            unoptimized
            width={400}
            height={400}
            src={p.image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        {p.has_promotion && p.discount_percent > 0 && (
          <span className="absolute top-0 right-0 bg-primary-soft px-1 text-[11px] leading-[18px] font-semibold text-primary md:px-[5px] md:text-xs">
            -{p.discount_percent}%
          </span>
        )}
        {!p.in_stock && (
          <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-0.5 text-center text-xs text-white">
            {t('soldOut')}
          </span>
        )}
      </span>
      <span className="flex flex-1 flex-col gap-1 px-2 pt-1.5 pb-2 md:gap-1.5 md:p-2">
        <span className="line-clamp-2 min-h-[35px] text-[13px] leading-[1.35]">
          {official && (
            <span className="mr-1 inline-block rounded-sm bg-primary px-1 align-[1px] text-[10px] leading-[15px] font-semibold text-white">
              {t('official')}
            </span>
          )}
          {p.name}
        </span>
        <span className="mt-auto flex flex-wrap items-baseline justify-between gap-x-1">
          <PriceTag value={p.price_min} className="text-sm md:text-[15px]" />
          <span className="text-[11px] text-muted md:text-xs">
            {t('sold', { count: formatCount(p.sold, lang) })}
          </span>
        </span>
        {showLocation && p.shop.city && (
          <span className="truncate text-[11px] text-muted md:text-xs">{p.shop.city}</span>
        )}
      </span>
    </Link>
  );
}
