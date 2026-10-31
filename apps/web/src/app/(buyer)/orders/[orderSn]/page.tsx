'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import type { BuyerOrder, OrderTracking } from '@huspee/sdk';
import { RequireRole } from '@huspee/web-ui/components/session';
import { VoiceWidget } from '@/components/assistant/VoiceWidget';
import { Button, Icon, QueryState, useToast } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { formatDateTime, formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { CancelOrderModal } from '../../_orders/CancelOrderModal';
import { messages } from '../../_orders/messages';
import { formatDayMonthTime, formatFullDate } from '../../_orders/order-view';
import { ReturnRequestModal } from '../../_orders/ReturnRequestModal';
import { ReviewModal } from '../../_orders/ReviewModal';
import { formatPaymentMethod, getErrorMessage, OrderStatusBadge, panel } from '../../_orders/shared';
import { OrderStatusStepper, TrackingTimeline } from '../../_orders/TrackingTimeline';

function OrderDetailView() {
  const t = useT(messages);
  const tCommon = useT(common);
  const { lang } = useLang();
  const toast = useToast();
  const params = useParams();
  const orderSn = String(params.orderSn);

  // Fetch order detail
  const {
    data: order,
    loading: orderLoading,
    error: orderError,
    reload: reloadOrder,
  } = useApi<BuyerOrder>(() => getApiClient().buyer.orders.get(orderSn), [orderSn]);

  // Fetch tracking
  const {
    data: tracking,
    loading: trackingLoading,
    error: trackingError,
    reload: reloadTracking,
  } = useApi<OrderTracking>(() => getApiClient().buyer.orders.tracking(orderSn), [orderSn]);

  // Modals state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<{
    itemId: number;
    modelId?: number;
    itemName: string;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleConfirmReceipt = async () => {
    if (!window.confirm(t('confirmReceiptPrompt'))) return;
    setConfirming(true);
    try {
      await getApiClient().buyer.orders.confirmReceipt(orderSn);
      toast(t('receiptConfirmed'));
      reloadOrder();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setConfirming(false);
    }
  };

  if (orderLoading || orderError)
    return <QueryState loading={orderLoading} error={orderError} retry={reloadOrder} />;
  if (!order) return null;

  return (
    <div className="space-y-4 pb-12">
      <VoiceWidget shopId={order.shop.shop_id} order={{ order_sn: order.order_sn, status: order.status, image: order.items[0]?.image_url ?? undefined }} />
      {/* Top Bar with Back and Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
        <div className="flex items-center gap-3">
          <Link
            href="/orders"
            className="text-sm font-medium text-gray-600 hover:text-primary transition-colors flex items-center gap-1"
          >
            ← {t('back')}
          </Link>
          <span className="text-gray-300">|</span>
          <span className="font-mono text-sm font-semibold text-gray-800">
            {t('orderSn')}: {order.order_sn}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {order.placed_via_assistant && (
            <span className="text-[13px] text-muted">
              {t('placedViaAssistant', { time: formatDayMonthTime(order.placed_via_assistant.placed_at) })}
            </span>
          )}
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      {/* Status Stepper */}
      <div className={panel}>
        <OrderStatusStepper order={order} />
      </div>

      {/* Tracking Timeline */}
      <div className={panel}>
        {trackingLoading || trackingError ? (
          <QueryState loading={trackingLoading} error={trackingError} retry={reloadTracking} />
        ) : (
          <TrackingTimeline tracking={tracking} />
        )}
      </div>

      {/* Recipient Address */}
      <div className={panel}>
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-800">
          <Icon name="pin" className="h-5 w-5 text-primary" />
          <span>{t('shippingAddress')}</span>
        </h3>
        <div className="space-y-1 text-sm text-gray-700">
          <div className="font-semibold text-gray-900">
            {order.recipient_address.name} ({order.recipient_address.phone})
          </div>
          <div>
            {order.recipient_address.full_address ||
              [
                order.recipient_address.address,
                order.recipient_address.town,
                order.recipient_address.district,
                order.recipient_address.city,
                order.recipient_address.state,
              ]
                .filter(Boolean)
                .join(', ')}
          </div>
        </div>
      </div>

      {/* Items Section */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        {/* Shop Header */}
        <div className="border-b bg-gray-50/70 px-4 py-3 flex items-center justify-between">
          <Link
            href={`/shops/${order.shop.shop_id}`}
            className="font-semibold text-gray-900 hover:text-primary transition-colors flex items-center gap-1.5"
          >
            <Icon name="shop" className="h-4 w-4 text-gray-500" />
            <span>{order.shop.shop_name}</span>
          </Link>
          <span className="text-xs text-gray-500">
            {t('orderDate')}: {formatDateTime(order.create_time, lang)}
          </span>
        </div>

        {/* Item Rows */}
        <div className="divide-y p-4">
          {order.items.map((item, idx) => (
            <div
              key={idx}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border bg-gray-100">
                  {item.image_url ? (
                    <Image
                      unoptimized
                      width={64}
                      height={64}
                      src={item.image_url}
                      alt={item.item_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                      Huspee
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Link
                    href={`/products/${item.item_id}`}
                    className="line-clamp-2 text-sm font-medium text-gray-800 hover:text-primary"
                  >
                    {item.item_name}
                  </Link>
                  {item.model_name && (
                    <div className="text-xs text-gray-500">
                      {t('productVariant')}: {item.model_name}
                    </div>
                  )}
                  <div className="text-xs text-gray-500">x{item.quantity}</div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4">
                <div className="text-right text-sm">
                  {item.original_price > item.unit_price && (
                    <div className="text-xs text-gray-400 line-through">{formatVnd(item.original_price)}</div>
                  )}
                  <div className="font-semibold text-primary">{formatVnd(item.line_total)}</div>
                </div>

                {order.status === 'COMPLETED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setReviewItem({
                        itemId: item.item_id,
                        modelId: item.model_id,
                        itemName: item.item_name,
                      })
                    }
                  >
                    {t('review')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {order.message_to_seller && (
          <div className="border-t bg-gray-50/30 px-4 py-2 text-xs text-gray-600">
            <span className="font-medium">{t('messageToSeller')}:</span> {order.message_to_seller}
          </div>
        )}
      </div>

      {/* Payment & Amount Breakdown */}
      <div className={panel}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Payment Info */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-gray-800">{t('paymentMethod')}</h4>
            <div className="text-sm text-gray-700">
              <p className="font-medium">{formatPaymentMethod(order.payment_method, order.cod, t)}</p>
            </div>
          </div>

          {/* Money Breakdown */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>{t('itemsSubtotal')}:</span>
              <span>{formatVnd(order.amounts.items_subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>{t('shippingFee')}:</span>
              <span>{formatVnd(order.amounts.shipping_fee)}</span>
            </div>
            {order.amounts.shipping_discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>{t('shippingDiscount')}:</span>
                <span>-{formatVnd(order.amounts.shipping_discount)}</span>
              </div>
            )}
            {order.amounts.voucher_discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>{t('voucherDiscount')}:</span>
                <span>-{formatVnd(order.amounts.voucher_discount)}</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between items-baseline font-semibold text-gray-900">
              <span>{t('total')}:</span>
              <span className="text-xl font-bold text-primary">{formatVnd(order.amounts.total_amount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
        {order.actions.can_request_return && order.actions.return_request_due_date && (
          <span className="mr-auto text-[13px] text-muted">
            {t('returnDeadline', { date: formatFullDate(order.actions.return_request_due_date) })}
          </span>
        )}
        {order.actions.can_cancel && (
          <Button variant="outline" onClick={() => setCancelModalOpen(true)}>
            {t('cancelOrder')}
          </Button>
        )}

        {order.actions.can_confirm_receipt && (
          <Button loading={confirming} onClick={handleConfirmReceipt}>
            {t('confirmReceipt')}
          </Button>
        )}

        {order.actions.can_request_return && (
          <Button variant="outline" onClick={() => setReturnModalOpen(true)}>
            {t('requestReturn')}
          </Button>
        )}
      </div>

      {/* Cancel Order Modal */}
      {cancelModalOpen && (
        <CancelOrderModal
          open={cancelModalOpen}
          orderSn={order.order_sn}
          onClose={() => setCancelModalOpen(false)}
          onSuccess={() => reloadOrder()}
        />
      )}

      {/* Return Request Modal */}
      {returnModalOpen && (
        <ReturnRequestModal
          open={returnModalOpen}
          order={order}
          onClose={() => setReturnModalOpen(false)}
          onSuccess={() => reloadOrder()}
        />
      )}

      {/* Review Modal */}
      {reviewItem && (
        <ReviewModal
          open={!!reviewItem}
          orderSn={order.order_sn}
          itemId={reviewItem.itemId}
          modelId={reviewItem.modelId}
          itemName={reviewItem.itemName}
          onClose={() => setReviewItem(null)}
          onSuccess={() => reloadOrder()}
        />
      )}
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <RequireRole role="buyer">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <OrderDetailView />
      </div>
    </RequireRole>
  );
}
