'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { ProductSummary } from '@huspee/sdk';
import { Button, EmptyState } from '@/components/ui';
import { useT } from '@/i18n';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { messages } from './_browse/messages';
import { panel, ProductGrid, State } from './_browse/shared';
export default function Home() {
  const t = useT(messages);
  const [page, setPage] = useState(1);
  const [previous, setPrevious] = useState<ProductSummary[]>([]);
  useEffect(() => {
    document.title = 'Huspee';
  }, []);
  const categories = useApi(() => getApiClient().marketplace.categories(), []);
  const shops = useApi(() => getApiClient().marketplace.listShops({ page_size: 8 }), []);
  const products = useApi(
    () => getApiClient().marketplace.searchProducts({ sort: 'top_sales', page_size: 24, page }),
    [page],
  );
  function more() {
    if (products.data) {
      setPrevious([...previous, ...products.data.data]);
      setPage(page + 1);
    }
  }
  return (
    <div className="space-y-5">
      <section className={panel}>
        <h1 className="mb-4 text-lg font-medium uppercase text-gray-600">{t('categories')}</h1>
        <State {...categories} retry={categories.reload} />
        {!categories.loading &&
          !categories.error &&
          (categories.data?.length ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
              {categories.data.map((c) => (
                <Link
                  key={c.category_id}
                  href={`/search?category_id=${c.category_id}`}
                  className="flex flex-col items-center gap-2 p-2 text-center text-sm hover:text-[#ee4d2d]"
                >
                  <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-orange-50 text-lg text-[#ee4d2d]">
                    {c.image_url ? (
                      <Image
                        unoptimized
                        width={500}
                        height={500}
                        src={c.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      c.display_name.charAt(0)
                    )}
                  </span>
                  {c.display_name}
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={t('noCategories')} />
          ))}
      </section>
      <section className={panel}>
        <h2 className="mb-4 text-lg font-medium uppercase text-gray-600">{t('shops')}</h2>
        <State {...shops} retry={shops.reload} />
        {!shops.loading &&
          !shops.error &&
          (shops.data?.data.length ? (
            <div className="flex gap-4 overflow-x-auto">
              {shops.data.data.map((s) => (
                <Link
                  key={s.shop_id}
                  href={`/shops/${s.shop_id}`}
                  className="min-w-36 border p-4 text-center hover:border-[#ee4d2d]"
                >
                  <span className="mx-auto mb-2 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-orange-50 text-[#ee4d2d]">
                    {s.logo_url ? (
                      <Image
                        unoptimized
                        width={500}
                        height={500}
                        src={s.logo_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      s.shop_name.charAt(0)
                    )}
                  </span>
                  {s.shop_name}
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={t('noShops')} />
          ))}
      </section>
      <section>
        <h2 className="border-b-4 border-[#ee4d2d] bg-white p-4 text-center font-medium uppercase text-[#ee4d2d]">
          {t('discover')}
        </h2>
        <div className="mt-2">
          <State {...products} retry={products.reload} />
          {(previous.length > 0 || (!products.loading && !products.error && products.data)) && (
            <ProductGrid
              products={[
                ...previous,
                ...(products.loading || products.error ? [] : (products.data?.data ?? [])),
              ]}
            />
          )}
        </div>
        {!products.loading && !products.error && products.data?.page.has_next && (
          <div className="mt-5 text-center">
            <Button variant="outline" onClick={more}>
              {t('more')}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
