'use client';
import { ChevronIcon } from '@huspee/web-ui/components/icons';
import { useT } from '@huspee/web-ui/i18n';
import { BackIcon, NextIcon, SortIcon } from '@/components/layout';
import type { SearchSort } from '../_browse/search-query';
import { messages } from './messages';

const PLAIN_SORTS = [
  { sort: 'relevance', label: 'relevance' },
  { sort: 'newest', label: 'newest' },
  { sort: 'top_sales', label: 'topSales' },
] as const;

/** Desktop sort bar with the compact page switcher on the right. */
export function SortBar({
  sort,
  page,
  totalPages,
  onSort,
  onPage,
}: {
  sort: SearchSort;
  page: number;
  totalPages: number;
  onSort: (sort: SearchSort) => void;
  onPage: (page: number) => void;
}) {
  const t = useT(messages);
  const byPrice = sort === 'price_asc' || sort === 'price_desc';
  const pager =
    'flex h-[34px] w-9 items-center justify-center rounded-sm bg-white text-ink disabled:text-gray-300 enabled:hover:text-primary';
  return (
    <div className="hidden flex-wrap items-center gap-2.5 rounded-sm bg-gray-200 px-4 py-3 md:flex">
      <span className="mr-1 text-muted">{t('sortBy')}</span>
      {PLAIN_SORTS.map((option) => (
        <button
          key={option.sort}
          type="button"
          aria-pressed={sort === option.sort}
          onClick={() => onSort(option.sort)}
          className={`h-[34px] rounded-sm px-4 ${sort === option.sort ? 'bg-primary text-white' : 'bg-white text-ink hover:text-primary'}`}
        >
          {t(option.label)}
        </button>
      ))}
      <label className="relative">
        <span className="sr-only">{t('price')}</span>
        <select
          value={byPrice ? sort : ''}
          onChange={(event) => onSort(event.target.value as SearchSort)}
          className={`h-[34px] w-[180px] cursor-pointer appearance-none rounded-sm bg-white pr-8 pl-3 ${byPrice ? 'text-primary' : 'text-ink'}`}
        >
          <option value="" disabled hidden>
            {t('price')}
          </option>
          <option value="price_asc">{t('priceAsc')}</option>
          <option value="price_desc">{t('priceDesc')}</option>
        </select>
        <ChevronIcon className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
      </label>
      <span className="ml-auto flex items-center gap-3">
        <span className="text-muted tabular-nums">
          <span className="text-primary">{page}</span>/{totalPages}
        </span>
        <span className="flex gap-px">
          <button
            type="button"
            aria-label={t('previousPage')}
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className={pager}
          >
            <BackIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={t('nextPage')}
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            className={pager}
          >
            <NextIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      </span>
    </div>
  );
}

/** Mobile sort tabs; "Giá" toggles low-to-high and high-to-low. */
export function SortTabs({ sort, onSort }: { sort: SearchSort; onSort: (sort: SearchSort) => void }) {
  const t = useT(messages);
  const byPrice = sort === 'price_asc' || sort === 'price_desc';
  const tab = (on: boolean) =>
    `flex h-[42px] items-center justify-center gap-1 border-b-2 text-[13px] ${on ? 'border-primary text-primary' : 'border-transparent text-ink'}`;
  return (
    <div
      role="group"
      aria-label={t('sortBy')}
      className="grid grid-cols-4 border-t border-b border-t-line-soft border-b-line bg-white"
    >
      {PLAIN_SORTS.map((option) => (
        <button
          key={option.sort}
          type="button"
          aria-pressed={sort === option.sort}
          onClick={() => onSort(option.sort)}
          className={tab(sort === option.sort)}
        >
          {t(option.label)}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={byPrice}
        aria-label={
          sort === 'price_desc' ? t('priceDesc') : sort === 'price_asc' ? t('priceAsc') : t('price')
        }
        onClick={() => onSort(sort === 'price_asc' ? 'price_desc' : 'price_asc')}
        className={tab(byPrice)}
      >
        {t('price')}
        <SortIcon
          className={`h-3 w-3 ${sort === 'price_asc' ? '[&>path:last-child]:opacity-30' : sort === 'price_desc' ? '[&>path:first-child]:opacity-30' : ''}`}
        />
      </button>
    </div>
  );
}
