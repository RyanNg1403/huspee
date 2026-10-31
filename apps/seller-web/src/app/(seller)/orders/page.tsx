'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import type { SellerShop } from '@huspee/sdk';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { call } from '@/lib/seller-api';
import { formatShortDateTime } from '@/components/commerce/format';
import { pageSlice } from '@/components/commerce/list';
import { ListState } from '@/components/commerce/ListState';
import { OrderStatusLabel, usePaymentLabel } from '@/components/commerce/orders/OrderStatusLabel';
import { loadOrderDetails, loadOrderRefs } from '@/components/commerce/orders/order-api';
import {
  countOrderTabs,
  DATE_RANGES,
  filterOrders,
  statusForTab,
  tabFromStatus,
  visibleOrderTabs,
  type DateRange,
  type OrderTab,
} from '@/components/commerce/orders/order-filters';
import { ShipModal } from '@/components/commerce/orders/ShipModal';
import type { LogisticsChannel, OrderDetail } from '@/components/commerce/orders/types';
import { PageTabs } from '@/components/commerce/PageTabs';
import { Pager } from '@/components/commerce/Pager';
import { ShopGuard } from '@/components/commerce/ShopGuard';
import { Thumb } from '@/components/commerce/Thumb';
import { btn, input, panel, sub, table } from '@/components/commerce/ui';
import { orderMessages } from './messages';

const PAGE_SIZE = 20;
type Filters = { query: string; range: DateRange; channel: number };
const DEFAULT_FILTERS: Filters = { query: '', range: '30d', channel: 0 };
const TAB_LABEL = {
  all: 'tabAll',
  unpaid: 'tabUnpaid',
  to_ship: 'tabToShip',
  shipping: 'tabShipping',
  delivered: 'tabDelivered',
  cancelled: 'tabCancelled',
  returns: 'tabReturns',
} as const;
const RANGE_LABEL = { today: 'rangeToday', '7d': 'range7d', '30d': 'range30d' } as const;

export default function OrdersPage() {
  return <ShopGuard>{(shop) => <Orders shop={shop} />}</ShopGuard>;
}

