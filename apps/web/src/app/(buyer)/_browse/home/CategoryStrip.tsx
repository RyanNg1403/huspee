'use client';
import Image from 'next/image';
import Link from 'next/link';
import { EmptyState, QueryState } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { categoryLabel, useCategories, useCategoryCovers } from '@/components/catalog';
import { messages } from './messages';

export function CategoryStrip() {
  const t = useT(messages);
  const { lang } = useLang();
  const categories = useCategories();
  const list = categories.data ?? [];
  const covers = useCategoryCovers(list);
  return (
    <section aria-labelledby="home-categories" className="bg-white md:rounded-sm md:shadow-card">
      <h2
        id="home-categories"
        className="px-3 pt-2.5 pb-2 text-sm font-semibold text-muted uppercase md:border-b md:border-line-soft md:px-5 md:py-4 md:text-[15px] md:font-medium md:tracking-[0.02em]"
      >
        {t('categories')}
      </h2>
      {categories.loading || categories.error ? (
        <div className="px-3 pb-3 md:p-4">
          <QueryState {...categories} retry={categories.reload} className="h-20 w-full md:h-28" />
        </div>
      ) : list.length ? (
        <ul className="flex overflow-x-auto pb-3 [scrollbar-width:none] md:grid md:grid-cols-[repeat(auto-fit,minmax(140px,1fr))] md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
          {list.map((category) => (
            <li
              key={category.category_id}
              className="w-[76px] shrink-0 md:w-auto md:border-r md:border-line-soft md:last:border-r-0"
            >
              <Link
                href={`/search?category_id=${category.category_id}`}
                className="flex h-full flex-col items-center gap-1.5 px-1 text-center text-[11px] leading-tight text-ink hover:text-primary md:gap-2 md:px-2 md:py-4 md:text-[13px]"
              >
                <span className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full bg-primary-soft text-base font-semibold text-primary md:h-[72px] md:w-[72px]">
                  {covers.get(category.category_id) ? (
                    <Image
                      unoptimized
                      width={144}
                      height={144}
                      src={covers.get(category.category_id)!}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    covers.has(category.category_id) && (
                      <span aria-hidden="true">{categoryLabel(category, lang).charAt(0)}</span>
                    )
                  )}
                </span>
                {categoryLabel(category, lang)}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('noCategories')} />
      )}
    </section>
  );
}
