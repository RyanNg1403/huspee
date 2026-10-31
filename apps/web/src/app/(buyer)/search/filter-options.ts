import type { messages } from './messages';

type Key = keyof (typeof messages)['vi'];

/** Minimum ratings the search API filters by. */
export const RATING_STEPS = [5, 4, 3] as const;

/** Shortcuts that fill the price boxes on mobile. */
export const PRICE_PRESETS: ReadonlyArray<{ label: Key; min?: number; max: number }> = [
  { label: 'upTo5m', max: 5_000_000 },
  { label: 'from5to10m', min: 5_000_000, max: 10_000_000 },
  { label: 'from10to20m', min: 10_000_000, max: 20_000_000 },
];

/** Yes/no filters the search API supports. */
export const TOGGLES: ReadonlyArray<{ key: 'has_promotion' | 'in_stock'; label: Key }> = [
  { key: 'has_promotion', label: 'onSale' },
  { key: 'in_stock', label: 'inStock' },
];
