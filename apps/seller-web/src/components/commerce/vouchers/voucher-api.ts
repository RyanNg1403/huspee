import { call } from '@/lib/seller-api';
import type { VoucherDetail } from './voucher-form';

export type VoucherSummary = Omit<
  VoucherDetail,
  'max_price' | 'min_basket_price' | 'display_channel_list' | 'item_id_list'
>;

export async function loadVouchers(shopId: number): Promise<VoucherSummary[]> {
  const list: VoucherSummary[] = [];
  for (let page = 1; ; page++) {
    const res = await call<{ more: boolean; voucher_list: VoucherSummary[] }>(
      shopId,
      '/voucher/get_voucher_list',
      {
        page_no: page,
        page_size: 100,
        status: 'all',
      },
    );
    list.push(...res.voucher_list);
    if (!res.more) return list;
  }
}

export function loadVoucher(shopId: number, voucherId: number): Promise<VoucherDetail> {
  return call<VoucherDetail>(shopId, '/voucher/get_voucher', { voucher_id: voucherId });
}

/** The list endpoint omits minimum spend, cap and products; read them for the visible rows. */
export async function loadVoucherDetails(shopId: number, ids: number[]): Promise<Map<number, VoucherDetail>> {
  const details = await Promise.all(ids.map((id) => loadVoucher(shopId, id)));
  return new Map(details.map((d) => [d.voucher_id, d]));
}

export type ShopItem = { item_id: number; item_name: string; image: { image_url_list: string[] } };

/** Listed and hidden items a product voucher can target, plus the live item count. */
export async function loadVoucherItems(shopId: number): Promise<{ items: ShopItem[]; liveCount: number }> {
  const [live, all] = await Promise.all([
    call<{ total_count: number }>(shopId, '/product/get_item_list', {
      offset: 0,
      page_size: 1,
      item_status: ['NORMAL'],
    }),
    call<{ item: Array<{ item_id: number }> }>(shopId, '/product/get_item_list', {
      offset: 0,
      page_size: 100,
      item_status: ['NORMAL', 'UNLIST'],
    }),
  ]);
  const ids = all.item.map((i) => i.item_id);
  const batches = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) =>
      call<{ item_list: ShopItem[] }>(shopId, '/product/get_item_base_info', {
        item_id_list: ids.slice(i * 50, i * 50 + 50),
      }),
    ),
  );
  return { items: batches.flatMap((b) => b.item_list), liveCount: live.total_count };
}
