'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { formatCount, formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { messages } from '@huspee/web-ui/components/assistant/messages';
import { formatClock } from '@huspee/web-ui/components/assistant/time';

import type { ProductInfo } from '@huspee/web-ui/components/assistant/card-types';
export type { ProductInfo } from '@huspee/web-ui/components/assistant/card-types';

const sectionTitle = 'mb-1 text-xs font-semibold text-muted';

function priceLabel(models: ProductInfo['models']): string | null {
  if (!models.length) return null;
  const prices = models.map((model) => model.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? formatVnd(low) : `${formatVnd(low)} – ${formatVnd(high)}`;
}

/**
 * Everything the shop publishes about one product. `collapsible` keeps a chat card short: specs,
 * description and reviews open on request.
 */
export function ProductDetails({
  product,
  checkedAt,
  collapsible = false,
}: {
  product: ProductInfo;
  /** When the tool returned this data (ms). */
  checkedAt?: number;
  collapsible?: boolean;
}) {
  const t = useT(messages);
  const { lang } = useLang();
  const [open, setOpen] = useState(!collapsible);
  const [expanded, setExpanded] = useState(false);
  const thumb = product.images[0];
  const price = priceLabel(product.models);
  const meta = [
    product.rating != null && product.rating_count
      ? `★ ${product.rating.toFixed(1)} (${formatCount(product.rating_count, lang)})`
      : null,
    product.sold ? t('sold', { n: formatCount(product.sold, lang) }) : null,
    checkedAt !== undefined ? t('updatedAt', { time: formatClock(checkedAt, lang) }) : null,
  ].filter(Boolean);
  const facts = [
    product.brand ? { name: t('brand'), value: product.brand } : null,
    product.category ? { name: t('category'), value: product.category } : null,
    ...(product.attributes ?? []).map((a) => ({ name: a.name, value: a.value ?? t('noInfo') })),
  ].filter((fact): fact is { name: string; value: string } => !!fact);
  const description = product.description?.trim();
  const long = !!description && description.length > 220;
  const hasMore =
    facts.length > 0 || !!description || !!product.reviews || product.images.length > 1 || product.days_to_ship !== undefined;
  const only = product.models.length === 1 ? product.models[0] : undefined;
  return (
    <div className="text-sm">
      <Link href={`/products/${product.item_id}`} className="flex gap-2.5 p-2.5 hover:bg-gray-50">
        {thumb ? (
          <Image
            src={thumb}
            alt=""
            width={144}
            height={144}
            unoptimized
            className="h-[72px] w-[72px] shrink-0 rounded object-cover"
          />
        ) : (
          <span className="h-[72px] w-[72px] shrink-0 rounded bg-gray-100" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-[13px] leading-snug text-ink">{product.name}</span>
          {price && <span className="text-base font-semibold text-primary">{price}</span>}
          {only && (
            <span className="text-xs text-muted">
              {only.stock > 0 ? t('stockLeft', { n: only.stock }) : t('outOfStock')}
            </span>
          )}
          {meta.length > 0 && <span className="text-xs text-muted">{meta.join(' · ')}</span>}
        </span>
      </Link>
      {product.models.length > 1 && (
        <section className="border-t border-line-soft px-2.5 py-2">
          <h4 className={sectionTitle}>{t('variants')}</h4>
          <ul className="divide-y divide-line-soft">
            {product.models.map((model) => (
              <li key={model.model_id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                <span className={model.stock > 0 ? 'text-ink' : 'text-subtle'}>{model.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-muted">
                    {model.stock > 0 ? t('stockLeft', { n: model.stock }) : t('outOfStock')}
                  </span>
                  <span className="font-semibold text-primary">{formatVnd(model.price)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {open && hasMore && (
        <div className="space-y-3 border-t border-line-soft px-2.5 py-2.5">
          {product.images.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {product.images.map((src) => (
                <Image
                  key={src}
                  src={src}
                  alt=""
                  width={112}
                  height={112}
                  unoptimized
                  className="h-14 w-14 shrink-0 rounded object-cover"
                />
              ))}
            </div>
          )}
          {facts.length > 0 && (
            <section>
              <h4 className={sectionTitle}>{t('specs')}</h4>
              <dl className="divide-y divide-line-soft text-xs">
                {facts.map((fact) => (
                  <div key={`${fact.name}-${fact.value}`} className="grid grid-cols-[38%_1fr] gap-2 py-1.5">
                    <dt className="text-muted">{fact.name}</dt>
                    <dd className="text-ink">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {product.days_to_ship !== undefined && (
            <p className="text-xs text-muted">{t('shipsIn', { days: product.days_to_ship })}</p>
          )}
          {description && (
            <section>
              <h4 className={sectionTitle}>{t('description')}</h4>
              <p
                className={`text-xs leading-relaxed whitespace-pre-wrap text-ink ${long && !expanded ? 'line-clamp-4' : ''}`}
              >
                {description}
              </p>
              {long && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="mt-1 text-xs font-medium text-primary"
                >
                  {expanded ? t('less') : t('more')}
                </button>
              )}
            </section>
          )}
          {product.reviews && (
            <section>
              <h4 className={sectionTitle}>{t('reviews')}</h4>
              {product.reviews.length === 0 ? (
                <p className="text-xs text-muted">{t('noReviews')}</p>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {product.reviews.map((review, index) => (
                    <li key={index} className="py-1.5 text-xs">
                      <p className="flex flex-wrap items-center gap-x-2">
                        <span className="text-primary" aria-label={`${review.rating}/5`}>
                          {'★'.repeat(Math.round(review.rating))}
                        </span>
                        <span className="font-medium text-ink">{review.buyer_name}</span>
                        {review.model_name && <span className="text-muted">{review.model_name}</span>}
                      </p>
                      {review.comment && <p className="mt-0.5 text-ink">{review.comment}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line-soft px-2.5 py-2 text-xs">
        <Link href={`/products/${product.item_id}`} className="font-medium text-primary hover:underline">
          {t('viewProduct')}
        </Link>
        {collapsible && hasMore && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="min-h-8 font-medium text-muted hover:text-ink"
          >
            {open ? t('hideDetails') : t('details')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Loads a listed product's public details on demand, without another assistant turn. */
export function ProductDetailsLoader({ itemId }: { itemId: number }) {
  const t = useT(messages);
  const detail = useApi(async () => {
    const [product, reviews] = await Promise.all([
      getApiClient().marketplace.getProduct(itemId),
      getApiClient().marketplace.getReviews(itemId, { page_size: 3 }),
    ]);
    const info: ProductInfo = {
      item_id: product.item_id,
      name: product.name,
      images: product.images,
      models: product.models
        .filter((model) => model.available)
        .map(({ model_id, name, price, stock }) => ({
          model_id,
          name,
          price,
          stock,
        })),
      description: product.description,
      attributes: product.attributes,
      brand: product.brand?.name ?? null,
      category: product.category.display_name,
      rating: product.rating_count ? product.rating_star : null,
      rating_count: product.rating_count,
      sold: product.sold,
      days_to_ship: product.days_to_ship,
      reviews: reviews.data.map((review) => ({
        rating: review.rating,
        comment: review.comment,
        buyer_name: review.buyer_name,
        model_name: review.model_name,
      })),
    };
    return info;
  }, [itemId]);
  if (detail.loading)
    return (
      <span className="m-2.5 block h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
    );
  if (detail.error || !detail.data)
    return (
      <button type="button" onClick={detail.reload} className="p-2.5 text-xs text-primary">
        {t('loadFailed')}
      </button>
    );
  return <ProductDetails product={detail.data} />;
}
