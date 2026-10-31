'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { BuyerOrder } from '@huspee/sdk';
import { RequireRole } from '@huspee/web-ui/components/session';
import { Button, Icon, QueryState } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { messages } from '../../_orders/messages';
import { parseOrderSns } from '../../_orders/order-view';
import { formatPaymentMethod, panel } from '../../_orders/shared';

function OrderSummary({ order }: { order: BuyerOrder }) {
  const t = useT(messages);
  const address = order.recipient_address;
  const fullAddress =
    address.full_address ||
    [address.address, address.town, address.district, address.city, address.state].filter(Boolean).join(', ');
  const shippingPaid = order.amounts.shipping_fee - order.amounts.shipping_discount;

  return (
    <div className="border-t pt-4 text-left first:border-t-0 first:pt-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{order.shop.shop_name}</span>
        <span className="text-muted">
          {t('orderSn')}{' '}
          <Link href={`/orders/${order.order_sn}`} className="font-medium text-ink hover:text-primary">
            {order.order_sn}
          </Link>
        </span>
      </div>
      <div className="space-y-3">
        {order.items.map((item) => (
          <div key={item.model_id} className="flex items-center gap-3">
            <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded border bg-gray-50">
              {item.image_url && (
                <Image unoptimized width={48} height={48} src={item.image_url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="line-clamp-2">
                {item.item_name}
                {item.model_name ? ` · ${item.model_name}` : ''}
              </div>
              <div className="text-[13px] text-muted">× {item.quantity}</div>
            </div>
            <span className="text-sm">{formatVnd(item.line_total)}</span>
          </div>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">{t('itemsSubtotal')}</dt>
        <dd className="text-right">{formatVnd(order.amounts.items_subtotal)}</dd>
        {order.voucher_code && order.amounts.voucher_discount > 0 && (
          <>
            <dt className="text-muted">{t('voucherCode', { code: order.voucher_code })}</dt>
            <dd className="text-right">−{formatVnd(order.amounts.voucher_discount)}</dd>
          </>
        )}
        <dt className="text-muted">{t('shippingVia', { carrier: order.logistics.shipping_carrier })}</dt>
        <dd className="text-right">
          {order.amounts.shipping_discount > 0 && (
            <span className="mr-1.5 text-[13px] text-subtle line-through">{formatVnd(order.amounts.shipping_fee)}</span>
          )}
          {formatVnd(shippingPaid)}
        </dd>
        <dt className="font-semibold">{t('totalPayment')}</dt>
        <dd className="text-right text-lg text-primary">{formatVnd(order.amounts.total_amount)}</dd>
      </dl>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-muted">{t('paymentMethod')}</dt>
        <dd>{formatPaymentMethod(order.payment_method, order.cod, t)}</dd>
        <dt className="text-muted">{t('deliverTo')}</dt>
        <dd>
          {address.name} · {address.phone}
          <br />
          {fullAddress}
        </dd>
      </dl>
    </div>
  );
}

function CheckoutSuccessView() {
  const t = useT(messages);
  const searchParams = useSearchParams();
  const ordersParam = searchParams.get('orders');
  const orderSns = parseOrderSns(ordersParam);

  const { data: orders, loading, error, reload } = useApi<BuyerOrder[]>(
    () => Promise.all(parseOrderSns(ordersParam).map((sn) => getApiClient().buyer.orders.get(sn))),
    [ordersParam],
  );

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className={panel}>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-success">
            <Icon name="check" className="h-8 w-8" />
          </div>
          <h2 className="mb-6 text-2xl font-semibold">{t('orderSuccess')}</h2>
          <div className="mb-6 flex flex-wrap justify-center gap-3">
            <Link href="/orders">
              <Button>{t('viewOrders')}</Button>
            </Link>
            <Link href="/">
              <Button variant="outline">{t('continueShopping')}</Button>
            </Link>
          </div>
        </div>

        {orderSns.length > 0 &&
          (loading || error ? (
            <QueryState loading={loading} error={error} retry={reload} />
          ) : (
            <div className="space-y-4 border-t pt-4">
              {(orders ?? []).map((order) => (
                <OrderSummary key={order.order_sn} order={order} />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <RequireRole role="buyer">
      <CheckoutSuccessView />
    </RequireRole>
  );
}
