'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { SellerShop } from '@huspee/sdk';
import { EmptyState } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { Breadcrumb } from '@/components/commerce/Breadcrumb';
import { formatDay, formatShortDateTime } from '@/components/commerce/format';
import { ListState } from '@/components/commerce/ListState';
import { CancelOrderModal } from '@/components/commerce/orders/CancelOrderModal';
import {
  OrderStatusLabel,
  useCancelReasonLabel,
  usePaymentLabel,
} from '@/components/commerce/orders/OrderStatusLabel';
import { loadOrder } from '@/components/commerce/orders/order-api';
import { ShipModal } from '@/components/commerce/orders/ShipModal';
import { SimulationPanel } from '@/components/commerce/orders/SimulationPanel';
import type { OrderDetail, TrackingEvent } from '@/components/commerce/orders/types';
import { Facts, Panel } from '@/components/commerce/Panel';
import { ShopGuard } from '@/components/commerce/ShopGuard';
import { Thumb } from '@/components/commerce/Thumb';
import { btn, sub, table } from '@/components/commerce/ui';
import { orderMessages } from '../messages';

export default function OrderDetailPage() {
  const orderSn = String(useParams().orderSn);
  return <ShopGuard>{(shop) => <OrderDetailView shop={shop} orderSn={orderSn} />}</ShopGuard>;
}

function OrderDetailView({ shop, orderSn }: { shop: SellerShop; orderSn: string }) {
  const t = useT(orderMessages);
  const [dialog, setDialog] = useState<'ship' | 'cancel' | null>(null);
  const data = useApi(() => loadOrder(shop.shop_id, orderSn), [shop.shop_id, orderSn]);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: t('title'), href: '/orders' }, { label: orderSn }]} />
      <ListState
        loading={data.loading}
        error={data.error}
        empty={false}
        emptyTitle={t('notFound')}
        onRetry={data.reload}
      >
        {data.data ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <h1 className="text-xl font-semibold">{t('orderTitle', { sn: orderSn })}</h1>
                <OrderStatusLabel status={data.data.order.order_status} />
              </div>
              <div className="flex gap-2">
                {['UNPAID', 'READY_TO_SHIP'].includes(data.data.order.order_status) && (
                  <button type="button" className={btn.outline} onClick={() => setDialog('cancel')}>
                    {t('cancelOrder')}
                  </button>
                )}
                {data.data.order.order_status === 'READY_TO_SHIP' && (
                  <button type="button" className={btn.primary} onClick={() => setDialog('ship')}>
                    {t('prepare')}
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
              <div className="min-w-0 space-y-4">
                <ShippingPanel
                  shopId={shop.shop_id}
                  order={data.data.order}
                  trackingNumber={data.data.trackingNumber}
                  events={data.data.events}
                  onUpdated={data.reload}
                />
                <ProductsPanel order={data.data.order} />
              </div>
              <BuyerPanel order={data.data.order} />
            </div>
            {dialog === 'ship' && (
              <ShipModal
                shop={shop}
                orderSn={orderSn}
                carrier={data.data.order.shipping_carrier}
                onClose={() => setDialog(null)}
                onShipped={data.reload}
              />
            )}
            {dialog === 'cancel' && (
              <CancelOrderModal
                shopId={shop.shop_id}
                order={data.data.order}
                onClose={() => setDialog(null)}
                onCancelled={data.reload}
              />
            )}
          </>
        ) : (
          <EmptyState title={t('notFound')} />
        )}
      </ListState>
    </div>
  );
}