function Orders({ shop }: { shop: SellerShop }) {
  const t = useT(orderMessages);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = tabFromStatus(params.get('status'));
  const [draft, setDraft] = useState(DEFAULT_FILTERS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [shipping, setShipping] = useState<OrderDetail | null>(null);
  const shopId = shop.shop_id;

  const channels = useApi(
    () =>
      call<{ logistics_channel_list: LogisticsChannel[] }>(shopId, '/logistics/get_channel_list').then(
        (r) => r.logistics_channel_list,
      ),
    [shopId],
  );
  const refs = useApi(
    () => loadOrderRefs(shopId, filters.range, filters.channel),
    [shopId, filters.range, filters.channel],
  );
  const counts = useMemo(() => countOrderTabs(refs.data ?? []), [refs.data]);
  const filtered = useMemo(
    () => filterOrders(refs.data ?? [], tab, filters.query),
    [refs.data, tab, filters.query],
  );
  const pageKey = pageSlice(filtered, page, PAGE_SIZE)
    .map((o) => o.order_sn)
    .join(',');
  const details = useApi(
    () => loadOrderDetails(shopId, pageKey ? pageKey.split(',') : []),
    [shopId, pageKey],
  );

  function selectTab(next: OrderTab) {
    setPage(0);
    const status = statusForTab(next);
    router.replace(status ? `${pathname}?status=${status}` : pathname, { scroll: false });
  }
  function apply(e: FormEvent) {
    e.preventDefault();
    setPage(0);
    setFilters(draft);
  }
  function reset() {
    setPage(0);
    setDraft(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  }
  function reload() {
    refs.reload();
    details.reload();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <section aria-label={t('title')} className={`${panel} px-6 pb-4`}>
        <PageTabs
          label={t('statusTabs')}
          value={tab}
          onChange={selectTab}
          items={visibleOrderTabs(refs.data ? counts : null, tab).map((value) => ({
            value,
            label: t(TAB_LABEL[value]),
            count: refs.data ? counts[value] : undefined,
            accent: value === 'to_ship' || value === 'returns',
          }))}
        />
        <form onSubmit={apply} onReset={reset} className="flex flex-wrap items-end gap-3 py-4">
          <label className="flex min-w-60 flex-[2] flex-col gap-1.5 text-[13px] text-muted">
            {t('search')}
            <input
              type="search"
              className={input}
              placeholder={t('searchPlaceholder')}
              value={draft.query}
              onChange={(e) => setDraft({ ...draft, query: e.target.value })}
            />
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1.5 text-[13px] text-muted">
            {t('orderDate')}
            <select
              className={input}
              value={draft.range}
              onChange={(e) => setDraft({ ...draft, range: e.target.value as DateRange })}
            >
              {DATE_RANGES.map((r) => (
                <option key={r} value={r}>
                  {t(RANGE_LABEL[r])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1.5 text-[13px] text-muted">
            {t('carrier')}
            <select
              className={input}
              value={draft.channel}
              onChange={(e) => setDraft({ ...draft, channel: Number(e.target.value) })}
            >
              <option value={0}>{t('all')}</option>
              {(channels.data ?? []).map((c) => (
                <option key={c.logistics_channel_id} value={c.logistics_channel_id}>
                  {c.logistics_channel_name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className={btn.primary}>
              {t('apply')}
            </button>
            <button type="reset" className={btn.outline}>
              {t('reset')}
            </button>
          </div>
        </form>
        {refs.data && (
          <p className="pb-2 text-base font-semibold">{t('count', { count: filtered.length })}</p>
        )}
        <ListState
          loading={refs.loading || (details.loading && filtered.length > 0)}
          error={refs.error ?? details.error}
          empty={!filtered.length}
          emptyTitle={t('empty')}
          onRetry={reload}
        >
          <div className="overflow-x-auto">
            <table className={table.root}>
              <thead>
                <tr>
                  <th scope="col" className={table.th}>
                    {t('orderSn')}
                  </th>
                  <th scope="col" className={table.th}>
                    {t('buyer')}
                  </th>
                  <th scope="col" className={table.th}>
                    {t('product')}
                  </th>
                  <th scope="col" className={`${table.th} text-right`}>
                    {t('total')}
                  </th>
                  <th scope="col" className={table.th}>
                    {t('status')}
                  </th>
                  <th scope="col" className={`${table.th} text-right`}>
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(details.data ?? []).map((order) => (
                  <OrderRow key={order.order_sn} order={order} onShip={() => setShipping(order)} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        </ListState>
      </section>
      {shipping && (
        <ShipModal
          shop={shop}
          orderSn={shipping.order_sn}
          carrier={shipping.shipping_carrier}
          onClose={() => setShipping(null)}
          onShipped={reload}
        />
      )}
    </div>
  );
}

function OrderRow({ order, onShip }: { order: OrderDetail; onShip: () => void }) {
  const t = useT(orderMessages);
  const { lang } = useLang();
  const payment = usePaymentLabel();
  const [first, ...rest] = order.item_list ?? [];
  return (
    <tr>
      <td className={table.td}>
        <Link href={`/orders/${order.order_sn}`} className="text-link hover:underline">
          {order.order_sn}
        </Link>
        <div className={sub}>{formatShortDateTime(order.create_time, lang)}</div>
      </td>
      <td className={table.td}>{order.buyer_username}</td>
      <td className={table.td}>
        {first && (
          <div className="flex items-center gap-2.5">
            <Thumb src={first.image_info?.image_url} />
            <div className="min-w-0">
              <p className="line-clamp-2 max-w-64">{first.item_name}</p>
              <p className={sub}>
                {[first.model_name, `× ${first.model_quantity_purchased}`].filter(Boolean).join(' ')}
                {rest.length > 0 && ` · ${t('moreItems', { count: rest.length })}`}
              </p>
            </div>
          </div>
        )}
      </td>
      <td className={`${table.td} text-right whitespace-nowrap`}>
        {formatVnd(order.total_amount)}
        <div className={sub}>{payment(order.payment_method, order.cod, true)}</div>
      </td>
      <td className={table.td}>
        <OrderStatusLabel status={order.order_status} />
      </td>
      <td className={`${table.td} text-right`}>
        {order.order_status === 'READY_TO_SHIP' ? (
          <button type="button" className={btn.accentSm} onClick={onShip}>
            {t('prepare')}
          </button>
        ) : (
          <Link href={`/orders/${order.order_sn}`} className="whitespace-nowrap text-link hover:underline">
            {t('view')}
          </Link>
        )}
      </td>
    </tr>
  );
}
