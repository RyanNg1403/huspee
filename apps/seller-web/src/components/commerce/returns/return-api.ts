import { call } from '@/lib/seller-api';
import type { ReturnDetail, ReturnSolutions, ReturnSummary } from './types';

/** Every return created since `from`, newest first. */
export async function loadReturns(shopId: number, from: number): Promise<ReturnSummary[]> {
  const list: ReturnSummary[] = [];
  for (let page = 0; ; page++) {
    const res = await call<{ more: boolean; return: ReturnSummary[] }>(shopId, '/returns/get_return_list', {
      page_no: page,
      page_size: 100,
      create_time_from: from,
    });
    list.push(...res.return);
    if (!res.more) return list;
  }
}

export async function loadReturn(shopId: number, returnSn: string) {
  const detail = await call<ReturnDetail>(shopId, '/returns/get_return_detail', { return_sn: returnSn });
  const [solutions, reverse, orderTracking, policy] = await Promise.all([
    detail.status === 'REQUESTED'
      ? call<ReturnSolutions>(shopId, '/returns/get_available_solutions', { return_sn: returnSn })
      : null,
    call<{ tracking_info: Array<{ update_time: number; tracking_description: string }> }>(
      shopId,
      '/returns/get_reverse_tracking_info',
      { return_sn: returnSn },
    ),
    call<{ tracking_info: Array<{ update_time: number; logistics_status: string }> }>(
      shopId,
      '/logistics/get_tracking_info',
      { order_sn: detail.order_sn },
    ),
    call<{ return_policy: string; return_window_days: number }>(shopId, '/custom/shop/get_policies'),
  ]);
  const delivered = orderTracking.tracking_info.find((e) => e.logistics_status === 'LOGISTICS_DELIVERY_DONE');
  return {
    detail,
    solutions,
    reverseEvents: reverse.tracking_info ?? [],
    deliveredAt: delivered?.update_time ?? null,
    policy,
  };
}
