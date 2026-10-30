'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { ProductSummary } from '@huspee/sdk';
import { Button, EmptyState, QueryState } from '@/components/ui';
import { useT } from '@/i18n';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { messages } from './_browse/messages';
import { ProductGrid } from './_browse/shared';
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
  const heroPick = [2000103, 2000203, 2000106, 2000402];
  const pool = [...previous, ...(products.data?.data ?? [])].filter((p) => p.image_url);
  const heroPhotos = [
    ...heroPick.map((id) => pool.find((p) => p.item_id === id)).filter((p) => p !== undefined),
    ...pool.filter((p) => !heroPick.includes(p.item_id)),
  ].slice(0, 4);
  const sectionTitle = 'text-lg font-semibold tracking-tight text-ink sm:text-xl';
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#ff6a3d] via-primary to-[#c9361a] text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:p-12">
          <div className="relative space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide uppercase ring-1 ring-white/25">
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3" />
              </svg>
              {t('heroEyebrow')}
            </span>
            <h1 className="max-w-xl text-3xl leading-tight font-bold sm:text-4xl lg:text-[2.75rem]">
              {t('heroTitle')}
            </h1>
            <p className="max-w-lg text-sm leading-relaxed text-white/85 sm:text-base">{t('heroBody')}</p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#shops"
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:bg-orange-50"
              >
                {t('heroCta')}
              </a>
              <a
                href="#discover"
                className="rounded-full px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/10"
              >
                {t('heroSecondary')}
              </a>
            </div>
          </div>
          <div className="relative hidden grid-cols-2 gap-3 sm:grid">
            {heroPhotos.map((p, i) => (
              <Link
                key={p.item_id}
                href={`/products/${p.item_id}`}
                className={`overflow-hidden rounded-2xl bg-white/20 shadow-lift ring-1 ring-white/20 ${i % 2 ? 'translate-y-6' : ''}`}
              >
                <Image
                  unoptimized
                  width={400}
                  height={400}
                  src={p.image_url!}
                  alt={p.name}
                  className="aspect-[4/3] h-full w-full object-cover transition duration-500 hover:scale-105"
                />
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section>
        <h2 className={`mb-4 ${sectionTitle}`}>{t('categories')}</h2>
        <QueryState {...categories} retry={categories.reload} />
        {!categories.loading &&
          !categories.error &&
          (categories.data?.length ? (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {categories.data.map((c) => (
                <Link
                  key={c.category_id}
                  href={`/search?category_id=${c.category_id}`}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-white py-1.5 pr-4 pl-1.5 text-sm font-medium text-gray-700 transition hover:border-primary/40 hover:text-primary"
                >
                  <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-sm font-semibold text-primary">
                    {c.image_url ? (
                      <Image
                        unoptimized
                        width={64}
                        height={64}
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
      <section id="shops" className="scroll-mt-24">
        <h2 className={`mb-4 ${sectionTitle}`}>{t('shops')}</h2>
        <QueryState {...shops} retry={shops.reload} />
        {!shops.loading &&
          !shops.error &&
          (shops.data?.data.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {shops.data.data.map((s) => (
                <Link
                  key={s.shop_id}
                  href={`/shops/${s.shop_id}`}
                  className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-4 transition hover:border-gray-300 hover:shadow-lift"
                >
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-primary">
                    {s.logo_url ? (
                      <Image
                        unoptimized
                        width={112}
                        height={112}
                        src={s.logo_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      s.shop_name.charAt(0)
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-semibold text-ink group-hover:text-primary">
                      <span className="truncate">{s.shop_name}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {s.city ? `${s.city} · ` : ''}
                      {s.item_count} {t('shopProducts')} · <span className="text-amber-400">★</span>{' '}
                      {s.rating_star.toFixed(1)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={t('noShops')} />
          ))}
      </section>
      <section id="discover" className="scroll-mt-24">
        <h2 className={`mb-4 ${sectionTitle}`}>{t('discover')}</h2>
        <div>
          <QueryState {...products} retry={products.reload} />
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
          <div className="mt-6 text-center">
            <Button variant="outline" onClick={more}>
              {t('more')}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
