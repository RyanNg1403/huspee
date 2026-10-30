'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { HandoffTicket } from '@huspee/sdk';
import { Badge, Button, Card, EmptyState, ErrorState, Pagination, Spinner, Tabs } from '@/components/ui';
import { useLang, useT } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { getApiClient } from '@/lib/api';
import { useApi } from '@/lib/use-api';
import { InboxShopGuard } from './_components/InboxShopGuard';
import { inboxMessages } from './messages';

export default function SellerInboxPage() {
  return <InboxShopGuard>{(shop) => <SellerInboxContent shopId={shop.shop_id} />}</InboxShopGuard>;
}

function SellerInboxContent({ shopId }: { shopId: number }) {
  const t = useT(inboxMessages);
  const { lang } = useLang();

  const [statusTab, setStatusTab] = useState<'all' | 'OPEN' | 'ANSWERED' | 'CLOSED'>('all');
  const [page, setPage] = useState<number>(1);

  const queryParams = {
    status: statusTab === 'all' ? undefined : statusTab,
    page,
    page_size: 15,
  };

  const inboxApi = useApi(async () => {
    return getApiClient().seller.inbox.list(shopId, queryParams);
  }, [shopId, statusTab, page]);

  const tabs = [
    { value: 'all', label: t('tabAll') },
    { value: 'OPEN', label: t('tabOpen') },
    { value: 'ANSWERED', label: t('tabAnswered') },
    { value: 'CLOSED', label: t('tabClosed') },
  ];

  function handleTabChange(value: string) {
    setStatusTab(value as 'all' | 'OPEN' | 'ANSWERED' | 'CLOSED');
    setPage(1);
  }

  const items: HandoffTicket[] = inboxApi.data?.data ?? [];
  const pageInfo = inboxApi.data?.page ?? { page: 1, page_size: 15, total: 0, has_next: false };
  const totalPages = Math.max(1, Math.ceil(pageInfo.total / pageInfo.page_size));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('inboxTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('inboxDesc')}</p>
      </div>

      {/* Tabs Filter */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
        <Tabs items={tabs} value={statusTab} onChange={handleTabChange} />
      </div>

      {/* Content State */}
      {inboxApi.loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : inboxApi.error ? (
        <ErrorState message={t('loadFailed')} onRetry={inboxApi.reload} retryLabel={t('retry')} />
      ) : items.length === 0 ? (
        <EmptyState title={t('noTickets')}>
          <p className="mt-1 text-xs text-gray-400">{t('noTicketsDesc')}</p>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-xs md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">{t('ticketId')}</th>
                  <th className="px-4 py-3">{t('subject')}</th>
                  <th className="px-4 py-3">{t('status')}</th>
                  <th className="px-4 py-3">{t('lastMessage')}</th>
                  <th className="px-4 py-3">{t('updatedAt')}</th>
                  <th className="px-4 py-3 text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((ticket) => {
                  const hasUnread = (ticket.seller_unread ?? 0) > 0;
                  return (
                    <tr
                      key={ticket.ticket_id}
                      className={`hover:bg-gray-50/50 ${hasUnread ? 'bg-orange-50/20 font-medium' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                        #{ticket.ticket_id}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-gray-900">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/seller/inbox/${ticket.ticket_id}`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {ticket.subject}
                          </Link>
                          {hasUnread && (
                            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                              {ticket.seller_unread} {t('unreadBadge')}
                            </span>
                          )}
                          {ticket.conversation_id && (
                            <span
                              title={t('viewLinkedConversation')}
                              className="rounded-lg bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-700"
                            >
                              AI
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge
                          tone={
                            ticket.status === 'OPEN'
                              ? 'warning'
                              : ticket.status === 'ANSWERED'
                                ? 'success'
                                : 'neutral'
                          }
                        >
                          {ticket.status === 'OPEN'
                            ? t('statusOpen')
                            : ticket.status === 'ANSWERED'
                              ? t('statusAnswered')
                              : t('statusClosed')}
                        </Badge>
                      </td>
                      <td className="max-w-md px-4 py-3 text-xs text-gray-500 line-clamp-1">
                        {ticket.last_message?.body || '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatDateTime(ticket.updated_at, lang)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link href={`/seller/inbox/${ticket.ticket_id}`}>
                          <Button size="sm" variant="ghost">
                            {t('viewTicket')}
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="space-y-3 md:hidden">
            {items.map((ticket) => {
              const hasUnread = (ticket.seller_unread ?? 0) > 0;
              return (
                <Card
                  key={ticket.ticket_id}
                  className={`space-y-3 ${hasUnread ? 'border-primary/40 bg-orange-50/10' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-gray-500">#{ticket.ticket_id}</span>
                        {hasUnread && (
                          <span className="rounded-full bg-red-600 px-1.5 py-0.2 text-[10px] font-bold text-white">
                            {ticket.seller_unread}
                          </span>
                        )}
                        {ticket.conversation_id && (
                          <span className="rounded-lg bg-purple-50 px-1.5 py-0.2 text-[10px] font-medium text-purple-700">
                            AI
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/seller/inbox/${ticket.ticket_id}`}
                        className="font-semibold text-gray-900 text-sm hover:text-primary"
                      >
                        {ticket.subject}
                      </Link>
                    </div>

                    <Badge
                      tone={
                        ticket.status === 'OPEN'
                          ? 'warning'
                          : ticket.status === 'ANSWERED'
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {ticket.status === 'OPEN'
                        ? t('statusOpen')
                        : ticket.status === 'ANSWERED'
                          ? t('statusAnswered')
                          : t('statusClosed')}
                    </Badge>
                  </div>

                  {ticket.last_message && (
                    <p className="text-xs text-gray-600 line-clamp-2 bg-gray-50 p-2 rounded">
                      <span className="font-medium text-gray-800">
                        {ticket.last_message.author === 'BUYER'
                          ? `${t('authorBuyer')}: `
                          : ticket.last_message.author === 'SELLER'
                            ? `${t('authorSeller')}: `
                            : `${t('authorAssistant')}: `}
                      </span>
                      {ticket.last_message.body}
                    </p>
                  )}

                  <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-400">
                    <span>{formatDateTime(ticket.updated_at, lang)}</span>
                    <Link href={`/seller/inbox/${ticket.ticket_id}`}>
                      <Button size="sm" variant="outline">
                        {t('viewTicket')}
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
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
