import type { ProductSearchQuery } from '@huspee/sdk';

/** Search results per page; divisible by the 2- and 5-column grids. */
export const SEARCH_PAGE_SIZE = 30;

export type SearchSort = NonNullable<ProductSearchQuery['sort']>;
const SORTS: readonly SearchSort[] = [
  'relevance',
  'newest',
  'top_sales',
  'price_asc',
  'price_desc',
  'rating',
];

/** Filters the marketplace product search accepts; everything else in the URL is ignored. */
export interface SearchFilters {
  category_id?: number;
  shop_id?: number;
  min_price?: number;
  max_price?: number;
  min_rating?: number;
  has_promotion?: boolean;
  in_stock?: boolean;
}

export interface SearchState extends SearchFilters {
  q?: string;
  sort: SearchSort;
  page: number;
}

type Params = { get(name: string): string | null };

function positive(value: string | null) {
  const n = Number(value);
  return value !== null && value !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseSearch(params: Params): SearchState {
  const sort = params.get('sort') as SearchSort | null;
  const rating = positive(params.get('min_rating'));
  return {
    q: params.get('q')?.trim() || undefined,
    category_id: positive(params.get('category_id')),
    shop_id: positive(params.get('shop_id')),
    min_price: positive(params.get('min_price')),
    max_price: positive(params.get('max_price')),
    min_rating: rating !== undefined && rating <= 5 ? rating : undefined,
    has_promotion: params.get('has_promotion') === 'true' || undefined,
    in_stock: params.get('in_stock') === 'true' || undefined,
    sort: sort && SORTS.includes(sort) ? sort : 'relevance',
    page: Math.floor(positive(params.get('page')) ?? 1),
  };
}

export function toApiQuery(state: SearchState): ProductSearchQuery {
  return { ...state, page_size: SEARCH_PAGE_SIZE };
}

/** State after `changes`; any change other than `page` returns to page 1. */
export function applySearch(state: SearchState, changes: Partial<SearchState>): SearchState {
  return { ...state, page: 1, ...changes };
}

/** URL for the search page after applying `changes`. */
export function searchHref(state: SearchState, changes: Partial<SearchState> = {}): string {
  const next = applySearch(state, changes);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === false || value === '') continue;
    if (key === 'sort' && value === 'relevance') continue;
    if (key === 'page' && value === 1) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}

const FILTER_KEYS: readonly (keyof SearchFilters)[] = [
  'category_id',
  'shop_id',
  'min_price',
  'max_price',
  'min_rating',
  'has_promotion',
  'in_stock',
];

export function pickFilters(state: SearchState): SearchFilters {
  return Object.fromEntries(FILTER_KEYS.map((key) => [key, state[key]])) as SearchFilters;
}

export function activeFilterCount(filters: SearchFilters): number {
  const price = filters.min_price !== undefined || filters.max_price !== undefined ? 1 : 0;
  return (
    price +
    FILTER_KEYS.filter((key) => key !== 'min_price' && key !== 'max_price' && filters[key] !== undefined)
      .length
  );
}

/** Changes for `searchHref` that remove every filter and keep the keyword and sort. */
export const CLEARED_FILTERS: SearchFilters = Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined]));

/** Digits typed into a price box, or undefined when empty. */
export function parsePrice(text: string): number | undefined {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}

export function validPriceRange(min?: number, max?: number) {
  return min === undefined || max === undefined || min <= max;
}
