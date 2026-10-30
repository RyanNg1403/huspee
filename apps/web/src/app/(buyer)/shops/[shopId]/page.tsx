'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ProductSearchQuery } from '@huspee/sdk';
import { Pagination } from '@/components/ui';
import { useT } from '@/i18n';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { messages } from '../../_browse/messages';
import { panel, ProductGrid, State, Vouchers } from '../../_browse/shared';
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
    <div className="space-y-4">
      <section className={panel}>
        <State {...shop} retry={shop.reload} />
        {!shop.loading && !shop.error && shop.data && (
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-orange-50 text-2xl text-[#ee4d2d]">
              {shop.data.logo_url ? (
                <Image
                  unoptimized
                  width={500}
                  height={500}
                  src={shop.data.logo_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                shop.data.shop_name.charAt(0)
              )}
            </div>
            <div>
              <h1 className="text-2xl font-medium">{shop.data.shop_name}</h1>
              <p className="text-gray-500">{shop.data.description}</p>
              <p className="mt-2 text-sm">
                {shop.data.city} · {shop.data.item_count} {t('products')} · ★{' '}
                {shop.data.rating_star.toFixed(1)} ({shop.data.rating_count})
              </p>
            </div>
          </div>
        )}
      </section>
      <section className={panel}>
        <h2 className="mb-3 text-lg">{t('vouchers')}</h2>
        <State {...vouchers} retry={vouchers.reload} />
        {!vouchers.loading && !vouchers.error && vouchers.data && <Vouchers vouchers={vouchers.data} />}
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3 bg-white p-4">
          <h2 className="mr-auto text-lg">{t('filterByShop')}</h2>
          <label htmlFor="shop-sort">{t('sort')}</label>
          <select
            id="shop-sort"
            className="border p-2"
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
        <State {...products} retry={products.reload} />
        {!products.loading && !products.error && products.data && (
          <>
            <ProductGrid products={products.data.data} />
            <div className="mt-6">
              <Pagination
                page={page}
                totalPages={Math.max(1, Math.ceil(products.data.page.total / 24))}
                onChange={setPage}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
