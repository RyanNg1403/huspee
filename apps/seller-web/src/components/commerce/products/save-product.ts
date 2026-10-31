import { call } from '@/lib/seller-api';
import { planVariants, type ProductDraft, type RowDraft, type TierDraft } from './draft';
import type { Attribute, Channel } from './types';

type BatchResult = { failure_list?: Array<{ failed_reason: string }> };

/** Field-level failures come back in failure_list, not as an error envelope. */
async function batch(shopId: number, path: string, params: Record<string, unknown>) {
  const res = await call<BatchResult>(shopId, path, params);
  if (res.failure_list?.length) throw new Error(res.failure_list[0].failed_reason);
}

const modelPayload = (r: RowDraft) => ({
  tier_index: r.tierIndex,
  original_price: Number(r.price),
  seller_stock: [{ stock: Number(r.stock) }],
  model_sku: r.sku.trim(),
});

/** Creates or updates the item, then applies only the variant changes. Returns the item id. */
export async function saveProduct({
  shopId,
  itemId,
  saved,
  draft,
  channels,
  attributes,
}: {
  shopId: number;
  itemId: number | null;
  saved: { tiers: TierDraft[]; rows: RowDraft[] };
  draft: ProductDraft;
  channels: Channel[];
  /** Category attribute tree; null while it has not loaded (attributes and brand stay unchanged). */
  attributes: Attribute[] | null;
}): Promise<number> {
  const common = {
    item_name: draft.name.trim(),
    description: draft.description.trim(),
    item_sku: draft.sku.trim(),
    weight: Number(draft.weight),
    dimension: {
      package_length: Number(draft.length),
      package_width: Number(draft.width),
      package_height: Number(draft.height),
    },
    category_id: draft.categoryId,
    image: { image_id_list: draft.images.map((i) => i.id) },
    logistic_info: channels.map((c) => ({
      logistic_id: c.logistics_channel_id,
      enabled: draft.logistics.includes(c.logistics_channel_id),
    })),
    ...(attributes
      ? {
          brand: { brand_id: draft.brandId },
          attribute_list: attributes.flatMap((a) => {
            const value = draft.attributes[a.attribute_id]?.trim();
            if (!value) return [];
            return [
              {
                attribute_id: a.attribute_id,
                attribute_value_list: [
                  a.attribute_info.input_type === 2
                    ? { value_id: 0, original_value_name: value }
                    : { value_id: Number(value) },
                ],
              },
            ];
          }),
        }
      : {}),
  };

  if (itemId === null) {
    const row = draft.rows[0];
    const created = await call<{ item_id: number }>(shopId, '/product/add_item', {
      ...common,
      original_price: Number(row.price),
      seller_stock: [{ stock: Number(row.stock) }],
    });
    return created.item_id;
  }

  await call(shopId, '/product/update_item', { item_id: itemId, ...common });
  const plan = planVariants(saved, draft);
  const tierVariation = draft.tiers.map((t) => ({
    name: t.name.trim(),
    option_list: t.options.map((o) => ({ option: o.trim() })),
  }));
  if (!saved.tiers.length && draft.tiers.length) {
    await call(shopId, '/product/init_tier_variation', {
      item_id: itemId,
      tier_variation: tierVariation,
      model: plan.added.map(modelPayload),
    });
    return itemId;
  }
  if (plan.tiersChanged) {
    await call(shopId, '/product/update_tier_variation', { item_id: itemId, tier_variation: tierVariation });
  }
  if (plan.added.length) {
    await call(shopId, '/product/add_model', { item_id: itemId, model_list: plan.added.map(modelPayload) });
  }
  if (plan.price.length)
    await batch(shopId, '/product/update_price', { item_id: itemId, price_list: plan.price });
  if (plan.stock.length)
    await batch(shopId, '/product/update_stock', { item_id: itemId, stock_list: plan.stock });
  if (plan.sku.length) await call(shopId, '/product/update_model', { item_id: itemId, model: plan.sku });
  return itemId;
}
