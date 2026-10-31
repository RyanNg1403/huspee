'use client';
import Link from 'next/link';
import type { OrderStatus } from '@huspee/sdk';
import { ErrorState, Skeleton } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n/client';
import { formatVnd } from '@huspee/web-ui/lib/format';
import {
  Block,
  StatusDot,
  tableClass,
  tbodyClass,
  tdClass,
  thClass,
  type StatusTone,
} from '@/components/shell';
import type { HomeOrder, SalesData } from './api';
import { homeMessages } from './messages';
import type { Query } from './query';

const LIMIT = 10;
const NEEDS_ACTION: OrderStatus[] = ['UNPAID', 'READY_TO_SHIP', 'IN_CANCEL'];

function tone(status: OrderStatus): StatusTone {
  if (NEEDS_ACTION.includes(status)) return 'action';
  return status === 'COMPLETED' ? 'success' : 'neutral';
}

function Items({ order }: { order: HomeOrder }) {
  const t = useT(homeMessages);
  const [first, ...rest] = order.item_list ?? [];
  if (!first) return null;
  return (
    <>
      <span className="line-clamp-1">
        {first.item_name}
        {first.model_name && ` · ${first.model_name}`}
        {first.model_quantity_purchased > 1 && ` × ${first.model_quantity_purchased}`}
      </span>
      {rest.length > 0 && (
        <span className="text-[13px] text-muted">{t('moreItems', { count: rest.length })}</span>
      )}
    </>
  );
}

/** Orders placed since midnight, newest first. */
export function TodayOrdersBlock({ sales }: { sales: Query<SalesData> }) {
  const t = useT(homeMessages);
  const data = sales.data;
  const orders = data ? data.orders.filter((o) => o.create_time >= data.todayStart).slice(0, LIMIT) : [];
  return (
    <Block
      title={t('todayOrders')}
      action={
        <Link href="/orders" className="text-link hover:underline">
          {t('allOrdersLink')}
        </Link>
      }
    >
      {sales.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : sales.error || !data ? (
        <ErrorState message={t('failed')} onRetry={sales.reload} retryLabel={t('retry')} />
      ) : !orders.length ? (
        <p className="py-6 text-center text-muted">{t('noOrdersToday')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass}>
                  {t('orderSn')}
                </th>
                <th scope="col" className={thClass}>
                  {t('product')}
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  {t('total')}
                </th>
                <th scope="col" className={thClass}>
                  {t('status')}
                </th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {orders.map((order) => (
                <tr key={order.order_sn}>
                  <td className={tdClass}>
                    <Link
                      href={`/orders/${encodeURIComponent(order.order_sn)}`}
                      className="text-link hover:underline"
                    >
                      {order.order_sn}
                    </Link>
                  </td>
                  <td className={`${tdClass} max-w-[360px]`}>
                    <Items order={order} />
                  </td>
                  <td className={`${tdClass} text-right whitespace-nowrap`}>
                    {formatVnd(order.total_amount)}
                  </td>
                  <td className={tdClass}>
                    <StatusDot tone={tone(order.order_status)}>{t(`status${order.order_status}`)}</StatusDot>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Block>
  );
}
