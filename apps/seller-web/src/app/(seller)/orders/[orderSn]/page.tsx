'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Price, Spinner } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n/client';
import { formatDateTime, formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { call } from '../../_ops/api';
import { CancelOrderModal } from '../../_ops/CancelOrderModal';
import { ShipModal } from '../../_ops/ShipModal';
import { ShopGuard } from '../../_ops/ShopGuard';
import { SimulationPanel } from '../../_ops/SimulationPanel';
import { OrderStatusBadge } from '../../_ops/StatusBadge';
import type { OrderDetail, TrackingInfoResponse, TrackingNumberResponse } from '../../_ops/types';
import { orderMessages } from '../messages';

export default function OrderDetailPage() {
  const params = useParams();
  const orderSn = String(params.orderSn);

  return <ShopGuard>{(shop) => <OrderDetailContent shopId={shop.shop_id} orderSn={orderSn} />}</ShopGuard>;
}

function OrderDetailContent({ shopId, orderSn }: { shopId: number; orderSn: string }) {
  const t = useT(orderMessages);
  const { lang } = useLang();

  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const detailApi = useApi(async () => {
    // 1. Fetch order detail
    const res = await call<{ order_list: OrderDetail[] }>(shopId, '/order/get_order_detail', {
      order_sn_list: [orderSn],
      response_optional_fields: [
        'buyer_username',
        'buyer_user_id',
        'recipient_address',
        'actual_shipping_fee',
        'pay_time',
        'buyer_cancel_reason',
        'cancel_by',
        'cancel_reason',
        'item_list',
        'package_list',
        'payment_info',
        'total_amount',
      ],
    });

    const order = res.order_list?.[0];
    if (!order) return null;

    // 2. Fetch tracking number & tracking info in parallel (graceful on empty)
    let trackingNumber = '';
    let trackingInfo: TrackingInfoResponse | null = null;

    try {
      const tnRes = await call<TrackingNumberResponse>(shopId, '/logistics/get_tracking_number', {
        order_sn: orderSn,
      });
      trackingNumber = tnRes.tracking_number;
    } catch {
      // Not yet generated
    }

    try {
      trackingInfo = await call<TrackingInfoResponse>(shopId, '/logistics/get_tracking_info', {
        order_sn: orderSn,
      });
    } catch {
      // No tracking info yet
    }

    return { order, trackingNumber, trackingInfo };
  }, [shopId, orderSn]);

  if (detailApi.loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (detailApi.error) {
    return <ErrorState message={t('failed')} onRetry={detailApi.reload} retryLabel={t('filter')} />;
  }

  if (!detailApi.data?.order) {
    return <EmptyState title={t('noOrders')} />;
  }

  const { order, trackingNumber, trackingInfo } = detailApi.data;
  const isReadyToShip = order.order_status === 'READY_TO_SHIP';
  const canCancel = isReadyToShip || order.order_status === 'UNPAID';

  return (
    <div className="space-y-5">
      {/* Back button & Title bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/orders">
            <Button variant="outline" size="sm">
              ← {t('ordersTitle')}
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-gray-900 md:text-2xl">
            {t('orderDetailTitle')}: {order.order_sn}
          </h1>
          <OrderStatusBadge status={order.order_status} />
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isReadyToShip && (
            <Button variant="primary" size="sm" onClick={() => setShipModalOpen(true)}>
              {t('shipOrderBtn')}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-600 text-red-600 hover:bg-red-50"
              onClick={() => setCancelModalOpen(true)}
            >
              {t('cancelOrderBtn')}
            </Button>
          )}
        </div>
      </div>

      {/* Simulation Tool Panel */}
      <SimulationPanel
        shopId={shopId}
        orderSn={orderSn}
        currentStatus={order.order_status}
        onUpdated={detailApi.reload}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left Column: Items and Logistics (2 cols) */}
        <div className="space-y-5 lg:col-span-2">
          {/* Purchased Items Card */}
          <Card>
            <h2 className="mb-4 text-base font-bold text-gray-900">{t('orderItems')}</h2>
            <div className="divide-y divide-gray-100">
              {(order.item_list ?? []).map((item) => (
                <div
                  key={`${item.item_id}-${item.model_id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.image_info?.image_url ? (
                      <Image
                        src={item.image_info.image_url}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-gray-100" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{item.item_name}</p>
                      {item.model_name && (
                        <p className="text-xs text-gray-500">{t('variation', { name: item.model_name })}</p>
                      )}
                      <p className="text-xs text-gray-400">SKU: {item.model_sku || item.item_sku || '—'}</p>
                    </div>
                  </div>

                  <div className="text-right text-sm">
                    <p className="font-semibold text-gray-900">
                      <Price
                        value={item.model_discounted_price}
                        originalPrice={
                          item.model_original_price > item.model_discounted_price
                            ? item.model_original_price
                            : undefined
                        }
                      />
                    </p>
                    <p className="text-xs text-gray-500">x{item.model_quantity_purchased}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Tracking / Logistics Card */}
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <h2 className="text-base font-bold text-gray-900">{t('logisticsTracking')}</h2>
              <div className="text-xs text-gray-600">
                <span className="font-semibold">{t('carrier')}:</span>{' '}
                {order.shipping_carrier || t('unassignedCarrier')}
                {trackingNumber && (
                  <span className="ml-3 font-semibold text-primary">
                    {t('trackingNumber')}: {trackingNumber}
                  </span>
                )}
              </div>
            </div>

            {trackingInfo?.tracking_info?.length ? (
              <div className="relative border-l-2 border-primary/30 pl-4 space-y-4 my-2">
                {trackingInfo.tracking_info.map((event, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="text-xs text-gray-400">{formatDateTime(event.update_time, lang)}</p>
                    <p className="text-sm font-medium text-gray-800">{event.description}</p>
                    <span className="text-xs text-gray-500 font-mono">{event.logistics_status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-gray-500">{t('noTrackingEvents')}</p>
            )}
          </Card>
        </div>

        {/* Right Column: Buyer & Payment Summary (1 col) */}
        <div className="space-y-5">
          {/* Buyer Info Card */}
          <Card>
            <h2 className="mb-3 text-base font-bold text-gray-900">{t('buyerInfo')}</h2>
            <div className="space-y-2 text-sm text-gray-700">
              <div>
                <span className="text-xs font-semibold text-gray-500">{t('buyer')}:</span>
                <p className="font-medium text-gray-900">
                  {order.buyer_username || '—'} (ID: {order.buyer_user_id ?? '—'})
                </p>
              </div>

              {order.recipient_address && (
                <>
                  <div>
                    <span className="text-xs font-semibold text-gray-500">{t('recipient')}:</span>
                    <p className="font-medium text-gray-900">{order.recipient_address.name}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500">{t('phone')}:</span>
                    <p>{order.recipient_address.phone}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500">{t('address')}:</span>
                    <p className="text-gray-800">
                      {order.recipient_address.full_address ||
                        [
                          order.recipient_address.district,
                          order.recipient_address.city,
                          order.recipient_address.state,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                    </p>
                  </div>
                </>
              )}

              {order.message_to_seller && (
                <div className="rounded-lg bg-yellow-50 p-2 text-xs text-yellow-800">
                  <span className="font-semibold">{t('buyerMessage')}:</span> {order.message_to_seller}
                </div>
              )}
            </div>
          </Card>

          {/* Payment Summary Card */}
          <Card>
            <h2 className="mb-3 text-base font-bold text-gray-900">{t('paymentSummary')}</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>{t('shippingFee')}</span>
                <span>{formatVnd(order.actual_shipping_fee ?? order.estimated_shipping_fee)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold text-base text-gray-900">
                <span>{t('totalPayment')}</span>
                <span className="text-primary">{formatVnd(order.total_amount)}</span>
              </div>

              <div className="mt-3 border-t pt-3 text-xs space-y-1 text-gray-600">
                <div className="flex justify-between">
                  <span>{t('paymentMethod')}:</span>
                  <span className="font-medium">{order.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('paymentStatus')}:</span>
                  <span className="font-medium">
                    {order.cod ? 'COD' : order.pay_time ? t('paid') : t('unpaid')}
                  </span>
                </div>
                {order.pay_time ? (
                  <div className="flex justify-between text-gray-400">
                    <span>{t('paymentTime')}</span>
                    <span>{formatDateTime(order.pay_time, lang)}</span>
                  </div>
                ) : null}
              </div>

              {order.order_status === 'CANCELLED' && (
                <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                  <p className="font-semibold">{t('cancelReason')}:</p>
                  <p>{order.cancel_reason || order.buyer_cancel_reason || t('unknownReason')}</p>
                  {order.cancel_by && (
                    <p className="mt-1 text-gray-500">
                      {t('cancelledBy')}: {order.cancel_by}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Ship Modal */}
      {shipModalOpen && (
        <ShipModal
          open={shipModalOpen}
          shopId={shopId}
          orderSn={orderSn}
          onClose={() => setShipModalOpen(false)}
          onSuccess={() => detailApi.reload()}
        />
      )}

      {/* Cancel Order Modal */}
      {cancelModalOpen && (
        <CancelOrderModal
          open={cancelModalOpen}
          shopId={shopId}
          order={order}
          onClose={() => setCancelModalOpen(false)}
          onSuccess={() => detailApi.reload()}
        />
      )}
    </div>
  );
}
