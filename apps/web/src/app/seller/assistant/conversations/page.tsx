'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AssistantConversation } from '@huspee/sdk';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  Spinner,
} from '@/components/ui';
import { useLang, useT } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { AssistantNav } from '../_components/AssistantNav';
import { AssistantShopGuard } from '../_components/AssistantShopGuard';
import { assistantMessages } from '../messages';

export default function AssistantConversationsPage() {
  return (
    <AssistantShopGuard>{(shop) => <ConversationsListContent shopId={shop.shop_id} />}</AssistantShopGuard>
  );
}

function ConversationsListContent({ shopId }: { shopId: number }) {
  const t = useT(assistantMessages);
  const { lang } = useLang();

  // Filters state
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'ENDED'>('all');
  const [handoffFilter, setHandoffFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const queryParams = {
    status: statusFilter === 'all' ? undefined : statusFilter,
    has_handoff: handoffFilter === 'all' ? undefined : handoffFilter === 'yes',
    from: fromDate ? Math.floor(new Date(fromDate).getTime() / 1000) : undefined,
    to: toDate ? Math.floor(new Date(toDate).getTime() / 1000) + 86400 : undefined,
    page,
    page_size: 15,
  };

  const conversationsApi = useApi(async () => {
    return getApiClient().seller.assistant.conversations.list(shopId, queryParams);
  }, [shopId, statusFilter, handoffFilter, fromDate, toDate, page]);

  function handleResetFilters() {
    setStatusFilter('all');
    setHandoffFilter('all');
    setFromDate('');
    setToDate('');
    setPage(1);
  }

  const items: AssistantConversation[] = conversationsApi.data?.data ?? [];
  const pageInfo = conversationsApi.data?.page ?? { page: 1, page_size: 15, total: 0, has_next: false };
  const totalPages = Math.max(1, Math.ceil(pageInfo.total / pageInfo.page_size));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('conversationsTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('conversationsDesc')}</p>
      </div>

      {/* Sub Nav */}
      <AssistantNav />

      {/* Filters Bar */}
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('filterStatus')}</label>
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'all' | 'ACTIVE' | 'ENDED');
                setPage(1);
              }}
            >
              <option value="all">{t('filterAll')}</option>
              <option value="ACTIVE">{t('statusActive')}</option>
              <option value="ENDED">{t('statusEnded')}</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('filterHandoff')}</label>
            <Select
              value={handoffFilter}
              onChange={(e) => {
                setHandoffFilter(e.target.value as 'all' | 'yes' | 'no');
                setPage(1);
              }}
            >
              <option value="all">{t('filterAll')}</option>
              <option value="yes">{t('handoffYes')}</option>
              <option value="no">{t('handoffNo')}</option>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('fromDate')}</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('toDate')}</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {(statusFilter !== 'all' || handoffFilter !== 'all' || fromDate || toDate) && (
          <div className="flex justify-end pt-1">
            <Button size="sm" variant="ghost" onClick={handleResetFilters}>
              {t('clearFilter')}
            </Button>
          </div>
        )}
      </Card>

      {/* Content State */}
      {conversationsApi.loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : conversationsApi.error ? (
        <ErrorState message={t('loadFailed')} onRetry={conversationsApi.reload} retryLabel={t('retry')} />
      ) : items.length === 0 ? (
        <EmptyState title={t('noConversations')}>
          <p className="mt-1 text-xs text-gray-400">{t('noConversationsDesc')}</p>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-xs md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">{t('conversationId')}</th>
                  <th className="px-4 py-3">{t('channel')}</th>
                  <th className="px-4 py-3">{t('filterStatus')}</th>
                  <th className="px-4 py-3">{t('buyer')}</th>
                  <th className="px-4 py-3">{t('startedAt')}</th>
                  <th className="px-4 py-3 text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((c) => {
                  return (
                    <tr key={c.conversation_id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">
                        <Link
                          href={`/seller/assistant/conversations/${encodeURIComponent(c.conversation_id)}`}
                          className="hover:text-primary hover:underline"
                        >
                          {c.conversation_id.slice(0, 8)}...
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge tone={c.channel === 'VOICE' ? 'info' : 'neutral'}>
                          {c.channel === 'VOICE' ? t('channelVoice') : t('channelText')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {c.status === 'ACTIVE' ? t('statusActive') : t('statusEnded')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">#{c.buyer_id}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {formatDateTime(c.started_at, lang)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          href={`/seller/assistant/conversations/${encodeURIComponent(c.conversation_id)}`}
                        >
                          <Button size="sm" variant="ghost">
                            {t('viewDetail')}
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {items.map((c) => (
              <Card key={c.conversation_id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-gray-900">
                    #{c.conversation_id.slice(0, 8)}...
                  </span>
                  <div className="flex gap-1.5">
                    <Badge tone={c.channel === 'VOICE' ? 'info' : 'neutral'}>
                      {c.channel === 'VOICE' ? t('channelVoice') : t('channelText')}
                    </Badge>
                    <Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {c.status === 'ACTIVE' ? t('statusActive') : t('statusEnded')}
                    </Badge>
                  </div>
                </div>

                <div className="text-xs text-gray-500 space-y-1">
                  <p>
                    <span className="font-medium text-gray-700">{t('buyer')}:</span> #{c.buyer_id}
                  </p>
                  <p>
                    <span className="font-medium text-gray-700">{t('startedAt')}:</span>{' '}
                    {formatDateTime(c.started_at, lang)}
                  </p>
                </div>

                <div className="flex justify-end border-t border-gray-100 pt-2">
                  <Link href={`/seller/assistant/conversations/${encodeURIComponent(c.conversation_id)}`}>
                    <Button size="sm" variant="outline">
                      {t('viewDetail')}
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pt-2">
              <Pagination page={page} totalPages={totalPages} onChange={(p) => setPage(p)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
