'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { BuyerReturn, Paginated } from '@huspee/sdk';
import { RequireRole } from '@huspee/web-ui/components/session';
import { Button, Pagination, QueryState } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { formatDateTime, formatVnd } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { messages } from '../_orders/messages';
import { panel, ReturnStatusBadge } from '../_orders/shared';

function ReturnsView() {
  const t = useT(messages);
  const { lang } = useLang();
  const [page, setPage] = useState(1);

  const {
    data: returnsData,
    loading,
    error,
    reload,
  } = useApi<Paginated<BuyerReturn>>(
    () =>
      getApiClient().buyer.returns.list({
        page,
        page_size: 10,
      }),
    [page],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between rounded-2xl border border-line bg-white p-4 shadow-card">
        <h2 className="text-lg font-semibold text-gray-800">{t('returnsTitle')}</h2>
        <Link href="/orders" className="text-sm font-medium text-primary hover:underline">
          ← {t('ordersTitle')}
        </Link>
      </div>

      {/* List */}
      {loading || error ? (
        <QueryState loading={loading} error={error} retry={reload} />
      ) : !returnsData || returnsData.data.length === 0 ? (
        <div className={`${panel} py-16 text-center`}>
          <div className="mb-4 text-4xl">↩️</div>
          <h3 className="mb-2 text-lg font-semibold text-gray-800">{t('noReturns')}</h3>
          <Link href="/orders">
            <Button>{t('viewOrders')}</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {returnsData.data.map((item) => (
            <div
              key={item.return_sn}
              className="overflow-hidden rounded-2xl border border-line bg-white shadow-card"
            >
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50/70 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 font-mono text-sm">{item.return_sn}</span>
                  <span className="text-gray-400">|</span>
                  <span className="text-xs text-gray-500">
                    {t('orderSn')}: {item.order_sn}
                  </span>
                </div>
                <ReturnStatusBadge status={item.status} />
              </div>

              {/* Items */}
              <div className="divide-y p-4">
                {item.items.map((prod, idx) => (
                  <div key={idx} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border bg-gray-100">
                      {prod.image_url ? (
                        <Image
                          unoptimized
                          width={64}
                          height={64}
                          src={prod.image_url}
                          alt={prod.item_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                          Huspee
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="line-clamp-2 text-sm font-medium text-gray-800">{prod.item_name}</div>
                      {prod.model_name && (
                        <div className="text-xs text-gray-500">
                          {t('productVariant')}: {prod.model_name}
                        </div>
                      )}
                      <div className="text-xs text-gray-500">x{prod.quantity}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold text-primary">{formatVnd(prod.refund_amount)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer info */}
              <div className="border-t bg-gray-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-gray-500">
                    <span>
                      {t('solution')}:{' '}
                      {item.solution === 'RETURN_REFUND'
                        ? t('solutionReturnRefund')
                        : t('solutionRefundOnly')}
                    </span>
                    <span className="mx-2">•</span>
                    <span>{formatDateTime(item.create_time, lang)}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-xs text-gray-500 mr-2">{t('refundAmount')}:</span>
                      <span className="text-lg font-bold text-primary">{formatVnd(item.refund_amount)}</span>
                    </div>

                    <Link href={`/returns/${item.return_sn}`}>
                      <Button variant="outline" size="sm">
                        {t('viewDetail')}
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {returnsData.page.total > returnsData.page.page_size && (
            <div className="flex justify-center pt-4">
              <Pagination
                page={page}
                totalPages={Math.ceil(returnsData.page.total / returnsData.page.page_size)}
                onChange={(p) => setPage(p)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReturnsPage() {
  return (
    <RequireRole role="buyer">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <ReturnsView />
      </div>
    </RequireRole>
  );
}
