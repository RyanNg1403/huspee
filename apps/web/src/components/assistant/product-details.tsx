'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useLang, useT } from '@/i18n';
import { getApiClient } from '@/lib/api';
import { formatCount, formatVnd } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { messages } from './messages';

import type { ProductInfo } from './card-types';
export type { ProductInfo } from './card-types';

function Stars({ value }: { value: number }) {
  return (
    <span className="text-amber-400" aria-label={`${value}/5`}>
      {'★'.repeat(Math.round(value))}
      <span className="text-gray-200">{'★'.repeat(5 - Math.round(value))}</span>
    </span>
  );
}

/** Everything the shop publishes about one product: gallery, variants, specs, description, reviews. */
export function ProductDetails({ product }: { product: ProductInfo }) {
  const t = useT(messages);
  const { lang } = useLang();
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const image = product.images[selected] ?? product.images[0];
  const meta = [
    product.rating != null && product.rating_count
      ? `★ ${product.rating.toFixed(1)} (${formatCount(product.rating_count, lang)})`
      : null,
    product.sold ? `${t('sold')} ${formatCount(product.sold, lang)}` : null,
  ].filter(Boolean);
  const facts = [
    product.brand ? { name: t('brand'), value: product.brand } : null,
    product.category ? { name: t('category'), value: product.category } : null,
    ...(product.attributes ?? []),
  ].filter((fact): fact is { name: string; value: string } => !!fact);
  const description = product.description?.trim();
  const long = !!description && description.length > 220;
  return (
    <div className="space-y-3">
      {image && (
        <div className="space-y-1.5">
          <Image
            src={image}
            alt=""
            width={480}
            height={480}
            unoptimized
            className="aspect-square w-full rounded-xl object-cover ring-1 ring-line"
          />
          {product.images.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {product.images.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSelected(index)}
                  aria-label={`${index + 1}`}
                  className={`shrink-0 rounded-lg ring-2 ${index === selected ? 'ring-primary' : 'ring-transparent'}`}
                >
                  <Image
                    src={src}
                    alt=""
                    width={96}
                    height={96}
                    unoptimized
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div>
        <Link
          href={`/products/${product.item_id}`}
          className="font-semibold text-gray-900 hover:text-primary"
        >
          {product.name}
        </Link>
        {meta.length > 0 && <p className="mt-0.5 text-xs text-gray-500">{meta.join(' · ')}</p>}
      </div>
      {product.models.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {t('variants')}
          </h4>
          <ul className="divide-y divide-line rounded-xl bg-gray-50 px-3">
            {product.models.map((model) => (
              <li key={model.model_id} className="flex items-center justify-between gap-2 py-2 text-xs">
                <span className="text-gray-700">{model.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={model.stock > 0 ? 'text-gray-500' : 'text-red-600'}>
                    {t('stock')}: {model.stock}
                  </span>
                  <span className="font-semibold text-primary tabular-nums">{formatVnd(model.price)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {facts.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">{t('specs')}</h4>
          <dl className="divide-y divide-line rounded-xl ring-1 ring-line">
            {facts.map((fact) => (
              <div
                key={`${fact.name}-${fact.value}`}
                className="grid grid-cols-[40%_1fr] gap-2 px-3 py-1.5 text-xs"
              >
                <dt className="text-gray-500">{fact.name}</dt>
                <dd className="text-gray-800">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {product.days_to_ship !== undefined && (
        <p className="text-xs text-gray-500">{t('shipsIn', { days: product.days_to_ship })}</p>
      )}
      {description && (
        <section>
          <h4 className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {t('description')}
          </h4>
          <p
            className={`text-xs leading-relaxed whitespace-pre-wrap text-gray-700 ${long && !expanded ? 'line-clamp-4' : ''}`}
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
          <h4 className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">{t('reviews')}</h4>
          {product.reviews.length === 0 ? (
            <p className="text-xs text-gray-500">{t('noReviews')}</p>
          ) : (
            <ul className="space-y-2">
              {product.reviews.map((review, index) => (
                <li key={index} className="rounded-xl bg-gray-50 px-3 py-2 text-xs">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <Stars value={review.rating} />
                    <span className="font-medium text-gray-700">{review.buyer_name}</span>
                    {review.model_name && <span className="text-gray-400">{review.model_name}</span>}
                  </p>
                  {review.comment && <p className="mt-1 text-gray-700">{review.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <Link
        href={`/products/${product.item_id}`}
        className="block rounded-full border border-line py-2 text-center text-xs font-semibold text-gray-700 transition hover:border-primary hover:text-primary"
      >
        {t('viewProduct')}
      </Link>
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
        .map(({ model_id, name, price, stock }) => ({ model_id, name, price, stock })),
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
      <span className="block h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
    );
  if (detail.error || !detail.data)
    return (
      <button type="button" onClick={detail.reload} className="text-xs text-red-600">
        {t('loadFailed')}
      </button>
    );
  return <ProductDetails product={detail.data} />;
}
