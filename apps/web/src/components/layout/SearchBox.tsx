'use client';
import { Suspense, useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SearchIcon } from '@huspee/web-ui/components/icons';
import { useT } from '@huspee/web-ui/i18n';
import { messages } from './messages';
import { SuggestionRow } from './SuggestionRow';
import { useSearchHistory } from './use-search-history';
import { keywordHref, useSearchSuggestions, type SuggestionOption } from './use-search-suggestions';

/** Desktop marketplace search with keyword, product and shop suggestions. */
export function SearchBox() {
  return (
    <Suspense fallback={<SearchForm initial="" />}>
      <SearchFormFromUrl />
    </Suspense>
  );
}

function SearchFormFromUrl() {
  const pathname = usePathname();
  const params = useSearchParams();
  const q = pathname === '/search' ? (params.get('q') ?? '') : '';
  return <SearchForm key={q} initial={q} />;
}

function SearchForm({ initial }: { initial: string }) {
  const t = useT(messages);
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const history = useSearchHistory();
  const options = useSearchSuggestions(value, open, history.items);
  const shown = open && options.length > 0;
  const query = value.trim();

  function close() {
    setOpen(false);
    setActive(-1);
  }
  function go(option: SuggestionOption) {
    if (option.kind === 'query' || option.kind === 'history') history.add(option.keyword);
    close();
    router.push(option.href);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const picked = shown ? options[active] : undefined;
    if (picked) return go(picked);
    if (query) history.add(query);
    close();
    router.push(query ? keywordHref(query) : '/search');
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') return close();
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setOpen(true);
    const next = active + (event.key === 'ArrowDown' ? 1 : -1);
    setActive(next >= options.length ? -1 : next < -1 ? options.length - 1 : next);
  }

  return (
    <div className="relative">
      <form
        role="search"
        onSubmit={submit}
        className="flex items-center gap-1 rounded bg-white p-1 focus-within:ring-2 focus-within:ring-ink/25"
      >
        <input
          type="search"
          name="q"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={shown ? listId : undefined}
          aria-activedescendant={shown && options[active] ? `${listId}-${options[active].id}` : undefined}
          aria-label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
        />
        {/* Implicit submit: page scripts find a page's own form by button[type="submit"]. */}
        <button
          aria-label={t('searchSubmit')}
          className="flex h-10 w-16 shrink-0 items-center justify-center rounded-sm bg-primary text-white transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <SearchIcon className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>
      </form>
      {shown && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-sm bg-white py-1 text-sm text-ink shadow-lift">
          {!query && (
            <div className="flex items-center justify-between px-4 py-1.5 text-xs text-muted">
              <span>{t('history')}</span>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={history.clear}
                className="hover:text-primary"
              >
                {t('clearHistory')}
              </button>
            </div>
          )}
          <ul role="listbox" id={listId} aria-label={t('suggestions')}>
            {options.map((option, i) => (
              <li
                key={option.id}
                id={`${listId}-${option.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(option)}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-10 cursor-pointer items-center gap-3 px-4 py-1.5 ${i === active ? 'bg-gray-100' : ''}`}
              >
                <SuggestionRow option={option} query={query} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
