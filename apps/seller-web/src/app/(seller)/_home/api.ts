import type { AssistantConversation, OrderStatus } from '@huspee/sdk';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { call } from '@/lib/seller-api';
import { dayStarts } from './aggregate';

export type HomeOrder = {
  order_sn: string;
  order_status: OrderStatus;
  total_amount: number;
  create_time: number;
  item_list?: Array<{ item_name: string; model_name: string; model_quantity_purchased: number }>;
};

const MAX_PAGES = 10;
const DETAIL_BATCH = 50;

/** Orders created in [from, to] with totals, status and items, newest first. */
async function ordersBetween(shopId: number, from: number, to: number): Promise<HomeOrder[]> {
  const sns: string[] = [];
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const list = await call<{ more: boolean; next_cursor: string; order_list: Array<{ order_sn: string }> }>(
      shopId,
      '/order/get_order_list',
      {
        time_range_field: 'create_time',
        time_from: from,
        time_to: to,
        page_size: 100,
        cursor: cursor || undefined,
      },
    );
    sns.push(...list.order_list.map((o) => o.order_sn));
    if (!list.more || !list.next_cursor) break;
    cursor = list.next_cursor;
  }
  const batches = Array.from({ length: Math.ceil(sns.length / DETAIL_BATCH) }, (_, i) =>
    sns.slice(i * DETAIL_BATCH, (i + 1) * DETAIL_BATCH),
  );
  const details = await Promise.all(
    batches.map((batch) =>
      call<{ order_list: HomeOrder[] }>(shopId, '/order/get_order_detail', {
        order_sn_list: batch,
        response_optional_fields: ['item_list'],
      }),
    ),
  );
  return details.flatMap((d) => d.order_list).sort((a, b) => b.create_time - a.create_time);
}

/** Assistant conversations started in [from, to]. */
async function conversationsBetween(
  shopId: number,
  from: number,
  to: number,
): Promise<AssistantConversation[]> {
  const rows: AssistantConversation[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await getApiClient().seller.assistant.conversations.list(shopId, {
      from,
      to,
      page,
      page_size: 100,
    });
    rows.push(...result.data);
    if (!result.page.has_next) break;
  }
  return rows;
}

/** The moment a block's data was read, with local midnights of today and yesterday. */
function clock() {
  const date = new Date();
  return { now: Math.floor(date.getTime() / 1000), ...dayStarts(date) };
}

export type SalesData = Awaited<ReturnType<typeof loadSales>>;

/** Today's and yesterday's orders and conversations for the sales block and today's orders. */
export async function loadSales(shopId: number) {
  const { now, today: todayStart, yesterday: yesterdayStart } = clock();
  const api = getApiClient().seller;
  const [today, yesterday, orders, conversations] = await Promise.all([
    api.dashboardSummary(shopId, { time_from: todayStart, time_to: now }),
    // Yesterday up to the same time of day, for "compared with the same time yesterday".
    api.dashboardSummary(shopId, { time_from: yesterdayStart, time_to: now - 86400 }),
    ordersBetween(shopId, yesterdayStart, now),
    conversationsBetween(shopId, yesterdayStart, now),
  ]);
  return { now, todayStart, yesterdayStart, today, yesterday, orders, conversations };
}

export type AssistantData = Awaited<ReturnType<typeof loadAssistant>>;

/** Assistant settings and today's assistant activity. */
export async function loadAssistant(shopId: number) {
  const { now, today } = clock();
  const api = getApiClient().seller.assistant;
  const [config, insights] = await Promise.all([
    api.getConfig(shopId),
    api.insights(shopId, { from: today, to: now }),
  ]);
  return { config, today: insights.totals };
}

/** The last seven days of assistant insights. */
export function loadWeekInsights(shopId: number) {
  const { now } = clock();
  return getApiClient().seller.assistant.insights(shopId, { from: now - 7 * 86400, to: now });
}
