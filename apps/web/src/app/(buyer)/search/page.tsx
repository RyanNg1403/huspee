'use client';
import { Suspense, useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchIcon } from '@huspee/web-ui/components/icons';
import { EmptyState, Pagination, QueryState } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { categoryLabel, findCategory, useCategories } from '@/components/catalog';
import {
  activeFilterCount,
  applySearch,
  CLEARED_FILTERS,
  parseSearch,
  pickFilters,
  SEARCH_PAGE_SIZE,
  searchHref,
  toApiQuery,
  type SearchState,
} from '../_browse/search-query';
import { browsePage, ProductGrid, ProductGridSkeleton } from '../_browse/shared';
import { FilterDrawer } from './FilterDrawer';
import { FilterSidebar } from './FilterSidebar';
import { messages } from './messages';
import { MobileSearchBar } from './MobileSearchBar';
import { RelatedShop } from './RelatedShop';
import { SortBar } from './SortBar';
import { YouMayLike } from './YouMayLike';

/** Below this many results the page adds best sellers under them. */
const FEW_RESULTS = 10;

function Heading({ state }: { state: SearchState }) {
  const t = useT(messages);
  const { lang } = useLang();
  const categories = useCategories();
  const category = findCategory(categories.data ?? [], state.category_id);
  const [prefix, subject] = state.q
    ? [t('resultsFor'), state.q]
    : category
      ? [t('inCategory'), categoryLabel(category, lang)]
      : [t('allProducts'), null];
  return (
    <h1 className="sr-only text-sm font-normal text-muted md:not-sr-only md:flex md:items-center md:gap-2">
      <SearchIcon className="h-4 w-4 shrink-0" />
      <span>
        {prefix}
        {subject !== null && (
          <>
            {' '}
            &quot;<span className="text-primary">{subject}</span>&quot;
          </>
        )}
      </span>
    </h1>
  );
}

function Search() {
  const t = useT(messages);
  const router = useRouter();
  const key = useSearchParams().toString();
  const state = useMemo(() => parseSearch(new URLSearchParams(key)), [key]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const products = useApi(() => getApiClient().marketplace.searchProducts(toApiQuery(state)), [key]);
  const shops = useApi(() => getApiClient().marketplace.listShops({ page_size: 100 }), []);
  const categories = useCategories();
  const officialShopIds = useMemo(
    () => new Set((shops.data?.data ?? []).filter((s) => s.is_official).map((s) => s.shop_id)),
    [shops.data],
  );
  useEffect(() => {
    document.title = `${state.q ?? t('pageTitle')} | Huspee`;
  }, [state.q, t]);

  // Controls show the requested state at once; results follow the URL when navigation completes.
  const [view, setView] = useOptimistic(state);
  const [, startTransition] = useTransition();
  const go = (changes: Partial<SearchState>) =>
    startTransition(() => {
      setView(applySearch(state, changes));
      router.push(searchHref(state, changes));
    });
  const filterCount = activeFilterCount(pickFilters(view));
  // Keep the last known total while the next page loads so the pager does not jump.
  const [knownTotal, setKnownTotal] = useState(0);
  if (products.data && products.data.page.total !== knownTotal) setKnownTotal(products.data.page.total);
  const total = products.data?.page.total ?? knownTotal;
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  const results = products.data?.data ?? [];
  const settled = !products.loading && !products.error && !!products.data;

  return (
    <div className={browsePage}>
      <MobileSearchBar
        query={state.q ?? ''}
        sort={view.sort}
        filterCount={filterCount}
        onFilter={() => setFiltersOpen(true)}
        onSort={(sort) => go({ sort })}
      />
      <div className="md:flex md:items-start md:gap-5">
        <FilterSidebar state={view} categories={categories.data ?? []} onChange={go} />
        <div className="min-w-0 flex-1 space-y-2.5 md:space-y-4">
          {state.q && <RelatedShop query={state.q} />}
          <section aria-label={t('pageTitle')} className="space-y-1.5 md:space-y-2.5">
            <Heading state={state} />
            {settled && (
              <p className="px-3 pt-1 text-[13px] text-muted md:hidden">
                {state.q
                  ? t('resultCountFor', { count: total, q: state.q })
                  : t('resultCount', { count: total })}
              </p>
            )}
            <SortBar
              sort={view.sort}
              page={view.page}
              totalPages={totalPages}
              onSort={(sort) => go({ sort })}
              onPage={(page) => go({ page })}
            />
            <div className="px-1.5 md:px-0">
              {products.loading ? (
                <ProductGridSkeleton count={10} />
              ) : products.error ? (
                <QueryState loading={false} error={products.error} retry={products.reload} />
              ) : results.length ? (
                <ProductGrid products={results} officialShopIds={officialShopIds} showLocation />
              ) : (
                <div className="bg-white md:rounded-sm md:shadow-card">
                  <EmptyState title={t('empty')}>
                    {filterCount > 0 && (
                      <button
                        type="button"
                        onClick={() => go(CLEARED_FILTERS)}
                        className="h-9 rounded-sm border border-primary px-4 text-primary"
                      >
                        {t('clearFilters')}
                      </button>
                    )}
                  </EmptyState>
                </div>
              )}
            </div>
            {settled && totalPages > 1 && (
              <div className="pt-3">
                <Pagination page={state.page} totalPages={totalPages} onChange={(page) => go({ page })} />
              </div>
            )}
          </section>
          {settled && state.page === 1 && total < FEW_RESULTS && (
            <YouMayLike exclude={new Set(results.map((p) => p.item_id))} officialShopIds={officialShopIds} />
          )}
        </div>
      </div>
      {filtersOpen && (
        <FilterDrawer
          state={state}
          categories={categories.data ?? []}
          onClose={() => setFiltersOpen(false)}
          onApply={(filters) => {
            setFiltersOpen(false);
            go(filters);
          }}
        />
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className={`${browsePage} px-1.5 pt-24 md:px-0 md:pt-0`}>
          <ProductGridSkeleton count={10} />
        </div>
      }
    >
      <Search />
    </Suspense>
  );
}
