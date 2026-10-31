'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ProductSearchQuery } from '@huspee/sdk';
import { Button, Pagination, QueryState, Skeleton } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { messages } from '../_browse/messages';
import { panel, ProductGrid } from '../_browse/shared';
function Search() {
  const t = useT(messages);
  const params = useSearchParams();
  const router = useRouter();
  const qs = params.toString();
  useEffect(() => {
    document.title = `${t('results')} | Huspee`;
  }, [t]);
  const number = (key: string) => {
    const n = Number(params.get(key));
    return n > 0 && Number.isFinite(n) ? n : undefined;
  };
  const validSort: ProductSearchQuery['sort'][] = [
    'relevance',
    'newest',
    'top_sales',
    'price_asc',
    'price_desc',
    'rating',
  ];
  const sort = params.get('sort') as ProductSearchQuery['sort'];
  const query: ProductSearchQuery = {
    q: params.get('q') || undefined,
    category_id: number('category_id'),
    shop_id: number('shop_id'),
    min_price: number('min_price'),
    max_price: number('max_price'),
    in_stock: params.get('in_stock') === 'true' || undefined,
    has_promotion: params.get('has_promotion') === 'true' || undefined,
    min_rating: number('min_rating'),
    sort: validSort.includes(sort) ? sort : 'relevance',
    page: number('page') || 1,
    page_size: 24,
  };
  const products = useApi(() => getApiClient().marketplace.searchProducts(query), [qs]);
  function update(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(qs);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`/search${next.size ? `?${next}` : ''}`);
  }
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <aside>
        <details className={`${panel} md:open`} open>
          <summary className="cursor-pointer font-semibold">{t('filters')}</summary>
          <form
            key={qs}
            className="mt-4 space-y-4 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              update({
                min_price: String(f.get('min_price') || ''),
                max_price: String(f.get('max_price') || ''),
                in_stock: f.has('in_stock') ? 'true' : undefined,
                has_promotion: f.has('has_promotion') ? 'true' : undefined,
                min_rating: String(f.get('min_rating') || ''),
                page: undefined,
              });
            }}
          >
            <label className="block">
              {t('minPrice')}
              <input
                className="mt-1 w-full border p-2"
                type="number"
                min="0"
                name="min_price"
                defaultValue={params.get('min_price') ?? ''}
              />
            </label>
            <label className="block">
              {t('maxPrice')}
              <input
                className="mt-1 w-full border p-2"
                type="number"
                min="0"
                name="max_price"
                defaultValue={params.get('max_price') ?? ''}
              />
            </label>
            <label className="flex gap-2">
              <input type="checkbox" name="in_stock" defaultChecked={query.in_stock} />
              {t('inStock')}
            </label>
            <label className="flex gap-2">
              <input type="checkbox" name="has_promotion" defaultChecked={query.has_promotion} />
              {t('promotion')}
            </label>
            <label className="block">
              {t('minRating')}
              <select
                name="min_rating"
                defaultValue={params.get('min_rating') ?? ''}
                className="mt-1 w-full border p-2"
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} {t('stars')}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" className="w-full">
              {t('apply')}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => router.push('/search')}>
              {t('clear')}
            </Button>
          </form>
        </details>
      </aside>
      <section className="min-w-0">
        <h1 className="mb-3 text-lg">
          {t('results')}
          {query.q && `: ${query.q}`}
        </h1>
        <div className="mb-3 flex flex-wrap items-center gap-3 bg-gray-200 p-3">
          <label htmlFor="sort">{t('sort')}</label>
          <select
            id="sort"
            value={query.sort}
            className="border bg-white p-2"
            onChange={(e) => update({ sort: e.target.value, page: undefined })}
          >
            <option value="relevance">{t('relevance')}</option>
            <option value="newest">{t('newest')}</option>
            <option value="top_sales">{t('topSales')}</option>
            <option value="price_asc">{t('priceAsc')}</option>
            <option value="price_desc">{t('priceDesc')}</option>
            <option value="rating">{t('ratingSort')}</option>
          </select>
          {products.data && !products.loading && (
            <span className="ml-auto text-sm">
              {products.data.page.total} {t('resultCount')}
            </span>
          )}
        </div>
        <QueryState {...products} retry={products.reload} />
        {!products.loading && !products.error && products.data && (
          <>
            <ProductGrid products={products.data.data} />
            {!products.data.data.length && (
              <div className="text-center">
                <Button variant="outline" onClick={() => router.push('/search')}>
                  {t('clear')}
                </Button>
              </div>
            )}
            <div className="mt-6">
              <Pagination
                page={query.page ?? 1}
                totalPages={Math.max(1, Math.ceil(products.data.page.total / 24))}
                onChange={(n) => update({ page: String(n) })}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
export default function SearchPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Search />
    </Suspense>
  );
}
