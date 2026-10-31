'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { HandoffTicket, Paginated } from '@huspee/sdk';
import { RequireRole } from '@huspee/web-ui/components/session';
import { Button, Card, Icon, Pagination, QueryState, Tabs } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { formatDateTime } from '@huspee/web-ui/lib/format';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { messages } from './messages';
import { parseHandoffBody } from './handoff';
import { StatusBadge } from './_components/StatusBadge';

type StatusFilter = 'ALL' | 'OPEN' | 'ANSWERED' | 'CLOSED';

function MessagesListView() {
  const t = useT(messages);
  const { lang } = useLang();
  const [activeTab, setActiveTab] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);

  const tabItems: Array<{ value: StatusFilter; label: string }> = [
    { value: 'ALL', label: t('tabAll') },
    { value: 'OPEN', label: t('tabOpen') },
    { value: 'ANSWERED', label: t('tabAnswered') },
    { value: 'CLOSED', label: t('tabClosed') },
  ];

  const handleTabChange = (key: StatusFilter) => {
    setActiveTab(key);
    setPage(1);
  };

  const {
    data: ticketsData,
    loading,
    error,
    reload,
  } = useApi<Paginated<HandoffTicket>>(async () => {
    const client = getApiClient();
    const query: { page: number; page_size: number; status?: 'OPEN' | 'ANSWERED' | 'CLOSED' } = {
      page,
      page_size: 10,
    };
    if (activeTab !== 'ALL') {
      query.status = activeTab;
    }
    // Using SDK buyer.messages.list
    return client.buyer.messages.list(query);
  }, [activeTab, page]);

  const totalPages = ticketsData
    ? Math.max(1, Math.ceil(ticketsData.page.total / ticketsData.page.page_size))
    : 1;

  const getAuthorPrefix = (author?: 'BUYER' | 'SELLER' | 'ASSISTANT') => {
    if (author === 'BUYER') return `${t('authorBuyer')}: `;
    if (author === 'SELLER') return `${t('authorSeller')}: `;
    if (author === 'ASSISTANT') return `${t('authorBuyer')}: `;
    return '';
  };

  return (
    <div className="space-y-4">
      {/* Header Title */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{t('title')}</h1>
          <p className="text-sm text-gray-500">{t('subtitle')}</p>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white px-2 shadow-card">
        <Tabs items={tabItems} value={activeTab} onChange={handleTabChange} />
      </div>

      {/* Main Content */}
      {loading || error ? (
        <QueryState loading={loading} error={error} retry={reload} />
      ) : !ticketsData || ticketsData.data.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon name="chat" className="h-7 w-7" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-gray-800">{t('emptyTitle')}</h2>
          <p className="mx-auto mb-6 max-w-md text-sm text-gray-500">{t('emptyDescription')}</p>
          <Link href="/">
            <Button>{t('continueShopping')}</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {ticketsData.data.map((ticket) => {
            const hasUnread = ticket.buyer_unread > 0;
            return (
              <div
                key={ticket.ticket_id}
                className={`relative rounded-lg border bg-white p-4 shadow-xs transition hover:border-primary/50 hover:shadow-sm ${
                  hasUnread ? 'border-primary/30 bg-orange-50/20' : 'border-gray-200'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Shop Info and Subject */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                      <Link
                        href={`/shops/${ticket.shop_id}`}
                        className="flex items-center gap-1.5 font-medium text-gray-900 hover:text-primary transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ticket.logo_url ? (
                          <Image
                            unoptimized
                            width={20}
                            height={20}
                            src={ticket.logo_url}
                            alt={ticket.shop_name}
                            className="h-5 w-5 rounded-full object-cover"
                          />
                        ) : (
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-xs text-primary"
                            aria-label={ticket.shop_name}
                          >
                            <Icon name="shop" className="h-3 w-3" />
                          </span>
                        )}
                        <span className="truncate max-w-[200px]">{ticket.shop_name}</span>
                      </Link>
                      <span className="text-gray-300">•</span>
                      <span className="text-xs text-gray-400 font-mono">
                        {t('ticketNumber', { id: ticket.ticket_id })}
                      </span>
                      <span className="text-gray-300">•</span>
                      <span className="text-xs text-gray-500">{formatDateTime(ticket.updated_at, lang)}</span>
                      {ticket.conversation_id && (
                        <span className="text-xs text-gray-500">· {t('viaAssistant')}</span>
                      )}
                    </div>

                    <Link href={`/messages/${ticket.ticket_id}`} className="mt-2 block group">
                      <div className="flex items-center gap-2">
                        {hasUnread && (
                          <span
                            className="min-w-[18px] shrink-0 rounded-full bg-primary px-1.5 text-center text-[11px] font-semibold leading-[18px] text-white"
                            aria-label={t('unreadCount', { count: ticket.buyer_unread })}
                          >
                            {ticket.buyer_unread}
                          </span>
                        )}
                        <h2
                          className={`truncate text-base transition-colors group-hover:text-primary ${
                            hasUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'
                          }`}
                        >
                          {ticket.subject}
                        </h2>
                      </div>

                      {/* Last message preview */}
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                        {ticket.last_message ? (
                          <>
                            <span className="font-medium text-gray-700">
                              {getAuthorPrefix(ticket.last_message.author)}
                            </span>
                            <span>
                              {ticket.last_message.author === 'ASSISTANT'
                                ? parseHandoffBody(ticket.last_message.body).question
                                : ticket.last_message.body}
                            </span>
                          </>
                        ) : (
                          <span className="italic text-gray-400">{t('noMessagesYet')}</span>
                        )}
                      </p>
                    </Link>
                  </div>

                  {/* Status and Action */}
                  <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-2 sm:border-t-0 sm:pt-0">
                    <StatusBadge status={ticket.status} />
                    <Link href={`/messages/${ticket.ticket_id}`}>
                      <Button variant="outline" className="text-xs sm:text-sm">
                        {t('viewThread')}
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pt-4">
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <RequireRole role="buyer">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <MessagesListView />
      </div>
    </RequireRole>
  );
}
