'use client';
import { useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { ProductGrid } from '../_browse/shared';
import { messages } from './messages';

/** Best sellers not already in the results, shown when a search returns few products. */
export function YouMayLike({
  exclude,
  officialShopIds,
}: {
  exclude: ReadonlySet<number>;
  officialShopIds: ReadonlySet<number>;
}) {
  const t = useT(messages);
  const picks = useApi(
    () => getApiClient().marketplace.searchProducts({ sort: 'top_sales', page_size: 20 }),
    [],
  );
  const products = (picks.data?.data ?? []).filter((p) => !exclude.has(p.item_id)).slice(0, 10);
  if (!products.length) return null;
  return (
    <section aria-labelledby="you-may-like-h" className="space-y-1.5 md:space-y-2.5">
      <h2
        id="you-may-like-h"
        className="px-3 pt-1.5 text-sm font-semibold md:px-0 md:pt-2 md:text-[15px] md:font-medium md:text-muted md:uppercase md:tracking-[0.02em]"
      >
        {t('youMayLike')}
      </h2>
      <div className="px-1.5 md:px-0">
        <ProductGrid products={products} officialShopIds={officialShopIds} showLocation />
      </div>
    </section>
  );
}
