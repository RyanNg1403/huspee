import { countBy, matchesSearch } from '../list';

/** A variant at or below this stock is "low" (sắp hết). */
export const LOW_STOCK_THRESHOLD = 10;

export type StockLevel = 'out' | 'low' | 'ok';

export function stockLevel(stock: number): StockLevel {
  if (stock <= 0) return 'out';
  return stock <= LOW_STOCK_THRESHOLD ? 'low' : 'ok';
}

export type VariantRow = {
  model_id: number;
  /** Tier option names in tier order; empty for an item without variations. */
  options: string[];
  label: string;
  sku: string;
  stock: number;
  current_price: number;
  original_price: number;
};

export type VariantSummary = {
  totalStock: number;
  minPrice: number;
  maxPrice: number;
  out: VariantRow[];
  low: VariantRow[];
};

export function summarizeVariants(variants: VariantRow[]): VariantSummary {
  const prices = variants.map((v) => v.current_price);
  return {
    totalStock: variants.reduce((n, v) => n + v.stock, 0),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    out: variants.filter((v) => stockLevel(v.stock) === 'out'),
    low: variants.filter((v) => stockLevel(v.stock) === 'low'),
  };
}

export const PRODUCT_TABS = ['all', 'active', 'hidden', 'out', 'low'] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

export type ProductRef = { item_name: string; item_sku: string; item_status: string; variants: VariantRow[] };

export function productTabsOf(p: ProductRef): ProductTab[] {
  const tabs: ProductTab[] = ['all'];
  if (p.item_status === 'NORMAL') tabs.push('active');
  if (p.item_status === 'UNLIST') tabs.push('hidden');
  if (p.variants.some((v) => stockLevel(v.stock) === 'out')) tabs.push('out');
  if (p.variants.some((v) => stockLevel(v.stock) === 'low')) tabs.push('low');
  return tabs;
}

export function countProductTabs(list: ProductRef[]): Record<ProductTab, number> {
  return countBy(list, PRODUCT_TABS, productTabsOf);
}

export function filterProducts<T extends ProductRef>(list: T[], tab: ProductTab, query: string): T[] {
  return list.filter(
    (p) =>
      productTabsOf(p).includes(tab) &&
      matchesSearch(query, [p.item_name, p.item_sku, ...p.variants.map((v) => v.sku)]),
  );
}

export const PRODUCT_SORTS = ['default', 'sales', 'stock', 'priceAsc', 'priceDesc'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** Stable sort on a copy; "default" keeps the API order. */
export function sortProducts<T extends ProductRef & { sale: number }>(list: T[], sort: ProductSort): T[] {
  if (sort === 'default') return list;
  const key = (p: T) => {
    const s = summarizeVariants(p.variants);
    if (sort === 'sales') return -p.sale;
    if (sort === 'stock') return s.totalStock;
    return sort === 'priceAsc' ? s.minPrice : -s.maxPrice;
  };
  return list
    .map((p, i) => ({ p, i, k: key(p) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.p);
}
