import type { ProductDetail, ProductModel } from '@huspee/sdk';

/** One chosen option index per tier variation; -1 means the tier has no choice yet. */
export type Selection = number[];
export type OptionState = 'available' | 'unavailable' | 'sold_out';

export const emptySelection = (product: ProductDetail): Selection => product.tier_variations.map(() => -1);

export const inStock = (model: ProductModel) => model.available && model.stock > 0;

/** The model for a complete selection; a product without tier variations has a single model. */
export function selectedModel(product: ProductDetail, selection: Selection): ProductModel | undefined {
  if (product.tier_variations.length === 0)
    return product.models.length === 1 ? product.models[0] : undefined;
  return product.models.find(
    (m) => m.tier_index.length === selection.length && m.tier_index.every((n, i) => n === selection[i]),
  );
}

/**
 * `sold_out` when no model with this option has stock; `unavailable` when the other chosen options
 * rule it out. Only `available` options can be chosen.
 */
export function optionState(
  product: ProductDetail,
  selection: Selection,
  tier: number,
  option: number,
): OptionState {
  const withOption = product.models.filter((m) => m.tier_index[tier] === option && inStock(m));
  if (withOption.length === 0) return 'sold_out';
  const compatible = withOption.some((m) =>
    selection.every((n, k) => k === tier || n < 0 || m.tier_index[k] === n),
  );
  return compatible ? 'available' : 'unavailable';
}

/** Choosing the selected option again clears it, so a buyer can switch to a combination ruled out by it. */
export const toggleOption = (selection: Selection, tier: number, option: number): Selection =>
  selection.map((n, k) => (k === tier ? (n === option ? -1 : option) : n));

/** Same rounding as the marketplace search `discount_percent`. */
export const discountPercent = (price: number, original: number) =>
  original > price ? Math.round((1 - price / original) * 100) : 0;

/** Number of models of a product that cannot be bought right now. */
export const soldOutModels = (product: ProductDetail) => product.models.filter((m) => !inStock(m)).length;
