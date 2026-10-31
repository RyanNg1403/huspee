import { call } from '@/lib/seller-api';
import { resolveDateRange, splitTimeRange, type DateRange, type OrderRef } from './order-filters';
import type { OrderDetail, TrackingEvent } from './types';

const LIST_FIELDS = ['buyer_username', 'item_list', 'total_amount'];
const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  'recipient_address',
  'actual_shipping_fee',
  'cancel_by',
  'cancel_reason',
];

/** Every order number and status created in the range, newest first. */
export async function loadOrderRefs(
  shopId: number,
  range: DateRange,
  channelId: number,
): Promise<OrderRef[]> {
  const { from, to } = resolveDateRange(range, new Date());
  const refs: OrderRef[] = [];
  const seen = new Set<string>();
  for (const window of splitTimeRange(from, to)) {
    let cursor = '';
    do {
      const page = await call<{ more: boolean; next_cursor: string; order_list: OrderRef[] }>(
        shopId,
        '/order/get_order_list',
        {
          time_range_field: 'create_time',
          time_from: window.from,
          time_to: window.to,
          page_size: 100,
          response_optional_fields: 'order_status',
          ...(cursor ? { cursor } : {}),
          ...(channelId ? { logistics_channel_id: channelId } : {}),
        },
      );
      for (const o of page.order_list) {
        if (seen.has(o.order_sn)) continue;
        seen.add(o.order_sn);
        refs.push(o);
      }
      cursor = page.more ? page.next_cursor : '';
    } while (cursor);
  }
  return refs;
}

export async function loadOrderDetails(
  shopId: number,
  orderSns: string[],
  detail = false,
): Promise<OrderDetail[]> {
  if (!orderSns.length) return [];
  const res = await call<{ order_list: OrderDetail[] }>(shopId, '/order/get_order_detail', {
    order_sn_list: orderSns,
    response_optional_fields: detail ? DETAIL_FIELDS : LIST_FIELDS,
  });
  return res.order_list ?? [];
}

export async function loadOrder(shopId: number, orderSn: string) {
  const [order] = await loadOrderDetails(shopId, [orderSn], true);
  if (!order) return null;
  const [tracking, events] = await Promise.all([
    call<{ tracking_number: string }>(shopId, '/logistics/get_tracking_number', { order_sn: orderSn }),
    call<{ tracking_info: TrackingEvent[] }>(shopId, '/logistics/get_tracking_info', { order_sn: orderSn }),
  ]);
  return { order, trackingNumber: tracking.tracking_number, events: events.tracking_info ?? [] };
}
