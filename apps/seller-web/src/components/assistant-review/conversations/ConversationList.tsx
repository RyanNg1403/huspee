'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AssistantConversation } from '@huspee/sdk';
import { EmptyState, ErrorState, Pagination, Select, Spinner } from '@huspee/web-ui/components/ui';
import { useLang, useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { conversationOverview, type Overview } from '../conversation-log';
import { StatusDot } from '@/components/shell';
import { formatStamp } from '../time';
import { OutcomeText } from './describe';
import { conversationMessages } from './messages';

const PAGE_SIZE = 10;
type Period = 'today' | '7' | '30' | 'all';
type Status = 'all' | 'ACTIVE' | 'ENDED';
type Handoff = 'all' | 'yes' | 'no';
type Row = { conversation: AssistantConversation; overview: Overview };

function periodStart(period: Period): number | undefined {
  if (period === 'all') return undefined;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period !== 'today') start.setDate(start.getDate() - Number(period) + 1);
  return Math.floor(start.getTime() / 1000);
}

const filterSelect = 'h-[34px]! w-auto! rounded! border-line-strong! py-0! pr-8! pl-2!';

export function ConversationList({ shopId }: { shopId: number }) {
  const t = useT(conversationMessages);
  const [period, setPeriod] = useState<{ value: Period; from?: number }>({ value: 'all' });
  const [status, setStatus] = useState<Status>('all');
  const [handoff, setHandoff] = useState<Handoff>('all');
  const [page, setPage] = useState(1);
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  // The list route has no transcript fields; each row's details come from the conversation itself.
  const list = useApi(async () => {
    const result = await getApiClient().seller.assistant.conversations.list(shopId, {
      from: period.from,
      status: status === 'all' ? undefined : status,
      has_handoff: handoff === 'all' ? undefined : handoff === 'yes',
      page,
      page_size: PAGE_SIZE,
    });
    const details = await Promise.all(
      result.data.map((row) =>
        getApiClient().seller.assistant.conversations.get(shopId, row.conversation_id),
      ),
    );
    const rows: Row[] = result.data.map((conversation, index) => ({
      conversation,
      overview: conversationOverview(details[index]!),
    }));
    return { rows, total: result.page.total };
  }, [shopId, period, status, handoff, page]);

  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRow = (page - 1) * PAGE_SIZE + 1;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <section aria-label={t('listLabel')} className="rounded bg-white px-6 pt-4 pb-5 shadow-card">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line-soft pb-4">
          <label className="flex items-center gap-2 text-muted">
            {t('filterPeriod')}
            <Select
              className={filterSelect}
              value={period.value}
              onChange={(event) => {
                const value = event.target.value as Period;
                setPeriod({ value, from: periodStart(value) });
                setPage(1);
              }}
            >
              <option value="all">{t('periodAll')}</option>
              <option value="today">{t('periodToday')}</option>
              <option value="7">{t('period7')}</option>
              <option value="30">{t('period30')}</option>
            </Select>
          </label>
          <label className="flex items-center gap-2 text-muted">
            {t('filterStatus')}
            <Select
              className={filterSelect}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as Status);
                setPage(1);
              }}
            >
              <option value="all">{t('all')}</option>
              <option value="ACTIVE">{t('statusActive')}</option>
              <option value="ENDED">{t('statusEnded')}</option>
            </Select>
          </label>
          <label className="flex items-center gap-2 text-muted">
            {t('filterHandoff')}
            <Select
              className={filterSelect}
              value={handoff}
              onChange={(event) => {
                setHandoff(event.target.value as Handoff);
                setPage(1);
              }}
            >
              <option value="all">{t('all')}</option>
              <option value="yes">{t('yes')}</option>
              <option value="no">{t('no')}</option>
            </Select>
          </label>
        </div>

        {!list.data && list.loading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : list.error || !list.data ? (
          <div className="pt-4">
            <ErrorState message={t('loadFailed')} onRetry={list.reload} retryLabel={t('retry')} />
          </div>
        ) : list.data.rows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <>
            <p className="pt-3 pb-1 text-[13px] text-muted">{t('count', { count: total })}</p>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="text-[13px] text-muted">
                    <th
                      scope="col"
                      className="border-b border-line-soft py-3 pr-3 font-medium whitespace-nowrap"
                    >
                      {t('colTime')}
                    </th>
                    <th scope="col" className="min-w-[220px] border-b border-line-soft p-3 font-medium">
                      {t('colQuestion')}
                    </th>
                    <th scope="col" className="min-w-[180px] border-b border-line-soft p-3 font-medium">
                      {t('colProducts')}
                    </th>
                    <th
                      scope="col"
                      className="border-b border-line-soft p-3 text-right font-medium whitespace-nowrap"
                    >
                      {t('colTurns')}
                    </th>
                    <th scope="col" className="border-b border-line-soft p-3 font-medium">
                      {t('colOutcome')}
                    </th>
                    <th scope="col" className="border-b border-line-soft p-3 font-medium">
                      {t('colStatus')}
                    </th>
                    <th scope="col" className="border-b border-line-soft py-3 pl-3 text-right font-medium">
                      <span className="sr-only">{t('colActions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.rows.map((row) => (
                    <ConversationRow key={row.conversation.conversation_id} row={row} now={now} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-4 pt-4 text-muted">
              <span>{t('range', { from: firstRow, to: firstRow + list.data.rows.length - 1, total })}</span>
              {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ConversationRow({ row, now }: { row: Row; now: number }) {
  const t = useT(conversationMessages);
  const { lang } = useLang();
  const { conversation, overview } = row;
  const href = `/assistant/conversations/${encodeURIComponent(conversation.conversation_id)}`;
  const stamp = formatStamp(conversation.started_at, lang, now);
  const cell = 'border-b border-line-soft p-3 align-top';
  const shown = overview.products.slice(0, 2);
  const hidden = overview.products.length - shown.length;
  return (
    <tr>
      <td className="border-b border-line-soft py-3 pr-3 align-top whitespace-nowrap">
        {stamp}
        <div className="text-[13px] text-muted">
          {conversation.channel === 'VOICE' ? t('channelVoice') : t('channelText')}
        </div>
      </td>
      <td className={cell}>
        {overview.firstQuestion ? (
          <span className="line-clamp-2">{overview.firstQuestion}</span>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </td>
      <td className={cell}>
        {shown.length ? (
          <>
            {shown.join(', ')}
            {hidden > 0 && <span className="text-muted"> {t('more', { count: hidden })}</span>}
          </>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </td>
      <td className={`${cell} text-right`}>{overview.turns}</td>
      <td className={`${cell} whitespace-nowrap`}>
        <OutcomeText outcome={overview.outcome} />
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        {conversation.status === 'ACTIVE' ? (
          <StatusDot tone="success">{t('statusActive')}</StatusDot>
        ) : (
          <StatusDot tone="neutral">{t('statusEnded')}</StatusDot>
        )}
      </td>
      <td className="border-b border-line-soft py-3 pl-3 text-right align-top">
        <Link href={href} aria-label={`${t('view')} ${stamp}`} className="text-link hover:underline">
          {t('view')}
        </Link>
      </td>
    </tr>
  );
}
