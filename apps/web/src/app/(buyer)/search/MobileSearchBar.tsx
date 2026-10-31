'use client';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { SearchIcon } from '@huspee/web-ui/components/icons';
import { useT } from '@huspee/web-ui/i18n';
import { BackIcon, FilterIcon, MobileSearchSheet } from '@/components/layout';
import type { SearchSort } from '../_browse/search-query';
import { messages } from './messages';
import { SortTabs } from './SortBar';

/** Mobile search header: back, the current keyword (opens the search sheet), filters and sort tabs. */
export function MobileSearchBar({
  query,
  sort,
  filterCount,
  onFilter,
  onSort,
}: {
  query: string;
  sort: SearchSort;
  filterCount: number;
  onFilter: () => void;
  onSort: (sort: SearchSort) => void;
}) {
  const t = useT(messages);
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  return (
    <>
      <div className="sticky top-0 z-30 bg-white md:hidden">
        <div className="flex items-center gap-1 px-1 py-2">
          <button
            type="button"
            aria-label={t('back')}
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-primary"
          >
            <BackIcon className="h-[22px] w-[22px]" />
          </button>
          <button
            type="button"
            // Mount synchronously inside the tap so the autofocused input raises the phone keyboard.
            onClick={() => flushSync(() => setSearching(true))}
            className="flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-sm bg-page px-2.5 text-left text-sm"
          >
            <SearchIcon className="h-4 w-4 shrink-0 text-subtle" strokeWidth={2} />
            <span className={`truncate ${query ? 'text-ink' : 'text-muted'}`}>
              {query || t('searchPlaceholder')}
            </span>
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={
              filterCount ? `${t('filter')}, ${t('activeFilters', { count: filterCount })}` : t('filter')
            }
            onClick={onFilter}
            className={`relative flex h-10 shrink-0 items-center gap-1 px-2.5 text-[13px] ${filterCount ? 'text-primary' : 'text-ink'}`}
          >
            <FilterIcon className="h-[18px] w-[18px]" />
            {t('filter')}
            {filterCount > 0 && (
              <span className="absolute top-1 right-0.5 h-4 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-white">
                {filterCount}
              </span>
            )}
          </button>
        </div>
        <SortTabs sort={sort} onSort={onSort} />
      </div>
      {searching && <MobileSearchSheet initial={query} onClose={() => setSearching(false)} />}
    </>
  );
}
