'use client';
import { useState, type FormEvent } from 'react';
import type { CategoryNode } from '@huspee/sdk';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { categoryChoices, categoryLabel } from '@/components/catalog';
import { FilterIcon } from '@/components/layout';
import {
  CLEARED_FILTERS,
  parsePrice,
  validPriceRange,
  type SearchFilters,
  type SearchState,
} from '../_browse/search-query';
import { RATING_STEPS, TOGGLES } from './filter-options';
import { messages } from './messages';

const group = 'mt-3.5 border-b border-line-strong pb-3.5 first-of-type:mt-0';
const legend = 'pb-2 font-medium';
const check = 'flex min-h-7 cursor-pointer items-center gap-2 hover:text-primary';

function PriceForm({ state, onChange }: { state: SearchState; onChange: (changes: SearchFilters) => void }) {
  const t = useT(messages);
  const [min, setMin] = useState(state.min_price?.toString() ?? '');
  const [max, setMax] = useState(state.max_price?.toString() ?? '');
  const [invalid, setInvalid] = useState(false);
  const input =
    'h-[30px] w-full min-w-0 rounded-sm border border-line-strong bg-white px-1.5 text-xs placeholder:text-subtle focus:border-primary focus:outline-none';
  function submit(event: FormEvent) {
    event.preventDefault();
    const range = { min_price: parsePrice(min), max_price: parsePrice(max) };
    setInvalid(!validPriceRange(range.min_price, range.max_price));
    if (validPriceRange(range.min_price, range.max_price)) onChange(range);
  }
  return (
    <form onSubmit={submit}>
      <div className="flex items-center gap-1.5">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t('minPrice')}</span>
          <input
            inputMode="numeric"
            value={min}
            onChange={(event) => setMin(event.target.value)}
            placeholder={t('minPlaceholder')}
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
            placeholder={t('maxPlaceholder')}
            className={input}
          />
        </label>
      </div>
      {invalid && (
        <p role="alert" className="mt-1.5 text-xs text-primary">
          {t('invalidPrice')}
        </p>
      )}
      <button className="mt-2.5 h-[30px] w-full rounded-sm bg-primary text-[13px] text-white uppercase hover:bg-primary-hover">
        {t('apply')}
      </button>
    </form>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <span aria-hidden="true" className="tracking-[1px]">
      <span className="text-amber-400">{'★'.repeat(count)}</span>
      <span className="text-gray-300">{'★'.repeat(5 - count)}</span>
    </span>
  );
}

/** Desktop search filters; each choice applies at once except the price range. */
export function FilterSidebar({
  state,
  categories,
  onChange,
}: {
  state: SearchState;
  categories: CategoryNode[];
  onChange: (changes: SearchFilters) => void;
}) {
  const t = useT(messages);
  const { lang } = useLang();
  const choices = categoryChoices(categories, state.category_id);
  return (
    <aside aria-label={t('filters')} className="hidden w-[200px] shrink-0 text-[13px] md:block">
      <h2 className="mb-3.5 flex items-center gap-2 text-[15px] font-semibold uppercase">
        <FilterIcon className="h-4 w-4" strokeWidth={2} />
        {t('filters')}
      </h2>
      {choices.length > 0 && (
        <fieldset className={group}>
          <legend className={legend}>{t('byCategory')}</legend>
          {choices.map(({ category, depth }) => (
            <label key={category.category_id} className={`${check} ${depth ? 'pl-6' : ''}`}>
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={state.category_id === category.category_id}
                onChange={(event) =>
                  onChange({ category_id: event.target.checked ? category.category_id : undefined })
                }
              />
              {categoryLabel(category, lang)}
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className={group}>
        <legend className={legend}>{t('priceRange')}</legend>
        <PriceForm key={`${state.min_price}-${state.max_price}`} state={state} onChange={onChange} />
      </fieldset>
      <fieldset className={group}>
        <legend className={legend}>{t('rating')}</legend>
        {RATING_STEPS.map((stars) => {
          const on = state.min_rating === stars;
          return (
            <button
              key={stars}
              type="button"
              aria-pressed={on}
              aria-label={stars === 5 ? t('starsOnly') : t('starsAndUp', { count: stars })}
              onClick={() => onChange({ min_rating: on ? undefined : stars })}
              className={`flex min-h-[26px] w-full items-center gap-1.5 rounded-sm px-1 text-left ${on ? 'bg-primary-soft' : 'hover:bg-gray-50'}`}
            >
              <Stars count={stars} />
              {stars < 5 && <span>{t('andUp')}</span>}
            </button>
          );
        })}
      </fieldset>
      <fieldset className={group}>
        <legend className={legend}>{t('dealsAndStock')}</legend>
        {TOGGLES.map(({ key, label }) => (
          <label key={key} className={check}>
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0"
              checked={!!state[key]}
              onChange={(event) => onChange({ [key]: event.target.checked || undefined })}
            />
            {t(label)}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        onClick={() => onChange(CLEARED_FILTERS)}
        className="mt-3.5 h-8 w-full rounded-sm bg-primary text-[13px] text-white uppercase hover:bg-primary-hover"
      >
        {t('clearAll')}
      </button>
    </aside>
  );
}
