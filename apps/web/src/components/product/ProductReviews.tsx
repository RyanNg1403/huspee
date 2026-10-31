'use client';
import Image from 'next/image';
import { useState } from 'react';
import type { ProductDetail } from '@huspee/sdk';
import { Pagination, QueryState, Rating } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { formatDate } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { messages } from './messages';

const PAGE_SIZE = 5;

const filterButton = (active: boolean) =>
  `min-h-9 rounded-sm border bg-white px-3.5 text-[13px] transition ${active ? 'border-primary text-primary-hover' : 'border-line-strong hover:border-primary'}`;

/** Rating summary, per-star filters and the paged list of reviews. */
export function ProductReviews({ product }: { product: ProductDetail }) {
  const t = useT(messages);
  const { lang } = useLang();
  const [rating, setRating] = useState(0);
  const [page, setPage] = useState(1);
  const reviews = useApi(
    () =>
      getApiClient().marketplace.getReviews(product.item_id, {
        rating: rating || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    [product.item_id, rating, page],
  );
  const summary = reviews.data?.summary;
  const total = summary ? Object.values(summary).reduce((sum, n) => sum + n, 0) : product.rating_count;
  const filter = (next: number) => {
    setRating(next);
    setPage(1);
  };
  return (
    <section aria-labelledby="product-reviews" className="bg-white p-3 sm:rounded-lg sm:p-5">
      <h2 id="product-reviews" className="mb-3.5 text-base font-semibold">
        {t('reviews')}
      </h2>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded border border-mic-ring bg-primary-soft px-4 py-4 sm:px-5">
        <div className="text-primary-hover">
          {product.rating_count > 0 ? (
            <>
              <div>
                <span className="text-[26px] font-bold">{product.rating_star.toFixed(1)}</span>{' '}
                <span className="text-[15px]">{t('outOf5')}</span>
              </div>
              <Rating value={product.rating_star} />
            </>
          ) : (
            <span className="text-[15px]">{t('noRating')}</span>
          )}
        </div>
        <div role="group" aria-label={t('ratings')} className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={rating === 0}
            onClick={() => filter(0)}
            className={filterButton(rating === 0)}
          >
            {t('allReviews', { count: total })}
          </button>
          {[5, 4, 3, 2, 1].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={rating === n}
              onClick={() => filter(n)}
              className={filterButton(rating === n)}
            >
              {t('stars', { n, count: summary?.[String(n)] ?? 0 })}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2">
        <QueryState {...reviews} retry={reviews.reload} className="mt-4 h-24 w-full" />
        {!reviews.loading &&
          !reviews.error &&
          reviews.data &&
          (reviews.data.data.length === 0 ? (
            <p className="py-8 text-center text-muted">
              {rating ? t('noReviewsForFilter', { n: rating }) : t('noReviews')}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-line-soft">
                {reviews.data.data.map((r) => (
                  <li key={r.comment_id} className="flex gap-3 py-4">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs text-muted"
                    >
                      {r.buyer_name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-[13px]">{r.buyer_name}</div>
                      <Rating value={r.rating} />
                      <div className="text-xs text-muted">
                        {[
                          formatDate(r.create_time, lang),
                          r.model_name && `${t('variation')}: ${r.model_name}`,
                          r.verified_purchase && t('verified'),
                        ]
                          .filter(Boolean)
                          .join(' | ')}
                      </div>
                      {r.comment && <p className="pt-1 whitespace-pre-wrap">{r.comment}</p>}
                      {r.image_urls.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {r.image_urls.map((url) => (
                            <Image
                              key={url}
                              unoptimized
                              width={144}
                              height={144}
                              src={url}
                              alt=""
                              className="h-[72px] w-[72px] rounded-sm object-cover"
                            />
                          ))}
                        </div>
                      )}
                      {r.seller_reply && (
                        <div className="mt-2 rounded-sm bg-gray-50 p-3 text-[13px]">
                          <div className="mb-1 font-medium">{t('sellerReply')}</div>
                          <p className="whitespace-pre-wrap text-muted">{r.seller_reply}</p>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {reviews.data.page.total > PAGE_SIZE && (
                <Pagination
                  page={page}
                  totalPages={Math.ceil(reviews.data.page.total / PAGE_SIZE)}
                  onChange={setPage}
                />
              )}
            </>
          ))}
      </div>
    </section>
  );
}
