'use client';
import { useRef, useState, type ReactNode } from 'react';
import type { CategoryNode } from '@huspee/sdk';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { categoryChoices, categoryLabel } from '@/components/catalog';
import { useOverlay } from '@/components/layout';
import {
  CLEARED_FILTERS,
  parsePrice,
  pickFilters,
  validPriceRange,
  type SearchFilters,
  type SearchState,
} from '../_browse/search-query';
import { PRICE_PRESETS, RATING_STEPS, TOGGLES } from './filter-options';
import { messages } from './messages';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="bg-white px-3.5 py-3">
      <legend className="float-left mb-2 w-full text-[13px] font-semibold">{title}</legend>
      <div className="clear-both grid grid-cols-2 gap-2">{children}</div>
    </fieldset>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-[34px] rounded-sm px-2 py-1 text-[13px] leading-tight ${on ? 'border border-primary bg-white text-primary' : 'bg-page text-ink'}`}
    >
      {children}
    </button>
  );
}

/** Mobile filter drawer: choices stay a draft until "Áp dụng". */
export function FilterDrawer({
  state,
  categories,
  onApply,
  onClose,
}: {
  state: SearchState;
  categories: CategoryNode[];
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
}) {
  const t = useT(messages);
  const { lang } = useLang();
  const panel = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<SearchFilters>(() => pickFilters(state));
  const [min, setMin] = useState(state.min_price?.toString() ?? '');
  const [max, setMax] = useState(state.max_price?.toString() ?? '');
  const [invalid, setInvalid] = useState(false);
  useOverlay(true, panel, onClose);
  const set = (changes: SearchFilters) => setDraft((current) => ({ ...current, ...changes }));
  const input =
    'h-[34px] w-full min-w-0 rounded-sm bg-page px-2 text-center text-[13px] placeholder:text-subtle focus:outline-2 focus:outline-primary';

  function apply() {
    const range = { min_price: parsePrice(min), max_price: parsePrice(max) };
    if (!validPriceRange(range.min_price, range.max_price)) return setInvalid(true);
    onApply({ ...draft, ...range });
  }
  function reset() {
    setDraft(CLEARED_FILTERS);
    setMin('');
    setMax('');
    setInvalid(false);
  }

  return (
    <div className="fixed inset-0 z-[60] md:hidden">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/45" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-filters-title"
        className="absolute inset-y-0 right-0 flex w-[318px] max-w-[85vw] flex-col bg-page"
      >
        <h2
          id="search-filters-title"
          className="flex h-[52px] shrink-0 items-center border-b border-line bg-white px-4 pt-[env(safe-area-inset-top)] text-base font-semibold"
        >
          {t('filters')}
        </h2>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pt-2 pb-2">
          {categories.length > 0 && (
            <Group title={t('byCategory')}>
              {categoryChoices(categories, draft.category_id).map(({ category }) => (
                <Chip
                  key={category.category_id}
                  on={draft.category_id === category.category_id}
                  onClick={() =>
                    set({
                      category_id:
                        draft.category_id === category.category_id ? undefined : category.category_id,
                    })
                  }
                >
                  {categoryLabel(category, lang)}
                </Chip>
              ))}
            </Group>
          )}
          <fieldset className="bg-white px-3.5 py-3">
            <legend className="float-left mb-2 w-full text-[13px] font-semibold">{t('priceRangeVnd')}</legend>
            <div className="clear-both flex items-center gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t('minPrice')}</span>
                <input
                  inputMode="numeric"
                  value={min}
                  onChange={(event) => setMin(event.target.value)}
                  placeholder={t('minShort')}
                  className={input}
                />
              </label>
              <span aria-hidden="true" className="text-subtle">
                –
              </span>
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t('maxPrice')}</span>
                <input
                  inputMode="numeric"
                  value={max}
                  onChange={(event) => setMax(event.target.value)}
                  placeholder={t('maxShort')}
                  className={input}
                />
              </label>
            </div>
            {invalid && (
              <p role="alert" className="mt-1.5 text-xs text-primary">
                {t('invalidPrice')}
              </p>
            )}
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PRICE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setMin(preset.min?.toString() ?? '');
                    setMax(preset.max.toString());
                    setInvalid(false);
                  }}
                  className="h-[30px] rounded-sm bg-page text-xs text-ink"
                >
                  {t(preset.label)}
                </button>
              ))}
            </div>
          </fieldset>
          <Group title={t('rating')}>
            {RATING_STEPS.map((stars) => (
              <Chip
                key={stars}
                on={draft.min_rating === stars}
                onClick={() => set({ min_rating: draft.min_rating === stars ? undefined : stars })}
              >
                <span aria-hidden="true" className="mr-1 text-amber-400">
                  ★
                </span>
                {stars === 5 ? t('starsOnly') : t('starsAndUp', { count: stars })}
              </Chip>
            ))}
          </Group>
          <Group title={t('dealsAndStock')}>
            {TOGGLES.map(({ key, label }) => (
              <Chip key={key} on={!!draft[key]} onClick={() => set({ [key]: draft[key] ? undefined : true })}>
                {t(label)}
              </Chip>
            ))}
          </Group>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-line bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={reset}
            className="h-10 rounded-sm border border-primary bg-white text-[15px] text-primary"
          >
            {t('reset')}
          </button>
          <button type="button" onClick={apply} className="h-10 rounded-sm bg-primary text-[15px] text-white">
            {t('apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
