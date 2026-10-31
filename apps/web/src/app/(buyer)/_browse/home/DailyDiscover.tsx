'use client';
import { useState } from 'react';
import type { ProductSummary } from '@huspee/sdk';
import { EmptyState, QueryState } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { ProductGrid, ProductGridSkeleton } from '../shared';
import { messages } from './messages';

const PAGE_SIZE = 24;

/** Best sellers across all shops, loaded a page at a time. */
export function DailyDiscover() {
  const t = useT(messages);
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState<ProductSummary[]>([]);
  const current = useApi(
    () => getApiClient().marketplace.searchProducts({ sort: 'top_sales', page_size: PAGE_SIZE, page }),
    [page],
  );
  const items = [...loaded, ...(current.data?.data ?? [])];
  function more() {
    if (!current.data) return;
    setLoaded(items);
    setPage(page + 1);
  }
  return (
    <section aria-labelledby="home-discover">
      <h2
        id="home-discover"
        className="flex h-10 items-center justify-center border-b-2 border-primary bg-white text-sm font-semibold text-primary uppercase md:h-[50px] md:border-b-[3px] md:text-[15px] md:font-medium md:tracking-[0.02em]"
      >
        {t('discover')}
      </h2>
      <div className="mt-1.5 space-y-1.5 px-1.5 md:mt-2 md:space-y-2 md:px-0">
        {items.length > 0 && <ProductGrid products={items} columns="wide" />}
        {current.loading && <ProductGridSkeleton count={page === 1 ? 12 : 6} columns="wide" />}
        {current.error ? (
          <QueryState loading={false} error={current.error} retry={current.reload} />
        ) : (
          !current.loading && !items.length && <EmptyState title={t('noProducts')} />
        )}
      </div>
      {current.data?.page.has_next && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={more}
            className="h-10 min-w-[280px] rounded-sm border border-line-strong bg-white px-4 text-sm text-ink transition hover:border-primary hover:text-primary"
          >
            {t('more')}
          </button>
        </div>
      )}
    </section>
  );
}
