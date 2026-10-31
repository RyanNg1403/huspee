'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { categoryLabel, useCategories, useCategoryCovers } from '@/components/catalog';
import { BackIcon, ClearIcon } from './icons';
import { messages } from './messages';
import { SuggestionRow } from './SuggestionRow';
import { useOverlay } from './use-overlay';
import { useSearchHistory } from './use-search-history';
import { keywordHref, useSearchSuggestions, type SuggestionOption } from './use-search-suggestions';

/**
 * Full-screen mobile search. Open it inside `flushSync` from the tap handler so the autofocused
 * input raises the phone keyboard.
 */
export function MobileSearchSheet({ initial, onClose }: { initial: string; onClose: () => void }) {
  const t = useT(messages);
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const history = useSearchHistory();
  const options = useSearchSuggestions(value, true, history.items);
  const query = value.trim();
  useOverlay(true, panel, onClose);

  function pick(option: SuggestionOption) {
    if (option.kind === 'query' || option.kind === 'history') history.add(option.keyword);
    onClose();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (query) history.add(query);
    onClose();
    router.push(query ? keywordHref(query) : '/search');
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={t('search')}
      className="fixed inset-0 z-[60] flex flex-col bg-page md:hidden"
    >
      <form
        role="search"
        onSubmit={submit}
        className="flex items-center gap-1 border-b border-line bg-white py-2 pr-2 pl-1 pt-[max(0.5rem,env(safe-area-inset-top))]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('back')}
          className="flex h-10 w-10 shrink-0 items-center justify-center text-primary"
        >
          <BackIcon className="h-[22px] w-[22px]" />
        </button>
        <label className="flex h-[38px] min-w-0 flex-1 items-center gap-1.5 rounded-sm border border-primary pr-0.5 pl-2.5">
          <span className="sr-only">{t('searchLabel')}</span>
          <input
            ref={input}
            autoFocus
            type="search"
            enterKeyHint="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
          />
          {value && (
            <button
              type="button"
              aria-label={t('clearQuery')}
              onClick={() => {
                setValue('');
                input.current?.focus();
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center text-subtle"
            >
              <ClearIcon className="h-4 w-4" />
            </button>
          )}
        </label>
        {/* Implicit submit, like the desktop search box. */}
        <button className="h-[38px] shrink-0 rounded-sm bg-primary px-3 text-sm text-white">
          {t('searchSubmit')}
        </button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {query ? (
          <ul aria-label={t('suggestions')} className="bg-white text-sm">
            {options.map((option) => (
              <li key={option.id}>
                <Link
                  href={option.href}
                  onClick={() => pick(option)}
                  className="flex min-h-11 items-center gap-3 border-b border-line-soft px-4 py-1.5 text-ink"
                >
                  <SuggestionRow option={option} query={query} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {history.items.length > 0 && (
              <section aria-labelledby="search-history-h" className="bg-white px-4 pt-3 pb-3.5">
                <div className="mb-2.5 flex items-baseline justify-between">
                  <h2 id="search-history-h" className="text-sm font-semibold">
                    {t('history')}
                  </h2>
                  <button type="button" onClick={history.clear} className="text-[13px] text-muted">
                    {t('clearHistory')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.items.map((keyword) => (
                    <Link
                      key={keyword}
                      href={keywordHref(keyword)}
                      onClick={() =>
                        pick({ kind: 'history', id: keyword, keyword, href: keywordHref(keyword) })
                      }
                      className="flex h-[30px] max-w-full items-center truncate rounded-sm bg-page px-3 text-[13px] text-ink"
                    >
                      {keyword}
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <CategoryShortcuts onPick={onClose} />
          </>
        )}
      </div>
    </div>
  );
}

function CategoryShortcuts({ onPick }: { onPick: () => void }) {
  const t = useT(messages);
  const { lang } = useLang();
  const categories = useCategories();
  const covers = useCategoryCovers(categories.data ?? []);
  if (!categories.data?.length) return null;
  return (
    <section aria-labelledby="search-categories-h" className="mt-2 bg-white px-4 pt-3 pb-3.5">
      <h2 id="search-categories-h" className="mb-2.5 text-sm font-semibold">
        {t('categories')}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {categories.data.map((category) => (
          <Link
            key={category.category_id}
            href={`/search?category_id=${category.category_id}`}
            onClick={onPick}
            className="flex items-center gap-2 rounded-sm border border-line-soft p-1.5 text-[13px] text-ink"
          >
            <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-sm bg-gray-100">
              {covers.get(category.category_id) && (
                <Image
                  unoptimized
                  width={80}
                  height={80}
                  src={covers.get(category.category_id)!}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </span>
            <span className="min-w-0 leading-tight">{categoryLabel(category, lang)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
