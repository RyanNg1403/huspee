/** Editable product state and the pure rules that turn it into API calls. */

export type TierDraft = { name: string; options: string[] };

export type RowDraft = {
  /** null for a variant that does not exist yet. */
  modelId: number | null;
  tierIndex: number[];
  price: string;
  stock: string;
  sku: string;
  /** Read-only promotion price from the API, when it differs from the original price. */
  promoPrice?: number;
};

export type ProductDraft = {
  name: string;
  description: string;
  sku: string;
  categoryId: number;
  brandId: number;
  attributes: Record<number, string>;
  images: Array<{ id: string; url: string }>;
  weight: string;
  length: string;
  width: string;
  height: string;
  logistics: number[];
  tiers: TierDraft[];
  rows: RowDraft[];
};

export const EDITOR_TABS = ['basic', 'specs', 'sales', 'shipping'] as const;
export type EditorTab = (typeof EDITOR_TABS)[number];

export type FieldKey =
  | 'name'
  | 'description'
  | 'category'
  | 'images'
  | 'attributes'
  | 'tiers'
  | 'rows'
  | 'weight'
  | 'dimension'
  | 'logistics';

const FIELD_TAB: Record<FieldKey, EditorTab> = {
  name: 'basic',
  description: 'basic',
  category: 'basic',
  images: 'basic',
  attributes: 'specs',
  tiers: 'sales',
  rows: 'sales',
  weight: 'shipping',
  dimension: 'shipping',
  logistics: 'shipping',
};

export function tabOfField(field: FieldKey): EditorTab {
  return FIELD_TAB[field];
}

/** Every tier-index combination, first tier outermost. */
export function combinations(tiers: TierDraft[]): number[][] {
  return tiers.reduce<number[][]>(
    (acc, tier) => acc.flatMap((prefix) => tier.options.map((_, i) => [...prefix, i])),
    tiers.length ? [[]] : [],
  );
}

/**
 * Keep existing rows (and their edits) and add rows only for combinations that use an option
 * appended after the last save; combinations removed earlier are not brought back.
 */
export function syncRows(tiers: TierDraft[], savedOptionCounts: number[], rows: RowDraft[]): RowDraft[] {
  const key = (idx: number[]) => idx.join(',');
  const existing = new Map(rows.map((r) => [key(r.tierIndex), r]));
  const isNew = (idx: number[]) => idx.some((o, t) => o >= (savedOptionCounts[t] ?? 0));
  const result = rows.filter(
    (r) =>
      r.modelId !== null &&
      r.tierIndex.length === tiers.length &&
      r.tierIndex.every((o, t) => o < (tiers[t]?.options.length ?? 0)),
  );
  for (const idx of combinations(tiers)) {
    if (!isNew(idx)) continue;
    result.push(existing.get(key(idx)) ?? { modelId: null, tierIndex: idx, price: '', stock: '', sku: '' });
  }
  return result;
}

const isPrice = (v: string) => /^\d+$/.test(v) && Number(v) >= 1000 && Number(v) <= 1_000_000_000;
const isStock = (v: string) => /^\d+$/.test(v) && Number(v) <= 999_999;
const isPositive = (v: string) => Number(v) > 0;

/** Client-side checks mirroring the API limits; returns the invalid fields. */
export function validateDraft(draft: ProductDraft, mandatoryAttributes: number[]): FieldKey[] {
  const errors: FieldKey[] = [];
  if (!draft.name.trim()) errors.push('name');
  if (!draft.description.trim()) errors.push('description');
  if (!draft.categoryId) errors.push('category');
  if (!draft.images.length) errors.push('images');
  if (mandatoryAttributes.some((id) => !draft.attributes[id]?.trim())) errors.push('attributes');
  if (draft.tiers.some((t) => !t.name.trim() || !t.options.length || t.options.some((o) => !o.trim())))
    errors.push('tiers');
  if (!draft.rows.length || draft.rows.some((r) => !isPrice(r.price) || !isStock(r.stock)))
    errors.push('rows');
  if (!isPositive(draft.weight)) errors.push('weight');
  if ([draft.length, draft.width, draft.height].some((v) => !/^\d+$/.test(v) || !isPositive(v)))
    errors.push('dimension');
  if (!draft.logistics.length) errors.push('logistics');
  return errors;
}

export type VariantPlan = {
  tiersChanged: boolean;
  added: RowDraft[];
  price: Array<{ model_id: number; original_price: number }>;
  stock: Array<{ model_id: number; seller_stock: Array<{ stock: number }> }>;
  sku: Array<{ model_id: number; model_sku: string }>;
};

/** Calls needed to move saved variants to the draft (model_id 0 is an item without variations). */
export function planVariants(
  saved: { tiers: TierDraft[]; rows: RowDraft[] },
  draft: ProductDraft,
): VariantPlan {
  const before = new Map(saved.rows.map((r) => [r.modelId, r]));
  const existing = draft.rows.filter((r) => r.modelId !== null && before.has(r.modelId));
  const changed = (r: RowDraft, field: 'price' | 'stock' | 'sku') =>
    before.get(r.modelId)?.[field] !== r[field];
  return {
    tiersChanged: JSON.stringify(saved.tiers) !== JSON.stringify(draft.tiers),
    added: draft.rows.filter((r) => r.modelId === null),
    price: existing
      .filter((r) => changed(r, 'price'))
      .map((r) => ({ model_id: r.modelId!, original_price: Number(r.price) })),
    stock: existing
      .filter((r) => changed(r, 'stock'))
      .map((r) => ({ model_id: r.modelId!, seller_stock: [{ stock: Number(r.stock) }] })),
    sku: existing
      .filter((r) => r.modelId !== 0 && changed(r, 'sku'))
      .map((r) => ({ model_id: r.modelId!, model_sku: r.sku.trim() })),
  };
}
