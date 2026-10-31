import { call } from '@/lib/seller-api';
import type { ProductDraft, RowDraft, TierDraft } from './draft';
import type { Attribute, Brand, Category, Channel, Item, Model, TierVariation } from './types';

export type EditorData = {
  categories: Category[];
  channels: Channel[];
  item: Item | null;
  sale: number | null;
  saved: { tiers: TierDraft[]; rows: RowDraft[] };
  draft: ProductDraft;
};

const rowOf = (
  modelId: number,
  tierIndex: number[],
  price?: { original_price: number; current_price: number },
  stock = 0,
  sku = '',
): RowDraft => ({
  modelId,
  tierIndex,
  price: price ? String(price.original_price) : '',
  stock: String(stock),
  sku,
  ...(price && price.current_price < price.original_price ? { promoPrice: price.current_price } : {}),
});

export async function loadEditor(shopId: number, itemId?: number): Promise<EditorData> {
  const [categories, channels, base, extra, models] = await Promise.all([
    call<{ category_list: Category[] }>(shopId, '/product/get_category').then((r) => r.category_list),
    call<{ logistics_channel_list: Channel[] }>(shopId, '/logistics/get_channel_list').then(
      (r) => r.logistics_channel_list,
    ),
    itemId
      ? call<{ item_list: Item[] }>(shopId, '/product/get_item_base_info', { item_id_list: [itemId] })
      : null,
    itemId
      ? call<{ item_list: Array<{ sale: number }> }>(shopId, '/product/get_item_extra_info', {
          item_id_list: [itemId],
        })
      : null,
    itemId
      ? call<{ model: Model[]; tier_variation: TierVariation[] }>(shopId, '/product/get_model_list', {
          item_id: itemId,
        })
      : null,
  ]);
  const item = base?.item_list[0] ?? null;
  if (itemId && !item) throw new Error('Item not found');
  const tiers: TierDraft[] = (models?.tier_variation ?? []).map((t) => ({
    name: t.name,
    options: t.option_list.map((o) => o.option),
  }));
  const rows: RowDraft[] = item?.has_model
    ? (models?.model ?? []).map((m) =>
        rowOf(
          m.model_id,
          m.tier_index,
          m.price_info[0],
          m.stock_info_v2.summary_info.total_available_stock,
          m.model_sku,
        ),
      )
    : [rowOf(0, [], item?.price_info?.[0], item?.stock_info_v2?.summary_info.total_available_stock ?? 0)];
  if (!item) rows[0].stock = '';
  return {
    categories,
    channels,
    item,
    sale: extra?.item_list[0]?.sale ?? null,
    saved: { tiers, rows },
    draft: {
      name: item?.item_name ?? '',
      description: item?.description ?? '',
      sku: item?.item_sku ?? '',
      categoryId: item?.category_id ?? 0,
      brandId: item?.brand?.brand_id ?? 0,
      attributes: Object.fromEntries(
        (item?.attribute_list ?? []).flatMap((a) => {
          const v = a.attribute_value_list[0];
          return v ? [[a.attribute_id, v.value_id ? String(v.value_id) : v.original_value_name]] : [];
        }),
      ),
      images: (item?.image.image_id_list ?? []).map((id, i) => ({
        id,
        url: item!.image.image_url_list[i] ?? '',
      })),
      weight: item?.weight ?? '',
      length: String(item?.dimension.package_length ?? ''),
      width: String(item?.dimension.package_width ?? ''),
      height: String(item?.dimension.package_height ?? ''),
      logistics: item
        ? item.logistic_info.filter((l) => l.enabled).map((l) => l.logistic_id)
        : channels.filter((c) => c.enabled).map((c) => c.logistics_channel_id),
      tiers,
      rows,
    },
  };
}

export async function loadCategoryDetails(shopId: number, categoryId: number) {
  const brands: Brand[] = [];
  for (let offset = 0; ; ) {
    const page = await call<{ brand_list: Brand[]; has_next_page: boolean; next_offset: number }>(
      shopId,
      '/product/get_brand_list',
      { category_id: categoryId, offset, page_size: 100 },
    );
    brands.push(...page.brand_list);
    if (!page.has_next_page || !page.brand_list.length) break;
    offset = page.next_offset;
  }
  const tree = await call<{ list: Array<{ attribute_tree: Attribute[] }> }>(
    shopId,
    '/product/get_attribute_tree',
    {
      category_id_list: [categoryId],
    },
  );
  return { brands, attributes: tree.list[0]?.attribute_tree ?? [] };
}
