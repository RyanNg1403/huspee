import { getApiClient } from '@huspee/web-ui/lib/api';
import { call } from '@/lib/seller-api';
import type { VariantRow } from './stock';
import type { Category, Item, Model, TierVariation } from './types';

const chunks = <T>(list: T[], size: number) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

export type ProductRow = {
  item: Item;
  item_name: string;
  item_sku: string;
  item_status: string;
  sale: number;
  asks: number | null;
  tiers: TierVariation[];
  variants: VariantRow[];
};

/** Variant rows for one item: its models, or the item itself when it has no variations. */
export function variantRows(item: Item, models: Model[], tiers: TierVariation[]): VariantRow[] {
  if (!item.has_model) {
    return [
      {
        model_id: 0,
        options: [],
        label: '',
        sku: item.item_sku,
        stock: item.stock_info_v2?.summary_info.total_available_stock ?? 0,
        current_price: item.price_info?.[0]?.current_price ?? 0,
        original_price: item.price_info?.[0]?.original_price ?? 0,
      },
    ];
  }
  return models.map((m) => {
    const options = m.tier_index.map((idx, i) => tiers[i]?.option_list[idx]?.option ?? '');
    return {
      model_id: m.model_id,
      options,
      label: options.join(' '),
      sku: m.model_sku,
      stock: m.stock_info_v2.summary_info.total_available_stock,
      current_price: m.price_info[0]?.current_price ?? 0,
      original_price: m.price_info[0]?.original_price ?? 0,
    };
  });
}

/** Whole catalogue of the shop with variant stock, sales and assistant ask counts (30 days). */
export async function loadProducts(shopId: number): Promise<{ rows: ProductRow[]; categories: Category[] }> {
  const ids: number[] = [];
  for (let offset = 0; ; ) {
    const page = await call<{
      item: Array<{ item_id: number }>;
      has_next_page: boolean;
      next_offset: number;
    }>(shopId, '/product/get_item_list', {
      offset,
      page_size: 100,
      item_status: ['NORMAL', 'UNLIST', 'BANNED', 'REVIEWING'],
    });
    ids.push(...page.item.map((i) => i.item_id));
    if (!page.has_next_page) break;
    offset = page.next_offset;
  }
  const [batches, categories, asks] = await Promise.all([
    Promise.all(
      chunks(ids, 50).map(async (batch) => {
        const [base, extra] = await Promise.all([
          call<{ item_list: Item[] }>(shopId, '/product/get_item_base_info', { item_id_list: batch }),
          call<{ item_list: Array<{ item_id: number; sale: number }> }>(
            shopId,
            '/product/get_item_extra_info',
            {
              item_id_list: batch,
            },
          ),
        ]);
        return { items: base.item_list, sales: extra.item_list };
      }),
    ),
    call<{ category_list: Category[] }>(shopId, '/product/get_category').then((r) => r.category_list),
    getApiClient()
      .seller.assistant.insights(shopId)
      .then((r) => new Map(r.top_products.map((p) => [p.item_id, p.count])))
      .catch(() => null),
  ]);
  const sales = new Map(batches.flatMap((b) => b.sales).map((s) => [s.item_id, s.sale]));
  const rows = await Promise.all(
    batches
      .flatMap((b) => b.items)
      .map(async (item) => {
        const models = item.has_model
          ? await call<{ model: Model[]; tier_variation: TierVariation[] }>(
              shopId,
              '/product/get_model_list',
              {
                item_id: item.item_id,
              },
            )
          : { model: [], tier_variation: [] };
        return {
          item,
          item_name: item.item_name,
          item_sku: item.item_sku,
          item_status: item.item_status,
          sale: sales.get(item.item_id) ?? 0,
          asks: asks ? (asks.get(item.item_id) ?? 0) : null,
          tiers: models.tier_variation,
          variants: variantRows(item, models.model, models.tier_variation),
        };
      }),
  );
  return { rows, categories };
}