function ShippingPanel({
  shopId,
  order,
  trackingNumber,
  events,
  onUpdated,
}: {
  shopId: number;
  order: OrderDetail;
  trackingNumber: string;
  events: TrackingEvent[];
  onUpdated: () => void;
}) {
  const t = useT(orderMessages);
  const cancelReason = useCancelReasonLabel();
  const { lang } = useLang();
  const by = { seller: t('bySeller'), buyer: t('byBuyer'), system: t('bySystem') } as Record<string, string>;
  const rows = [
    { label: t('carrier'), value: order.shipping_carrier },
    {
      label: t('trackingNumber'),
      value: trackingNumber || <span className="text-muted">{t('notYet')}</span>,
    },
    ...(['UNPAID', 'READY_TO_SHIP', 'PROCESSED'].includes(order.order_status)
      ? [{ label: t('shipBy'), value: formatDay(order.ship_by_date, lang) }]
      : []),
    ...(order.order_status === 'CANCELLED'
      ? [
          { label: t('cancelledBy'), value: by[order.cancel_by ?? ''] ?? order.cancel_by },
          { label: t('cancelReason'), value: cancelReason(order.cancel_reason) },
        ]
      : []),
  ];
  return (
    <Panel title={t('shipping')}>
      <Facts rows={rows} />
      {events.length > 0 && (
        <ol className="mt-4 space-y-2.5 border-t border-line-soft pt-4 text-sm">
          {events.map((e, i) => (
            <li
              key={`${e.update_time}-${i}`}
              className="grid grid-cols-[6.5rem_0.75rem_1fr] items-baseline gap-3"
            >
              <span className="text-muted">{formatShortDateTime(e.update_time, lang)}</span>
              <span
                aria-hidden="true"
                className={`h-2 w-2 self-center rounded-full ${i === 0 ? 'bg-primary' : 'bg-gray-300'}`}
              />
              <span>{e.description}</span>
            </li>
          ))}
        </ol>
      )}
      <SimulationPanel
        shopId={shopId}
        orderSn={order.order_sn}
        status={order.order_status}
        onUpdated={onUpdated}
      />
    </Panel>
  );
}

function ProductsPanel({ order }: { order: OrderDetail }) {
  const t = useT(orderMessages);
  const payment = usePaymentLabel();
  const summary = [
    { label: t('shippingFee'), value: formatVnd(order.estimated_shipping_fee) },
    ...(order.actual_shipping_fee !== undefined && order.actual_shipping_fee !== order.estimated_shipping_fee
      ? [{ label: t('buyerShippingFee'), value: formatVnd(order.actual_shipping_fee) }]
      : []),
  ];
  return (
    <Panel title={t('products')}>
      <div className="overflow-x-auto">
        <table className={table.root}>
          <thead>
            <tr>
              <th scope="col" className={table.th}>
                {t('product')}
              </th>
              <th scope="col" className={`${table.th} text-right`}>
                {t('unitPrice')}
              </th>
              <th scope="col" className={`${table.th} text-right`}>
                {t('quantity')}
              </th>
            </tr>
          </thead>
          <tbody>
            {(order.item_list ?? []).map((i) => (
              <tr key={`${i.item_id}-${i.model_id}`}>
                <td className={table.td}>
                  <div className="flex items-center gap-3">
                    <Thumb src={i.image_info?.image_url} size={56} />
                    <div>
                      <p>{i.item_name}</p>
                      <p className={sub}>
                        {[i.model_name, i.model_sku || i.item_sku ? `SKU ${i.model_sku || i.item_sku}` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                </td>
                <td className={`${table.td} text-right whitespace-nowrap`}>
                  {formatVnd(i.model_discounted_price)}
                  {i.model_original_price > i.model_discounted_price && (
                    <div className={`${sub} line-through`}>{formatVnd(i.model_original_price)}</div>
                  )}
                </td>
                <td className={`${table.td} text-right`}>{i.model_quantity_purchased}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto mt-4 max-w-sm space-y-2 text-sm">
        {summary.map((row) => (
          <div key={row.label} className="flex justify-between gap-4">
            <dt className="text-muted">{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-line-soft pt-3">
          <dt className="font-semibold">{t('buyerPays')}</dt>
          <dd className="text-lg font-semibold text-primary">{formatVnd(order.total_amount)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">{t('paymentMethod')}</dt>
          <dd>{payment(order.payment_method, order.cod)}</dd>
        </div>
      </dl>
    </Panel>
  );
}

function BuyerPanel({ order }: { order: OrderDetail }) {
  const t = useT(orderMessages);
  const address = order.recipient_address;
  return (
    <Panel title={t('buyer')} className="self-start">
      <div className="space-y-1 text-sm">
        <p className="font-semibold">{address?.name ?? order.buyer_username}</p>
        {address && (
          <>
            <p>{address.phone}</p>
            <p className="text-muted">{address.full_address}</p>
          </>
        )}
        {order.message_to_seller && (
          <p className="pt-2">
            <span className="text-muted">{t('buyerMessage')}: </span>
            {order.message_to_seller}
          </p>
        )}
      </div>
    </Panel>
  );
}
