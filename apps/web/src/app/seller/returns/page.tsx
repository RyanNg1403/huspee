'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, QueryState, Tabs } from '@/components/ui';
import { useLang, useT } from '@/i18n/client';
import { formatDate, formatVnd } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { call } from '../_ops/api';
import { ShopGuard } from '../_ops/ShopGuard';
import { ReturnStatusBadge } from '../_ops/StatusBadge';
import type { ReturnDetail, ReturnStatusType } from '../_ops/types';
import { returnMessages } from './messages';

export default function ReturnsPage() {
  return <ShopGuard>{(shop) => <ReturnsContent shopId={shop.shop_id} />}</ShopGuard>;
}

function ReturnsContent({ shopId }: { shopId: number }) {
  const t = useT(returnMessages);
  const { lang } = useLang();

  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [pageNo, setPageNo] = useState<number>(0);

  const returnsApi = useApi(async () => {
    return call<{
      more: boolean;
      return: ReturnDetail[];
    }>(shopId, '/returns/get_return_list', {
      page_no: pageNo,
      page_size: 10,
      ...(selectedStatus !== 'all' ? { status: selectedStatus } : {}),
    });
  }, [shopId, pageNo, selectedStatus]);

  const tabs = [
    { value: 'all', label: t('all') },
    { value: 'REQUESTED', label: t('requested') },
    { value: 'ACCEPTED', label: t('accepted') },
    { value: 'JUDGING', label: t('judging') },
    { value: 'PROCESSING', label: t('processing') },
    { value: 'SELLER_DISPUTE', label: t('sellerDispute') },
    { value: 'CANCELLED', label: t('cancelled') },
    { value: 'CLOSED', label: t('closed') },
  ];

  function handleTabChange(val: string) {
    setSelectedStatus(val);
    setPageNo(0);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{t('returnsTitle')}</h1>
      </div>

      {/* Status tabs */}
      <div className="overflow-x-auto bg-white rounded shadow-sm">
        <Tabs items={tabs} value={selectedStatus} onChange={handleTabChange} />
      </div>

      {/* Returns List */}
      <QueryState
        loading={returnsApi.loading}
        error={returnsApi.error}
        errorMessage={t('failed')}
        retry={returnsApi.reload}
        retryLabel={t('all')}
        empty={!returnsApi.data?.return?.length}
        emptyTitle={t('noReturns')}
        card
        spinner
      >
        {returnsApi.data && (
          <div className="space-y-3">
            {/* Desktop Table View */}
            <div className="hidden overflow-x-auto rounded bg-white shadow-sm md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="px-4 py-3">{t('returnSn')}</th>
                    <th className="px-4 py-3">{t('orderSn')}</th>
                    <th className="px-4 py-3">{t('buyer')}</th>
                    <th className="px-4 py-3">{t('items')}</th>
                    <th className="px-4 py-3">{t('refundAmount')}</th>
                    <th className="px-4 py-3">{t('status')}</th>
                    <th className="px-4 py-3">{t('createdAt')}</th>
                    <th className="px-4 py-3 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {returnsApi.data.return.map((ret) => (
                    <tr key={ret.return_sn} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-primary">
                        <Link href={`/seller/returns/${ret.return_sn}`}>{ret.return_sn}</Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <Link
                          href={`/seller/orders/${ret.order_sn}`}
                          className="hover:underline text-gray-700"
                        >
                          {ret.order_sn}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{ret.user?.username || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 max-w-xs">
                          {(ret.item ?? []).map((i, idx) => (
                            <div key={idx} className="flex items-center gap-2 truncate">
                              {i.images?.[0] && (
                                <Image
                                  src={i.images[0]}
                                  alt=""
                                  width={28}
                                  height={28}
                                  unoptimized
                                  className="h-7 w-7 rounded object-cover"
                                />
                              )}
                              <span className="truncate text-xs text-gray-800">
                                {i.name} x{i.amount}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-primary">{formatVnd(ret.refund_amount)}</td>
                      <td className="px-4 py-3">
                        <ReturnStatusBadge status={ret.status as ReturnStatusType} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {ret.create_time ? formatDate(ret.create_time, lang) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/seller/returns/${ret.return_sn}`}>
                          <Button size="sm" variant="ghost">
                            {t('viewDetail')}
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (375px) */}
            <div className="space-y-3 md:hidden">
              {returnsApi.data.return.map((ret) => (
                <Card key={ret.return_sn} className="space-y-3 text-sm">
                  <div className="flex items-center justify-between border-b pb-2">
                    <Link href={`/seller/returns/${ret.return_sn}`} className="font-bold text-primary">
                      {ret.return_sn}
                    </Link>
                    <ReturnStatusBadge status={ret.status as ReturnStatusType} />
                  </div>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p>
                      <span className="font-semibold">{t('orderSn')}:</span>{' '}
                      <Link href={`/seller/orders/${ret.order_sn}`} className="text-primary hover:underline">
                        {ret.order_sn}
                      </Link>
                    </p>
                    <p>
                      <span className="font-semibold">{t('buyer')}:</span> {ret.user?.username || '—'}
                    </p>
                    <p>
                      <span className="font-semibold">{t('createdAt')}:</span>{' '}
                      {ret.create_time ? formatDate(ret.create_time, lang) : '—'}
                    </p>
                  </div>
                  <div className="space-y-2 border-y py-2">
                    {(ret.item ?? []).map((i, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {i.images?.[0] && (
                          <Image
                            src={i.images[0]}
                            alt=""
                            width={36}
                            height={36}
                            unoptimized
                            className="h-9 w-9 rounded object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1 text-xs">
                          <p className="truncate font-medium">{i.name}</p>
                          <p className="text-gray-500">
                            x{i.amount} · {formatVnd(i.item_price)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{t('refundAmount')}:</span>
                    <span className="text-base font-bold text-primary">{formatVnd(ret.refund_amount)}</span>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Link href={`/seller/returns/${ret.return_sn}`}>
                      <Button size="sm" variant="ghost">
                        {t('viewDetail')}
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between bg-white p-3 rounded shadow-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={pageNo === 0}
                onClick={() => setPageNo((p) => Math.max(0, p - 1))}
              >
                ← {t('prevPage')}
              </Button>
              <span className="text-xs text-gray-500">{t('pageNumber', { page: pageNo + 1 })}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!returnsApi.data?.more}
                onClick={() => setPageNo((p) => p + 1)}
              >
                {t('nextPage')} →
              </Button>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
