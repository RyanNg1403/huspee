'use client';
import { useState } from 'react';
import type { ProductSearchQuery } from '@huspee/sdk';
import { Pagination, QueryState, Tabs } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { ProductGrid } from '@/app/(buyer)/_browse/shared';
import { categoryTabs } from './categories';
import { InlineState } from './InlineState';
import { messages } from './messages';

type Sort = NonNullable<ProductSearchQuery['sort']>;
const PAGE_SIZE = 30;
/** Largest page the marketplace search returns; enough to list a shop's categories. */
const MAX_PAGE = 100;
const ALL = 'all';

const sortButton = (active: boolean) =>
  `h-[34px] rounded-sm px-2 text-sm whitespace-nowrap transition sm:px-4 ${active ? 'bg-primary text-white' : 'bg-white text-ink hover:text-primary'}`;

/** Category tabs, sort bar and the shop's product grid. */
export function ShopProducts({ shopId }: { shopId: number }) {
  const t = useT(messages);
  const [category, setCategory] = useState(ALL);
  const [sort, setSort] = useState<Sort>('relevance');
  const [page, setPage] = useState(1);
  const tree = useApi(() => getApiClient().marketplace.categories(), []);
  const listed = useApi(
    () => getApiClient().marketplace.searchProducts({ shop_id: shopId, page_size: MAX_PAGE }),
    [shopId],
  );
  const products = useApi(
    () =>
      getApiClient().marketplace.searchProducts({
        shop_id: shopId,
        category_id: category === ALL ? undefined : Number(category),
        sort,
        page,
        page_size: PAGE_SIZE,
      }),
    [shopId, category, sort, page],
  );
  const tabs = tree.data && listed.data ? categoryTabs(listed.data.data, tree.data) : [];
  const choose = (next: Sort) => {
    setSort(next);
    setPage(1);
  };
  const priceSort = sort === 'price_asc' || sort === 'price_desc';
  return (
    <>
      <nav
        aria-label={t('categories')}
        className="bg-white px-1 max-sm:-mx-4 sm:rounded sm:px-3 sm:shadow-card"
      >
        <Tabs
          items={[
            { value: ALL, label: t('allProducts') },
            ...tabs.map((tab) => ({ value: String(tab.category_id), label: tab.name })),
          ]}
          value={category}
          onChange={(value) => {
            setCategory(value);
            setPage(1);
          }}
        />
        {Boolean(tree.error || listed.error) && (
          <div className="px-3 py-2">
            <InlineState
              loading={false}
              error={tree.error || listed.error}
              retry={() => {
                tree.reload();
                listed.reload();
              }}
            />
          </div>
        )}
      </nav>
      <section aria-label={t('allProducts')} className="space-y-2.5">
        <div className="grid grid-cols-4 items-center gap-1.5 bg-gray-200 p-2 max-sm:-mx-4 sm:flex sm:flex-wrap sm:gap-2.5 sm:rounded-sm sm:px-4 sm:py-3">
          <span className="hidden text-muted sm:inline">{t('sortBy')}</span>
          {(['relevance', 'newest', 'top_sales'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => choose(value)}
              className={sortButton(sort === value)}
            >
              {t(value === 'relevance' ? 'popular' : value === 'newest' ? 'newest' : 'topSales')}
            </button>
          ))}
          <label className="min-w-0">
            <span className="sr-only">{t('price')}</span>
            <select
              value={priceSort ? sort : ''}
              onChange={(e) => choose(e.target.value as Sort)}
              className={`h-[34px] w-full min-w-0 rounded-sm border-0 px-2 text-sm sm:w-40 sm:px-3 [&>option]:bg-white [&>option]:text-ink ${priceSort ? 'bg-primary text-white' : 'bg-white text-ink'}`}
            >
              <option value="" disabled hidden>
                {t('price')}
              </option>
              <option value="price_asc">{t('priceAsc')}</option>
              <option value="price_desc">{t('priceDesc')}</option>
            </select>
          </label>
          {products.data && (
            <span className="ml-auto hidden text-muted sm:inline">
              {t('productCount', { count: products.data.page.total })}
            </span>
          )}
        </div>
        <QueryState {...products} retry={products.reload} className="h-72 w-full" />
        {!products.loading && !products.error && products.data && (
          <>
            <ProductGrid products={products.data.data} />
            {products.data.page.total > PAGE_SIZE && (
              <Pagination
                page={page}
                totalPages={Math.ceil(products.data.page.total / PAGE_SIZE)}
                onChange={setPage}
              />
            )}
          </>
        )}
      </section>
    </>
  );
}
