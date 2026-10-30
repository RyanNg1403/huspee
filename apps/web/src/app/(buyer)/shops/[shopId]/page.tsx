'use client';
import Image from 'next/image';
import { VoiceWidget } from '@/components/assistant/VoiceWidget';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ProductSearchQuery } from '@huspee/sdk';
import { Pagination, QueryState } from '@/components/ui';
import { useT } from '@/i18n';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { messages } from '../../_browse/messages';
import { ProductGrid, Vouchers } from '../../_browse/shared';
export default function ShopPage() {
  const t = useT(messages);
  const id = Number(useParams().shopId);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ProductSearchQuery['sort']>('top_sales');
  const shop = useApi(() => getApiClient().marketplace.getShop(id), [id]);
  const vouchers = useApi(() => getApiClient().marketplace.shopVouchers(id), [id]);
  const products = useApi(
    () => getApiClient().marketplace.searchProducts({ shop_id: id, sort, page, page_size: 24 }),
    [id, sort, page],
  );
  useEffect(() => {
    document.title = `${shop.data?.shop_name ?? t('shop')} | Huspee`;
  }, [shop.data, t]);
  return (
    <div className="space-y-8">
      <VoiceWidget shopId={id} />
      <section className="overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-white via-white to-primary-soft shadow-card">
        <div className="p-5 sm:p-8">
          <QueryState {...shop} retry={shop.reload} />
          {!shop.loading && !shop.error && shop.data && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-2xl text-primary shadow-card ring-4 ring-white sm:h-24 sm:w-24">
                {shop.data.logo_url ? (
                  <Image
                    unoptimized
                    width={192}
                    height={192}
                    src={shop.data.logo_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  shop.data.shop_name.charAt(0)
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{shop.data.shop_name}</h1>
                  {shop.data.is_official && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                      {t('official')}
                    </span>
                  )}
                </div>
                <p className="max-w-3xl text-sm text-gray-500">{shop.data.description}</p>
              </div>
              <dl className="flex shrink-0 gap-6 text-sm">
                <div>
                  <dt className="text-xs text-gray-500">{t('products')}</dt>
                  <dd className="font-semibold">{shop.data.item_count}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">{t('reviews')}</dt>
                  <dd className="font-semibold">
                    <span className="text-amber-400">★</span> {shop.data.rating_star.toFixed(1)}{' '}
                    <span className="font-normal text-gray-400">({shop.data.rating_count})</span>
                  </dd>
                </div>
                {shop.data.city && (
                  <div>
                    <dt className="text-xs text-gray-500">{t('shop')}</dt>
                    <dd className="font-semibold">{shop.data.city}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">{t('vouchers')}</h2>
        <QueryState {...vouchers} retry={vouchers.reload} />
        {!vouchers.loading && !vouchers.error && vouchers.data && <Vouchers vouchers={vouchers.data} />}
      </section>
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-lg font-semibold tracking-tight">{t('filterByShop')}</h2>
          <label htmlFor="shop-sort" className="text-sm text-gray-500">
            {t('sort')}
          </label>
          <select
            id="shop-sort"
            className="h-10 rounded-full border border-line bg-white px-4 text-sm font-medium focus:border-primary focus:outline-none"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as ProductSearchQuery['sort']);
              setPage(1);
            }}
          >
            <option value="top_sales">{t('topSales')}</option>
            <option value="newest">{t('newest')}</option>
            <option value="price_asc">{t('priceAsc')}</option>
            <option value="price_desc">{t('priceDesc')}</option>
          </select>
        </div>
        <QueryState {...products} retry={products.reload} />
        {!products.loading && !products.error && products.data && (
          <>
            <ProductGrid products={products.data.data} />
            {products.data.page.total > 24 && (
              <div className="mt-8">
                <Pagination
                  page={page}
                  totalPages={Math.max(1, Math.ceil(products.data.page.total / 24))}
                  onChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
