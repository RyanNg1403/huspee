'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button, Card, Input, QueryState, Tabs } from '@/components/ui';
import { useLang, useT } from '@/i18n/client';
import { formatDate, formatVnd } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { call } from '../_ops/api';
import { ShipModal } from '../_ops/ShipModal';
import { ShopGuard } from '../_ops/ShopGuard';
import { OrderStatusBadge } from '../_ops/StatusBadge';
import type { OrderDetail } from '../_ops/types';
import { orderMessages } from './messages';

const FIFTEEN_DAYS_SECONDS = 15 * 86400;

export default function OrdersPage() {
  return <ShopGuard>{(shop) => <OrdersContent shopId={shop.shop_id} />}</ShopGuard>;
}

function OrdersContent({ shopId }: { shopId: number }) {
  const t = useT(orderMessages);
  const { lang } = useLang();

  // Status tab
  const [selectedTab, setSelectedTab] = useState<string>('all');

  // Dates: default last 15 days
  const defaultDates = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 14 * 86400 * 1000);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }, []);

  const [dateFrom, setDateFrom] = useState(defaultDates.start);
  const [dateTo, setDateTo] = useState(defaultDates.end);
  const [cursor, setCursor] = useState<string>('');
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  // Shipping modal state
  const [shippingOrderSn, setShippingOrderSn] = useState<string | null>(null);

  // Time boundaries in unix seconds (clamped to 15 days)
  const { fromUnix, toUnix, rangeError } = useMemo(() => {
    const from = Math.floor(new Date(`${dateFrom}T00:00:00`).getTime() / 1000);
    const to = Math.floor(new Date(`${dateTo}T23:59:59`).getTime() / 1000);
    const diff = to - from;
    if (diff < 0) return { fromUnix: from, toUnix: to, rangeError: t('dateRangeInvalid') };
    if (diff > FIFTEEN_DAYS_SECONDS) {
      return { fromUnix: from, toUnix: to, rangeError: t('dateRangeHint') };
    }
    return { fromUnix: from, toUnix: to, rangeError: null };
  }, [dateFrom, dateTo, t]);

  const ordersApi = useApi(async () => {
    if (rangeError) return { orders: [], nextCursor: '', more: false };

    const listRes = await call<{
      more: boolean;
      next_cursor: string;
      order_list: Array<{ order_sn: string; order_status?: string }>;
    }>(shopId, '/order/get_order_list', {
      time_range_field: 'create_time',
      time_from: fromUnix,
      time_to: toUnix,
      page_size: 20,
      cursor: cursor || undefined,
      ...(selectedTab !== 'all' ? { order_status: selectedTab } : {}),
      response_optional_fields: 'order_status',
    });

    const snList = listRes.order_list.map((o) => o.order_sn);
    if (!snList.length) {
      return { orders: [], nextCursor: listRes.next_cursor, more: listRes.more };
    }

    const detailRes = await call<{ order_list: OrderDetail[] }>(shopId, '/order/get_order_detail', {
      order_sn_list: snList,
      response_optional_fields: [
        'buyer_username',
        'buyer_user_id',
        'recipient_address',
        'actual_shipping_fee',
        'payment_info',
        'item_list',
        'package_list',
        'pay_time',
        'total_amount',
      ],
    });

    return {
      orders: detailRes.order_list ?? [],
      nextCursor: listRes.next_cursor,
      more: listRes.more,
    };
  }, [shopId, fromUnix, toUnix, selectedTab, cursor, rangeError]);

  const tabs = [
    { value: 'all', label: t('all') },
    { value: 'READY_TO_SHIP', label: t('readyToShip') },
    { value: 'PROCESSED', label: t('processed') },
    { value: 'SHIPPED', label: t('shipped') },
    { value: 'TO_CONFIRM_RECEIVE', label: t('toConfirmReceive') },
    { value: 'COMPLETED', label: t('completed') },
    { value: 'CANCELLED', label: t('cancelled') },
    { value: 'TO_RETURN', label: t('toReturn') },
  ];

  function handleTabChange(value: string) {
    setSelectedTab(value);
    setCursor('');
    setCursorHistory([]);
  }

  function handleNextPage() {
    if (!ordersApi.data?.nextCursor) return;
    setCursorHistory((prev) => [...prev, cursor]);
    setCursor(ordersApi.data.nextCursor);
  }

  function handlePrevPage() {
    if (cursorHistory.length === 0) return;
    const prevCursor = cursorHistory[cursorHistory.length - 1] ?? '';
    setCursorHistory((prev) => prev.slice(0, -1));
    setCursor(prevCursor);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{t('ordersTitle')}</h1>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto bg-white rounded shadow-sm">
        <Tabs items={tabs} value={selectedTab} onChange={handleTabChange} />
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{t('dateFrom')}</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setCursor('');
                  setCursorHistory([]);
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">{t('dateTo')}</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setCursor('');
                  setCursorHistory([]);
                }}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">{t('dateRangeHint')}</p>
          {rangeError && <p className="text-xs font-medium text-red-600">{rangeError}</p>}
        </div>
      </Card>

      {/* Orders List / Table */}
      <QueryState
        loading={ordersApi.loading}
        error={ordersApi.error}
        errorMessage={t('failed')}
        retry={ordersApi.reload}
        retryLabel={t('filter')}
        empty={!ordersApi.data?.orders?.length}
        emptyTitle={t('noOrders')}
        card
        spinner
      >
        {ordersApi.data && (
          <div className="space-y-3">
            {/* Desktop Table View */}
            <div className="hidden overflow-x-auto rounded bg-white shadow-sm md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="px-4 py-3">{t('orderSn')}</th>
                    <th className="px-4 py-3">{t('buyer')}</th>
                    <th className="px-4 py-3">{t('items')}</th>
                    <th className="px-4 py-3">{t('total')}</th>
                    <th className="px-4 py-3">{t('payment')}</th>
                    <th className="px-4 py-3">{t('status')}</th>
                    <th className="px-4 py-3">{t('shipByDate')}</th>
                    <th className="px-4 py-3 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ordersApi.data.orders.map((order) => {
                    const itemCount = (order.item_list ?? []).reduce(
                      (sum, i) => sum + i.model_quantity_purchased,
                      0,
                    );
                    return (
                      <tr key={order.order_sn} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-medium text-primary">
                          <Link href={`/seller/orders/${order.order_sn}`}>{order.order_sn}</Link>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{order.buyer_username || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1 max-w-xs">
                            {(order.item_list ?? []).slice(0, 2).map((item) => (
                              <div
                                key={`${item.item_id}-${item.model_id}`}
                                className="flex items-center gap-2 truncate"
                              >
                                {item.image_info?.image_url && (
                                  <Image
                                    src={item.image_info.image_url}
                                    alt=""
                                    width={28}
                                    height={28}
                                    unoptimized
                                    className="h-7 w-7 rounded object-cover"
                                  />
                                )}
                                <span className="truncate text-xs text-gray-800">
                                  {item.item_name}
                                  {item.model_name ? ` (${item.model_name})` : ''} x
                                  {item.model_quantity_purchased}
                                </span>
                              </div>
                            ))}
                            {(order.item_list ?? []).length > 2 && (
                              <span className="text-xs text-gray-500">
                                {t('moreItems', { count: order.item_list!.length - 2 })}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              {t('itemCount', { count: itemCount })}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {formatVnd(order.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          <div>{order.payment_method}</div>
                          <div className="text-gray-400">
                            {order.cod ? 'COD' : order.pay_time ? t('paid') : t('unpaid')}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <OrderStatusBadge status={order.order_status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {order.ship_by_date ? formatDate(order.ship_by_date, lang) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {order.order_status === 'READY_TO_SHIP' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShippingOrderSn(order.order_sn)}
                              >
                                {t('shipNow')}
                              </Button>
                            )}
                            <Link href={`/seller/orders/${order.order_sn}`}>
                              <Button size="sm" variant="ghost">
                                {t('viewDetail')}
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (375px) */}
            <div className="space-y-3 md:hidden">
              {ordersApi.data.orders.map((order) => (
                <Card key={order.order_sn} className="space-y-3 text-sm">
                  <div className="flex items-center justify-between border-b pb-2">
                    <Link href={`/seller/orders/${order.order_sn}`} className="font-bold text-primary">
                      {order.order_sn}
                    </Link>
                    <OrderStatusBadge status={order.order_status} />
                  </div>
                  <div className="text-xs text-gray-600">
                    <p>
                      <span className="font-semibold">{t('buyer')}:</span> {order.buyer_username || '—'}
                    </p>
                    <p>
                      <span className="font-semibold">{t('shipByDate')}:</span>{' '}
                      {order.ship_by_date ? formatDate(order.ship_by_date, lang) : '—'}
                    </p>
                  </div>
                  <div className="space-y-2 border-y py-2">
                    {(order.item_list ?? []).map((item) => (
                      <div key={`${item.item_id}-${item.model_id}`} className="flex items-center gap-2">
                        {item.image_info?.image_url && (
                          <Image
                            src={item.image_info.image_url}
                            alt=""
                            width={36}
                            height={36}
                            unoptimized
                            className="h-9 w-9 rounded object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1 text-xs">
                          <p className="truncate font-medium">{item.item_name}</p>
                          <p className="text-gray-500">
                            {item.model_name ? `${item.model_name} · ` : ''}x{item.model_quantity_purchased} ·{' '}
                            {formatVnd(item.model_discounted_price)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{t('total')}:</span>
                    <span className="text-base font-bold text-primary">{formatVnd(order.total_amount)}</span>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    {order.order_status === 'READY_TO_SHIP' && (
                      <Button size="sm" variant="outline" onClick={() => setShippingOrderSn(order.order_sn)}>
                        {t('shipNow')}
                      </Button>
                    )}
                    <Link href={`/seller/orders/${order.order_sn}`}>
                      <Button size="sm" variant="ghost">
                        {t('viewDetail')}
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>

            {/* Cursor Pagination */}
            <div className="flex items-center justify-between bg-white p-3 rounded shadow-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={cursorHistory.length === 0}
                onClick={handlePrevPage}
              >
                ← {t('prevPage')}
              </Button>
              <span className="text-xs text-gray-500">
                {t('pageNumber', { page: cursorHistory.length + 1 })}
              </span>
              <Button variant="outline" size="sm" disabled={!ordersApi.data.more} onClick={handleNextPage}>
                {t('nextPage')} →
              </Button>
            </div>
          </div>
        )}
      </QueryState>

      {/* Ship Modal */}
      {shippingOrderSn && (
        <ShipModal
          open={Boolean(shippingOrderSn)}
          shopId={shopId}
          orderSn={shippingOrderSn}
          onClose={() => setShippingOrderSn(null)}
          onSuccess={() => ordersApi.reload()}
        />
      )}
    </div>
  );
}
