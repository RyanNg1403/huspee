'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { HandoffTicket } from '@huspee/sdk';
import { EmptyState, ErrorState, Pagination, Spinner } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { ticketState } from '../handoff';
import { StatusDot } from '@/components/shell';
import { SearchInput } from '@/components/commerce/SearchInput';
import { elapsed, formatStamp, type Elapsed } from '../time';
import { inboxMessages } from './messages';

type Status = 'OPEN' | 'ANSWERED' | 'CLOSED';
type Tab = 'all' | Status;
const PAGE_SIZE = 20;
export const INBOX_CHANGED = 'huspee:inbox-changed';

function useElapsedLabel() {
  const t = useT(inboxMessages);
  return (value: Elapsed) =>
    t(value.unit === 'minutes' ? 'elapsedMinutes' : value.unit === 'hours' ? 'elapsedHours' : 'elapsedDays', {
      n: value.value,
    });
}

export function TicketList({ shopId, selectedId }: { shopId: number; selectedId: number | null }) {
  const t = useT(inboxMessages);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const list = useApi(
    () =>
      getApiClient().seller.inbox.list(shopId, {
        status: tab === 'all' ? undefined : tab,
        q: q || undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    [shopId, tab, q, page],
  );
  const counts = useApi(async () => {
    const [all, open] = await Promise.all([
      getApiClient().seller.inbox.list(shopId, { page_size: 1 }),
      getApiClient().seller.inbox.list(shopId, { status: 'OPEN', page_size: 1 }),
    ]);
    return { all: all.page.total, OPEN: open.page.total };
  }, [shopId]);
  const { reload: reloadList } = list;
  const { reload: reloadCounts } = counts;
  useEffect(() => {
    const refresh = () => {
      setNow(Math.floor(Date.now() / 1000));
      reloadList();
      reloadCounts();
    };
    window.addEventListener(INBOX_CHANGED, refresh);
    return () => window.removeEventListener(INBOX_CHANGED, refresh);
  }, [reloadList, reloadCounts]);

  const tabs: Array<{ value: Tab; label: string; count?: number }> = [
    { value: 'all', label: t('tabAll'), count: counts.data?.all },
    { value: 'OPEN', label: t('tabOpen'), count: counts.data?.OPEN },
    { value: 'ANSWERED', label: t('tabAnswered') },
    { value: 'CLOSED', label: t('tabClosed') },
  ];
  const tickets = list.data?.data ?? [];
  const total = list.data?.page.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div
        role="tablist"
        aria-label={t('filterLabel')}
        className="flex overflow-x-auto border-b border-line-soft px-2 whitespace-nowrap"
      >
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => {
              setTab(item.value);
              setPage(1);
            }}
            className={`-mb-px h-[46px] border-b-2 px-2 ${
              tab === item.value
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {item.label}
            {item.count ? ` ${item.count}` : ''}
          </button>
        ))}
      </div>
      <div className="border-b border-line-soft px-4 py-3">
        <SearchInput
          label={t('search')}
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={setSearch}
        />
      </div>
      {!list.data && list.loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : list.error ? (
        <div className="p-4">
          <ErrorState message={t('loadFailed')} onRetry={list.reload} retryLabel={t('retry')} />
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <>
          <ul aria-label={t('listLabel')}>
            {tickets.map((ticket) => (
              <li key={ticket.ticket_id} className="border-b border-line-soft">
                <TicketRow ticket={ticket} selected={ticket.ticket_id === selectedId} now={now} />
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <div className="py-3">
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          )}
        </>
      )}
    </>
  );
}

function TicketRow({ ticket, selected, now }: { ticket: HandoffTicket; selected: boolean; now: number }) {
  const t = useT(inboxMessages);
  const { lang } = useLang();
  const elapsedLabel = useElapsedLabel();
  const state = ticketState(ticket);
  const unread = ticket.seller_unread > 0;
  const last = ticket.last_message;
  const preview =
    last?.author === 'SELLER'
      ? t('previewSeller', { text: last.body })
      : last?.author === 'BUYER'
        ? t('previewBuyer', { text: last.body })
        : null;
  return (
    <Link
      href={`/inbox/${ticket.ticket_id}`}
      aria-current={selected ? 'true' : undefined}
      className={`block border-l-2 py-3.5 pr-4 pl-3.5 hover:bg-gray-50 ${
        selected ? 'border-primary bg-gray-50' : 'border-transparent'
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className={`truncate ${unread ? 'font-semibold' : 'font-medium'}`}>
          {unread && <span className="sr-only">{t('unread')}: </span>}
          {ticket.buyer_name}
        </span>
        <span className="shrink-0 text-[13px] text-muted">
          {formatStamp(last?.created_at ?? ticket.updated_at, lang, now)}
        </span>
      </span>
      <span className="mt-0.5 line-clamp-2">{ticket.subject}</span>
      {preview && <span className="mt-0.5 line-clamp-1 text-[13px] text-muted">{preview}</span>}
      <span className={`mt-1.5 block text-[13px] ${state.kind === 'waiting' ? 'text-ink' : 'text-muted'}`}>
        {state.kind === 'waiting' ? (
          <StatusDot tone="action">
            {t('waiting', { elapsed: elapsedLabel(elapsed(state.since, now)) })}
          </StatusDot>
        ) : state.kind === 'answered' ? (
          <StatusDot tone="neutral">{t('answeredAt', { time: formatStamp(state.at, lang, now) })}</StatusDot>
        ) : (
          <StatusDot tone="neutral">{t('closed')}</StatusDot>
        )}
      </span>
    </Link>
  );
}
