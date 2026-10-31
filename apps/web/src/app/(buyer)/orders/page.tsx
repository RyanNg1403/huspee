'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { BuyerOrder, BuyerOrderCounts, OrderStatus, Paginated } from '@huspee/sdk';
import { RequireRole } from '@huspee/web-ui/components/session';
import { Button, Icon, Pagination, QueryState, Tabs, useToast } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { common } from '@huspee/web-ui/i18n/common';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { CancelOrderModal } from '../_orders/CancelOrderModal';
import { messages } from '../_orders/messages';
import { countFor, formatDayMonth, formatDayMonthTime, inTransitTracking, withCount } from '../_orders/order-view';
import { ReturnRequestModal } from '../_orders/ReturnRequestModal';
import { ReviewModal } from '../_orders/ReviewModal';
import { formatPaymentMethod, getErrorMessage, OrderStatusBadge, panel } from '../_orders/shared';

type TabKey =
  | 'ALL'
  | 'UNPAID'
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'TO_CONFIRM_RECEIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RETURNS';

function OrdersView() {
  const t = useT(messages);
  const tCommon = useT(common);
  const router = useRouter();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const [page, setPage] = useState(1);

  // Modals state
  const [cancelModalOrderSn, setCancelModalOrderSn] = useState<string | null>(null);
  const [returnModalOrder, setReturnModalOrder] = useState<BuyerOrder | null>(null);
  const [reviewItem, setReviewItem] = useState<{
    orderSn: string;
    itemId: number;
    modelId?: number;
    itemName: string;
  } | null>(null);
  const [confirmingSn, setConfirmingSn] = useState<string | null>(null);

  const { data: counts, reload: reloadCounts } = useApi<BuyerOrderCounts>(
    () => getApiClient().buyer.orders.counts(),
    [],
  );

  // Counts only on tabs that still need something to happen, as in the design.
  const tabItems: Array<{ value: TabKey; label: string }> = [
    { value: 'ALL', label: t('tabAll') },
    { value: 'UNPAID', label: withCount(t('tabUnpaid'), countFor(counts, ['UNPAID'])) },
    {
      value: 'READY_TO_SHIP',
      label: withCount(t('tabReadyToShip'), countFor(counts, ['READY_TO_SHIP', 'PROCESSED'])),
    },
    { value: 'SHIPPED', label: withCount(t('tabShipped'), countFor(counts, ['SHIPPED'])) },
    {
      value: 'TO_CONFIRM_RECEIVE',
      label: withCount(t('tabConfirmReceive'), countFor(counts, ['TO_CONFIRM_RECEIVE'])),
    },
    { value: 'COMPLETED', label: t('tabCompleted') },
    { value: 'CANCELLED', label: t('tabCancelled') },
    // TO_RETURN orders are the ones with an open return request.
    { value: 'RETURNS', label: withCount(t('tabReturns'), countFor(counts, ['TO_RETURN'])) },
  ];

  const handleTabChange = (key: TabKey) => {
    if (key === 'RETURNS') {
      router.push('/returns');
      return;
    }
    setActiveTab(key);
    setPage(1);
  };

  const {
    data: ordersData,
    loading,
    error,
    reload,
  } = useApi<Paginated<BuyerOrder>>(async () => {
    const statusQuery =
      activeTab === 'ALL' || activeTab === 'RETURNS'
        ? undefined
        : activeTab === 'READY_TO_SHIP'
          ? ['READY_TO_SHIP', 'PROCESSED']
          : (activeTab as OrderStatus);
    return getApiClient().buyer.orders.list({
      status: statusQuery,
      page,
      page_size: 10,
    });
  }, [activeTab, page]);

  const handleConfirmReceipt = async (orderSn: string) => {
    if (!window.confirm(t('confirmReceiptPrompt'))) return;
    setConfirmingSn(orderSn);
    try {
      await getApiClient().buyer.orders.confirmReceipt(orderSn);
      toast(t('receiptConfirmed'));
      reload();
      reloadCounts();
    } catch (err) {
      toast(getErrorMessage(err, tCommon, t));
    } finally {
      setConfirmingSn(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Shopee-style Status Tabs */}
      <div className="rounded-2xl border border-line bg-white px-2 shadow-card">
        <div className="overflow-x-auto">
          <Tabs items={tabItems} value={activeTab} onChange={handleTabChange} />
        </div>
      </div>

      {/* Orders List */}
      {loading || error ? (
        <QueryState loading={loading} error={error} retry={reload} />
      ) : !ordersData || ordersData.data.length === 0 ? (
        <div className={`${panel} py-16 text-center`}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="box" className="h-7 w-7" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-800">{t('noOrders')}</h3>
          <Link href="/">
            <Button>{t('continueShopping')}</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {ordersData.data.map((order) => (
            <div
              key={order.order_sn}
              className="overflow-hidden rounded-2xl border border-line bg-white shadow-card"
            >
              {/* Order Card Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50/70 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">
                    <Link
                      href={`/shops/${order.shop.shop_id}`}
                      className="hover:text-primary transition-colors flex items-center gap-1.5"
                    >
                      <Icon name="shop" className="h-4 w-4 text-gray-500" />
                      <span>{order.shop.shop_name}</span>
                    </Link>
                  </span>
                  <span className="text-gray-400">|</span>
                  <span className="text-xs text-gray-500 font-mono">{order.order_sn}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  {order.placed_via_assistant && (
                    <span className="text-muted">
                      {t('placedViaAssistant', {
                        time: formatDayMonthTime(order.placed_via_assistant.placed_at),
                      })}
                    </span>
                  )}
                  {inTransitTracking(order) ? (
                    <Link href={`/orders/${order.order_sn}`} className="text-success hover:underline">
                      {inTransitTracking(order)!.description} · {formatDayMonthTime(inTransitTracking(order)!.time)}
                    </Link>
                  ) : order.delivered_time ? (
                    <span className="text-muted">
                      {t('deliveredOn', { date: formatDayMonth(order.delivered_time) })}
                    </span>
                  ) : null}
                  <OrderStatusBadge status={order.status} />
                </div>
              </div>

              {/* Order Items */}
              <div className="divide-y p-4">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
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
                    <div className="flex-1 space-y-1">
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
                    <div className="text-right text-sm">
                      {item.original_price > item.unit_price && (
                        <div className="text-xs text-gray-400 line-through">
                          {formatVnd(item.original_price)}
                        </div>
                      )}
                      <div className="font-medium text-primary">{formatVnd(item.line_total)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Order Card Footer */}
              <div className="border-t bg-gray-50/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3 border-b">
                  <div className="text-xs text-gray-500">
                    {formatPaymentMethod(order.payment_method, order.cod, t)}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm text-gray-600">{t('total')}:</span>
                    <span className="text-xl font-bold text-primary">
                      {formatVnd(order.amounts.total_amount)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <Link href={`/orders/${order.order_sn}`}>
                    <Button variant="outline" size="sm">
                      {t('viewDetail')}
                    </Button>
                  </Link>

                  {order.actions.can_cancel && (
                    <Button variant="outline" size="sm" onClick={() => setCancelModalOrderSn(order.order_sn)}>
                      {t('cancelOrder')}
                    </Button>
                  )}

                  {order.actions.can_confirm_receipt && (
                    <Button
                      size="sm"
                      loading={confirmingSn === order.order_sn}
                      onClick={() => handleConfirmReceipt(order.order_sn)}
                    >
                      {t('confirmReceipt')}
                    </Button>
                  )}

                  {order.actions.can_request_return && (
                    <Button variant="outline" size="sm" onClick={() => setReturnModalOrder(order)}>
                      {t('requestReturn')}
                    </Button>
                  )}

                  {order.status === 'COMPLETED' && order.items[0] && (
                    <Button
                      size="sm"
                      onClick={() =>
                        setReviewItem({
                          orderSn: order.order_sn,
                          itemId: order.items[0].item_id,
                          modelId: order.items[0].model_id,
                          itemName: order.items[0].item_name,
                        })
                      }
                    >
                      {t('review')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {ordersData.page.total > ordersData.page.page_size && (
            <div className="flex justify-center pt-4">
              <Pagination
                page={page}
                totalPages={Math.ceil(ordersData.page.total / ordersData.page.page_size)}
                onChange={(p) => setPage(p)}
              />
            </div>
          )}
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModalOrderSn && (
        <CancelOrderModal
          open={!!cancelModalOrderSn}
          orderSn={cancelModalOrderSn}
          onClose={() => setCancelModalOrderSn(null)}
          onSuccess={() => reload()}
        />
      )}

      {/* Return Modal */}
      {returnModalOrder && (
        <ReturnRequestModal
          open={!!returnModalOrder}
          order={returnModalOrder}
          onClose={() => setReturnModalOrder(null)}
          onSuccess={() => reload()}
        />
      )}

      {/* Review Modal */}
      {reviewItem && (
        <ReviewModal
          open={!!reviewItem}
          orderSn={reviewItem.orderSn}
          itemId={reviewItem.itemId}
          modelId={reviewItem.modelId}
          itemName={reviewItem.itemName}
          onClose={() => setReviewItem(null)}
          onSuccess={() => reload()}
        />
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <RequireRole role="buyer">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <OrdersView />
      </div>
    </RequireRole>
  );
}
